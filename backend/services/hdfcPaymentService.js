// Location: backend/services/hdfcPaymentService.js
// HDFC SmartGateway Payment Service using Juspay ExpressCheckout SDK with JWT Authentication

const { Juspay, APIError } = require('expresscheckout-nodejs');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Initialize Juspay SDK
let juspay = null;

const initializeJuspay = () => {
  if (juspay) return juspay;

  const merchantId = process.env.HDFC_MERCHANT_ID;
  const baseUrl = process.env.HDFC_BASE_URL || 'https://smartgateway.hdfc.bank.in';
  const keyUuid = process.env.HDFC_KEY_UUID;
  const privateKeyPath = process.env.HDFC_PRIVATE_KEY_PATH;
  const publicKeyPath = process.env.HDFC_PUBLIC_KEY_PATH;

  if (!merchantId || !keyUuid) {
    logger.error('HDFC SmartGateway credentials not configured');
    throw new Error('HDFC SmartGateway credentials not configured. Missing MERCHANT_ID or KEY_UUID');
  }

  // Read keys - try environment variables first (for cloud deployment), then files
  let privateKey, publicKey;

  // Check for keys in environment variables (base64 encoded for multiline support)
  if (process.env.HDFC_PRIVATE_KEY && process.env.HDFC_PUBLIC_KEY) {
    try {
      // Keys can be stored as base64 or raw (with \n escaped)
      privateKey = process.env.HDFC_PRIVATE_KEY.includes('-----BEGIN')
        ? process.env.HDFC_PRIVATE_KEY.replace(/\\n/g, '\n')
        : Buffer.from(process.env.HDFC_PRIVATE_KEY, 'base64').toString('utf8');
      publicKey = process.env.HDFC_PUBLIC_KEY.includes('-----BEGIN')
        ? process.env.HDFC_PUBLIC_KEY.replace(/\\n/g, '\n')
        : Buffer.from(process.env.HDFC_PUBLIC_KEY, 'base64').toString('utf8');
      logger.info('HDFC keys loaded from environment variables');
    } catch (err) {
      logger.error('Failed to parse HDFC keys from environment variables', { error: err.message });
      throw new Error(`Failed to parse HDFC keys from environment variables: ${err.message}`);
    }
  } else if (privateKeyPath && publicKeyPath) {
    // Fallback to reading from files (for local development)
    try {
      const basePath = path.join(__dirname, '..');
      privateKey = fs.readFileSync(path.join(basePath, privateKeyPath), 'utf8');
      publicKey = fs.readFileSync(path.join(basePath, publicKeyPath), 'utf8');
      logger.info('HDFC keys loaded from files');
    } catch (err) {
      logger.error('Failed to read HDFC JWT keys from files', { error: err.message });
      throw new Error(`Failed to read HDFC JWT keys: ${err.message}. For cloud deployment, set HDFC_PRIVATE_KEY and HDFC_PUBLIC_KEY environment variables.`);
    }
  } else {
    throw new Error('HDFC keys not configured. Set HDFC_PRIVATE_KEY/HDFC_PUBLIC_KEY env vars or HDFC_PRIVATE_KEY_PATH/HDFC_PUBLIC_KEY_PATH file paths.');
  }

  // Initialize with JWT/JWE authentication
  juspay = new Juspay({
    merchantId: merchantId,
    baseUrl: baseUrl,
    jweAuth: {
      keyId: keyUuid,
      publicKey: publicKey,
      privateKey: privateKey
    }
  });

  logger.info('HDFC SmartGateway SDK initialized with JWT auth', { merchantId, baseUrl, keyUuid });
  return juspay;
};

/**
 * Create an order session for wallet recharge
 * @param {Object} params - Payment parameters
 * @param {number} params.amount - Amount to charge (in INR)
 * @param {string} params.customerId - User ID
 * @param {string} params.customerEmail - User email
 * @param {string} params.customerPhone - User phone number
 * @param {string} params.transactionId - Internal transaction ID
 * @returns {Object} - Order session response with payment link
 */
const createOrderSession = async ({ amount, customerId, customerEmail, customerPhone, transactionId }) => {
  try {
    const client = initializeJuspay();

    // Generate unique order ID (max 21 chars, alphanumeric only)
    const orderId = `wal${Date.now()}${Math.random().toString(36).substr(2, 4)}`.substring(0, 20);

    const returnUrl = process.env.HDFC_RETURN_URL || 'https://shipsarthi.com/billing?payment_redirect=true';
    const paymentPageClientId = process.env.HDFC_PAYMENT_PAGE_CLIENT_ID || 'hdfcmaster';

    logger.info('Creating HDFC order session', {
      orderId,
      amount,
      customerId,
      transactionId
    });

    // Create order session using Juspay SDK
    const orderSession = await client.orderSession.create({
      order_id: orderId,
      amount: amount.toString(),
      customer_id: customerId,
      customer_email: customerEmail || undefined,
      customer_phone: customerPhone || undefined,
      payment_page_client_id: paymentPageClientId,
      action: 'paymentPage',
      return_url: returnUrl,
      currency: 'INR',
      description: `Wallet recharge - ${transactionId}`
    });

    logger.info('HDFC order session created', {
      orderId,
      orderSessionId: orderSession.id,
      status: orderSession.status,
      paymentLinks: orderSession.payment_links
    });

    return {
      success: true,
      orderId: orderId,
      orderSessionId: orderSession.id,
      paymentLink: orderSession.payment_links?.web || orderSession.payment_links?.iframe,
      sdkPayload: orderSession.sdk_payload,
      status: orderSession.status
    };
  } catch (error) {
    logger.error('Error creating HDFC order session', {
      error: error.message,
      stack: error.stack,
      errorCode: error instanceof APIError ? error.errorCode : undefined
    });

    throw error;
  }
};

/**
 * Get order status to verify payment
 * @param {string} orderId - The HDFC order ID
 * @returns {Object} - Order status with payment details
 */
const getOrderStatus = async (orderId) => {
  try {
    const client = initializeJuspay();

    logger.info('Checking HDFC order status', { orderId });

    const orderStatus = await client.order.status(orderId);

    logger.info('HDFC order status retrieved', {
      orderId,
      status: orderStatus.status,
      txnId: orderStatus.txn_id
    });

    return {
      success: true,
      orderId: orderStatus.order_id,
      status: orderStatus.status,
      amount: parseFloat(orderStatus.amount),
      txnId: orderStatus.txn_id,
      bankRefNo: orderStatus.bank_ref_no,
      paymentMethod: orderStatus.payment_method,
      paymentMethodType: orderStatus.payment_method_type,
      gatewayReferenceId: orderStatus.gateway_reference_id,
      errorCode: orderStatus.error_code,
      errorMessage: orderStatus.error_message
    };
  } catch (error) {
    logger.error('Error getting HDFC order status', {
      orderId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
};

/**
 * Map HDFC payment status to internal transaction status
 * @param {string} hdfcStatus - Status from HDFC
 * @returns {string} - Internal status (completed, pending, failed)
 */
const mapPaymentStatus = (hdfcStatus) => {
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
};

/**
 * Check if payment was successful
 * @param {string} hdfcStatus - Status from HDFC
 * @returns {boolean}
 */
const isPaymentSuccessful = (hdfcStatus) => {
  return ['CHARGED', 'COD_INITIATED'].includes(hdfcStatus);
};

module.exports = {
  initializeJuspay,
  createOrderSession,
  getOrderStatus,
  mapPaymentStatus,
  isPaymentSuccessful
};
