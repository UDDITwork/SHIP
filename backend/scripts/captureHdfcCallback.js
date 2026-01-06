/**
 * HDFC Callback Capture and Debug Script
 *
 * This script helps capture and analyze what HDFC UAT server sends back
 * after payment completion. Run this to understand the callback payload.
 *
 * Usage:
 *   node scripts/captureHdfcCallback.js --order-id <ORDER_ID>
 *   node scripts/captureHdfcCallback.js --list-pending
 *   node scripts/captureHdfcCallback.js --check-all
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
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  debug: (msg) => console.log(`${colors.magenta}[DEBUG]${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}\n${colors.bright}${msg}${colors.reset}\n${colors.blue}${'='.repeat(70)}${colors.reset}`)
};

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
 * Get detailed order status from HDFC
 */
async function getDetailedOrderStatus(client, orderId) {
  log.header(`Order Status: ${orderId}`);

  try {
    const orderStatus = await client.order.status(orderId);

    log.success('Successfully retrieved order status from HDFC UAT');

    console.log(`\n${colors.cyan}=== RAW HDFC RESPONSE ===${colors.reset}`);
    console.log(JSON.stringify(orderStatus, null, 2));
    console.log(`${colors.cyan}=== END RAW RESPONSE ===${colors.reset}\n`);

    // Extract all relevant fields
    const details = {
      // Order Identification
      order_id: orderStatus.order_id,
      merchant_id: orderStatus.merchant_id,

      // Payment Status
      status: orderStatus.status,
      status_id: orderStatus.status_id,

      // Transaction IDs (CRITICAL for audit)
      txn_id: orderStatus.txn_id,
      txn_uuid: orderStatus.txn_uuid,
      gateway_id: orderStatus.gateway_id,
      gateway_reference_id: orderStatus.gateway_reference_id,
      bank_ref_no: orderStatus.bank_ref_no,
      rrn: orderStatus.rrn,

      // Amount
      amount: orderStatus.amount,
      currency: orderStatus.currency,

      // Payment Method
      payment_method: orderStatus.payment_method,
      payment_method_type: orderStatus.payment_method_type,
      card_brand: orderStatus.card_brand,
      card_issuer_bank_name: orderStatus.card_issuer_bank_name,

      // Timestamps
      date_created: orderStatus.date_created,
      last_updated: orderStatus.last_updated,

      // Error info (if any)
      error_code: orderStatus.error_code,
      error_message: orderStatus.error_message,

      // Additional fields that might be present
      udf1: orderStatus.udf1,
      udf2: orderStatus.udf2,
      udf3: orderStatus.udf3,
      udf4: orderStatus.udf4,
      udf5: orderStatus.udf5,
      return_url: orderStatus.return_url,
      customer_id: orderStatus.customer_id,
      customer_email: orderStatus.customer_email,
      customer_phone: orderStatus.customer_phone
    };

    log.info('Parsed Order Details:');
    console.log(`\n${colors.green}--- IMPORTANT FIELDS FOR CONFIRMATION PAGE ---${colors.reset}`);
    console.log(`  Order ID:              ${details.order_id || 'NOT FOUND'}`);
    console.log(`  Status:                ${details.status || 'NOT FOUND'}`);
    console.log(`  Amount:                ₹${details.amount || 'NOT FOUND'}`);
    console.log(`  Transaction ID:        ${details.txn_id || 'NOT FOUND'}`);
    console.log(`  Bank Reference No:     ${details.bank_ref_no || 'NOT FOUND'}`);
    console.log(`  Gateway Reference ID:  ${details.gateway_reference_id || 'NOT FOUND'}`);
    console.log(`  Payment Method:        ${details.payment_method || 'NOT FOUND'}`);
    console.log(`  Payment Method Type:   ${details.payment_method_type || 'NOT FOUND'}`);
    console.log(`  Date Created:          ${details.date_created || 'NOT FOUND'}`);
    console.log(`  Last Updated:          ${details.last_updated || 'NOT FOUND'}`);

    if (details.error_code || details.error_message) {
      console.log(`\n${colors.red}--- ERROR INFORMATION ---${colors.reset}`);
      console.log(`  Error Code:    ${details.error_code || 'N/A'}`);
      console.log(`  Error Message: ${details.error_message || 'N/A'}`);
    }

    // Status interpretation
    console.log(`\n${colors.yellow}--- STATUS INTERPRETATION ---${colors.reset}`);
    const successStatuses = ['CHARGED', 'COD_INITIATED'];
    const pendingStatuses = ['AUTHORIZED', 'PENDING', 'PENDING_VBV', 'AUTHORIZING', 'NEW', 'STARTED'];
    const failedStatuses = ['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED', 'AUTO_REFUNDED'];

    if (successStatuses.includes(details.status)) {
      log.success(`Payment SUCCESSFUL - Wallet should be credited`);
    } else if (pendingStatuses.includes(details.status)) {
      log.warn(`Payment PENDING - Transaction in progress`);
    } else if (failedStatuses.includes(details.status)) {
      log.error(`Payment FAILED`);
    } else {
      log.warn(`Unknown status: ${details.status}`);
    }

    return details;
  } catch (error) {
    log.error(`Failed to get order status: ${error.message}`);
    console.error('Full error:', error);
    return null;
  }
}

/**
 * List all pending HDFC transactions from database
 */
async function listPendingTransactions() {
  log.header('Pending HDFC Transactions');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    log.error('MONGODB_URI not configured');
    return [];
  }

  await mongoose.connect(mongoUri);
  log.success('Connected to MongoDB');

  const Transaction = require('../models/Transaction');

  const pendingTxns = await Transaction.find({
    'payment_info.payment_gateway': 'hdfc',
    status: { $in: ['pending'] }
  })
    .sort({ created_at: -1 })
    .limit(20)
    .lean();

  log.info(`Found ${pendingTxns.length} pending HDFC transactions\n`);

  pendingTxns.forEach((txn, i) => {
    console.log(`${colors.cyan}${i + 1}. ${txn.payment_info?.gateway_order_id || 'NO ORDER ID'}${colors.reset}`);
    console.log(`   Transaction ID: ${txn.transaction_id}`);
    console.log(`   Amount: ₹${txn.amount}`);
    console.log(`   Created: ${txn.created_at}`);
    console.log(`   Payment Status: ${txn.payment_info?.payment_status || 'N/A'}`);
    console.log('');
  });

  await mongoose.disconnect();
  return pendingTxns;
}

/**
 * Check and update all pending transactions
 */
async function checkAndUpdateAllPending() {
  log.header('Checking All Pending Transactions');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    log.error('MONGODB_URI not configured');
    return;
  }

  await mongoose.connect(mongoUri);
  log.success('Connected to MongoDB');

  const Transaction = require('../models/Transaction');
  const User = require('../models/User');
  const client = initializeJuspay();

  const pendingTxns = await Transaction.find({
    'payment_info.payment_gateway': 'hdfc',
    'payment_info.gateway_order_id': { $exists: true, $ne: null },
    status: 'pending'
  }).sort({ created_at: -1 });

  log.info(`Found ${pendingTxns.length} pending transactions to check\n`);

  const results = {
    updated_to_success: [],
    updated_to_failed: [],
    still_pending: [],
    errors: []
  };

  for (const txn of pendingTxns) {
    const orderId = txn.payment_info?.gateway_order_id;
    log.info(`\nChecking: ${orderId}`);

    try {
      const orderStatus = await client.order.status(orderId);
      log.debug(`  HDFC Status: ${orderStatus.status}`);

      const successStatuses = ['CHARGED', 'COD_INITIATED'];
      const failedStatuses = ['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED', 'AUTO_REFUNDED'];

      if (successStatuses.includes(orderStatus.status)) {
        // Update transaction
        txn.status = 'completed';
        txn.payment_info.payment_status = 'completed';
        txn.payment_info.gateway_transaction_id = orderStatus.txn_id;
        txn.payment_info.bank_ref_no = orderStatus.bank_ref_no;
        txn.payment_info.payment_method = orderStatus.payment_method;
        txn.payment_info.payment_date = new Date();
        txn.updated_at = new Date();
        txn.transaction_date = new Date();

        // Credit wallet
        const user = await User.findById(txn.user_id);
        if (user) {
          const openingBalance = user.wallet_balance || 0;
          user.wallet_balance = Math.round((openingBalance + txn.amount) * 100) / 100;

          txn.balance_info = {
            opening_balance: openingBalance,
            closing_balance: user.wallet_balance
          };

          await user.save();
          await txn.save();

          log.success(`  Updated to COMPLETED - Wallet credited ₹${txn.amount}`);
          log.success(`  New Balance: ₹${user.wallet_balance}`);
          results.updated_to_success.push({
            orderId,
            amount: txn.amount,
            txnId: orderStatus.txn_id,
            bankRef: orderStatus.bank_ref_no
          });
        }
      } else if (failedStatuses.includes(orderStatus.status)) {
        txn.status = 'failed';
        txn.payment_info.payment_status = 'failed';
        txn.notes = orderStatus.error_message || 'Payment failed';
        txn.updated_at = new Date();
        await txn.save();

        log.error(`  Updated to FAILED: ${orderStatus.error_message || 'Unknown error'}`);
        results.updated_to_failed.push({ orderId, error: orderStatus.error_message });
      } else {
        log.warn(`  Still PENDING: ${orderStatus.status}`);
        results.still_pending.push({ orderId, status: orderStatus.status });
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      log.error(`  Error: ${error.message}`);
      results.errors.push({ orderId, error: error.message });
    }
  }

  // Summary
  log.header('SUMMARY');
  console.log(`\n${colors.green}Successfully Completed: ${results.updated_to_success.length}${colors.reset}`);
  results.updated_to_success.forEach(r => {
    console.log(`  - ${r.orderId}: ₹${r.amount} (TXN: ${r.txnId})`);
  });

  console.log(`\n${colors.red}Failed: ${results.updated_to_failed.length}${colors.reset}`);
  results.updated_to_failed.forEach(r => {
    console.log(`  - ${r.orderId}: ${r.error}`);
  });

  console.log(`\n${colors.yellow}Still Pending: ${results.still_pending.length}${colors.reset}`);
  results.still_pending.forEach(r => {
    console.log(`  - ${r.orderId}: ${r.status}`);
  });

  console.log(`\n${colors.red}Errors: ${results.errors.length}${colors.reset}`);
  results.errors.forEach(r => {
    console.log(`  - ${r.orderId}: ${r.error}`);
  });

  await mongoose.disconnect();
}

/**
 * Simulate what the callback endpoint receives
 */
async function simulateCallbackEndpoint(orderId) {
  log.header('Simulating Callback Flow');

  log.info(`\nWhat HDFC sends to your return URL:`);
  log.info(`POST/GET to: ${process.env.HDFC_RETURN_URL}`);

  console.log(`\n${colors.cyan}Expected Request Body/Query from HDFC:${colors.reset}`);
  console.log(`{`);
  console.log(`  "order_id": "${orderId}",`);
  console.log(`  "status": "CHARGED" // or other status`);
  console.log(`}`);

  log.info(`\nYour callback handler should:`);
  console.log(`  1. Extract order_id from req.body.order_id OR req.query.order_id`);
  console.log(`  2. Call HDFC API to verify: client.order.status(order_id)`);
  console.log(`  3. Update transaction in database`);
  console.log(`  4. Credit wallet if status is CHARGED`);
  console.log(`  5. Redirect user to confirmation page`);

  // Now actually get the status
  if (orderId) {
    const client = initializeJuspay();
    await getDetailedOrderStatus(client, orderId);
  }
}

/**
 * Main
 */
async function main() {
  console.log(`\n${colors.bright}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║           HDFC UAT CALLBACK CAPTURE & DEBUG SCRIPT                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node scripts/captureHdfcCallback.js --order-id <ORDER_ID>
      Get detailed status for a specific order

  node scripts/captureHdfcCallback.js --list-pending
      List all pending HDFC transactions

  node scripts/captureHdfcCallback.js --check-all
      Check and update ALL pending transactions

  node scripts/captureHdfcCallback.js --simulate <ORDER_ID>
      Simulate the callback flow

Examples:
  node scripts/captureHdfcCallback.js --order-id wal1767632896143mpyk
  node scripts/captureHdfcCallback.js --list-pending
  node scripts/captureHdfcCallback.js --check-all
`);
    process.exit(0);
  }

  try {
    if (args.includes('--list-pending')) {
      await listPendingTransactions();
    } else if (args.includes('--check-all')) {
      await checkAndUpdateAllPending();
    } else if (args.includes('--order-id')) {
      const orderIdIndex = args.indexOf('--order-id');
      const orderId = args[orderIdIndex + 1];
      if (!orderId) {
        log.error('Please provide an order ID');
        process.exit(1);
      }
      const client = initializeJuspay();
      await getDetailedOrderStatus(client, orderId);
    } else if (args.includes('--simulate')) {
      const simIndex = args.indexOf('--simulate');
      const orderId = args[simIndex + 1];
      await simulateCallbackEndpoint(orderId);
    } else if (args[0]) {
      // Assume first arg is order ID
      const client = initializeJuspay();
      await getDetailedOrderStatus(client, args[0]);
    } else {
      log.info('No arguments provided. Run with --help for usage.');
      log.info('\nChecking current HDFC configuration:');
      log.info(`  HDFC_MERCHANT_ID: ${process.env.HDFC_MERCHANT_ID || 'NOT SET'}`);
      log.info(`  HDFC_BASE_URL: ${process.env.HDFC_BASE_URL || 'NOT SET'}`);
      log.info(`  HDFC_RETURN_URL: ${process.env.HDFC_RETURN_URL || 'NOT SET'}`);
      log.info(`  HDFC_KEY_UUID: ${process.env.HDFC_KEY_UUID ? 'SET' : 'NOT SET'}`);
      log.info(`  Keys configured: ${(process.env.HDFC_PRIVATE_KEY || process.env.HDFC_PRIVATE_KEY_PATH) ? 'YES' : 'NO'}`);
    }
  } catch (error) {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

main();
