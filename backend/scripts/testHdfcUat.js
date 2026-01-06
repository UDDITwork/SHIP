/**
 * HDFC UAT Server Response Test Script
 *
 * This script tests connectivity and response handling from HDFC UAT servers.
 * It performs the following tests:
 * 1. SDK Initialization Test
 * 2. Create Order Session Test
 * 3. Get Order Status Test (for existing orders)
 * 4. Response Format Analysis
 *
 * Usage: node scripts/testHdfcUat.js [order_id]
 */

require('dotenv').config();
const { Juspay, APIError } = require('expresscheckout-nodejs');
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

// Test results collector
const testResults = {
  passed: [],
  failed: [],
  warnings: []
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

  log.info(`Merchant ID: ${merchantId}`);
  log.info(`Base URL: ${baseUrl}`);
  log.info(`Key UUID: ${keyUuid}`);
  log.info(`Return URL: ${process.env.HDFC_RETURN_URL}`);

  if (!merchantId || !keyUuid) {
    throw new Error('HDFC credentials not configured. Missing MERCHANT_ID or KEY_UUID');
  }

  let privateKey, publicKey;

  // Check for keys in environment variables
  if (process.env.HDFC_PRIVATE_KEY && process.env.HDFC_PUBLIC_KEY) {
    privateKey = process.env.HDFC_PRIVATE_KEY.includes('-----BEGIN')
      ? process.env.HDFC_PRIVATE_KEY.replace(/\\n/g, '\n')
      : Buffer.from(process.env.HDFC_PRIVATE_KEY, 'base64').toString('utf8');
    publicKey = process.env.HDFC_PUBLIC_KEY.includes('-----BEGIN')
      ? process.env.HDFC_PUBLIC_KEY.replace(/\\n/g, '\n')
      : Buffer.from(process.env.HDFC_PUBLIC_KEY, 'base64').toString('utf8');
    log.info('Keys loaded from environment variables');
  } else if (privateKeyPath && publicKeyPath) {
    const basePath = path.join(__dirname, '..');
    privateKey = fs.readFileSync(path.join(basePath, privateKeyPath), 'utf8');
    publicKey = fs.readFileSync(path.join(basePath, publicKeyPath), 'utf8');
    log.info(`Keys loaded from files: ${privateKeyPath}, ${publicKeyPath}`);
  } else {
    throw new Error('HDFC keys not configured');
  }

  // Validate key format
  if (!privateKey.includes('-----BEGIN') || !publicKey.includes('-----BEGIN')) {
    throw new Error('Invalid key format - keys should be in PEM format');
  }

  log.success('Keys validated successfully');

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
 * Test 1: SDK Initialization
 */
async function testSdkInitialization() {
  log.header('TEST 1: SDK Initialization');

  try {
    const client = initializeJuspay();
    log.success('Juspay SDK initialized successfully');
    testResults.passed.push('SDK Initialization');
    return client;
  } catch (error) {
    log.error(`SDK Initialization failed: ${error.message}`);
    testResults.failed.push(`SDK Initialization: ${error.message}`);
    return null;
  }
}

/**
 * Test 2: Create Order Session
 */
async function testCreateOrderSession(client) {
  log.header('TEST 2: Create Order Session');

  if (!client) {
    log.warn('Skipping - SDK not initialized');
    return null;
  }

  try {
    const testOrderId = `test${Date.now()}${Math.random().toString(36).substr(2, 4)}`.substring(0, 20);
    const returnUrl = process.env.HDFC_RETURN_URL || 'https://shipsarthi.com/api/billing/wallet/payment-return';
    const paymentPageClientId = process.env.HDFC_PAYMENT_PAGE_CLIENT_ID || 'hdfcmaster';

    log.info(`Creating test order: ${testOrderId}`);
    log.info(`Return URL configured: ${returnUrl}`);
    log.info(`Payment Page Client ID: ${paymentPageClientId}`);

    const orderSession = await client.orderSession.create({
      order_id: testOrderId,
      amount: '100.00',
      customer_id: 'test_customer_123',
      customer_email: 'test@example.com',
      customer_phone: '9999999999',
      payment_page_client_id: paymentPageClientId,
      action: 'paymentPage',
      return_url: returnUrl,
      currency: 'INR',
      description: 'UAT Test Order'
    });

    log.success('Order session created successfully!');
    log.info('\n--- RAW RESPONSE FROM HDFC UAT ---');
    console.log(JSON.stringify(orderSession, null, 2));
    log.info('--- END RAW RESPONSE ---\n');

    // Analyze response
    log.info('Response Analysis:');
    log.info(`  - Order ID: ${orderSession.order_id || orderSession.orderId || 'NOT FOUND'}`);
    log.info(`  - Session ID: ${orderSession.id || 'NOT FOUND'}`);
    log.info(`  - Status: ${orderSession.status || 'NOT FOUND'}`);
    log.info(`  - Payment Links: ${JSON.stringify(orderSession.payment_links) || 'NOT FOUND'}`);
    log.info(`  - SDK Payload: ${orderSession.sdk_payload ? 'PRESENT' : 'NOT FOUND'}`);

    // Check for payment link
    if (orderSession.payment_links?.web || orderSession.payment_links?.iframe) {
      log.success(`Payment Link available: ${orderSession.payment_links.web || orderSession.payment_links.iframe}`);
    } else {
      log.warn('No payment link in response - check payment_links structure');
    }

    testResults.passed.push('Create Order Session');
    return testOrderId;
  } catch (error) {
    log.error(`Create Order Session failed: ${error.message}`);
    if (error instanceof APIError) {
      log.error(`API Error Code: ${error.errorCode}`);
      log.error(`API Error Message: ${error.errorMessage}`);
      log.error(`API Error Details: ${JSON.stringify(error)}`);
    }
    console.error('Full error:', error);
    testResults.failed.push(`Create Order Session: ${error.message}`);
    return null;
  }
}

/**
 * Test 3: Get Order Status
 */
async function testGetOrderStatus(client, orderId) {
  log.header('TEST 3: Get Order Status');

  if (!client) {
    log.warn('Skipping - SDK not initialized');
    return;
  }

  if (!orderId) {
    log.warn('Skipping - No order ID provided');
    return;
  }

  try {
    log.info(`Checking status for order: ${orderId}`);

    const orderStatus = await client.order.status(orderId);

    log.success('Order status retrieved successfully!');
    log.info('\n--- RAW ORDER STATUS RESPONSE FROM HDFC UAT ---');
    console.log(JSON.stringify(orderStatus, null, 2));
    log.info('--- END RAW RESPONSE ---\n');

    // Detailed status analysis
    log.info('Status Analysis:');
    log.info(`  - Order ID: ${orderStatus.order_id}`);
    log.info(`  - Status: ${orderStatus.status}`);
    log.info(`  - Amount: ${orderStatus.amount}`);
    log.info(`  - Transaction ID (txn_id): ${orderStatus.txn_id || 'NOT PRESENT'}`);
    log.info(`  - Bank Reference No: ${orderStatus.bank_ref_no || 'NOT PRESENT'}`);
    log.info(`  - Payment Method: ${orderStatus.payment_method || 'NOT PRESENT'}`);
    log.info(`  - Payment Method Type: ${orderStatus.payment_method_type || 'NOT PRESENT'}`);
    log.info(`  - Gateway Reference ID: ${orderStatus.gateway_reference_id || 'NOT PRESENT'}`);
    log.info(`  - Error Code: ${orderStatus.error_code || 'NONE'}`);
    log.info(`  - Error Message: ${orderStatus.error_message || 'NONE'}`);

    // Check status interpretation
    const successStatuses = ['CHARGED', 'COD_INITIATED'];
    const pendingStatuses = ['AUTHORIZED', 'PENDING', 'PENDING_VBV', 'AUTHORIZING', 'NEW', 'STARTED'];
    const failedStatuses = ['AUTHORIZATION_FAILED', 'AUTHENTICATION_FAILED', 'JUSPAY_DECLINED', 'AUTO_REFUNDED'];

    if (successStatuses.includes(orderStatus.status)) {
      log.success(`Status ${orderStatus.status} is a SUCCESS status - wallet should be credited`);
    } else if (pendingStatuses.includes(orderStatus.status)) {
      log.warn(`Status ${orderStatus.status} is a PENDING status - transaction still in progress`);
    } else if (failedStatuses.includes(orderStatus.status)) {
      log.error(`Status ${orderStatus.status} is a FAILED status`);
    } else {
      log.warn(`Status ${orderStatus.status} is UNKNOWN - not in predefined status map!`);
      testResults.warnings.push(`Unknown status received: ${orderStatus.status}`);
    }

    testResults.passed.push('Get Order Status');
    return orderStatus;
  } catch (error) {
    log.error(`Get Order Status failed: ${error.message}`);
    if (error instanceof APIError) {
      log.error(`API Error Code: ${error.errorCode}`);
      log.error(`API Error Message: ${error.errorMessage}`);
    }
    console.error('Full error:', error);
    testResults.failed.push(`Get Order Status: ${error.message}`);
    return null;
  }
}

/**
 * Test 4: Check existing transactions in database
 */
async function testExistingTransactions() {
  log.header('TEST 4: Check Existing HDFC Transactions in Database');

  try {
    const mongoose = require('mongoose');
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      log.warn('MONGODB_URI not set - skipping database check');
      return [];
    }

    log.info('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    log.success('Connected to MongoDB');

    // Load Transaction model
    const Transaction = require('../models/Transaction');

    // Find recent HDFC transactions
    const recentTransactions = await Transaction.find({
      'payment_info.payment_gateway': 'hdfc'
    })
      .sort({ created_at: -1 })
      .limit(10)
      .lean();

    log.info(`Found ${recentTransactions.length} recent HDFC transactions`);

    if (recentTransactions.length > 0) {
      log.info('\n--- RECENT HDFC TRANSACTIONS ---');
      recentTransactions.forEach((txn, i) => {
        console.log(`\n${colors.cyan}Transaction ${i + 1}:${colors.reset}`);
        console.log(`  Transaction ID: ${txn.transaction_id}`);
        console.log(`  Gateway Order ID: ${txn.payment_info?.gateway_order_id || 'N/A'}`);
        console.log(`  Gateway TXN ID: ${txn.payment_info?.gateway_transaction_id || 'N/A'}`);
        console.log(`  Status: ${txn.status}`);
        console.log(`  Payment Status: ${txn.payment_info?.payment_status || 'N/A'}`);
        console.log(`  Amount: ₹${txn.amount}`);
        console.log(`  Created: ${txn.created_at}`);
        console.log(`  Updated: ${txn.updated_at}`);
      });
      log.info('--- END TRANSACTIONS ---\n');

      // Return order IDs for further testing
      return recentTransactions
        .filter(t => t.payment_info?.gateway_order_id)
        .map(t => t.payment_info.gateway_order_id);
    }

    await mongoose.disconnect();
    testResults.passed.push('Database Transaction Check');
    return [];
  } catch (error) {
    log.error(`Database check failed: ${error.message}`);
    testResults.warnings.push(`Database check: ${error.message}`);
    return [];
  }
}

/**
 * Test 5: Verify Return URL accessibility
 */
async function testReturnUrlAccessibility() {
  log.header('TEST 5: Return URL Configuration Check');

  const returnUrl = process.env.HDFC_RETURN_URL;

  if (!returnUrl) {
    log.error('HDFC_RETURN_URL is not configured!');
    testResults.failed.push('Return URL not configured');
    return;
  }

  log.info(`Configured Return URL: ${returnUrl}`);

  // Parse and analyze the URL
  try {
    const url = new URL(returnUrl);
    log.info(`  - Protocol: ${url.protocol}`);
    log.info(`  - Host: ${url.host}`);
    log.info(`  - Path: ${url.pathname}`);
    log.info(`  - Query: ${url.search || 'none'}`);

    // Check if it points to the correct endpoint
    if (url.pathname.includes('/api/billing/wallet/payment-return')) {
      log.success('Return URL correctly points to payment-return endpoint');
    } else if (url.pathname === '/billing' || url.pathname.includes('payment_redirect')) {
      log.warn('Return URL points to frontend, not backend callback endpoint!');
      log.warn('HDFC callbacks should go to: /api/billing/wallet/payment-return');
      testResults.warnings.push('Return URL may be misconfigured - points to frontend');
    } else {
      log.warn(`Return URL path is: ${url.pathname} - verify this is correct`);
    }

    // Check for HTTPS in production URL
    if (url.host.includes('shipsarthi.com') && url.protocol !== 'https:') {
      log.error('Production URL should use HTTPS!');
      testResults.failed.push('Return URL not using HTTPS');
    }

    testResults.passed.push('Return URL Check');
  } catch (error) {
    log.error(`Invalid Return URL format: ${error.message}`);
    testResults.failed.push('Invalid Return URL format');
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`\n${colors.bright}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         HDFC UAT SERVER RESPONSE TEST SUITE              ║');
  console.log('║         Testing connectivity and response handling       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const startTime = Date.now();
  const providedOrderId = process.argv[2];

  if (providedOrderId) {
    log.info(`Testing with provided order ID: ${providedOrderId}`);
  }

  // Run tests
  const client = await testSdkInitialization();

  // Test return URL configuration
  await testReturnUrlAccessibility();

  // Create a test order
  const newOrderId = await testCreateOrderSession(client);

  // Get status of provided order OR newly created order
  const orderIdToCheck = providedOrderId || newOrderId;
  if (orderIdToCheck) {
    await testGetOrderStatus(client, orderIdToCheck);
  }

  // Check existing transactions
  const existingOrderIds = await testExistingTransactions();

  // If we have existing pending/completed orders, check their status
  if (existingOrderIds.length > 0 && client) {
    log.header('BONUS: Checking Status of Existing Orders');
    for (const oid of existingOrderIds.slice(0, 3)) {
      log.info(`\nChecking order: ${oid}`);
      try {
        const status = await client.order.status(oid);
        log.info(`  Status: ${status.status}`);
        log.info(`  TXN ID: ${status.txn_id || 'N/A'}`);
        log.info(`  Bank Ref: ${status.bank_ref_no || 'N/A'}`);
      } catch (err) {
        log.error(`  Failed to get status: ${err.message}`);
      }
    }
  }

  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  log.header('TEST SUMMARY');
  console.log(`\nDuration: ${duration}s\n`);

  console.log(`${colors.green}PASSED (${testResults.passed.length}):${colors.reset}`);
  testResults.passed.forEach(t => console.log(`  ✓ ${t}`));

  if (testResults.warnings.length > 0) {
    console.log(`\n${colors.yellow}WARNINGS (${testResults.warnings.length}):${colors.reset}`);
    testResults.warnings.forEach(t => console.log(`  ⚠ ${t}`));
  }

  if (testResults.failed.length > 0) {
    console.log(`\n${colors.red}FAILED (${testResults.failed.length}):${colors.reset}`);
    testResults.failed.forEach(t => console.log(`  ✗ ${t}`));
  }

  console.log('\n');

  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log.error(`Test suite crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
