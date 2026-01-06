/**
 * HDFC Transaction Reconciliation Script
 *
 * This script checks all pending HDFC transactions against HDFC UAT
 * and updates transactions that have been successfully charged.
 *
 * Usage:
 *   DRY RUN:  node scripts/reconcileHdfcTransactions.js
 *   EXECUTE:  node scripts/reconcileHdfcTransactions.js --execute
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Juspay } = require('expresscheckout-nodejs');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}\n${colors.bright}${msg}${colors.reset}\n${colors.blue}${'='.repeat(60)}${colors.reset}`)
};

const isDryRun = !process.argv.includes('--execute');

/**
 * Initialize Juspay SDK
 */
function initializeJuspay() {
  const merchantId = process.env.HDFC_MERCHANT_ID;
  const baseUrl = process.env.HDFC_BASE_URL || 'https://smartgateway.hdfcuat.bank.in';
  const keyUuid = process.env.HDFC_KEY_UUID;
  const privateKeyPath = process.env.HDFC_PRIVATE_KEY_PATH;
  const publicKeyPath = process.env.HDFC_PUBLIC_KEY_PATH;

  let privateKey, publicKey;

  if (process.env.HDFC_PRIVATE_KEY && process.env.HDFC_PUBLIC_KEY) {
    privateKey = process.env.HDFC_PRIVATE_KEY.includes('-----BEGIN')
      ? process.env.HDFC_PRIVATE_KEY.replace(/\\n/g, '\n')
      : Buffer.from(process.env.HDFC_PRIVATE_KEY, 'base64').toString('utf8');
    publicKey = process.env.HDFC_PUBLIC_KEY.includes('-----BEGIN')
      ? process.env.HDFC_PUBLIC_KEY.replace(/\\n/g, '\n')
      : Buffer.from(process.env.HDFC_PUBLIC_KEY, 'base64').toString('utf8');
  } else if (privateKeyPath && publicKeyPath) {
    const basePath = path.join(__dirname, '..');
    privateKey = fs.readFileSync(path.join(basePath, privateKeyPath), 'utf8');
    publicKey = fs.readFileSync(path.join(basePath, publicKeyPath), 'utf8');
  } else {
    throw new Error('HDFC keys not configured');
  }

  return new Juspay({
    merchantId: merchantId,
    baseUrl: baseUrl,
    jweAuth: {
      keyId: keyUuid,
      publicKey: publicKey,
      privateKey: privateKey
    }
  });
}

/**
 * Map HDFC status to internal status
 */
function mapPaymentStatus(hdfcStatus) {
  const statusMap = {
    'CHARGED': 'completed',
    'COD_INITIATED': 'completed',
    'AUTHORIZED': 'pending',
    'PENDING': 'pending',
    'PENDING_VBV': 'pending',
    'AUTHORIZATION_FAILED': 'failed',
    'AUTHENTICATION_FAILED': 'failed',
    'JUSPAY_DECLINED': 'failed',
    'AUTHORIZING': 'pending',
    'NEW': 'pending',
    'STARTED': 'pending',
    'AUTO_REFUNDED': 'failed'
  };
  return statusMap[hdfcStatus] || 'pending';
}

function isPaymentSuccessful(hdfcStatus) {
  return ['CHARGED', 'COD_INITIATED'].includes(hdfcStatus);
}

async function reconcileTransactions() {
  log.header('HDFC TRANSACTION RECONCILIATION');

  if (isDryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
    log.info('Run with --execute flag to apply changes');
  } else {
    log.warn('EXECUTE MODE - Changes WILL be applied to database');
  }

  console.log('');

  try {
    // Connect to MongoDB
    log.info('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    log.success('Connected to MongoDB');

    // Load models
    const Transaction = require('../models/Transaction');
    const User = require('../models/User');

    // Initialize Juspay
    log.info('Initializing HDFC SDK...');
    const client = initializeJuspay();
    log.success('HDFC SDK initialized');

    // Find all pending HDFC transactions
    log.info('Finding pending HDFC transactions...');
    const pendingTransactions = await Transaction.find({
      'payment_info.payment_gateway': 'hdfc',
      status: 'pending',
      'payment_info.gateway_order_id': { $exists: true, $ne: null }
    }).populate('user_id', 'email your_name wallet_balance');

    log.info(`Found ${pendingTransactions.length} pending HDFC transactions`);

    if (pendingTransactions.length === 0) {
      log.success('No pending transactions to reconcile');
      await mongoose.disconnect();
      return;
    }

    // Reconciliation stats
    const stats = {
      checked: 0,
      toCredit: [],
      toFail: [],
      stillPending: [],
      errors: []
    };

    // Check each transaction against HDFC
    log.header('Checking Transaction Status from HDFC');

    for (const txn of pendingTransactions) {
      const orderId = txn.payment_info.gateway_order_id;
      stats.checked++;

      try {
        log.info(`\n[${stats.checked}/${pendingTransactions.length}] Checking order: ${orderId}`);

        const orderStatus = await client.order.status(orderId);
        const hdfcStatus = orderStatus.status;
        const internalStatus = mapPaymentStatus(hdfcStatus);
        const isSuccess = isPaymentSuccessful(hdfcStatus);

        console.log(`  Transaction ID: ${txn.transaction_id}`);
        console.log(`  User: ${txn.user_id?.email || 'Unknown'}`);
        console.log(`  Amount: ₹${txn.amount}`);
        console.log(`  HDFC Status: ${hdfcStatus}`);
        console.log(`  TXN ID: ${orderStatus.txn_id || 'N/A'}`);

        if (isSuccess) {
          log.success(`  → CHARGED! Should credit wallet`);
          stats.toCredit.push({
            transaction: txn,
            hdfcStatus: orderStatus
          });
        } else if (internalStatus === 'failed') {
          log.error(`  → FAILED on HDFC`);
          stats.toFail.push({
            transaction: txn,
            hdfcStatus: orderStatus
          });
        } else {
          log.warn(`  → Still pending (${hdfcStatus})`);
          stats.stillPending.push({
            transaction: txn,
            hdfcStatus: orderStatus
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        log.error(`  Error checking ${orderId}: ${error.message}`);
        stats.errors.push({
          transaction: txn,
          error: error.message
        });
      }
    }

    // Summary
    log.header('RECONCILIATION SUMMARY');
    console.log(`\nTotal Checked: ${stats.checked}`);
    console.log(`${colors.green}To Credit (CHARGED): ${stats.toCredit.length}${colors.reset}`);
    console.log(`${colors.red}To Mark Failed: ${stats.toFail.length}${colors.reset}`);
    console.log(`${colors.yellow}Still Pending: ${stats.stillPending.length}${colors.reset}`);
    console.log(`${colors.red}Errors: ${stats.errors.length}${colors.reset}`);

    // Process credits
    if (stats.toCredit.length > 0) {
      log.header('TRANSACTIONS TO CREDIT');

      let totalToCredit = 0;
      for (const item of stats.toCredit) {
        const txn = item.transaction;
        const hdfc = item.hdfcStatus;
        totalToCredit += txn.amount;

        console.log(`\n${colors.cyan}Transaction: ${txn.transaction_id}${colors.reset}`);
        console.log(`  User: ${txn.user_id?.email}`);
        console.log(`  Amount: ₹${txn.amount}`);
        console.log(`  Current Wallet: ₹${txn.user_id?.wallet_balance || 0}`);
        console.log(`  New Wallet Would Be: ₹${(txn.user_id?.wallet_balance || 0) + txn.amount}`);
        console.log(`  HDFC TXN ID: ${hdfc.txn_id}`);

        if (!isDryRun) {
          try {
            // Update transaction
            txn.status = 'completed';
            txn.payment_info.payment_status = 'completed';
            txn.payment_info.gateway_transaction_id = hdfc.txn_id;
            txn.payment_info.bank_ref_no = hdfc.bank_ref_no;
            txn.payment_info.payment_method = hdfc.payment_method;
            txn.payment_info.payment_date = new Date();
            txn.transaction_date = new Date();
            txn.updated_at = new Date();

            // Credit wallet
            const user = await User.findById(txn.user_id._id);
            if (user) {
              const openingBalance = user.wallet_balance || 0;
              user.wallet_balance = Math.round((openingBalance + txn.amount) * 100) / 100;
              await user.save();

              txn.balance_info = {
                opening_balance: openingBalance,
                closing_balance: user.wallet_balance
              };

              log.success(`  ✓ Wallet credited! New balance: ₹${user.wallet_balance}`);
            }

            await txn.save();
            log.success(`  ✓ Transaction updated to completed`);

          } catch (updateError) {
            log.error(`  ✗ Failed to update: ${updateError.message}`);
          }
        } else {
          log.warn(`  [DRY RUN] Would credit ₹${txn.amount} to wallet`);
        }
      }

      console.log(`\n${colors.bright}Total Amount to Credit: ₹${totalToCredit}${colors.reset}`);
    }

    // Process failures
    if (stats.toFail.length > 0 && !isDryRun) {
      log.header('MARKING FAILED TRANSACTIONS');

      for (const item of stats.toFail) {
        const txn = item.transaction;
        const hdfc = item.hdfcStatus;

        try {
          txn.status = 'failed';
          txn.payment_info.payment_status = 'failed';
          txn.notes = hdfc.error_message || `Payment failed with status: ${hdfc.status}`;
          txn.updated_at = new Date();
          await txn.save();
          log.success(`Marked ${txn.transaction_id} as failed`);
        } catch (err) {
          log.error(`Failed to update ${txn.transaction_id}: ${err.message}`);
        }
      }
    }

    // Final message
    log.header('RECONCILIATION COMPLETE');

    if (isDryRun) {
      console.log(`\n${colors.yellow}This was a DRY RUN. No changes were made.${colors.reset}`);
      console.log(`To apply changes, run: node scripts/reconcileHdfcTransactions.js --execute\n`);
    } else {
      console.log(`\n${colors.green}Reconciliation completed successfully.${colors.reset}\n`);
    }

    await mongoose.disconnect();

  } catch (error) {
    log.error(`Reconciliation failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

reconcileTransactions();
