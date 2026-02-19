const express = require('express');
const { body, validationResult, query } = require('express-validator');
const moment = require('moment');
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const { auth } = require('../middleware/auth');
const Order = require('../models/Order');
const Warehouse = require('../models/Warehouse');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const TrackingOrder = require('../models/TrackingOrder');
const BillingCycle = require('../models/BillingCycle');
const Carrier = require('../models/Carrier');
const RateCardService = require('../services/rateCardService');
const delhiveryService = require('../services/delhiveryService');
const websocketService = require('../services/websocketService');
const trackingService = require('../services/trackingService');
const labelRenderer = require('../services/labelRenderer');
const logger = require('../utils/logger');

const router = express.Router();

const uploadStorage = multer.memoryStorage();
const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const normalizeKey = (key) => (key ? key.toString().trim().toLowerCase().replace(/\s+/g, '_') : '');

const isRowEmpty = (row) => {
  if (!row) return true;
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
  });
};

const normalizeString = (value, defaultValue = '') => {
  if (value === null || value === undefined) return defaultValue;
  if (value instanceof Date) {
    return moment(value).format('YYYY-MM-DD');
  }
  return value.toString().trim() || defaultValue;
};

const normalizePincode = (value) => {
  if (value === null || value === undefined) return '';
  let str = value.toString().trim();
  if (!str) return '';
  str = str.replace(/\D/g, '');
  if (str.length > 6) {
    str = str.slice(0, 6);
  }
  return str;
};

const normalizePhone = (value) => {
  if (value === null || value === undefined) return '';
  let str = value.toString().trim();
  if (!str) return '';
  str = str.replace(/\D/g, '');
  if (str.length > 10) {
    str = str.slice(-10);
  }
  return str;
};

const parseNumber = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === '') return defaultValue;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return defaultValue;
  return num;
};

const parseInteger = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === '') return defaultValue;
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return defaultValue;
  return num;
};

const normalizeDate = (value) => {
  if (!value) {
    return moment().format('YYYY-MM-DD');
  }

  if (value instanceof Date) {
    return moment(value).format('YYYY-MM-DD');
  }

  const raw = value.toString().trim();
  if (!raw) {
    return moment().format('YYYY-MM-DD');
  }

  let date = moment(raw, ['YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'], true);
  if (!date.isValid()) {
    date = moment(new Date(raw));
  }

  if (!date.isValid()) {
    return moment().format('YYYY-MM-DD');
  }

  return date.format('YYYY-MM-DD');
};

const normalizePaymentMode = (value) => {
  const normalized = normalizeString(value).toUpperCase();
  return normalized === 'COD' ? 'COD' : 'Prepaid';
};

const normalizeShippingMode = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === 'express' ? 'Express' : 'Surface';
};

const normalizeWarehouseIdentifier = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return '';
  }
  return normalized.toLowerCase().replace(/\s+/g, ' ').trim();
};

const SERVICEABILITY_ERROR_CODE = 'PINCODE_NOT_SERVICEABLE';

const normalizeBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    return ['y', 'yes', 'true', '1'].includes(value.trim().toLowerCase());
  }
  return false;
};

async function ensureServiceablePincodes(pickupPincode, deliveryPincode, paymentMode = 'Prepaid') {
  if (!pickupPincode || !deliveryPincode) {
    throw new Error('Pickup and delivery pincodes are required to validate serviceability.');
  }

  const [pickupResult, deliveryResult] = await Promise.all([
    delhiveryService.getServiceability(pickupPincode),
    delhiveryService.getServiceability(deliveryPincode)
  ]);

  if (!pickupResult.success) {
    throw new Error('Unable to verify pickup pincode serviceability. Please try again.');
  }

  if (!pickupResult.serviceable || normalizeBooleanFlag(pickupResult.pickup_available) === false) {
    throw new Error(`Pickup pincode ${pickupPincode} is not serviceable by Delhivery.`);
  }

  if (!deliveryResult.success) {
    throw new Error('Unable to verify delivery pincode serviceability. Please try again.');
  }

  if (!deliveryResult.serviceable) {
    throw new Error(`Delivery pincode ${deliveryPincode} is not serviceable by Delhivery.`);
  }

  if (paymentMode === 'COD' && normalizeBooleanFlag(deliveryResult.cash_on_delivery) === false) {
    throw new Error(`Delivery pincode ${deliveryPincode} does not support COD.`);
  }

  return {
    pickup: pickupResult,
    delivery: deliveryResult
  };
}

async function refundShippingChargesToWallet(order, userId) {
  try {
    const shippingCharges = order.payment_info?.shipping_charges || 0;
    if (shippingCharges <= 0) {
      logger.info('ℹ️ No shipping charges to refund for cancellation', {
        orderId: order.order_id,
        shippingCharges
      });
      return null;
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found for wallet refund');
    }

    const openingBalance = user.wallet_balance || 0;
    // Use Math.round to avoid floating-point precision issues
    const closingBalance = Math.round((openingBalance + shippingCharges) * 100) / 100;

    user.wallet_balance = closingBalance;
    await user.save();

    const refundTransaction = new Transaction({
      transaction_id: `CR${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      user_id: userId,
      transaction_type: 'credit',
      transaction_category: 'shipment_cancellation_refund',
      amount: shippingCharges,
      description: `Refund for cancelled shipment - Order ${order.order_id}`,
      related_order_id: order._id,
      status: 'completed',
      transaction_date: new Date(),
      balance_info: {
        opening_balance: openingBalance,
        closing_balance: closingBalance
      },
      order_info: {
        order_id: order.order_id,
        awb_number: order.delhivery_data?.waybill || null,
        weight: order.package_info?.weight * 1000 || 0,
        zone: order.delhivery_data?.status_type || null,
        order_date: order.order_date
      }
    });

    await refundTransaction.save();

    try {
      websocketService.sendNotificationToClient(String(userId), {
        type: 'wallet_refund',
        title: 'Wallet Refunded',
        message: `₹${shippingCharges} refunded for cancelled shipment ${order.order_id}. New balance: ₹${closingBalance}`,
        client_id: userId,
        amount: shippingCharges,
        transaction_type: 'credit',
        new_balance: closingBalance,
        order_id: order.order_id,
        created_at: new Date()
      });

      websocketService.sendNotificationToClient(String(userId), {
        type: 'wallet_balance_update',
        balance: closingBalance,
        currency: 'INR',
        previous_balance: openingBalance,
        amount: shippingCharges,
        transaction_id: refundTransaction.transaction_id,
        timestamp: new Date().toISOString()
      });

      logger.info('📡 Wallet refund notifications sent', {
        orderId: order.order_id,
        transactionId: refundTransaction.transaction_id,
        amount: shippingCharges,
        closingBalance: closingBalance
      });
    } catch (notifError) {
      logger.error('Failed to send wallet refund notifications:', notifError);
    }

    logger.info('✅ Wallet refunded successfully', {
      orderId: order.order_id,
      transactionId: refundTransaction.transaction_id,
      amount: shippingCharges,
      oldBalance: openingBalance,
      newBalance: closingBalance
    });

    return refundTransaction;
  } catch (error) {
    logger.error('❌ WALLET REFUND FAILED', {
      orderId: order.order_id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return null;
  }
}

function applyCancellationMetadata(order, message, statusType = 'CN', delhiveryResponse = null) {
  if (!order.delhivery_data) {
    order.delhivery_data = {};
  }

  order.delhivery_data.cancellation_status = 'cancelled';
  order.delhivery_data.cancellation_date = new Date();
  order.delhivery_data.cancellation_message = message;
  order.delhivery_data.status_type = statusType;

  if (delhiveryResponse) {
    order.delhivery_data.cancellation_response = delhiveryResponse;
  }

  order.status = 'cancelled';
  order.markModified('delhivery_data');
}

// NOTE: Zone calculation removed - now using Delhivery API to get zone
// Zone is fetched from Delhivery invoice/charges API response

/**
 * Helper function to deduct wallet and create transaction for order
 * @param {Object} order - The order document
 * @param {String} userId - User ID
 * @param {String} awbNumber - Optional AWB number (for orders with AWB)
 * @returns {Promise<Object>} - Returns { success: boolean, transaction: Transaction|null, error: string|null }
 */
async function deductWalletForOrder(order, userId, awbNumber = null) {
  try {
    const shippingCharges = order.payment_info?.shipping_charges || 0;
    
    if (shippingCharges <= 0) {
      return { success: true, transaction: null, message: 'No shipping charges to deduct' };
    }
    
    console.log('💳 DEDUCTING WALLET FOR ORDER', {
      orderId: order.order_id,
      shippingCharges,
      timestamp: new Date().toISOString()
    });
    
    // Get current wallet balance
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const openingBalance = user.wallet_balance || 0;
    
    if (openingBalance < shippingCharges) {
      console.error('❌ INSUFFICIENT WALLET BALANCE', {
        orderId: order.order_id,
        required: shippingCharges,
        available: openingBalance,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Insufficient wallet balance. Required: ₹${shippingCharges}, Available: ₹${openingBalance}`);
    }
    
    // Deduct from wallet
    // Use Math.round to avoid floating-point precision issues
    const closingBalance = Math.round((openingBalance - shippingCharges) * 100) / 100;
    user.wallet_balance = closingBalance;
    await user.save();
    
    // Get zone from Delhivery API (optional, won't fail if it doesn't work)
    let zone = null;
    try {
      // Calculate chargeable weight (in grams)
      const volumetricWeightKg = (order.package_info.dimensions.length * 
                                order.package_info.dimensions.width * 
                                order.package_info.dimensions.height) / 5000;
      const volumetricWeightGrams = volumetricWeightKg * 1000;
      const actualWeightGrams = order.package_info.weight * 1000;
      const chargeableWeightGrams = Math.max(actualWeightGrams, volumetricWeightGrams);
      
      // Get zone from Delhivery API
      const zoneResult = await delhiveryService.getZoneFromDelhivery(
        order.pickup_address.pincode,
        order.delivery_address.pincode,
        chargeableWeightGrams,
        order.shipping_mode === 'Express' ? 'E' : 'S',
        'Delivered',
        order.payment_info.payment_mode === 'COD' ? 'COD' : 'Pre-paid'
      );
      
      zone = zoneResult.success ? zoneResult.zone : null;
      
      logger.info('🌍 Zone retrieved from Delhivery for transaction', {
        orderId: order.order_id,
        zone: zone,
        zoneResultSuccess: zoneResult.success,
        chargeableWeightGrams: chargeableWeightGrams
      });
    } catch (zoneError) {
      console.warn('⚠️ Zone retrieval failed (non-critical):', zoneError.message);
      // Continue without zone - not critical for transaction
    }
    
    // Create transaction record
    const transaction = new Transaction({
      transaction_id: `DR${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      user_id: userId,
      transaction_type: 'debit',
      transaction_category: 'shipping_charge',
      amount: shippingCharges,
      description: `Shipping charges for order ${order.order_id}`,
      related_order_id: order._id,
      status: 'completed',
      transaction_date: new Date(),
      balance_info: {
        opening_balance: openingBalance,
        closing_balance: closingBalance
      },
      order_info: {
        order_id: order.order_id,
        awb_number: awbNumber || null,
        weight: order.package_info.weight * 1000, // Convert kg to grams
        zone: zone || null,
        order_date: order.order_date
      }
    });
    
    await transaction.save();
    
    // Calculate billing info for invoice tracking
    try {
      // Calculate volumetric weight (in grams)
      const volumetricWeightKg = (order.package_info.dimensions.length * 
                                order.package_info.dimensions.width * 
                                order.package_info.dimensions.height) / 5000;
      const volumetricWeightGrams = volumetricWeightKg * 1000;
      const actualWeightGrams = order.package_info.weight * 1000;
      const chargedWeightGrams = Math.max(actualWeightGrams, volumetricWeightGrams);
      
      // Calculate charges using RateCardService
      let billingCharges = {
        forward_charge: 0,
        rto_charge: 0,
        cod_charge: 0,
        total_charge: shippingCharges
      };

      if (zone && user.user_category) {
        try {
          // Determine carrier for rate calculation
          let selectedCarrierId = req.body.carrier_id;

          if (!selectedCarrierId && req.body.service_type) {
            // Lookup carrier by service type
            const carrier = await Carrier.findOne({
              carrier_group: 'DELHIVERY',
              service_type: req.body.service_type.toLowerCase(),
              is_active: true
            });

            if (carrier) {
              selectedCarrierId = carrier._id;
            }
          }

          // Calculate charges (with carrier support)
          let chargeResult;
          if (selectedCarrierId) {
            chargeResult = await RateCardService.calculateShippingChargesByCarrier(
              user.user_category,
              actualWeightGrams, // weight in grams
              {
                length: order.package_info.dimensions.length,
                breadth: order.package_info.dimensions.width,
                height: order.package_info.dimensions.height
              },
              zone,
              order.payment_info?.cod_amount || 0,
              order.order_type || 'forward',
              selectedCarrierId
            );
          } else {
            // Legacy: no carrier specified, use default (Surface)
            chargeResult = await RateCardService.calculateShippingCharges(
              user.user_category,
              actualWeightGrams, // weight in grams
              {
                length: order.package_info.dimensions.length,
                breadth: order.package_info.dimensions.width,
                height: order.package_info.dimensions.height
              },
              zone,
              order.payment_info?.cod_amount || 0,
              order.order_type || 'forward'
            );
          }

          billingCharges = {
            forward_charge: chargeResult.forwardCharges,
            rto_charge: chargeResult.rtoCharges,
            cod_charge: chargeResult.codCharges,
            total_charge: chargeResult.totalCharges
          };

          // Store carrier_id in order if provided
          if (selectedCarrierId) {
            order.carrier_used = selectedCarrierId;
          }
        } catch (rateError) {
          console.warn('⚠️ Rate calculation failed, using shipping_charges:', rateError.message);
        }
      }
      
      // Get or create current billing cycle
      const billingCycle = await BillingCycle.getCurrentCycle(userId);
      
      // Update order with billing_info
      order.billing_info = {
        zone: zone,
        declared_weight: actualWeightGrams,
        volumetric_weight: volumetricWeightGrams,
        charged_weight: chargedWeightGrams,
        charges: billingCharges,
        billing_status: 'unbilled',
        billing_cycle_id: billingCycle._id,
        wallet_transaction_id: transaction._id,
        user_category_at_order: user.user_category,
        charged_at: new Date()
      };
      
      await order.save();
      
      // Add order to billing cycle
      await billingCycle.addOrder(order, {
        forwardCharges: billingCharges.forward_charge,
        rtoCharges: billingCharges.rto_charge,
        codCharges: billingCharges.cod_charge,
        totalCharges: billingCharges.total_charge,
        weight_used: chargedWeightGrams,
        zone: zone
      });
      await billingCycle.save();
      
      console.log('✅ BILLING INFO TRACKED', {
        orderId: order.order_id,
        billingCycleId: billingCycle._id,
        zone: zone,
        charges: billingCharges,
        timestamp: new Date().toISOString()
      });
    } catch (billingError) {
      console.error('❌ BILLING INFO TRACKING FAILED (non-critical):', {
        orderId: order.order_id,
        error: billingError.message,
        timestamp: new Date().toISOString()
      });
      // Don't fail wallet deduction if billing tracking fails
    }
    
    // Send WebSocket notifications for wallet deduction
    try {
      // Notification for wallet deduction
      websocketService.sendNotificationToClient(String(userId), {
        type: 'wallet_deduction',
        title: 'Wallet Deducted',
        message: `₹${shippingCharges} deducted for order ${order.order_id}. New balance: ₹${closingBalance}`,
        client_id: userId,
        amount: shippingCharges,
        transaction_type: 'debit',
        new_balance: closingBalance,
        order_id: order.order_id,
        created_at: new Date()
      });
      
      // Real-time wallet balance update
      websocketService.sendNotificationToClient(String(userId), {
        type: 'wallet_balance_update',
        balance: closingBalance,
        currency: 'INR',
        previous_balance: openingBalance,
        amount: shippingCharges,
        transaction_id: transaction.transaction_id,
        timestamp: new Date().toISOString()
      });
      
      console.log('📡 WALLET NOTIFICATIONS SENT:', {
        orderId: order.order_id,
        transactionId: transaction.transaction_id,
        userId: userId,
        amount: shippingCharges,
        closing_balance: closingBalance
      });
    } catch (notifError) {
      console.error('Failed to send wallet notifications:', notifError);
      // Don't fail wallet deduction if notifications fail
    }
    
    console.log('✅ WALLET DEDUCTED SUCCESSFULLY', {
      orderId: order.order_id,
      transactionId: transaction.transaction_id,
      amount: shippingCharges,
      oldBalance: openingBalance,
      newBalance: closingBalance,
      zone: zone,
      userCategory: user.user_category,
      timestamp: new Date().toISOString()
    });
    
    return { 
      success: true, 
      transaction: transaction, 
      message: 'Wallet deducted successfully',
      openingBalance,
      closingBalance
    };
  } catch (error) {
    console.error('❌ WALLET DEDUCTION FAILED', {
      orderId: order.order_id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return {
      success: false,
      transaction: null,
      error: error.message
    };
  }
}

/**
 * Helper function to create a single order (used for multi-package B2C)
 * @param {Object} orderData - The order data from request body
 * @param {Object} user - The authenticated user object
 * @param {boolean} generateAWB - Whether to generate AWB
 * @returns {Promise<Object>} - Returns { success: boolean, order: Order|null, awb: string|null, status: string, error: string|null }
 */
async function createSingleOrder(orderData, user, generateAWB = true) {
  const { generateOrderId } = require('../utils/orderIdGenerator');
  const userId = user._id;
  const orderId = orderData.order_id || generateOrderId();

  try {
    console.log('📦 createSingleOrder: Starting', {
      orderId,
      userId,
      generateAWB,
      weight: orderData.package_info?.weight,
      timestamp: new Date().toISOString()
    });

    // Handle warehouse selection
    let warehouse = null;
    let pickupAddress = {};

    if (orderData.pickup_address?.warehouse_id) {
      warehouse = await Warehouse.findOne({
        _id: orderData.pickup_address.warehouse_id,
        user_id: userId,
        is_active: true
      });

      if (warehouse) {
        pickupAddress = {
          name: warehouse.name,
          full_address: warehouse.address.full_address,
          city: warehouse.address.city,
          state: warehouse.address.state,
          pincode: warehouse.address.pincode,
          phone: warehouse.contact_person.phone,
          country: warehouse.address.country || 'India'
        };
      }
    }

    if (!pickupAddress.name) {
      pickupAddress = {
        name: orderData.pickup_address?.name || 'SHIPSARTHI C2C',
        full_address: orderData.pickup_address?.full_address,
        city: orderData.pickup_address?.city,
        state: orderData.pickup_address?.state,
        pincode: orderData.pickup_address?.pincode,
        phone: orderData.pickup_address?.phone,
        country: orderData.pickup_address?.country || 'India'
      };
    }

    // Build full address
    const fullDeliveryAddress = `${orderData.delivery_address?.address_line_1 || ''}${orderData.delivery_address?.address_line_2 ? ', ' + orderData.delivery_address.address_line_2 : ''}`;

    // Create order document
    const order = new Order({
      user_id: userId,
      order_id: orderId,
      order_date: orderData.order_date ? new Date(orderData.order_date) : new Date(),
      reference_id: orderData.reference_id?.trim() || undefined,
      invoice_number: orderData.invoice_number?.trim() || undefined,
      customer_info: {
        buyer_name: orderData.customer_info?.buyer_name,
        phone: orderData.customer_info?.phone,
        alternate_phone: orderData.customer_info?.alternate_phone?.trim() || undefined,
        email: orderData.customer_info?.email?.trim()?.toLowerCase() || undefined,
        gstin: orderData.customer_info?.gstin?.trim() || undefined
      },
      delivery_address: {
        address_line_1: orderData.delivery_address?.address_line_1,
        address_line_2: orderData.delivery_address?.address_line_2,
        full_address: fullDeliveryAddress,
        city: orderData.delivery_address?.city,
        state: orderData.delivery_address?.state,
        pincode: orderData.delivery_address?.pincode,
        country: orderData.delivery_address?.country || 'India',
        address_type: orderData.delivery_address?.address_type || 'home'
      },
      pickup_address: pickupAddress,
      products: (orderData.products || []).map(product => ({
        product_name: product.product_name,
        product_description: product.product_description,
        quantity: product.quantity,
        unit_price: product.unit_price,
        hsn_code: product.hsn_code,
        category: product.category,
        sku: product.sku,
        discount: product.discount || 0,
        tax: product.tax || 0
      })),
      package_info: {
        package_type: orderData.package_info?.package_type || 'Single Package (B2C)',
        weight: orderData.package_info?.weight,
        dimensions: orderData.package_info?.dimensions,
        number_of_boxes: orderData.package_info?.number_of_boxes || 1,
        weight_per_box: orderData.package_info?.weight_per_box,
        rov_type: orderData.package_info?.rov_type,
        rov_owner: orderData.package_info?.rov_owner,
        // Multi-package metadata
        multi_package_parent: orderData.package_info?.multi_package_parent,
        multi_package_index: orderData.package_info?.multi_package_index,
        multi_package_total: orderData.package_info?.multi_package_total
      },
      payment_info: {
        payment_mode: orderData.payment_info?.payment_mode,
        order_value: orderData.payment_info?.order_value,
        total_amount: orderData.payment_info?.total_amount,
        shipping_charges: orderData.payment_info?.shipping_charges || 0,
        grand_total: orderData.payment_info?.grand_total,
        cod_amount: orderData.payment_info?.payment_mode === 'COD' ? orderData.payment_info?.cod_amount : 0
      },
      seller_info: {
        name: orderData.seller_info?.name,
        gst_number: orderData.seller_info?.gst_number,
        reseller_name: orderData.seller_info?.reseller_name,
        address: warehouse ? warehouse.address.full_address : pickupAddress.full_address
      },
      shipping_mode: orderData.shipping_mode || 'Surface',
      order_type: orderData.order_type || 'forward',
      status: 'new'
    });

    // Generate AWB if requested
    if (generateAWB) {
      // Validate serviceability
      await ensureServiceablePincodes(
        pickupAddress.pincode,
        order.delivery_address.pincode,
        order.payment_info.payment_mode
      );

      // Fetch waybill
      const waybillResult = await delhiveryService.getWaybill(1);
      let preFetchedWaybill = waybillResult.success && waybillResult.waybills?.length > 0
        ? waybillResult.waybills[0]
        : null;

      // Prepare data for Delhivery
      const orderDataForDelhivery = {
        order_id: order.order_id,
        customer_info: {
          buyer_name: order.customer_info.buyer_name,
          phone: order.customer_info.phone,
          email: order.customer_info.email || ''
        },
        delivery_address: {
          full_address: order.delivery_address.full_address,
          pincode: order.delivery_address.pincode,
          city: order.delivery_address.city,
          state: order.delivery_address.state,
          country: order.delivery_address.country || 'India',
          address_type: order.delivery_address.address_type || 'home'
        },
        pickup_address: {
          name: pickupAddress.name || 'SHIPSARTHI C2C',
          full_address: pickupAddress.full_address,
          city: pickupAddress.city,
          state: pickupAddress.state,
          pincode: pickupAddress.pincode,
          phone: pickupAddress.phone,
          country: pickupAddress.country || 'India'
        },
        products: order.products.map(p => ({
          product_name: p.product_name,
          quantity: p.quantity,
          hsn_code: p.hsn_code || '',
          unit_price: p.unit_price || 0
        })),
        package_info: {
          weight: order.package_info.weight,
          dimensions: {
            width: order.package_info.dimensions.width,
            height: order.package_info.dimensions.height,
            length: order.package_info.dimensions.length
          }
        },
        payment_info: {
          payment_mode: order.payment_info.payment_mode,
          cod_amount: order.payment_info.cod_amount || 0,
          order_value: order.payment_info.order_value || order.payment_info.total_amount || 0
        },
        seller_info: {
          name: order.seller_info?.name || 'SHIPSARTHI',
          gst_number: order.seller_info?.gst_number || ''
        },
        invoice_number: order.invoice_number || `INV${order.order_id}`,
        shipping_mode: order.shipping_mode || 'Surface',
        address_type: order.delivery_address.address_type || 'home',
        waybill: preFetchedWaybill || undefined
      };

      // Call Delhivery API
      const delhiveryResult = await delhiveryService.createShipment(orderDataForDelhivery);

      if (delhiveryResult.success) {
        let awbNumber = null;
        let packageData = null;

        if (delhiveryResult.packages?.length > 0) {
          packageData = delhiveryResult.packages[0];
          awbNumber = packageData.waybill || packageData.AWB || null;
        }
        if (!awbNumber && delhiveryResult.waybill) {
          awbNumber = delhiveryResult.waybill;
        }

        if (awbNumber) {
          order.delhivery_data = {
            waybill: awbNumber,
            package_id: packageData?.refnum || order.order_id,
            status: packageData?.status || 'Success',
            serviceable: packageData?.serviceable,
            sort_code: packageData?.sort_code,
            remarks: packageData?.remarks || []
          };
          order.status = 'ready_to_ship';

          await order.save();

          // Deduct wallet
          await deductWalletForOrder(order, userId, awbNumber);

          console.log('📦 createSingleOrder: SUCCESS', {
            orderId: order.order_id,
            awb: awbNumber,
            status: order.status
          });

          return {
            success: true,
            order: order,
            awb: awbNumber,
            status: order.status,
            error: null
          };
        } else {
          return {
            success: false,
            order: null,
            awb: null,
            status: 'failed',
            error: 'No AWB generated by Delhivery'
          };
        }
      } else {
        return {
          success: false,
          order: null,
          awb: null,
          status: 'failed',
          error: delhiveryResult.error || 'Delhivery API error'
        };
      }
    } else {
      // Save without AWB
      order.status = 'new';
      await order.save();
      await deductWalletForOrder(order, userId, null);

      return {
        success: true,
        order: order,
        awb: null,
        status: order.status,
        error: null
      };
    }
  } catch (error) {
    console.error('📦 createSingleOrder: ERROR', {
      orderId,
      error: error.message,
      stack: error.stack
    });
    return {
      success: false,
      order: null,
      awb: null,
      status: 'failed',
      error: error.message
    };
  }
}

// @desc    Get all orders with filters and pagination
// @route   GET /api/orders
// @access  Private
router.post('/bulk-import', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.file;

    logger.info('📥 Bulk order import received', {
      userId: req.user._id,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      timestamp: new Date().toISOString()
    });

    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return res.status(400).json({
        success: false,
        message: 'Uploaded file does not contain any sheets'
      });
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Uploaded file does not contain any rows'
      });
    }

    const baseUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;

    const importResults = {
      total: 0,
      created: 0,
      failed: 0,
      errors: [],
      details: []
    };

    const userWarehouses = await Warehouse.find({
      user_id: req.user._id,
      is_active: true
    }).lean();

    const warehouseLookup = new Map();
    userWarehouses.forEach((warehouseDoc) => {
      if (!warehouseDoc) {
        return;
      }

      const candidateKeys = [
        warehouseDoc.name,
        warehouseDoc.title,
        warehouseDoc.warehouse_code
      ];

      candidateKeys.forEach((candidate) => {
        const normalizedKey = normalizeWarehouseIdentifier(candidate);
        if (normalizedKey && !warehouseLookup.has(normalizedKey)) {
          warehouseLookup.set(normalizedKey, warehouseDoc);
        }
      });
    });

    if (warehouseLookup.size === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active warehouses found. Please create a warehouse before using bulk import.'
      });
    }

    const requiredFields = [
      'customer_name',
      'customer_phone',
      'delivery_address_line1',
      'delivery_city',
      'delivery_state',
      'delivery_pincode',
      'pickup_phone',
      'pickup_address',
      'pickup_city',
      'pickup_state',
      'pickup_pincode',
      'product_name',
      'product_quantity',
      'product_unit_price',
      'package_weight_kg',
      'package_length_cm',
      'package_width_cm',
      'package_height_cm'
    ];

    for (let i = 0; i < rawRows.length; i++) {
      const originalRow = rawRows[i];
      const rowNumber = i + 2; // Header is row 1

      if (isRowEmpty(originalRow)) {
        continue;
      }

      importResults.total += 1;

      const normalizedRow = {};
      Object.keys(originalRow).forEach((key) => {
        const normalized = normalizeKey(key);
        if (normalized) {
          normalizedRow[normalized] = originalRow[key];
        }
      });

      const getCell = (...aliases) => {
        for (const alias of aliases) {
          const normalized = normalizeKey(alias);
          if (Object.prototype.hasOwnProperty.call(normalizedRow, normalized)) {
            return normalizedRow[normalized];
          }
        }
        return '';
      };

      const sheetWarehouseName = normalizeString(getCell('pickup_name', 'warehouse_name', 'warehouse'));

      const missingFields = [];
      requiredFields.forEach((field) => {
        const value = normalizeString(getCell(field));
        if (!value) {
          missingFields.push(field);
        }
      });

      const customerPhone = normalizePhone(getCell('customer_phone'));
      if (!customerPhone || customerPhone.length !== 10) {
        missingFields.push('customer_phone (10 digits required)');
      }

      const pickupPhone = normalizePhone(getCell('pickup_phone'));
      if (!pickupPhone || pickupPhone.length !== 10) {
        missingFields.push('pickup_phone (10 digits required)');
      }

      const deliveryPincode = normalizePincode(getCell('delivery_pincode'));
      if (!deliveryPincode || deliveryPincode.length !== 6) {
        missingFields.push('delivery_pincode (6 digits required)');
      }

      const pickupPincode = normalizePincode(getCell('pickup_pincode'));
      if (!pickupPincode || pickupPincode.length !== 6) {
        missingFields.push('pickup_pincode (6 digits required)');
      }

      if (!sheetWarehouseName) {
        missingFields.push('pickup_name (must match saved warehouse name)');
      }

      const quantity = Math.max(parseInteger(getCell('product_quantity'), 1), 1);
      const unitPrice = parseNumber(getCell('product_unit_price'), 0);
      const discount = parseNumber(getCell('product_discount'), 0);
      const tax = parseNumber(getCell('product_tax'), 0);
      const packageWeight = parseNumber(getCell('package_weight_kg'), 0);
      const packageLength = parseNumber(getCell('package_length_cm'), 0);
      const packageWidth = parseNumber(getCell('package_width_cm'), 0);
      const packageHeight = parseNumber(getCell('package_height_cm'), 0);

      if (packageWeight <= 0) {
        missingFields.push('package_weight_kg (>0 required)');
      }

      if (packageLength <= 0) {
        missingFields.push('package_length_cm (>0 required)');
      }

      if (packageWidth <= 0) {
        missingFields.push('package_width_cm (>0 required)');
      }

      if (packageHeight <= 0) {
        missingFields.push('package_height_cm (>0 required)');
      }

      if (missingFields.length > 0) {
        importResults.failed += 1;
        importResults.errors.push({
          row: rowNumber,
          error: `Missing or invalid fields: ${missingFields.join(', ')}`
        });
        continue;
      }

      const warehouseKey = normalizeWarehouseIdentifier(sheetWarehouseName);
      const selectedWarehouse = warehouseLookup.get(warehouseKey);

      if (!selectedWarehouse) {
        importResults.failed += 1;
        importResults.errors.push({
          row: rowNumber,
          error: `Warehouse "${sheetWarehouseName}" is not found in your saved warehouses. Please ensure the sheet uses a saved warehouse name.`
        });
        continue;
      }

      const warehouseAddress = selectedWarehouse.address || {};
      const warehouseContact = selectedWarehouse.contact_person || {};

      const paymentMode = normalizePaymentMode(getCell('payment_mode'));
      const shippingMode = normalizeShippingMode(getCell('shipping_mode'));
      const orderDate = normalizeDate(getCell('order_date'));
      const orderId = normalizeString(getCell('order_id'));

      const orderValue = +(unitPrice * quantity).toFixed(2);
      const totalAmount = +(orderValue - discount + tax).toFixed(2);
      const codAmount = paymentMode === 'COD' ? parseNumber(getCell('cod_amount'), totalAmount) : 0;
      const grandTotal = +(totalAmount + 0).toFixed(2);

      const payload = {
        order_date: orderDate,
        reference_id: normalizeString(getCell('reference_id')),
        invoice_number: normalizeString(getCell('invoice_number')),
        customer_info: {
          buyer_name: normalizeString(getCell('customer_name')),
          phone: customerPhone,
          alternate_phone: normalizePhone(getCell('customer_alternate_phone')),
          email: normalizeString(getCell('customer_email')),
          gstin: normalizeString(getCell('customer_gstin'))
        },
        delivery_address: {
          address_line_1: normalizeString(getCell('delivery_address_line1')),
          address_line_2: normalizeString(getCell('delivery_address_line2')),
          pincode: deliveryPincode,
          city: normalizeString(getCell('delivery_city')),
          state: normalizeString(getCell('delivery_state')),
          country: normalizeString(getCell('delivery_country'), 'India')
        },
        pickup_address: {
          warehouse_id: selectedWarehouse._id ? selectedWarehouse._id.toString() : '',
          name: normalizeString(selectedWarehouse.name || sheetWarehouseName),
          full_address: normalizeString(warehouseAddress.full_address || getCell('pickup_address')),
          city: normalizeString(warehouseAddress.city || getCell('pickup_city')),
          state: normalizeString(warehouseAddress.state || getCell('pickup_state')),
          pincode: normalizePincode(warehouseAddress.pincode || pickupPincode),
          phone: normalizePhone(warehouseContact.phone || pickupPhone),
          country: normalizeString(warehouseAddress.country || getCell('pickup_country'), 'India')
        },
        products: [
          {
            product_name: normalizeString(getCell('product_name')),
            quantity,
            unit_price: unitPrice,
            hsn_code: normalizeString(getCell('product_hsn')),
            category: normalizeString(getCell('product_category')),
            sku: normalizeString(getCell('product_sku')),
            discount,
            tax
          }
        ],
        package_info: {
          package_type: normalizeString(getCell('package_type'), 'Single Package (B2C)'),
          weight: packageWeight,
          dimensions: {
            length: packageLength,
            width: packageWidth,
            height: packageHeight
          },
          number_of_boxes: parseInteger(getCell('number_of_boxes'), 1),
          weight_per_box: packageWeight / Math.max(parseInteger(getCell('number_of_boxes'), 1), 1),
          rov_type: normalizeString(getCell('rov_type')),
          rov_owner: normalizeString(getCell('rov_owner')),
          weight_photo_url: '',
          dimensions_photo_url: '',
          save_dimensions: false
        },
        payment_info: {
          payment_mode: paymentMode,
          order_value: orderValue,
          total_amount: totalAmount,
          shipping_charges: 0,
          grand_total: grandTotal,
          cod_amount: codAmount
        },
        seller_info: {
          name: normalizeString(getCell('seller_name')),
          gst_number: normalizeString(getCell('seller_gst')),
          reseller_name: normalizeString(getCell('seller_reseller'))
        },
        shipping_mode: shippingMode,
        order_id: orderId || undefined,
        generate_awb: false
      };

      try {
        const response = await axios.post(`${baseUrl}/api/orders`, payload, {
          headers: {
            Authorization: req.headers.authorization,
            'Content-Type': 'application/json'
          },
          timeout: 120000
        });

        importResults.created += 1;
        importResults.details.push({
          row: rowNumber,
          order_id: response.data?.data?.order?.order_id || payload.order_id || null
        });
      } catch (error) {
        importResults.failed += 1;
        let message = error.message;
        if (error.response?.data?.errors) {
          message = error.response.data.errors.map((err) => err.msg || err.message).join(', ');
        } else if (error.response?.data?.message) {
          message = error.response.data.message;
        }
        importResults.errors.push({
          row: rowNumber,
          error: message
        });
      }
    }

    const success = importResults.failed === 0;

    return res.status(success ? 200 : 207).json({
      success,
      message: success ? 'Bulk import completed successfully' : 'Bulk import completed with some errors',
      data: importResults
    });
  } catch (error) {
    logger.error('❌ Bulk order import error', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      message: 'Error processing bulk import',
      error: error.message
    });
  }
});

router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn([
    'new', 'ready_to_ship', 'pickup_pending', 'manifested', 'pickups_manifests',
    'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto', 'rto_in_transit', 'rto_delivered', 'cancelled', 'lost', 'all'
  ]),
  query('order_type').optional().isIn(['forward', 'reverse']),
  query('payment_mode').optional().isIn(['prepaid', 'cod']),
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    // Increased default limit to 1000 to fetch all orders (no pagination by default)
    // This ensures all orders are visible and data doesn't disappear
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = { user_id: userId };

    if (req.query.status && req.query.status !== 'all') {
      // Expand 'rto' to include all RTO sub-statuses
      if (req.query.status === 'rto') {
        filterQuery['status'] = { $in: ['rto', 'rto_in_transit', 'rto_delivered'] };
      } else {
        filterQuery['status'] = req.query.status;
      }

      // Exclude canceled shipments from pickups_manifests tab
      // Canceled shipments should only appear in "All" tab
      if (req.query.status === 'pickups_manifests') {
        filterQuery['delhivery_data.cancellation_status'] = { $ne: 'cancelled' };
      }
    }

    // Apply order type filter if provided
    if (req.query.order_type) {
      filterQuery['order_type'] = req.query.order_type;
    }

    if (req.query.payment_mode) {
      filterQuery['payment_info.payment_mode'] = req.query.payment_mode;
    }

    if (req.query.warehouse_id) {
      // Orders store warehouse data inline (name, address), not as a reference.
      // Look up the warehouse name from the ID and filter by pickup_address.name.
      try {
        const Warehouse = require('../models/Warehouse');
        const selectedWarehouse = await Warehouse.findById(req.query.warehouse_id);
        if (selectedWarehouse) {
          filterQuery['pickup_address.name'] = selectedWarehouse.name;
        }
      } catch (whErr) {
        console.error('Warehouse lookup for filter failed:', whErr);
      }
    }

    if (req.query.search) {
      const searchValue = String(req.query.search || '').trim();
      if (searchValue) {
        const searchRegex = new RegExp(searchValue, 'i');
        const searchType = String(req.query.search_type || '').toLowerCase();

        if (searchType === 'order') {
          filterQuery.order_id = searchRegex;
        } else if (searchType === 'reference') {
          filterQuery.reference_id = searchRegex;
        } else if (searchType === 'awb') {
          filterQuery.$or = [
            { 'shipping_info.awb_number': searchRegex },
            { 'delhivery_data.waybill': searchRegex },
            { awb: searchRegex },
            { waybill: searchRegex }
          ];
        } else if (searchType === 'mobile') {
          filterQuery['customer_info.phone'] = searchRegex;
        } else {
          filterQuery.$or = [
            { order_id: searchRegex },
            { reference_id: searchRegex },
            { 'shipping_info.awb_number': searchRegex },
            { 'delhivery_data.waybill': searchRegex },
            { 'customer_info.buyer_name': searchRegex },
            { 'customer_info.phone': searchRegex }
          ];
        }
      }
    }

    if (req.query.state) {
      const stateValue = String(req.query.state || '').trim();
      if (stateValue) {
        filterQuery['delivery_address.state'] = new RegExp(stateValue, 'i');
      }
    }

    if (req.query.min_amount || req.query.max_amount) {
      const minAmount = req.query.min_amount ? parseFloat(req.query.min_amount) : null;
      const maxAmount = req.query.max_amount ? parseFloat(req.query.max_amount) : null;

      const amountFilter = {};
      if (!isNaN(minAmount)) {
        amountFilter.$gte = minAmount;
      }
      if (!isNaN(maxAmount)) {
        amountFilter.$lte = maxAmount;
      }

      if (Object.keys(amountFilter).length > 0) {
        filterQuery['payment_info.total_amount'] = amountFilter;
      }
    }

    if (req.query.date_from || req.query.date_to) {
      // For delivered orders, filter by delivered_date if available, otherwise use createdAt
      // For other orders, filter by createdAt
      if (req.query.status === 'delivered') {
        // For delivered orders: filter by delivered_date OR createdAt (if delivered_date missing)
        const dateFrom = req.query.date_from ? new Date(req.query.date_from) : null;
        const dateTo = req.query.date_to ? new Date(req.query.date_to) : null;
        
        const dateConditions = [];
        
        // Condition 1: Orders with delivered_date in range
        const deliveredDateFilter = {};
        if (dateFrom) deliveredDateFilter.$gte = dateFrom;
        if (dateTo) deliveredDateFilter.$lte = dateTo;
        if (Object.keys(deliveredDateFilter).length > 0) {
          dateConditions.push({ delivered_date: deliveredDateFilter });
        }
        
        // Condition 2: Orders without delivered_date - use createdAt
        const createdAtFilter = {};
        if (dateFrom) createdAtFilter.$gte = dateFrom;
        if (dateTo) createdAtFilter.$lte = dateTo;
        if (Object.keys(createdAtFilter).length > 0) {
          dateConditions.push({
            $and: [
              { $or: [{ delivered_date: { $exists: false } }, { delivered_date: null }] },
              { createdAt: createdAtFilter }
            ]
          });
        }
        
        if (dateConditions.length > 0) {
          filterQuery.$or = dateConditions;
        }
      } else {
        filterQuery.createdAt = {};
        if (req.query.date_from) {
          filterQuery.createdAt.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          filterQuery.createdAt.$lte = new Date(req.query.date_to);
        }
      }
    }

    // Get orders from MongoDB - ALWAYS fetch all orders for the user
    // This ensures data stability and prevents orders from disappearing
    const orders = await Order.find(filterQuery)
      .sort({ createdAt: -1 })
      .lean(); // Remove skip/limit to get all orders

    const totalOrders = orders.length;

    logger.info('📦 Orders fetched from MongoDB', {
      userId: userId.toString(),
      totalOrders,
      filteredCount: orders.length,
      filters: filterQuery,
      timestamp: new Date().toISOString()
    });

    res.json({
      status: 'success',
      data: {
        orders,
        pagination: {
          current_page: 1,
          total_pages: 1,
          total_orders: totalOrders,
          per_page: totalOrders
        }
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching orders'
    });
  }
});

// @desc    Sync TrackingOrder statuses to Order models
// @route   POST /api/orders/sync-statuses
// @access  Private
router.post('/sync-statuses', auth, async (req, res) => {
  try {
    logger.info('🔄 Sync statuses endpoint called', {
      userId: req.user._id.toString()
    });

    const result = await trackingService.syncAllTrackingOrderStatuses();

    if (result.success) {
      res.json({
        status: 'success',
        message: 'Order statuses synced successfully',
        data: {
          total: result.total,
          synced: result.synced,
          skipped: result.skipped,
          errors: result.errors
        }
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Failed to sync order statuses',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('❌ Error in sync-statuses endpoint:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error syncing order statuses',
      error: error.message
    });
  }
});

// @desc    Sync a specific order by AWB number
// @route   POST /api/orders/sync-status/:awb
// @access  Private
router.post('/sync-status/:awb', auth, async (req, res) => {
  try {
    const { awb } = req.params;
    
    logger.info('🔄 Sync order by AWB endpoint called', {
      userId: req.user._id.toString(),
      awb: awb
    });

    const result = await trackingService.syncOrderByAWB(awb);

    if (result.success) {
      res.json({
        status: 'success',
        message: 'Order status synced successfully',
        data: result
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: result.error || 'Failed to sync order status',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('❌ Error in sync-status by AWB endpoint:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error syncing order status',
      error: error.message
    });
  }
});

// @desc    Force refresh all orders (calls Delhivery API to get fresh status)
// @route   POST /api/orders/force-refresh
// @access  Private
router.post('/force-refresh', auth, async (req, res) => {
  try {
    logger.info('🔄 Force refresh endpoint called', {
      userId: req.user._id.toString()
    });

    const result = await trackingService.forceRefreshAllOrders();

    if (result.success) {
      res.json({
        status: 'success',
        message: 'Orders refreshed successfully',
        data: {
          total: result.total,
          refreshed: result.refreshed,
          errors: result.errors
        }
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Failed to refresh orders',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('❌ Error in force-refresh endpoint:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error refreshing orders',
      error: error.message
    });
  }
});

// @desc    Track order by AWB number (MUST come before /:id route to avoid route conflict)
// @route   GET /api/orders/track/:awb
// @access  Private
router.get('/track/:awb', auth, async (req, res) => {
   try {
    const { awb } = req.params;
    const { order_id: orderIdQuery, ref_id: refIdQuery } = req.query;

    const sanitizedAwb = (awb || '').trim();

    if (!sanitizedAwb) {
      return res.status(400).json({
        status: 'error',
        message: 'AWB number is required'
      });
    }

    logger.info('📦 Tracking shipment', {
      awb: sanitizedAwb,
      userId: req.user._id
    });

    // Try to locate the order belonging to the current user so we can pass a reference ID to Delhivery
    let referenceId = '';
    try {
      const orderForUser = await Order.findOne({
        user_id: req.user._id,
        $or: [
          { 'shipping_info.awb_number': sanitizedAwb },
          { 'delhivery_data.waybill': sanitizedAwb },
          { awb: sanitizedAwb },
          { waybill: sanitizedAwb }
        ]
      }).lean();

      if (orderForUser) {
        referenceId = (
          orderIdQuery ||
          refIdQuery ||
          orderForUser.order_id ||
          orderForUser.reference_id ||
          ''
        ).trim();
      } else if (orderIdQuery || refIdQuery) {
        referenceId = (orderIdQuery || refIdQuery || '').trim();
      }
    } catch (lookupError) {
      logger.warn('⚠️ Failed to lookup order for tracking reference', {
        awb: sanitizedAwb,
        userId: req.user._id,
        error: lookupError.message
      });
      referenceId = (orderIdQuery || refIdQuery || '').trim();
    }

    // Track shipment with Delhivery API using AWB number (and optional ref_ids for better accuracy)
    const trackingResult = await delhiveryService.trackShipment(sanitizedAwb, referenceId);

    if (trackingResult.success) {
      logger.info('✅ Tracking data retrieved', {
        awb: sanitizedAwb,
        hasData: !!trackingResult.data
      });

      // Return the complete Delhivery response structure
      const rawData = trackingResult.data || {};
      const shipmentData = rawData.ShipmentData || [];

      return res.json({
        status: 'success',
        message: 'Tracking data retrieved successfully',
        data: {
          waybill: sanitizedAwb,
          // Complete Delhivery response structure
          ShipmentData: shipmentData,
          // Full raw data for reference
          tracking_data: trackingResult.data
        }
      });
    } else {
      logger.error('❌ Tracking failed', {
        awb: sanitizedAwb,
        error: trackingResult.error,
        referenceId
      });

      return res.status(400).json({
        status: 'error',
        message: trackingResult.error || 'Failed to fetch tracking information'
      });
    }

  } catch (error) {
    logger.error('❌ Track order error', {
      awb: req.params.awb,
      userId: req.user._id,
      error: error.message,
      errorStack: error.stack
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error tracking shipment'
    });
  }
});

// @desc    Generate comprehensive shipping label with order details and Delhivery label data
// @route   GET /api/orders/:id/print
// @access  Private
// NOTE: This route MUST come before /:id route to avoid conflicts
router.get('/:id/print', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id
    }).populate('user_id', 'company_name your_name email phone_number company_logo_url company_logo_public_id company_logo_uploaded_at label_settings')
      .lean();

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Prepare placeholder for any hosted PDF returned by Delhivery
    let delhiveryLabelPdfUrl = null;

    // Get waybill from multiple possible locations
    const waybill = order.delhivery_data?.waybill || 
                    order.shipping_info?.awb_number || 
                    order.awb ||
                    order.waybill;

    // Fetch Delhivery label data if waybill exists
    let delhiveryLabelData = null;
    if (waybill) {
      try {
        logger.info('🏷️ Fetching Delhivery label data for print', {
          orderId: order._id,
          waybill
        });

        const labelResult = await delhiveryService.generateShippingLabel(waybill, {
          pdf: false,
          pdf_size: '4R'
        });
        if (labelResult.success && labelResult.json_data) {
          delhiveryLabelData = labelResult.json_data;
          logger.info('✅ Delhivery label data fetched successfully');
        }

        // If Delhivery responded with a hosted PDF link, append to HTML later
        if (labelResult.success && labelResult.pdf_url) {
          delhiveryLabelPdfUrl = labelResult.pdf_url;
          logger.info('📄 Delhivery provided PDF label link', { pdfUrl: delhiveryLabelPdfUrl });
        } else if (!delhiveryLabelData) {
          logger.warn('⚠️ Delhivery label data not available, will use order data only');
        }
      } catch (labelError) {
        logger.warn('⚠️ Failed to fetch Delhivery label data', {
          error: labelError.message,
          waybill
        });
        // Continue without Delhivery data - use order data only
      }
    }

    // Get user's label settings
    // Since we used .lean(), the populated user_id is a plain object, so we need to fetch user separately
    const user = await User.findById(req.user._id).select('label_settings company_logo_url').lean();
    const labelSettings = user?.label_settings ? { ...user.label_settings } : {};

    // Use company_logo_url as fallback if logo_url not set
    if (!labelSettings.logo_url && user?.company_logo_url) {
      labelSettings.logo_url = user.company_logo_url;
    }

    // Get label format from user settings (default to first selected type or 'Thermal')
    const labelFormat = labelSettings.label_types?.[0] || 'Thermal';

    // Generate comprehensive HTML shipping label using labelRenderer for consistency
    const html = labelRenderer.generateLabelHTML(delhiveryLabelData, order.delhivery_data?.waybill, order, labelSettings, labelFormat);

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);

  } catch (error) {
    logger.error('❌ Generate order print error', {
      orderId: req.params.id,
      userId: req.user._id,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      status: 'error',
      message: 'Failed to generate order print page',
      error: error.message
    });
  }
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const id = req.params.id;
    let order = null;

    // First try by _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id) {
      order = await Order.findOne({
        _id: id,
        user_id: req.user._id
      }).populate('pickup_info.warehouse_id', 'title name address contact_info');
    }

    // Fallback: try by order_id (e.g. "ORD-12345")
    if (!order) {
      order = await Order.findOne({
        order_id: id,
        user_id: req.user._id
      }).populate('pickup_info.warehouse_id', 'title name address contact_info');
    }

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    res.json({
      status: 'success',
      data: order
    });

  } catch (error) {
    console.error('Get order error:', error);
    // Handle CastError (invalid ObjectId format) gracefully
    if (error.name === 'CastError') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID format'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching order'
    });
  }
});

// @desc    Get single order by order_id
// @route   GET /api/orders/order/:orderId
// @access  Private
router.get('/order/:orderId', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      order_id: req.params.orderId,
      user_id: req.user._id
    }).populate('pickup_info.warehouse_id', 'title name address contact_info');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    res.json({
      status: 'success',
      data: order
    });

  } catch (error) {
    console.error('Get order by order_id error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching order'
    });
  }
});

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
router.post('/', auth, [
  // Order Details
  body('order_date').optional().isISO8601().withMessage('Valid order date is required'),
  body('reference_id').optional().trim(),
  body('invoice_number').optional().trim(),
  
  // Customer Information
  body('customer_info.buyer_name').trim().notEmpty().withMessage('Buyer name is required'),
  body('customer_info.phone').matches(/^[6-9]\d{9}$/).withMessage('Valid phone number is required'),
  body('customer_info.alternate_phone').optional().custom((value) => {
    // Allow empty/undefined/null, but if provided, validate format
    if (!value || value.trim() === '') {
      return true; // Empty is allowed
    }
    if (!/^[6-9]\d{9}$/.test(value)) {
      throw new Error('Valid alternate phone number is required');
    }
    return true;
  }),
  body('customer_info.email').optional().custom((value) => {
    // Allow empty/undefined/null, but if provided, validate email format
    if (!value || value.trim() === '') {
      return true; // Empty is allowed
    }
    // Basic email validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(value)) {
      throw new Error('Valid email is required');
    }
    return true;
  }),
  body('customer_info.gstin').optional().custom((value) => {
    if (value && value.trim() !== '') {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(value)) {
        throw new Error('GSTIN must be in format: 22AAAAA0000A1Z5');
      }
    }
    return true;
  }),
  
  // Delivery Address
  body('delivery_address.address_line_1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('delivery_address.address_line_2').optional().trim(),
  body('delivery_address.pincode').matches(/^[1-9][0-9]{5}$/).withMessage('Valid pincode is required'),
  body('delivery_address.city').trim().notEmpty().withMessage('City is required'),
  body('delivery_address.state').trim().notEmpty().withMessage('State is required'),
  
  // Warehouse/Pickup Address
  body('pickup_address.warehouse_id').optional().custom((value) => {
    if (value && value.trim() !== '') {
      const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!mongoIdRegex.test(value)) {
        throw new Error('Valid warehouse ID is required');
      }
    }
    return true;
  }),
  body('pickup_address.name').optional().trim().notEmpty().withMessage('Warehouse name is required'),
  body('pickup_address.full_address').optional().trim().notEmpty().withMessage('Warehouse address is required'),
  body('pickup_address.city').optional().trim().notEmpty().withMessage('Warehouse city is required'),
  body('pickup_address.state').optional().trim().notEmpty().withMessage('Warehouse state is required'),
  body('pickup_address.pincode').optional().matches(/^[1-9][0-9]{5}$/).withMessage('Valid warehouse pincode is required'),
  body('pickup_address.phone').optional().matches(/^[6-9]\d{9}$/).withMessage('Valid warehouse phone is required'),
  
  // Products
  body('products').isArray({ min: 1 }).withMessage('At least one product is required'),
  body('products.*.product_name').trim().notEmpty().withMessage('Product name is required'),
  body('products.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
  body('products.*.unit_price').isFloat({ min: 0 }).withMessage('Valid unit price is required'),
  body('products.*.hsn_code').optional().trim(),
  body('products.*.category').optional().trim(),
  body('products.*.sku').optional().trim(),
  body('products.*.discount').optional().isFloat({ min: 0 }).withMessage('Valid discount is required'),
  body('products.*.tax').optional().isFloat({ min: 0 }).withMessage('Valid tax is required'),
  
  // Package Information
  body('package_info.package_type').isIn(['Single Package (B2C)', 'Multiple Package (B2C)', 'Multiple Package (B2B)']).withMessage('Valid package type is required'),
  body('package_info.weight').isFloat({ min: 0.1 }).withMessage('Valid weight is required'),
  body('package_info.dimensions.length').isFloat({ min: 1 }).withMessage('Valid length is required'),
  body('package_info.dimensions.width').isFloat({ min: 1 }).withMessage('Valid width is required'),
  body('package_info.dimensions.height').isFloat({ min: 1 }).withMessage('Valid height is required'),
  body('package_info.number_of_boxes').optional().isInt({ min: 1 }).withMessage('Valid number of boxes is required'),
  body('package_info.weight_per_box').optional().custom((value, { req }) => {
    // If weight_per_box is not provided, calculate it from total weight and number of boxes
    if (!value || value === 0) {
      const totalWeight = parseFloat(req.body.package_info?.weight) || 0;
      const numberOfBoxes = parseInt(req.body.package_info?.number_of_boxes) || 1;
      const calculatedWeightPerBox = totalWeight / numberOfBoxes;
      
      if (calculatedWeightPerBox < 0.1) {
        throw new Error('Weight per box must be at least 0.1 kg');
      }
    } else {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0.1) {
        throw new Error('Weight per box must be at least 0.1 kg');
      }
    }
    return true;
  }),
  body('package_info.rov_type').optional().trim(),
  body('package_info.rov_owner').optional().trim(),
  
  // Payment Information
  body('payment_info.payment_mode').isIn(['Prepaid', 'COD', 'Pickup']).withMessage('Valid payment mode is required (Prepaid, COD, or Pickup)'),
  body('payment_info.order_value').isFloat({ min: 0 }).withMessage('Valid order value is required'),
  body('payment_info.total_amount').isFloat({ min: 0 }).withMessage('Valid total amount is required'),
  body('payment_info.shipping_charges').optional().isFloat({ min: 0 }).withMessage('Valid shipping charges is required'),
  body('payment_info.grand_total').optional().isFloat({ min: 0 }).withMessage('Valid grand total is required'),
  body('payment_info.cod_amount').optional().isFloat({ min: 0 }).withMessage('Valid COD amount is required'),
  
  // Seller Information
  body('seller_info.name').optional().trim(),
  body('seller_info.gst_number').optional().custom((value) => {
    if (value && value.trim() !== '') {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(value)) {
        throw new Error('Seller GST number must be in format: 22AAAAA0000A1Z5');
      }
    }
    return true;
  }),
  body('seller_info.reseller_name').optional().trim(),
  body('order_id').optional().trim(),

  // Carrier/Service Type (optional - for Delhivery Air support)
  body('service_type').optional().isIn(['surface', 'air']).withMessage('Service type must be "surface" or "air"'),
  body('carrier_id').optional().isMongoId().withMessage('Carrier ID must be valid MongoDB ObjectId')
], async (req, res) => {
  const { generateOrderId } = require('../utils/orderIdGenerator');
  // Use the Order ID from frontend if provided, otherwise generate one
  const orderId = req.body.order_id || generateOrderId();
  
  try {
    console.log('🚀 ORDER CREATION STARTED', {
      orderId,
      userId: req.user._id,
      timestamp: new Date().toISOString(),
      formData: req.body
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ VALIDATION FAILED', {
        orderId,
        errors: errors.array(),
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    console.log('✅ VALIDATION PASSED', {
      orderId,
      timestamp: new Date().toISOString()
    });

    // Cross-validate order_type and payment_mode
    const orderType = req.body.order_type || 'forward';
    const paymentMode = req.body.payment_info?.payment_mode;

    if (orderType === 'reverse' && paymentMode !== 'Pickup') {
      console.log('❌ INVALID PAYMENT MODE FOR REVERSE ORDER', {
        orderId,
        orderType,
        paymentMode,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        status: 'error',
        message: 'Reverse orders must use Pickup payment mode'
      });
    }

    if (orderType === 'forward' && paymentMode === 'Pickup') {
      console.log('❌ INVALID PAYMENT MODE FOR FORWARD ORDER', {
        orderId,
        orderType,
        paymentMode,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        status: 'error',
        message: 'Forward orders cannot use Pickup payment mode'
      });
    }

    const userId = req.user._id;

    // ============================================
    // MULTI-PACKAGE B2C: Create multiple orders
    // ============================================
    const isMultiPackage = req.body.package_info?.package_type === 'Multiple Package (B2C)' &&
                           req.body.package_info?.boxes &&
                           Array.isArray(req.body.package_info.boxes) &&
                           req.body.package_info.boxes.length > 0;

    if (isMultiPackage) {
      console.log('📦 MULTI-PACKAGE B2C DETECTED', {
        totalBoxes: req.body.package_info.boxes.length,
        boxes: req.body.package_info.boxes,
        timestamp: new Date().toISOString()
      });

      // Create multiple orders - one per box
      const createdOrders = [];
      const failedOrders = [];
      const boxes = req.body.package_info.boxes;

      for (let boxIndex = 0; boxIndex < boxes.length; boxIndex++) {
        const box = boxes[boxIndex];
        // Generate unique order ID for each box
        const boxOrderId = `${orderId}-${String(boxIndex + 1).padStart(2, '0')}`;

        try {
          console.log(`📦 Creating order ${boxIndex + 1}/${boxes.length}`, {
            boxOrderId,
            weight: box.weight,
            dimensions: { length: box.length, width: box.width, height: box.height }
          });

          // Build order data for this box
          const boxOrderData = {
            ...req.body,
            order_id: boxOrderId,
            package_info: {
              ...req.body.package_info,
              package_type: 'Single Package (B2C)', // Treat each box as single package for Delhivery
              weight: box.weight, // Weight in kg
              dimensions: {
                length: box.length,
                width: box.width,
                height: box.height
              },
              number_of_boxes: 1,
              weight_per_box: box.weight,
              // Remove boxes array for individual order
              boxes: undefined,
              box_entries: undefined,
              // Mark as part of multi-package
              multi_package_parent: orderId,
              multi_package_index: boxIndex + 1,
              multi_package_total: boxes.length
            }
          };

          // Make recursive call to create single order
          // We'll use internal function to avoid circular issues
          const singleOrderResult = await createSingleOrder(boxOrderData, req.user, req.body.generate_awb);

          if (singleOrderResult.success) {
            createdOrders.push({
              order_id: boxOrderId,
              awb: singleOrderResult.awb,
              status: singleOrderResult.status,
              box_index: boxIndex + 1
            });
          } else {
            failedOrders.push({
              order_id: boxOrderId,
              box_index: boxIndex + 1,
              error: singleOrderResult.error
            });
          }
        } catch (boxError) {
          console.error(`❌ Failed to create order for box ${boxIndex + 1}`, {
            boxOrderId,
            error: boxError.message
          });
          failedOrders.push({
            order_id: boxOrderId,
            box_index: boxIndex + 1,
            error: boxError.message
          });
        }
      }

      // Return multi-package result
      const allSuccess = failedOrders.length === 0;
      const partialSuccess = createdOrders.length > 0 && failedOrders.length > 0;

      console.log('📦 MULTI-PACKAGE CREATION COMPLETED', {
        parentOrderId: orderId,
        totalBoxes: boxes.length,
        created: createdOrders.length,
        failed: failedOrders.length,
        timestamp: new Date().toISOString()
      });

      return res.status(allSuccess ? 201 : (partialSuccess ? 207 : 400)).json({
        status: allSuccess ? 'success' : (partialSuccess ? 'partial_success' : 'error'),
        message: allSuccess
          ? `All ${boxes.length} orders created successfully`
          : partialSuccess
            ? `${createdOrders.length} of ${boxes.length} orders created successfully`
            : 'Failed to create any orders',
        multi_package: true,
        parent_order_id: orderId,
        total_boxes: boxes.length,
        created_orders: createdOrders,
        failed_orders: failedOrders
      });
    }

    // ============================================
    // SINGLE PACKAGE: Original flow continues below
    // ============================================

    // Handle warehouse selection
    let warehouse = null;
    let pickupAddress = {};

    if (req.body.pickup_address?.warehouse_id) {
      // Use existing warehouse
      warehouse = await Warehouse.findOne({
        _id: req.body.pickup_address.warehouse_id,
        user_id: userId,
        is_active: true
      });

      if (!warehouse) {
        return res.status(400).json({
          status: 'error',
          message: 'Warehouse not found or not active'
        });
      }

      // Validate warehouse data completeness
      if (!warehouse.address?.full_address || !warehouse.contact_person?.phone) {
        return res.status(400).json({
          status: 'error',
          message: 'Warehouse data is incomplete. Please contact support.'
        });
      }

      // Validate required fields
      const requiredFields = ['name', 'address.full_address', 'address.city', 'address.state', 'address.pincode', 'contact_person.phone'];
      const missingFields = requiredFields.filter(field => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], warehouse);
        return !value || value.trim() === '';
      });

      if (missingFields.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Warehouse is missing required fields: ${missingFields.join(', ')}`
        });
      }

      pickupAddress = {
        name: warehouse.name,
        full_address: warehouse.address.full_address,
        city: warehouse.address.city,
        state: warehouse.address.state,
        pincode: warehouse.address.pincode,
        phone: warehouse.contact_person.phone,
        country: warehouse.address.country || 'India'
      };
    } else {
      // Use manually entered warehouse details
      if (!req.body.pickup_address) {
        return res.status(400).json({
          status: 'error',
          message: 'Pickup address information is required'
        });
      }

      // Validate manual address fields
      const requiredManualFields = ['name', 'full_address', 'city', 'state', 'pincode', 'phone'];
      const missingManualFields = requiredManualFields.filter(field => {
        const value = req.body.pickup_address[field];
        return !value || value.trim() === '';
      });

      if (missingManualFields.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Missing required pickup address fields: ${missingManualFields.join(', ')}`
        });
      }

      // Validate phone number format
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(req.body.pickup_address.phone)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid phone number format for pickup address'
        });
      }

      // Validate pincode format
      const pincodeRegex = /^[1-9][0-9]{5}$/;
      if (!pincodeRegex.test(req.body.pickup_address.pincode)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid pincode format for pickup address'
        });
      }

      pickupAddress = {
        name: req.body.pickup_address.name,
        full_address: req.body.pickup_address.full_address,
        city: req.body.pickup_address.city,
        state: req.body.pickup_address.state,
        pincode: req.body.pickup_address.pincode,
        phone: req.body.pickup_address.phone,
        country: req.body.pickup_address.country || 'India'
      };
    }

    // Build full address from address lines
    const fullDeliveryAddress = `${req.body.delivery_address.address_line_1}${req.body.delivery_address.address_line_2 ? ', ' + req.body.delivery_address.address_line_2 : ''}`;

    // Create order data
    const orderData = {
      user_id: userId,
      order_id: orderId,
      order_date: req.body.order_date ? new Date(req.body.order_date) : new Date(),
      reference_id: req.body.reference_id && req.body.reference_id.trim() ? req.body.reference_id.trim() : undefined, // Set to undefined if empty to avoid duplicate key error
      invoice_number: req.body.invoice_number && req.body.invoice_number.trim() ? req.body.invoice_number.trim() : undefined,
      
      customer_info: {
        buyer_name: req.body.customer_info.buyer_name,
        phone: req.body.customer_info.phone,
        // Convert empty strings to undefined for optional fields
        alternate_phone: req.body.customer_info.alternate_phone && req.body.customer_info.alternate_phone.trim() !== '' 
          ? req.body.customer_info.alternate_phone.trim() 
          : undefined,
        email: req.body.customer_info.email && req.body.customer_info.email.trim() !== '' 
          ? req.body.customer_info.email.trim().toLowerCase() 
          : undefined,
        gstin: req.body.customer_info.gstin && req.body.customer_info.gstin.trim() !== '' 
          ? req.body.customer_info.gstin.trim() 
          : undefined
      },
      
      delivery_address: {
        address_line_1: req.body.delivery_address.address_line_1,
        address_line_2: req.body.delivery_address.address_line_2,
        full_address: fullDeliveryAddress,
        city: req.body.delivery_address.city,
        state: req.body.delivery_address.state,
        pincode: req.body.delivery_address.pincode,
        country: req.body.delivery_address.country || 'India',
        address_type: req.body.delivery_address.address_type || 'home'
      },
      
      pickup_address: pickupAddress,
      
      products: req.body.products.map(product => ({
        product_name: product.product_name,
        product_description: product.product_description,
        quantity: product.quantity,
        unit_price: product.unit_price,
        hsn_code: product.hsn_code,
        category: product.category,
        sku: product.sku,
        discount: product.discount || 0,
        tax: product.tax || 0,
        tax_rate: product.tax_rate
      })),
      
      package_info: {
        package_type: req.body.package_info.package_type,
        weight: req.body.package_info.weight,
        dimensions: req.body.package_info.dimensions,
        number_of_boxes: req.body.package_info.number_of_boxes || 1,
        weight_per_box: (req.body.package_info.weight_per_box && req.body.package_info.weight_per_box > 0)
          ? req.body.package_info.weight_per_box
          : (req.body.package_info.weight / (req.body.package_info.number_of_boxes || 1)),
        rov_type: req.body.package_info.rov_type,
        rov_owner: req.body.package_info.rov_owner,
        weight_photo_url: req.body.package_info.weight_photo_url,
        dimensions_photo_url: req.body.package_info.dimensions_photo_url,
        save_dimensions: req.body.package_info.save_dimensions || false
      },
      
      payment_info: {
        payment_mode: req.body.payment_info.payment_mode,
        order_value: req.body.payment_info.order_value,
        total_amount: req.body.payment_info.total_amount,
        shipping_charges: req.body.payment_info.shipping_charges || 0,
        grand_total: req.body.payment_info.grand_total || req.body.payment_info.total_amount,
        cod_amount: req.body.payment_info.payment_mode === 'COD' ? req.body.payment_info.cod_amount : 0
      },
      
      seller_info: {
        name: req.body.seller_info?.name,
        gst_number: req.body.seller_info?.gst_number,
        reseller_name: req.body.seller_info?.reseller_name,
        address: warehouse ? warehouse.address.full_address : pickupAddress.full_address
      },
      
      shipping_mode: req.body.shipping_mode || 'Surface',
      order_type: req.body.order_type || 'forward', // Use 'forward' or 'reverse' from request
      status: 'new'
    };

    // Create order object but DON'T save to database yet
    const order = new Order(orderData);
    
    // Check if AWB generation is requested
    // If generate_awb is explicitly false (boolean) or 'false' (string), don't generate AWB
    // Otherwise, default to true (generate AWB) for backward compatibility
    const generateAWBFlag = req.body.generate_awb;
    
    // Explicit check: only generate AWB if flag is NOT explicitly false
    const generateAWB = generateAWBFlag !== false && generateAWBFlag !== 'false' && generateAWBFlag !== 0 && generateAWBFlag !== '0';
    
    console.log('📋 ORDER PREPARED (NOT SAVED YET)', {
      orderId: order.order_id,
      generateAWB: generateAWB,
      generate_awb_received: req.body.generate_awb,
      generate_awb_type: typeof req.body.generate_awb,
      will_call_delhivery: generateAWB,
      timestamp: new Date().toISOString()
    });

    let delhiveryResult = null;
    
    // Only call Delhivery API if generate_awb is explicitly true or not provided (for backward compatibility)
    if (generateAWB) {
      try {
        await ensureServiceablePincodes(
          pickupAddress.pincode,
          order.delivery_address.pincode,
          order.payment_info.payment_mode
        );
      } catch (svcError) {
        logger.error('❌ Serviceability validation failed before AWB creation', {
          orderId: order.order_id,
          pickupPincode: pickupAddress.pincode,
          deliveryPincode: order.delivery_address.pincode,
          error: svcError.message
        });
        return res.status(400).json({
          status: 'error',
          message: svcError.message,
          error_code: SERVICEABILITY_ERROR_CODE
        });
      }

      console.log('🔄 CALLING DELHIVERY API (AWB generation requested)');
      // Create shipment with Delhivery API FIRST
      try {
        // STEP 1: Fetch waybill from Delhivery BEFORE creating shipment
      console.log('📋 FETCHING WAYBILL FROM DELHIVERY', {
        orderId: order.order_id,
        timestamp: new Date().toISOString()
      });

      const waybillResult = await delhiveryService.getWaybill(1);
      let preFetchedWaybill = null;

      if (waybillResult.success && waybillResult.waybills && waybillResult.waybills.length > 0) {
        preFetchedWaybill = waybillResult.waybills[0]; // Get first waybill from array
        console.log('✅ WAYBILL FETCHED', {
          orderId: order.order_id,
          waybill: preFetchedWaybill,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('⚠️ WAYBILL FETCH FAILED, Delhivery will auto-generate', {
          orderId: order.order_id,
          error: waybillResult.error,
          timestamp: new Date().toISOString()
        });
        // Continue without pre-fetched waybill - Delhivery will generate
      }

      // STEP 2: Prepare order data for Delhivery API (service expects order structure, not formatted shipment data)
      const orderDataForDelhivery = {
        order_id: order.order_id,
        customer_info: {
          buyer_name: order.customer_info.buyer_name,
          phone: order.customer_info.phone,
          email: order.customer_info.email || ''
        },
        delivery_address: {
          full_address: order.delivery_address.full_address,
          pincode: order.delivery_address.pincode,
          city: order.delivery_address.city,
          state: order.delivery_address.state,
          country: order.delivery_address.country || 'India',
          address_type: order.delivery_address.address_type || 'home'
        },
        pickup_address: {
          name: pickupAddress.name || 'SHIPSARTHI C2C',
          full_address: pickupAddress.full_address,
          city: pickupAddress.city,
          state: pickupAddress.state,
          pincode: pickupAddress.pincode,
          phone: pickupAddress.phone,
          country: pickupAddress.country || 'India'
        },
        products: order.products.map(p => ({
          product_name: p.product_name,
          quantity: p.quantity,
          hsn_code: p.hsn_code || '',
          unit_price: p.unit_price || 0
        })),
        package_info: {
          weight: order.package_info.weight, // Keep in kg - will be converted to grams in delhiveryService
          dimensions: {
            width: order.package_info.dimensions.width,
            height: order.package_info.dimensions.height,
            length: order.package_info.dimensions.length || order.package_info.dimensions.width
          }
        },
        payment_info: {
          payment_mode: order.payment_info.payment_mode,
          cod_amount: order.payment_info.cod_amount || 0,
          order_value: order.payment_info.order_value || order.payment_info.total_amount || 0
        },
        seller_info: {
          name: order.seller_info?.name || 'SHIPSARTHI',
          gst_number: order.seller_info?.gst_number || ''
        },
        invoice_number: order.invoice_number || `INV${order.order_id}`,
        shipping_mode: order.shipping_mode || 'Surface',
        address_type: order.delivery_address.address_type || 'home',
        waybill: preFetchedWaybill || undefined // Send pre-fetched waybill if available
      };

      console.log('🌐 CALLING DELHIVERY API', {
        orderId: order.order_id,
        orderData: {
          order_id: orderDataForDelhivery.order_id,
          customer_name: orderDataForDelhivery.customer_info.buyer_name,
          delivery_pincode: orderDataForDelhivery.delivery_address.pincode,
          pickup_pincode: orderDataForDelhivery.pickup_address.pincode
        },
        timestamp: new Date().toISOString()
      });

      // Call Delhivery API to create shipment
      delhiveryResult = await delhiveryService.createShipment(orderDataForDelhivery);

      console.log('📥 DELHIVERY RESULT RECEIVED', {
        orderId: order.order_id,
        success: delhiveryResult?.success,
        hasWaybill: !!delhiveryResult?.waybill,
        hasPackages: !!delhiveryResult?.packages,
        packagesLength: delhiveryResult?.packages?.length || 0,
        fullResult: JSON.stringify(delhiveryResult),
        timestamp: new Date().toISOString()
      });

      if (delhiveryResult.success) {
        // Extract AWB/waybill from response - handle multiple response formats
        let awbNumber = null;
        let packageData = null;

        // Try to get AWB from packages array first
        if (delhiveryResult.packages && Array.isArray(delhiveryResult.packages) && delhiveryResult.packages.length > 0) {
          packageData = delhiveryResult.packages[0];
          awbNumber = packageData.waybill || packageData.AWB || packageData.wb || null;
        }
        
        // Fallback to direct waybill property
        if (!awbNumber && delhiveryResult.waybill) {
          awbNumber = delhiveryResult.waybill;
          packageData = packageData || { waybill: awbNumber, status: 'Success' };
        }

        // Fallback to tracking_id
        if (!awbNumber && delhiveryResult.tracking_id) {
          awbNumber = delhiveryResult.tracking_id;
          packageData = packageData || { waybill: awbNumber, status: 'Success' };
        }

        if (awbNumber) {
          console.log('✅ DELHIVERY API SUCCESS - SHIPMENT CREATED', {
            orderId: order.order_id,
            awb: awbNumber,
            source: delhiveryResult.packages ? 'packages' : 'waybill',
            delhiveryResponse: delhiveryResult,
            timestamp: new Date().toISOString()
          });
          
          // Update order with Delhivery response
          order.delhivery_data = {
            waybill: awbNumber,
            package_id: packageData?.refnum || order.order_id,
            upload_wbn: delhiveryResult.upload_wbn || null,
            status: packageData?.status || 'Success',
            serviceable: packageData?.serviceable,
            sort_code: packageData?.sort_code,
            remarks: packageData?.remarks || [],
            cod_amount: packageData?.cod_amount || 0,
            payment: packageData?.payment,
            label_url: delhiveryResult.label_url || packageData?.label_url || null,
            expected_delivery_date: delhiveryResult.expected_delivery || packageData?.expected_delivery_date || null
          };

          // Update order status based on Delhivery response
          if (packageData?.status === 'Success' || !packageData?.status) {
            order.status = 'ready_to_ship';
          } else {
            order.status = 'new';
          }
          
          // NOW SAVE TO DATABASE - Only after Delhivery confirms shipment creation
          await order.save();
          
          console.log('💾 ORDER SAVED TO DATABASE AFTER DELHIVERY SUCCESS', {
            orderId: order.order_id,
            awb: awbNumber,
            status: order.status,
            timestamp: new Date().toISOString()
          });
          
          // Create or update customer record AFTER successful order save
          try {
            const customerData = {
              name: order.customer_info.buyer_name,
              phone: order.customer_info.phone,
              alternate_phone: order.customer_info.alternate_phone,
              email: order.customer_info.email,
              gstin: order.customer_info.gstin,
              address: {
                address_line_1: order.delivery_address.address_line_1,
                address_line_2: order.delivery_address.address_line_2,
                full_address: order.delivery_address.full_address,
                landmark: order.delivery_address.landmark,
                city: order.delivery_address.city,
                state: order.delivery_address.state,
                pincode: order.delivery_address.pincode,
                country: order.delivery_address.country,
                address_type: order.delivery_address.address_type
              },
              channel: 'order_creation'
            };

            const customer = await Customer.findOrCreate(userId, customerData);
            
            // Update customer order statistics
            await customer.updateOrderStats(order.payment_info.total_amount);
            
            console.log('👤 CUSTOMER CREATED/UPDATED AFTER ORDER SUCCESS', {
              orderId: order.order_id,
              customerId: customer._id,
              customerName: customer.name,
              customerPhone: customer.phone,
              timestamp: new Date().toISOString()
            });
          } catch (customerError) {
            console.error('❌ CUSTOMER CREATION FAILED', {
              orderId: order.order_id,
              error: customerError.message,
              timestamp: new Date().toISOString()
            });
            // Don't fail the order creation if customer creation fails
          }
          
          // Deduct wallet and create transaction AFTER successful order save
          const walletResult = await deductWalletForOrder(order, userId, awbNumber);
          if (!walletResult.success) {
            console.error('❌ WALLET DEDUCTION FAILED', {
              orderId: order.order_id,
              error: walletResult.error,
              timestamp: new Date().toISOString()
            });
            // Log error but don't fail order creation - order is already saved
            // This allows the order to exist even if wallet deduction fails
            // Admin can manually process the wallet deduction if needed
          }
          
          console.log('✅ Shipment created successfully for order:', order.order_id, 'AWB:', awbNumber);
          
          // Note: Auto-pickup removed - order will appear in 'ready_to_ship' tab
          // User can manually request pickup using "Create Pickup Request" button
        } else {
          console.log('⚠️ DELHIVERY API SUCCESS BUT NO AWB FOUND - ORDER NOT SAVED', {
            orderId: order.order_id,
            delhiveryResponse: delhiveryResult,
            hasWaybill: !!delhiveryResult?.waybill,
            hasPackages: !!delhiveryResult?.packages,
            hasTrackingId: !!delhiveryResult?.tracking_id,
            delhiveryResultKeys: Object.keys(delhiveryResult || {}),
            timestamp: new Date().toISOString()
          });
          
          // Don't save order if no AWB was generated
          return res.status(400).json({
            status: 'error',
            message: 'Shipment creation failed - No AWB number generated by Delhivery',
            debug_info: {
              delhivery_success: delhiveryResult?.success || false,
              has_waybill: !!delhiveryResult?.waybill,
              has_packages: !!delhiveryResult?.packages,
              response_keys: Object.keys(delhiveryResult || {})
            }
          });
        }
      } else {
        console.log('❌ DELHIVERY API FAILED - ORDER NOT SAVED', {
          orderId: order.order_id,
          delhiveryResponse: delhiveryResult,
          error: delhiveryResult.error,
          timestamp: new Date().toISOString()
        });
        
        // Return error - don't save order if Delhivery fails
        return res.status(400).json({
          status: 'error',
          message: 'Shipment creation failed with Delhivery',
          error: delhiveryResult.error || 'Unknown Delhivery API error',
          debug_info: {
            delhivery_success: delhiveryResult?.success || false,
            response_data: delhiveryResult
          }
        });
      }
    } catch (delhiveryError) {
      console.error('❌ DELHIVERY API ERROR - ORDER NOT SAVED:', {
        orderId: order.order_id,
        error: delhiveryError.message,
        timestamp: new Date().toISOString()
      });
      
      // Return error - don't save order if Delhivery API fails
      return res.status(500).json({
        status: 'error',
        message: 'Failed to create shipment with Delhivery',
        error: delhiveryError.message,
        debug_info: {
          error_type: 'DELHIVERY_API_ERROR',
          order_id: order.order_id
        }
      });
    }
    } else {
      // If generate_awb is false, just save order without calling Delhivery API
      console.log('⏭️ SKIPPING DELHIVERY API (AWB generation NOT requested)', {
        orderId: order.order_id,
        generate_awb_flag: req.body.generate_awb
      });
      console.log('💾 SAVING ORDER WITHOUT AWB GENERATION', {
        orderId: order.order_id,
        status: 'new',
        timestamp: new Date().toISOString()
      });
      
      // Set status to 'new' since no AWB is generated
      order.status = 'new';
      
      // Save order to database
      await order.save();
      
      console.log('✅ ORDER SAVED TO DATABASE (NO AWB)', {
        orderId: order.order_id,
        status: order.status,
        timestamp: new Date().toISOString()
      });
      
      // Create or update customer record AFTER successful order save
      try {
        const Customer = require('../models/Customer');
        const customerData = {
          name: order.customer_info.buyer_name,
          phone: order.customer_info.phone,
          alternate_phone: order.customer_info.alternate_phone,
          email: order.customer_info.email,
          gstin: order.customer_info.gstin,
          address: {
            address_line_1: order.delivery_address.address_line_1,
            address_line_2: order.delivery_address.address_line_2,
            full_address: order.delivery_address.full_address,
            landmark: order.delivery_address.landmark,
            city: order.delivery_address.city,
            state: order.delivery_address.state,
            pincode: order.delivery_address.pincode,
            country: order.delivery_address.country,
            address_type: order.delivery_address.address_type
          },
          channel: 'order_creation'
        };

        const customer = await Customer.findOrCreate(userId, customerData);
        await customer.updateOrderStats(order.payment_info.total_amount);
        
        console.log('👤 CUSTOMER CREATED/UPDATED AFTER ORDER SAVE (NO AWB)', {
          orderId: order.order_id,
          customerId: customer._id,
          customerName: customer.name,
          timestamp: new Date().toISOString()
        });
      } catch (customerError) {
        console.error('❌ CUSTOMER CREATION FAILED (NO AWB)', {
          orderId: order.order_id,
          error: customerError.message,
          timestamp: new Date().toISOString()
        });
        // Don't fail the order creation if customer creation fails
      }
      
      // Deduct wallet and create transaction AFTER successful order save (for "Save" button flow)
      // Note: AWB is null for orders saved without AWB generation
      const walletResult = await deductWalletForOrder(order, userId, null);
      if (!walletResult.success) {
        console.error('❌ WALLET DEDUCTION FAILED', {
          orderId: order.order_id,
          error: walletResult.error,
          timestamp: new Date().toISOString()
        });
        // Log error but don't fail order creation - order is already saved
        // This allows the order to exist even if wallet deduction fails
        // Admin can manually process the wallet deduction if needed
      }
    }

    // Save package template if requested
    if (req.body.package_info.save_dimensions) {
      try {
        const Package = require('../models/Package');
        const packageTemplate = new Package({
          user_id: userId,
          name: `${order.products[0]?.product_name || 'Package'} - ${order.package_info.package_type}`,
          description: `Auto-saved from order ${order.order_id}`,
          category: order.products[0]?.category || 'General',
          package_type: order.package_info.package_type,
          dimensions: order.package_info.dimensions,
          weight: order.package_info.weight,
          number_of_boxes: order.package_info.number_of_boxes,
          weight_per_box: order.package_info.weight_per_box,
          rov_type: order.package_info.rov_type,
          rov_owner: order.package_info.rov_owner,
          product_name: order.products[0]?.product_name || 'Product',
          hsn_code: order.products[0]?.hsn_code,
          unit_price: order.products[0]?.unit_price,
          weight_photo_url: order.package_info.weight_photo_url,
          dimensions_photo_url: order.package_info.dimensions_photo_url,
          tags: [order.products[0]?.category || 'General', order.package_info.package_type]
        });

        await packageTemplate.save();
        console.log('✅ Package template saved for future use');
      } catch (packageError) {
        console.error('❌ Error saving package template:', packageError.message);
      }
    }

    // Refresh order from database to get the latest delhivery_data
    await order.populate('user_id', 'name email');
    
    const awbNumber = order.delhivery_data?.waybill || delhiveryResult?.waybill || null;
    
    // Log completion based on whether AWB was generated
    if (generateAWB) {
      console.log('🎉 ORDER AND SHIPMENT CREATION COMPLETED', {
        orderId: order.order_id,
        awb: order.delhivery_data?.waybill || 'N/A',
        status: order.status,
        delhiverySuccess: delhiveryResult?.success || false,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('🎉 ORDER SAVED SUCCESSFULLY (NO AWB)', {
        orderId: order.order_id,
        status: order.status,
        timestamp: new Date().toISOString()
      });
    }

    const message = generateAWB && awbNumber 
      ? 'Order and shipment created successfully' 
      : generateAWB 
        ? 'Order created, AWB generation in progress'
        : 'Order saved successfully';

    // Response data for order creation
    const responseData = {
      order: order,
      awb_number: order.delhivery_data?.waybill || null,
      shipment_info: order.delhivery_data || null,
      delhivery_confirmation: {
        success: true,
        awb: order.delhivery_data?.waybill,
        status: order.delhivery_data?.status,
        serviceable: order.delhivery_data?.serviceable,
        label_url: order.delhivery_data?.label_url,
        expected_delivery: order.delhivery_data?.expected_delivery_date
      }
    };
    
    res.status(201).json({
      status: 'success',
      message: message,
      data: responseData
    });

  } catch (error) {
    console.log('💥 ORDER CREATION ERROR', {
      orderId,
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      validationErrors: error.errors,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Handle specific error types with detailed messages
    let statusCode = 500;
    let errorMessage = 'Server error creating order';
    let errorDetails = {};

    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = 'Order validation failed';
      errorDetails = {
        validationErrors: Object.keys(error.errors).map(field => ({
          field,
          message: error.errors[field].message,
          value: error.errors[field].value,
          kind: error.errors[field].kind
        }))
      };
    } else if (error.code === 11000) {
      statusCode = 409;
      errorMessage = 'Duplicate order detected - this order may already exist';
      const field = Object.keys(error.keyPattern || {})[0];
      errorDetails = {
        duplicateField: field,
        duplicateValue: error.keyValue?.[field],
        hint: 'An order with this identifier already exists in the database'
      };
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      statusCode = 503;
      errorMessage = 'Database error occurred';
      errorDetails = {
        code: error.code,
        codeName: error.codeName
      };
    } else if (error.message && error.message.includes('Cast to')) {
      statusCode = 400;
      errorMessage = 'Invalid data type in order fields';
      errorDetails = {
        hint: 'One or more fields have incorrect data types',
        error: error.message
      };
    }

    console.error('Create order error:', error);
    res.status(statusCode).json({
      status: 'error',
      message: errorMessage,
      error: error.message,
      details: errorDetails
    });
  }
});

// @desc    Generate AWB for an existing order in NEW status
// @route   POST /api/orders/:id/generate-awb
// @access  Private
router.post('/:id/generate-awb', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;

    // Find order
    const order = await Order.findOne({
      _id: orderId,
      user_id: userId
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Validate order status - must be 'new' to generate AWB
    if (order.status !== 'new') {
      return res.status(400).json({
        status: 'error',
        message: `Order must be in 'new' status to generate AWB. Current status: ${order.status}`
      });
    }

    // Check if AWB already exists
    if (order.delhivery_data?.waybill) {
      return res.status(400).json({
        status: 'error',
        message: 'AWB number already exists for this order',
        awb: order.delhivery_data.waybill
      });
    }

    logger.info('🚀 Generating AWB for existing order', {
      orderId: order.order_id,
      userId: userId.toString()
    });

    // Get warehouse/pickup address
    let pickupAddress = {};
    if (order.pickup_address) {
      pickupAddress = {
        name: order.pickup_address.name || 'SHIPSARTHI C2C',
        full_address: order.pickup_address.full_address,
        city: order.pickup_address.city,
        state: order.pickup_address.state,
        pincode: order.pickup_address.pincode,
        phone: order.pickup_address.phone,
        country: order.pickup_address.country || 'India'
      };
    }

    try {
      await ensureServiceablePincodes(
        pickupAddress.pincode || order.pickup_address?.pincode,
        order.delivery_address.pincode,
        order.payment_info.payment_mode
      );
    } catch (svcError) {
      logger.error('❌ Serviceability validation failed before AWB generation', {
        orderId: order.order_id,
        pickupPincode: pickupAddress.pincode || order.pickup_address?.pincode,
        deliveryPincode: order.delivery_address.pincode,
        error: svcError.message
      });
      return res.status(400).json({
        status: 'error',
        message: svcError.message,
        error_code: SERVICEABILITY_ERROR_CODE
      });
    }

    // Prepare order data for Delhivery API
    const orderDataForDelhivery = {
      order_id: order.order_id,
      customer_info: {
        buyer_name: order.customer_info.buyer_name,
        phone: order.customer_info.phone,
        email: order.customer_info.email || ''
      },
      delivery_address: {
        full_address: order.delivery_address.full_address,
        pincode: order.delivery_address.pincode,
        city: order.delivery_address.city,
        state: order.delivery_address.state,
        country: order.delivery_address.country || 'India',
        address_type: order.delivery_address.address_type || 'home'
      },
      pickup_address: pickupAddress,
      products: order.products.map(p => ({
        product_name: p.product_name,
        quantity: p.quantity,
        hsn_code: p.hsn_code || '',
        unit_price: p.unit_price || 0
      })),
      package_info: {
        weight: order.package_info.weight,
        dimensions: {
          width: order.package_info.dimensions.width,
          height: order.package_info.dimensions.height,
          length: order.package_info.dimensions.length || order.package_info.dimensions.width
        }
      },
      payment_info: {
        payment_mode: order.payment_info.payment_mode,
        cod_amount: order.payment_info.cod_amount || 0,
        order_value: order.payment_info.order_value || order.payment_info.total_amount || 0
      },
      seller_info: {
        name: order.seller_info?.name || 'SHIPSARTHI',
        gst_number: order.seller_info?.gst_number || ''
      },
      invoice_number: order.invoice_number || `INV${order.order_id}`,
      shipping_mode: order.shipping_mode || 'Surface',
      address_type: order.delivery_address.address_type || 'home'
    };

    // Try to fetch waybill first
    const waybillResult = await delhiveryService.getWaybill(1);
    let preFetchedWaybill = null;
    
    if (waybillResult.success && waybillResult.waybills && waybillResult.waybills.length > 0) {
      preFetchedWaybill = waybillResult.waybills[0];
    }
    
    if (preFetchedWaybill) {
      orderDataForDelhivery.waybill = preFetchedWaybill;
    }

    // Call Delhivery API to create shipment
    const delhiveryResult = await delhiveryService.createShipment(orderDataForDelhivery);

    // Extract AWB number from response - check success OR if waybill exists
    let awbNumber = null;
    let packageData = null;

    // Always try to extract AWB, even if success is false (Delhivery may still generate it)
    if (delhiveryResult.packages && Array.isArray(delhiveryResult.packages) && delhiveryResult.packages.length > 0) {
      packageData = delhiveryResult.packages[0];
      awbNumber = packageData.waybill || packageData.AWB || packageData.wb || null;
    }
    
    if (!awbNumber && delhiveryResult.waybill) {
      awbNumber = delhiveryResult.waybill;
      packageData = packageData || { waybill: awbNumber, status: 'Success' };
    }

    // If we have AWB, proceed (even if success was false)
    if (awbNumber) {
      // Log warning if there was an error flag but we still got AWB
      if (delhiveryResult.warning) {
        logger.warn('⚠️ AWB generated despite Delhivery warning', {
          orderId: order.order_id,
          awbNumber: awbNumber,
          warning: delhiveryResult.warning
        });
      }
    } else if (!delhiveryResult.success) {
      // Only fail if no AWB AND success is false
      logger.error('❌ AWB generation failed - no AWB in response', {
        orderId: order.order_id,
        error: delhiveryResult.error,
        hasPackages: !!delhiveryResult.packages,
        hasWaybill: !!delhiveryResult.waybill
      });

      return res.status(400).json({
        status: 'error',
        message: delhiveryResult.error || 'Failed to generate AWB from Delhivery',
        error: delhiveryResult.error
      });
    } else {
      // No AWB found even though success was true (shouldn't happen, but handle gracefully)
      logger.error('❌ AWB generation reported success but no AWB found', {
        orderId: order.order_id,
        delhiveryResult: delhiveryResult
      });

      return res.status(400).json({
        status: 'error',
        message: 'AWB number not found in Delhivery response'
      });
    }

    // Update order with AWB and status
    order.delhivery_data = {
      waybill: awbNumber,
      package_id: packageData?.refnum || order.order_id,
      upload_wbn: delhiveryResult.upload_wbn || null,
      status: packageData?.status || 'Success',
      serviceable: packageData?.serviceable,
      sort_code: packageData?.sort_code,
      remarks: packageData?.remarks || [],
      cod_amount: packageData?.cod_amount || 0,
      payment: packageData?.payment,
      label_url: delhiveryResult.label_url || packageData?.label_url || null,
      expected_delivery_date: delhiveryResult.expected_delivery || packageData?.expected_delivery_date || null
    };

    // Update status to ready_to_ship
    order.status = 'ready_to_ship';

    await order.save();

    // Create TrackingOrder for automated tracking (don't require pickup request)
    try {
      await TrackingOrder.createFromOrder(order);
      logger.info('✅ TrackingOrder created at AWB generation', { orderId: order.order_id, awb: awbNumber });
    } catch (trackingErr) {
      // Non-critical — don't fail the AWB generation
      logger.warn('⚠️ Failed to create TrackingOrder at AWB generation (non-critical)', {
        orderId: order.order_id, error: trackingErr.message
      });
    }

    logger.info('✅ AWB generated successfully', {
      orderId: order.order_id,
      awb: awbNumber,
      newStatus: order.status
    });

    res.json({
      status: 'success',
      message: 'AWB generated successfully',
      data: {
        order_id: order.order_id,
        awb_number: awbNumber,
        status: order.status,
        shipment_info: order.delhivery_data
      }
    });

  } catch (error) {
    logger.error('❌ Generate AWB error', {
      orderId: req.params.id,
      userId: req.user._id,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error generating AWB'
    });
  }
});

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Private
router.put('/:id', auth, [
  body('customer_info.buyer_name').optional().trim().notEmpty(),
  body('customer_info.phone').optional().matches(/^[6-9]\d{9}$/),
  body('customer_info.email').optional().isEmail(),
  body('delivery_address.full_address').optional().trim().notEmpty(),
  body('delivery_address.pincode').optional().matches(/^[1-9][0-9]{5}$/),
  body('payment_info.payment_mode').optional().isIn(['prepaid', 'cod']),
  body('payment_info.order_value').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Check if order can be updated
    if (['delivered', 'rto', 'rto_in_transit', 'rto_delivered', 'cancelled', 'lost'].includes(order.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot update order in current status'
      });
    }

    // Update order fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        order[key] = req.body[key];
      }
    });

    await order.save();

    res.json({
      status: 'success',
      message: 'Order updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating order'
    });
  }
});

// @desc    Cancel order
// @route   DELETE /api/orders/:id
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (['delivered', 'rto', 'rto_in_transit', 'rto_delivered', 'cancelled', 'lost'].includes(order.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel order in current status'
      });
    }

    await order.updateStatus('cancelled', 'Order cancelled by user', '', 'user');

    res.json({
      status: 'success',
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error cancelling order'
    });
  }
});

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Private
router.patch('/:id/status', auth, [
  body('status').isIn([
    'new', 'ready_to_ship', 'pickup_pending', 'manifested', 'pickups_manifests',
    'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto', 'rto_in_transit', 'rto_delivered', 'cancelled', 'lost'
  ]).withMessage('Valid status is required'),
  body('remarks').optional().trim(),
  body('location').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    const { status, remarks = '', location = '' } = req.body;

    await order.updateStatus(status, remarks, location, 'user');

    res.json({
      status: 'success',
      message: 'Order status updated successfully',
      data: {
        order_id: order.order_id,
        current_status: order.status,
        last_updated: order.updatedAt
      }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating order status'
    });
  }
});

// @desc    Bulk update orders
// @route   PATCH /api/orders/bulk-update
// @access  Private
router.patch('/bulk-update', auth, [
  body('order_ids').isArray({ min: 1 }).withMessage('Order IDs array is required'),
  body('order_ids.*').isMongoId().withMessage('Valid order IDs are required'),
  body('action').isIn(['cancel', 'ready_to_ship', 'pickup_pending']).withMessage('Valid action is required'),
  body('remarks').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { order_ids, action, remarks = '' } = req.body;
    const userId = req.user._id;

    const orders = await Order.find({
      _id: { $in: order_ids },
      user_id: userId
    });

    if (orders.length !== order_ids.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Some orders not found or access denied'
      });
    }

    const results = [];

    for (const order of orders) {
      try {
        let newStatus;
        switch (action) {
          case 'cancel':
            newStatus = 'cancelled';
            break;
          case 'ready_to_ship':
            newStatus = 'ready_to_ship';
            break;
          case 'pickup_pending':
            newStatus = 'pickup_pending';
            break;
        }

        await order.updateStatus(newStatus, remarks, '', 'user');
        results.push({
          order_id: order.order_id,
          status: 'success',
          new_status: newStatus
        });
      } catch (error) {
        results.push({
          order_id: order.order_id,
          status: 'error',
          message: error.message
        });
      }
    }

    res.json({
      status: 'success',
      message: 'Bulk update completed',
      data: results
    });

  } catch (error) {
    console.error('Bulk update orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating orders'
    });
  }
});

// @desc    Get order statistics
// @route   GET /api/orders/statistics
// @access  Private
router.get('/statistics/overview', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = '30' } = req.query;
    const startDate = moment().subtract(parseInt(period), 'days').startOf('day');

    const stats = await Order.getOrderStats(userId, startDate.toDate(), new Date());

    const summary = {
      total_orders: 0,
      total_value: 0,
      status_breakdown: {}
    };

    stats.forEach(stat => {
      summary.total_orders += stat.count;
      summary.total_value += stat.total_value || 0;
      summary.status_breakdown[stat._id] = {
        count: stat.count,
        value: stat.total_value || 0
      };
    });

    res.json({
      status: 'success',
      data: {
        period_days: parseInt(period),
        summary,
        detailed_stats: stats
      }
    });

  } catch (error) {
    console.error('Order statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching order statistics'
    });
  }
});

// @desc    Track order by AWB or Order ID (Public)
// @route   GET /api/orders/track/:identifier
// @access  Public
router.get('/track/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    const order = await Order.findOne({
      $or: [
        { order_id: identifier },
        { 'shipping_info.awb_number': identifier }
      ]
    }).select('order_id shipping_info order_status customer_info.buyer_name delivery_address payment_info.payment_mode');

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    res.json({
      status: 'success',
      data: {
        order_id: order.order_id,
        awb_number: order.shipping_info.awb_number,
        current_status: order.status,
        status_history: order.status_history,
        customer_name: order.customer_info.buyer_name,
        delivery_city: order.delivery_address.city,
        payment_mode: order.payment_info.payment_mode
      }
    });

  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error tracking order'
    });
  }
});


// @desc    Generate shipping label
// @route   GET /api/orders/:id/label
// @access  Private
router.get('/:id/label', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Get waybill from multiple possible locations
    const waybill = order.delhivery_data?.waybill || 
                    order.shipping_info?.awb_number || 
                    order.awb ||
                    order.waybill;
    
    if (!waybill) {
      logger.error('❌ Waybill not found in order', {
        requestId: req.requestId,
        orderId: order._id,
        orderFields: {
          hasDelhiveryData: !!order.delhivery_data,
          delhiveryWaybill: order.delhivery_data?.waybill,
          hasShippingInfo: !!order.shipping_info,
          shippingAWB: order.shipping_info?.awb_number,
          directAWB: order.awb,
          directWaybill: order.waybill
        }
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'AWB/Waybill number not assigned yet. Please generate AWB first.'
      });
    }

    // Get query parameters for label generation
    const pdf = req.query.pdf !== 'false'; // Default to true (PDF)
    const pdf_size = req.query.pdf_size || 'A4'; // Default to A4

    logger.info('🏷️ Generating shipping label via Delhivery API', {
      requestId: req.requestId,
      orderId: order._id,
      waybill,
      pdf,
      pdf_size
    });

    // Call Delhivery API to generate shipping label
    // NOTE: Delhivery packing_slip API always returns JSON, never PDF URL
    const labelResult = await delhiveryService.generateShippingLabel(waybill);

    if (!labelResult.success) {
      logger.error('❌ Shipping label generation failed', {
        requestId: req.requestId,
        orderId: order._id,
        waybill,
        error: labelResult.error
      });

      return res.status(400).json({
        status: 'error',
        message: labelResult.error || 'Failed to generate shipping label from Delhivery',
        error: labelResult.error
      });
    }

    logger.info('✅ Shipping label JSON received from Delhivery', {
      requestId: req.requestId,
      orderId: order._id,
      waybill,
      hasJsonData: !!labelResult.json_data
    });

    // Check if HTML format is requested
    if (req.query.format === 'html') {
      try {
        // Fetch user's label settings
        const user = await User.findById(req.user._id).select('label_settings company_logo_url').lean();
        const labelSettings = user?.label_settings ? { ...user.label_settings } : {};
        if (!labelSettings.logo_url && user?.company_logo_url) {
          labelSettings.logo_url = user.company_logo_url;
        }

        // Convert JSON to HTML label, pass waybill as fallback and labelSettings
        const html = labelRenderer.generateLabelHTML(labelResult.json_data, waybill, order, labelSettings);

        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      } catch (error) {
        logger.error('❌ Error generating HTML label', {
          requestId: req.requestId,
          orderId: order._id,
          error: error.message
        });
        
        return res.status(500).json({
          status: 'error',
          message: 'Failed to generate HTML label',
          error: error.message
        });
      }
    }

    // Otherwise, return JSON data for frontend rendering
    // Generate HTML URL - handle production proxy correctly
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || process.env.FRONTEND_URL?.replace(/^https?:\/\//, '') || 'localhost:5000';
    const htmlUrl = `${protocol}://${host}/api/orders/${order._id}/label?format=html`;
    
    return res.json({
      status: 'success',
      message: 'Shipping label data generated successfully',
      data: {
        json_data: labelResult.json_data,
        waybill: waybill,
        order_id: order.order_id,
        label_type: 'json',
        html_url: htmlUrl
      }
    });

  } catch (error) {
    logger.error('❌ Generate label error', {
      requestId: req.requestId,
      orderId: req.params.id,
      userId: req.user._id,
      error: error.message,
      errorStack: error.stack
    });
    console.error('Generate label error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error generating label'
    });
  }
});

function generateShippingLabelHTML(order, delhiveryLabelData = null, delhiveryLabelPdfUrl = null, labelSettings = {}) {
  // Parse Delhivery label data to extract package information
  let pkg = null;
  if (delhiveryLabelData) {
    try {
      // Try to extract package data from Delhivery response (same logic as labelRenderer)
      if (Array.isArray(delhiveryLabelData)) {
        pkg = delhiveryLabelData[0];
      } else if (delhiveryLabelData.packages && Array.isArray(delhiveryLabelData.packages)) {
        pkg = delhiveryLabelData.packages[0];
      } else if (typeof delhiveryLabelData === 'object') {
        const keys = Object.keys(delhiveryLabelData);
        if (keys.length > 0) {
          const waybillKey = keys.find(k => /^\d{10,}$/.test(k));
          if (waybillKey) {
            pkg = delhiveryLabelData[waybillKey];
          } else {
            pkg = delhiveryLabelData[keys[0]];
          }
        }
        if (!pkg && delhiveryLabelData.Wbn) {
          pkg = delhiveryLabelData;
        }
      }
    } catch (parseError) {
      logger.warn('⚠️ Error parsing Delhivery label data', { error: parseError.message });
    }
  }

  // Extract data - prefer Delhivery data, fallback to MongoDB order data
  const waybill = pkg?.Wbn || pkg?.waybill || order.delhivery_data?.waybill || order.shipping_info?.awb_number || order.awb || order.waybill || 'N/A';
  const barcodeImage = pkg?.Barcode || pkg?.barcode || pkg?.barcode_image || '';

  // Customer/Delivery info - prefer Delhivery, fallback to MongoDB
  const customerName = pkg?.Name || order.customer_info?.buyer_name || 'N/A';
  const customerPhone = pkg?.Cnph || order.customer_info?.phone || 'N/A';
  const deliveryAddress = pkg?.Address || order.delivery_address?.full_address || 'N/A';
  const deliveryCity = pkg?.['Destination city'] || order.delivery_address?.city || 'N/A';
  const deliveryState = pkg?.['Customer state'] || order.delivery_address?.state || 'N/A';
  const deliveryPincode = pkg?.Pin || order.delivery_address?.pincode || 'N/A';

  // Origin/Pickup info - prefer Delhivery, fallback to MongoDB
  const originName = pkg?.Origin || order.pickup_address?.name || 'N/A';
  const originAddress = pkg?.Sadd || order.pickup_address?.full_address || 'N/A';
  const originCity = pkg?.['Origin city'] || order.pickup_address?.city || 'N/A';
  const originState = pkg?.['Origin state'] || order.pickup_address?.state || 'N/A';
  const originPincode = pkg?.Rpin || order.pickup_address?.pincode || 'N/A';

  // Product/Package info
  const weight = pkg?.Weight || order.package_info?.weight || '0.5';
  const dimensions = order.package_info?.dimensions ?
    `${order.package_info.dimensions.length}x${order.package_info.dimensions.width}x${order.package_info.dimensions.height} CM` :
    '10x10x10 CM';

  // Payment info
  const paymentMode = pkg?.Pt || order.payment_info?.payment_mode || 'Prepaid';
  const codAmount = pkg?.Cod || (order.payment_info?.payment_mode === 'COD' ? order.payment_info?.cod_amount : 0);
  const orderValue = order.payment_info?.order_value || 0;
  const shippingCharges = order.payment_info?.shipping_charges || 0;
  const totalAmount = order.payment_info?.total_amount || (orderValue + shippingCharges);

  // Order details
  const orderId = pkg?.Oid || order.order_id || 'N/A';
  const referenceId = order.reference_id || `REF-${waybill.slice(-10)}`;
  const invoiceRef = pkg?.['Invoice reference'] || order.invoice_number || 'N/A';
  const orderDate = order.order_date || order.createdAt || null;

  // Seller / pickup details
  const companyName = order.seller_info?.name || order.user_id?.company_name || originName || 'N/A';
  const sellerName = order.seller_info?.reseller_name || order.user_id?.your_name || originName || '';
  const companyGstin = order.seller_info?.gst_number || order.user_id?.gst_number || '';
  const companyPhone = order.pickup_address?.phone || order.user_id?.phone_number || '';

  // Apply label settings for logo
  const useOrderChannelLogo = labelSettings?.use_order_channel_logo || false;
  const labelLogoUrl = labelSettings?.logo_url || '';
  const companyLogoUrl = useOrderChannelLogo ? (order.seller_info?.logo_url || order.user_id?.company_logo_url || '') : (labelLogoUrl || order.user_id?.company_logo_url || '');

  // Get component visibility settings (default to true if not set)
  const visibility = labelSettings?.component_visibility || {};
  const showComponent = (component) => visibility[component] !== false; // Default to true if not explicitly set to false

  // Product list & notes
  const products = Array.isArray(order.products) ? order.products : [
    { product_name: pkg?.Prd || 'Product 1', sku: 'SKU001', quantity: pkg?.Qty || 1, unit_price: orderValue || 100 }
  ];
  const specialInstructions = order.special_instructions || order.internal_notes || '';

  // Brand info
  const brandName = order.user_id?.company_name || companyName || 'SHIPPING COMPANY';
  const brandTagline = 'Door 2 Door International & Domestic courier Service Available';
  const brandMobile = companyPhone || '9351205202';
  const courierName = 'Delhivery';

  const formatCurrency = (amount) => {
    if (!amount) return '₹0';
    return `₹${parseFloat(amount).toFixed(0)}`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shipping Label - ${orderId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      padding: 10px;
      font-size: 8px;
      line-height: 1.2;
      background: white;
    }

    /* Label Container - Fixed width, auto height */
    .label-container {
      width: 100mm;
      border: 1px solid #000;
      display: flex;
      flex-direction: column;
      background: white;
      margin: 0 auto;
    }

    /* Section 1: Header - Ship To (left) + Company Branding (right) */
    .label-section-header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      min-height: 70px;
    }
    .ship-to-section {
      padding: 6px 8px;
      border-right: 1px solid #000;
    }
    .ship-to-label {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 2px;
    }
    .ship-to-name {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 1px;
    }
    .ship-to-address {
      font-size: 7.5px;
      line-height: 1.3;
      margin-bottom: 1px;
    }
    .ship-to-city {
      font-size: 7.5px;
      color: #0066cc;
    }
    .ship-to-phone {
      font-size: 7.5px;
      margin-top: 2px;
    }
    .company-branding-section {
      padding: 6px 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .company-logo-preview {
      max-width: 100px;
      max-height: 35px;
      object-fit: contain;
      margin-bottom: 2px;
    }
    .company-brand-name {
      font-weight: bold;
      font-size: 10px;
      font-style: italic;
      margin-bottom: 1px;
    }
    .company-tagline {
      font-size: 6px;
      font-style: italic;
      text-align: center;
      line-height: 1.2;
      margin-bottom: 1px;
    }
    .company-mob {
      font-size: 7px;
      font-weight: bold;
    }

    /* Section 2: Courier & Payment Info Row */
    .label-section-courier {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      min-height: 60px;
    }
    .courier-section {
      padding: 6px 8px;
      border-right: 1px solid #000;
    }
    .courier-name {
      font-weight: bold;
      font-size: 8px;
      margin-bottom: 4px;
    }
    .courier-name span {
      font-weight: normal;
    }
    .awb-barcode {
      height: 30px;
      margin-bottom: 2px;
    }
    .awb-barcode img {
      max-height: 30px;
      max-width: 100%;
    }
    .awb-number {
      font-weight: bold;
      font-size: 8px;
    }
    .awb-number span {
      font-weight: normal;
    }
    .payment-info-section {
      padding: 6px 8px;
      font-size: 7.5px;
    }
    .payment-info-row {
      margin-bottom: 1px;
      display: flex;
    }
    .payment-info-label {
      color: #0066cc;
      min-width: 70px;
    }
    .payment-info-value {
      font-weight: normal;
    }

    /* Section 3: Shipped By & Order Info Row */
    .label-section-shipped {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      min-height: 80px;
    }
    .shipped-by-section {
      padding: 6px 8px;
      border-right: 1px solid #000;
    }
    .shipped-by-label {
      font-weight: bold;
      font-size: 8px;
      margin-bottom: 2px;
    }
    .shipped-by-label span {
      font-weight: normal;
      color: #0066cc;
      font-size: 7px;
    }
    .shipped-by-company {
      font-weight: bold;
      font-size: 8px;
      margin-bottom: 1px;
    }
    .shipped-by-gstin {
      font-size: 7px;
      margin-bottom: 1px;
    }
    .shipped-by-gstin span {
      font-weight: bold;
    }
    .shipped-by-name {
      font-size: 7.5px;
      margin-bottom: 1px;
    }
    .shipped-by-address {
      font-size: 7px;
      line-height: 1.2;
      margin-bottom: 1px;
    }
    .shipped-by-city {
      font-size: 7px;
      color: #0066cc;
    }
    .shipped-by-phone {
      font-size: 7.5px;
      margin-top: 2px;
    }
    .order-info-section {
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .order-id-row {
      font-size: 8px;
      margin-bottom: 4px;
      text-align: center;
    }
    .order-id-label {
      font-weight: bold;
    }
    .order-barcode {
      width: 80px;
      height: 40px;
      margin-bottom: 2px;
    }
    .order-barcode img {
      max-height: 40px;
      max-width: 100%;
    }
    .reference-id {
      font-size: 7px;
      margin-bottom: 4px;
    }
    .reference-id span {
      font-weight: bold;
    }
    .payment-badge {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 2px;
    }
    .payment-badge.prepaid {
      color: #0066cc;
    }
    .payment-badge.cod {
      color: #cc0000;
    }

    /* Section 4: Product Table */
    .label-section-products {
      padding: 4px 8px;
      border-bottom: 1px solid #000;
    }
    .products-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.5px;
    }
    .products-table th {
      background: #1a3a5c;
      color: white;
      padding: 3px 4px;
      text-align: left;
      font-weight: 600;
      font-size: 7px;
    }
    .products-table td {
      padding: 3px 4px;
      border-bottom: 1px solid #ddd;
    }
    .products-table .amount-col {
      text-align: right;
    }
    .products-table .qty-col {
      text-align: center;
    }
    .shipping-charge-row {
      font-size: 7px;
      text-align: right;
      padding: 2px 4px;
      margin-top: 2px;
    }
    .total-row {
      font-size: 8px;
      font-weight: bold;
      text-align: right;
      padding: 2px 4px;
    }

    /* Section 5: Footer */
    .label-section-footer {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 4px 8px;
      font-size: 6px;
      align-items: center;
      background: #f5f5f5;
    }
    .footer-disclaimer {
      font-size: 5.5px;
      line-height: 1.3;
      color: #333;
    }
    .footer-disclaimer p {
      margin: 0 0 1px 0;
    }
    .footer-branding {
      text-align: right;
      font-size: 6px;
    }
    .footer-branding-label {
      font-style: italic;
      color: #666;
    }
    .footer-branding-logo {
      max-height: 20px;
      max-width: 60px;
      object-fit: contain;
    }

    @media print {
      body { padding: 0; margin: 0; }
      .label-container { border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <div class="label-container">
    <!-- Section 1: Header - Ship To (left) + Company Branding (right) -->
    <div class="label-section-header">
      <div class="ship-to-section">
        <div class="ship-to-label">Ship To:</div>
        <div class="ship-to-name">${customerName}</div>
        <div class="ship-to-address">${deliveryAddress}</div>
        <div class="ship-to-city">${deliveryCity}, ${deliveryPincode}, India</div>
        ${showComponent('customer_phone') ? `<div class="ship-to-phone"><strong>Mobile Number:</strong> ${customerPhone}</div>` : ''}
      </div>
      <div class="company-branding-section">
        ${showComponent('logo') && companyLogoUrl ? `<img src="${companyLogoUrl}" class="company-logo-preview" alt="Company Logo">` : ''}
        <div class="company-brand-name">${brandName}</div>
        <div class="company-tagline">${brandTagline}</div>
        <div class="company-mob">Mob. : ${brandMobile}</div>
      </div>
    </div>

    <!-- Section 2: Courier & Payment Info Row -->
    <div class="label-section-courier">
      <div class="courier-section">
        <div class="courier-name">Courier: <span>${courierName}</span></div>
        <div class="awb-barcode">
          ${barcodeImage ? `<img src="${barcodeImage}" alt="AWB Barcode">` : '<div style="height:30px;background:repeating-linear-gradient(90deg,#000,#000 2px,#fff 2px,#fff 4px);"></div>'}
        </div>
        <div class="awb-number">AWB: <span>${waybill}</span></div>
      </div>
      <div class="payment-info-section">
        ${showComponent('dimensions') ? `<div class="payment-info-row"><span class="payment-info-label">Dimensions:</span><span class="payment-info-value">${dimensions}</span></div>` : ''}
        ${showComponent('weight') ? `<div class="payment-info-row"><span class="payment-info-label">Weight:</span><span class="payment-info-value">${weight}Kg</span></div>` : ''}
        ${showComponent('payment_type') ? `<div class="payment-info-row"><span class="payment-info-label">Payment:</span><span class="payment-info-value">${paymentMode}</span></div>` : ''}
        ${showComponent('invoice_number') ? `<div class="payment-info-row"><span class="payment-info-label">Invoice No:</span><span class="payment-info-value">${invoiceRef}</span></div>` : ''}
        ${showComponent('invoice_date') ? `<div class="payment-info-row"><span class="payment-info-label">Invoice Date:</span><span class="payment-info-value">${formatDate(orderDate)}</span></div>` : ''}
      </div>
    </div>

    <!-- Section 3: Shipped By & Order Info Row -->
    <div class="label-section-shipped">
      <div class="shipped-by-section">
        <div class="shipped-by-label">Shipped By: <span>(if undelivered, return to)</span></div>
        ${showComponent('company_name') ? `<div class="shipped-by-company">${companyName}</div>` : ''}
        ${showComponent('company_gstin') && companyGstin ? `<div class="shipped-by-gstin"><span>GSTIN:</span> ${companyGstin}</div>` : ''}
        <div class="shipped-by-name">${sellerName}</div>
        ${showComponent('pickup_address') ? `
          <div class="shipped-by-address">${originAddress}</div>
          <div class="shipped-by-city">${originState}, ${originPincode}, India</div>
        ` : ''}
        ${showComponent('company_phone') && companyPhone ? `<div class="shipped-by-phone"><strong>Mobile Number:</strong><br/>${companyPhone}</div>` : ''}
      </div>
      <div class="order-info-section">
        <div class="order-id-row"><span class="order-id-label">Order ID:</span> ${orderId}</div>
        <div class="order-barcode">
          ${barcodeImage ? `<img src="${barcodeImage}" alt="Order Barcode">` : '<div style="height:40px;background:repeating-linear-gradient(0deg,#000,#000 2px,#fff 2px,#fff 4px);"></div>'}
        </div>
        <div class="reference-id"><span>Reference ID:</span> ${referenceId}</div>
        <div class="payment-badge ${paymentMode.toLowerCase()}">${paymentMode.toUpperCase()}</div>
      </div>
    </div>

    <!-- Section 4: Product Table -->
    <div class="label-section-products">
      <table class="products-table">
        <thead>
          <tr>
            ${showComponent('sku') ? '<th>SKU</th>' : ''}
            <th>Item</th>
            <th class="qty-col">Qty</th>
            <th class="amount-col">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((item, index) => `
            <tr>
              ${showComponent('sku') ? `<td>${item.sku || item.hsn_code || '-'}</td>` : ''}
              <td>${showComponent('product_name') ? (item.product_name || '-') : `Item ${index + 1}`}</td>
              <td class="qty-col">${item.quantity || 1}</td>
              <td class="amount-col">${(showComponent('amount_prepaid') || showComponent('amount_cod')) ? formatCurrency((item.unit_price || 0) * (item.quantity || 1)) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${showComponent('shipping_charges') && shippingCharges > 0 ? `<div class="shipping-charge-row">Shipping Charge: ${formatCurrency(shippingCharges)}</div>` : ''}
      ${(showComponent('amount_prepaid') || showComponent('amount_cod')) ? `<div class="total-row">Total: ${formatCurrency(totalAmount)}</div>` : ''}
    </div>

    <!-- Section 5: Footer -->
    <div class="label-section-footer">
      <div class="footer-disclaimer">
        <p>1. Visit official website of Courier Company to view the Conditions of Carriage.</p>
        <p>2. All disputes will be resolved under Haryana jurisdiction. Sold goods are eligible for return or exchange according to the store's policy.</p>
      </div>
      <div class="footer-branding">
        <div class="footer-branding-label">Powered by:</div>
        <img src="https://shipsarthi.com/logo.png" class="footer-branding-logo" alt="Shipsarthi" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span style="display:none;font-weight:bold;font-size:9px;color:#1a3a5c;">Shipsarthi</span>
      </div>
    </div>

    <!-- Message section - shown only if enabled and message exists -->
    ${showComponent('message') && specialInstructions ? `
    <div style="padding: 4px 8px; font-size: 7px; border-top: 1px solid #000; background: #fff9e6;">
      <strong>Special Instructions:</strong> ${specialInstructions}
    </div>
    ` : ''}
  </div>

  <!-- Auto-print script -->
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `;
}

// @desc    Request pickup for an order
// @route   POST /api/orders/:id/request-pickup
// @access  Private
router.post('/:id/request-pickup', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;

    // Find order
    const order = await Order.findOne({
      _id: orderId,
      user_id: userId
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    // Validate order status
    if (order.status !== 'ready_to_ship') {
      return res.status(400).json({
        status: 'error',
        message: 'Order must be in ready_to_ship status to request pickup'
      });
    }

    // Validate AWB exists
    if (!order.delhivery_data?.waybill) {
      return res.status(400).json({
        status: 'error',
        message: 'AWB number is required for pickup request'
      });
    }

    // Extract warehouse details from pickup_address
    if (!order.pickup_address || !order.pickup_address.name) {
      return res.status(400).json({
        status: 'error',
        message: 'Pickup location is not configured for this order'
      });
    }

    // Get pickup date and time from request body, or use defaults
    let pickupDate = req.body.pickup_date;
    let pickupTime = req.body.pickup_time;
    const expectedPackageCount = req.body.expected_package_count || 1;

    // Validate pickup_date format (YYYY-MM-DD)
    if (pickupDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(pickupDate)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid pickup_date format. Expected YYYY-MM-DD'
        });
      }
      
      // Ensure date is not in the past
      const selectedDate = new Date(pickupDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        return res.status(400).json({
          status: 'error',
          message: 'Pickup date cannot be in the past'
        });
      }
    } else {
      // Default to tomorrow if not provided
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      pickupDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    // Validate pickup_time format (HH:mm:ss)
    if (pickupTime) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (!timeRegex.test(pickupTime)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid pickup_time format. Expected HH:mm:ss (e.g., 11:00:00)'
        });
      }
    } else {
      // Default to 11:00:00 if not provided
      pickupTime = '11:00:00';
    }

    logger.info('🚚 Requesting pickup from Delhivery', {
      orderId: order.order_id,
      waybill: order.delhivery_data.waybill,
      pickupLocation: order.pickup_address.name,
      pickupDate,
      pickupTime,
      expectedPackageCount
    });

    // Call Delhivery Pickup API
    const pickupResult = await delhiveryService.schedulePickup({
      pickup_time: pickupTime,
      pickup_date: pickupDate,
      pickup_location: order.pickup_address.name,
      expected_package_count: expectedPackageCount
    });

    if (!pickupResult.success) {
      logger.error('❌ Pickup request failed', {
        orderId: order.order_id,
        waybill: order.delhivery_data.waybill,
        error: pickupResult.error
      });

      // Use 400 for client errors (like wallet balance), 500 for server errors
      const isClientError = pickupResult.error && (
        pickupResult.error.includes('wallet balance') ||
        pickupResult.error.includes('insufficient balance') ||
        pickupResult.error.includes('less than')
      );
      
      return res.status(isClientError ? 400 : 500).json({
        status: 'error',
        message: pickupResult.error || 'Failed to request pickup from Delhivery'
      });
    }

    // Update order status and pickup information
    order.status = 'pickups_manifests';
    order.delhivery_data.pickup_request_status = 'scheduled';
    order.delhivery_data.pickup_request_date = new Date(pickupDate);
    order.delhivery_data.pickup_request_time = pickupTime;

    if (pickupResult.pickup_id) {
      order.delhivery_data.pickup_request_id = pickupResult.pickup_id;
    }

    await order.save();

    // Create or update TrackingOrder for automated tracking
    try {
      if (order.delhivery_data.waybill) {
        await TrackingOrder.createFromOrder(order);
        logger.info('✅ TrackingOrder created for automated tracking', {
          orderId: order.order_id,
          awb: order.delhivery_data.waybill
        });
      }
    } catch (trackingOrderError) {
      // Log error but don't fail the pickup request
      logger.warn('⚠️ Failed to create TrackingOrder (non-critical)', {
        orderId: order.order_id,
        error: trackingOrderError.message
      });
    }

    logger.info('✅ Pickup requested successfully', {
      orderId: order.order_id,
      waybill: order.delhivery_data.waybill,
      pickupRequestId: order.delhivery_data.pickup_request_id,
      pickupDate,
      pickupTime
    });

    res.json({
      status: 'success',
      message: 'Pickup requested successfully',
      data: {
        order_id: order.order_id,
        status: order.status,
        pickup_request_id: order.delhivery_data.pickup_request_id,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
        pickup_status: order.delhivery_data.pickup_request_status
      }
    });

  } catch (error) {
    logger.error('❌ Request pickup error', {
      orderId: req.params.id,
      userId: req.user._id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error requesting pickup'
    });
  }
});

// @desc    Cancel shipment for an order
// @route   POST /api/orders/:id/cancel-shipment
// @access  Private
router.post('/:id/cancel-shipment', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const orderId = req.params.id;
    const order = await Order.findOne({
      _id: orderId,
      user_id: userId
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
    }

    const waybill = order.delhivery_data?.waybill || order.shipping_info?.awb_number || order.waybill;
    const hasWaybill = Boolean(waybill);

    logger.info('🚫 Cancelling shipment for order', {
      orderId: order.order_id,
      waybill: waybill || 'N/A',
      userId: userId.toString(),
      currentStatus: order.status
    });

    if (!hasWaybill) {
      applyCancellationMetadata(order, 'Shipment cancelled before AWB generation', 'CN');
      await order.save();
      await refundShippingChargesToWallet(order, userId);

      return res.json({
        status: 'success',
        message: 'Shipment cancelled successfully',
        data: {
          order_id: order.order_id,
          waybill: null,
          cancellation_status: order.delhivery_data.cancellation_status,
          cancellation_date: order.delhivery_data.cancellation_date,
          status_type: order.delhivery_data.status_type,
          message: order.delhivery_data.cancellation_message
        }
      });
    }

    const cancelResult = await delhiveryService.cancelShipment(waybill);

    if (!cancelResult.success) {
      logger.error('❌ Shipment cancellation failed', {
        orderId: order.order_id,
        waybill: waybill,
        error: cancelResult.error
      });

      return res.status(400).json({
        status: 'error',
        message: cancelResult.error || 'Failed to cancel shipment with Delhivery',
        error: cancelResult.error
      });
    }

    const delhiveryResponse = cancelResult.data || {};

    logger.info('📋 Delhivery cancellation response received', {
      orderId: order.order_id,
      waybill: waybill,
      cancelResultSuccess: cancelResult.success,
      delhiveryResponse: delhiveryResponse,
      hasStatus: Object.prototype.hasOwnProperty.call(delhiveryResponse, 'status'),
      statusValue: delhiveryResponse.status,
      hasRemark: Object.prototype.hasOwnProperty.call(delhiveryResponse, 'remark'),
      remarkValue: delhiveryResponse.remark,
      cancelResultMessage: cancelResult.message
    });

    const isCancelled = cancelResult.success && (
      delhiveryResponse.status === true ||
      delhiveryResponse.status === 'true' ||
      delhiveryResponse.status === 1 ||
      (delhiveryResponse.remark && typeof delhiveryResponse.remark === 'string' && delhiveryResponse.remark.toLowerCase().includes('cancelled')) ||
      (delhiveryResponse.message && typeof delhiveryResponse.message === 'string' && delhiveryResponse.message.toLowerCase().includes('cancelled')) ||
      (cancelResult.message && typeof cancelResult.message === 'string' && cancelResult.message.toLowerCase().includes('cancelled'))
    );

    if (!isCancelled) {
      logger.warn('⚠️ Delhivery API response does not confirm cancellation', {
        orderId: order.order_id,
        waybill: waybill,
        delhiveryResponse: delhiveryResponse,
        cancelResultMessage: cancelResult.message
      });

      return res.status(200).json({
        status: 'success',
        message: cancelResult.message || 'Cancellation request sent, but confirmation pending',
        data: {
          order_id: order.order_id,
          waybill: waybill,
          cancellation_status: 'pending',
          delhivery_response: delhiveryResponse
        }
      });
    }

    let statusType = 'CN';
    if (order.status === 'pickups_manifests') {
      statusType = 'CN';
    } else if (['in_transit', 'pending', 'pickup_pending'].includes(order.status)) {
      statusType = 'RT';
    } else if (['ready_to_ship', 'new'].includes(order.status)) {
      statusType = 'UD';
    }

    const cancellationMessage = cancelResult.message || delhiveryResponse.remark || delhiveryResponse.message || 'Shipment cancelled successfully';

    applyCancellationMetadata(order, cancellationMessage, statusType, delhiveryResponse);
    await order.save();

    await refundShippingChargesToWallet(order, userId);

    logger.info('✅ Shipment cancelled successfully', {
      orderId: order.order_id,
      waybill: waybill,
      statusType: order.delhivery_data.status_type,
      cancellationMessage: order.delhivery_data.cancellation_message
    });

    res.json({
      status: 'success',
      message: 'Shipment cancelled successfully',
      data: {
        order_id: order.order_id,
        waybill: waybill,
        cancellation_status: order.delhivery_data.cancellation_status,
        cancellation_date: order.delhivery_data.cancellation_date,
        status_type: order.delhivery_data.status_type,
        message: order.delhivery_data.cancellation_message,
        delhivery_response: delhiveryResponse
      }
    });

  } catch (error) {
    logger.error('❌ Cancel shipment error', {
      orderId: req.params.id,
      userId: req.user._id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error cancelling shipment'
    });
  }
});

// ==========================================
// BULK OPERATIONS ENDPOINTS
// ==========================================

// @desc    Bulk Generate AWB
// @route   POST /api/orders/bulk/generate-awb
// @access  Private
router.post('/bulk/generate-awb', auth, async (req, res) => {
  try {
    const { order_ids } = req.body;
    const userId = req.user._id;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'order_ids array is required'
      });
    }

    const results = [];
    let stopped = false;
    let stopped_reason = null;

    logger.info('🚀 Starting bulk AWB generation', {
      userId: userId.toString(),
      orderCount: order_ids.length
    });

    for (const orderId of order_ids) {
      // If stopped due to wallet insufficient, mark remaining as skipped
      if (stopped) {
        results.push({ order_id: orderId, status: 'skipped', error: stopped_reason });
        continue;
      }

      try {
        // Fetch order
        const order = await Order.findOne({
          _id: orderId,
          user_id: userId
        });

        if (!order) {
          results.push({ order_id: orderId, status: 'failed', error: 'Order not found' });
          continue;
        }

        // Validate status = 'new'
        if (order.status !== 'new') {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: `Not in New status (current: ${order.status})`
          });
          continue;
        }

        // Check if AWB already exists
        if (order.delhivery_data?.waybill) {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: 'AWB already exists',
            awb: order.delhivery_data.waybill
          });
          continue;
        }

        // Get warehouse/pickup address
        let pickupAddress = {};
        if (order.pickup_address) {
          pickupAddress = {
            name: order.pickup_address.name || 'SHIPSARTHI C2C',
            full_address: order.pickup_address.full_address,
            city: order.pickup_address.city,
            state: order.pickup_address.state,
            pincode: order.pickup_address.pincode,
            phone: order.pickup_address.phone,
            country: order.pickup_address.country || 'India'
          };
        }

        // Check serviceability
        try {
          await ensureServiceablePincodes(
            pickupAddress.pincode || order.pickup_address?.pincode,
            order.delivery_address.pincode,
            order.payment_info.payment_mode
          );
        } catch (svcError) {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: svcError.message
          });
          continue;
        }

        // Prepare order data for Delhivery API
        const orderDataForDelhivery = {
          order_id: order.order_id,
          customer_info: {
            buyer_name: order.customer_info.buyer_name,
            phone: order.customer_info.phone,
            email: order.customer_info.email || ''
          },
          delivery_address: {
            full_address: order.delivery_address.full_address,
            pincode: order.delivery_address.pincode,
            city: order.delivery_address.city,
            state: order.delivery_address.state,
            country: order.delivery_address.country || 'India',
            address_type: order.delivery_address.address_type || 'home'
          },
          pickup_address: pickupAddress,
          products: order.products.map(p => ({
            product_name: p.product_name,
            quantity: p.quantity,
            hsn_code: p.hsn_code || '',
            unit_price: p.unit_price || 0
          })),
          package_info: {
            weight: order.package_info.weight,
            dimensions: {
              width: order.package_info.dimensions.width,
              height: order.package_info.dimensions.height,
              length: order.package_info.dimensions.length || order.package_info.dimensions.width
            }
          },
          payment_info: {
            payment_mode: order.payment_info.payment_mode,
            cod_amount: order.payment_info.cod_amount || 0,
            order_value: order.payment_info.order_value || order.payment_info.total_amount || 0
          },
          seller_info: {
            name: order.seller_info?.name || 'SHIPSARTHI',
            gst_number: order.seller_info?.gst_number || ''
          },
          invoice_number: order.invoice_number || `INV${order.order_id}`,
          shipping_mode: order.shipping_mode || 'Surface',
          address_type: order.delivery_address.address_type || 'home'
        };

        // Try to fetch waybill first
        const waybillResult = await delhiveryService.getWaybill(1);
        let preFetchedWaybill = null;

        if (waybillResult.success && waybillResult.waybills && waybillResult.waybills.length > 0) {
          preFetchedWaybill = waybillResult.waybills[0];
        }

        if (preFetchedWaybill) {
          orderDataForDelhivery.waybill = preFetchedWaybill;
        }

        // Call Delhivery API to create shipment
        const delhiveryResult = await delhiveryService.createShipment(orderDataForDelhivery);

        // Extract AWB number from response
        let awbNumber = null;
        let packageData = null;

        if (delhiveryResult.packages && Array.isArray(delhiveryResult.packages) && delhiveryResult.packages.length > 0) {
          packageData = delhiveryResult.packages[0];
          awbNumber = packageData.waybill || packageData.AWB || packageData.wb || null;
        }

        if (!awbNumber && delhiveryResult.waybill) {
          awbNumber = delhiveryResult.waybill;
          packageData = packageData || { waybill: awbNumber, status: 'Success' };
        }

        if (awbNumber) {
          // Update order with AWB and status
          order.delhivery_data = {
            waybill: awbNumber,
            package_id: packageData?.refnum || order.order_id,
            upload_wbn: delhiveryResult.upload_wbn || null,
            status: packageData?.status || 'Success',
            serviceable: packageData?.serviceable,
            sort_code: packageData?.sort_code,
            remarks: packageData?.remarks || [],
            cod_amount: packageData?.cod_amount || 0,
            payment: packageData?.payment,
            label_url: delhiveryResult.label_url || packageData?.label_url || null,
            expected_delivery_date: delhiveryResult.expected_delivery || packageData?.expected_delivery_date || null
          };

          order.status = 'ready_to_ship';
          await order.save();

          results.push({
            order_id: order.order_id,
            awb: awbNumber,
            status: 'success'
          });

          logger.info('✅ Bulk AWB generated', {
            orderId: order.order_id,
            awb: awbNumber
          });
        } else {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: delhiveryResult.error || 'Failed to generate AWB'
          });
        }

      } catch (error) {
        // Check if error is due to insufficient wallet balance
        const errorMsg = error.message || '';
        if (errorMsg.toLowerCase().includes('insufficient') || errorMsg.toLowerCase().includes('wallet')) {
          stopped = true;
          stopped_reason = 'Insufficient wallet balance';
        }

        results.push({
          order_id: orderId,
          status: 'failed',
          error: error.message || 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    logger.info('📋 Bulk AWB generation completed', {
      userId: userId.toString(),
      total: order_ids.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      stopped: stopped
    });

    res.json({
      status: stopped ? 'stopped' : 'completed',
      total: order_ids.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
      stopped_reason
    });

  } catch (error) {
    logger.error('❌ Bulk AWB generation error', {
      userId: req.user._id,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error during bulk AWB generation'
    });
  }
});

// @desc    Bulk Request Pickup
// @route   POST /api/orders/bulk/request-pickup
// @access  Private
router.post('/bulk/request-pickup', auth, async (req, res) => {
  try {
    const { order_ids, pickup_date, pickup_time } = req.body;
    const userId = req.user._id;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'order_ids array is required'
      });
    }

    const results = [];

    logger.info('🚀 Starting bulk pickup request', {
      userId: userId.toString(),
      orderCount: order_ids.length,
      pickupDate: pickup_date,
      pickupTime: pickup_time
    });

    for (const orderId of order_ids) {
      try {
        const order = await Order.findOne({
          _id: orderId,
          user_id: userId
        });

        if (!order) {
          results.push({ order_id: orderId, status: 'failed', error: 'Order not found' });
          continue;
        }

        // Validate order has AWB and is ready_to_ship
        if (order.status !== 'ready_to_ship') {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: `Order not in ready_to_ship status (current: ${order.status})`
          });
          continue;
        }

        const waybill = order.delhivery_data?.waybill;
        if (!waybill) {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: 'AWB not found'
          });
          continue;
        }

        // Request pickup from Delhivery
        const pickupResult = await delhiveryService.requestPickup({
          waybill: waybill,
          pickup_date: pickup_date || moment().add(1, 'days').format('YYYY-MM-DD'),
          pickup_time: pickup_time || '14:00:00',
          pickup_location: order.pickup_address?.name || 'SHIPSARTHI C2C',
          expected_package_count: 1
        });

        if (pickupResult.success) {
          order.status = 'pickups_manifests';
          order.pickup_request_id = pickupResult.pickup_id || `PU${Date.now()}`;
          order.pickup_request_date = pickup_date || moment().add(1, 'days').format('YYYY-MM-DD');
          order.pickup_request_time = pickup_time || '14:00:00';
          order.pickup_request_status = 'scheduled';
          await order.save();

          results.push({
            order_id: order.order_id,
            status: 'success',
            pickup_id: order.pickup_request_id
          });
        } else {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: pickupResult.error || 'Pickup request failed'
          });
        }

      } catch (error) {
        results.push({
          order_id: orderId,
          status: 'failed',
          error: error.message || 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    logger.info('📋 Bulk pickup request completed', {
      userId: userId.toString(),
      total: order_ids.length,
      success: successCount,
      failed: failedCount
    });

    res.json({
      status: 'completed',
      total: order_ids.length,
      success: successCount,
      failed: failedCount,
      results
    });

  } catch (error) {
    logger.error('❌ Bulk pickup request error', {
      userId: req.user._id,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error during bulk pickup request'
    });
  }
});

// @desc    Bulk Cancel Orders
// @route   POST /api/orders/bulk/cancel
// @access  Private
router.post('/bulk/cancel', auth, async (req, res) => {
  try {
    const { order_ids } = req.body;
    const userId = req.user._id;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'order_ids array is required'
      });
    }

    const results = [];

    logger.info('🚀 Starting bulk cancellation', {
      userId: userId.toString(),
      orderCount: order_ids.length
    });

    for (const orderId of order_ids) {
      try {
        const order = await Order.findOne({
          _id: orderId,
          user_id: userId
        });

        if (!order) {
          results.push({ order_id: orderId, status: 'failed', error: 'Order not found' });
          continue;
        }

        // Check if order can be cancelled
        if (['delivered', 'rto', 'rto_in_transit', 'rto_delivered', 'cancelled', 'lost'].includes(order.status)) {
          results.push({
            order_id: order.order_id,
            status: 'failed',
            error: `Cannot cancel order in ${order.status} status`
          });
          continue;
        }

        const waybill = order.delhivery_data?.waybill || order.shipping_info?.awb_number || order.waybill;
        const hasWaybill = Boolean(waybill);

        if (hasWaybill) {
          // Cancel with Delhivery
          const cancelResult = await delhiveryService.cancelShipment(waybill);

          if (!cancelResult.success) {
            results.push({
              order_id: order.order_id,
              status: 'failed',
              error: cancelResult.error || 'Delhivery cancellation failed'
            });
            continue;
          }
        }

        // Apply cancellation metadata
        applyCancellationMetadata(order, 'Bulk cancellation', 'CN');
        await order.save();

        // Refund shipping charges
        await refundShippingChargesToWallet(order, userId);

        results.push({
          order_id: order.order_id,
          status: 'success',
          awb: waybill || null
        });

        logger.info('✅ Order cancelled in bulk', {
          orderId: order.order_id,
          waybill: waybill || 'N/A'
        });

      } catch (error) {
        results.push({
          order_id: orderId,
          status: 'failed',
          error: error.message || 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    logger.info('📋 Bulk cancellation completed', {
      userId: userId.toString(),
      total: order_ids.length,
      success: successCount,
      failed: failedCount
    });

    res.json({
      status: 'completed',
      total: order_ids.length,
      success: successCount,
      failed: failedCount,
      results
    });

  } catch (error) {
    logger.error('❌ Bulk cancellation error', {
      userId: req.user._id,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error during bulk cancellation'
    });
  }
});

// @desc    Bulk Print Labels
// @route   GET /api/orders/bulk/labels
// @access  Private
router.get('/bulk/labels', auth, async (req, res) => {
  try {
    const { order_ids, format = 'thermal' } = req.query;
    const userId = req.user._id;

    if (!order_ids) {
      return res.status(400).json({
        status: 'error',
        message: 'order_ids query parameter is required'
      });
    }

    const orderIdArray = order_ids.split(',').map(id => id.trim()).filter(id => id);

    if (orderIdArray.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid order IDs provided'
      });
    }

    // Fetch user's label settings
    const user = await User.findById(userId).select('label_settings company_logo_url').lean();
    const labelSettings = user?.label_settings ? { ...user.label_settings } : {};

    logger.info('🖨️ Generating bulk labels', {
      userId: userId.toString(),
      orderCount: orderIdArray.length,
      format: format,
      hasLabelSettings: !!user?.label_settings
    });

    const labelsHtml = [];

    for (const orderId of orderIdArray) {
      try {
        const order = await Order.findOne({
          _id: orderId,
          user_id: userId
        }).populate('user_id', 'company_name your_name email phone_number company_logo_url gst_number');

        if (!order) {
          continue;
        }

        const waybill = order.delhivery_data?.waybill;
        if (!waybill) {
          continue;
        }

        // Get label data from Delhivery
        const labelResult = await delhiveryService.generateShippingLabel(waybill);

        if (labelResult.success && labelResult.json_data) {
          // Generate label HTML using labelRenderer with user's label settings
          const labelHtml = labelRenderer.renderLabel(order, labelResult.json_data, format, labelSettings);
          labelsHtml.push(labelHtml);
        }

      } catch (error) {
        logger.warn('⚠️ Error generating label for order', {
          orderId,
          error: error.message
        });
      }
    }

    if (labelsHtml.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No labels could be generated for the provided orders'
      });
    }

    // Combine all labels with page breaks
    const combinedHtml = labelRenderer.combineLabels(labelsHtml, format);

    res.setHeader('Content-Type', 'text/html');
    res.send(combinedHtml);

  } catch (error) {
    logger.error('❌ Bulk labels error', {
      userId: req.user._id,
      error: error.message
    });

    res.status(500).json({
      status: 'error',
      message: 'Server error generating bulk labels'
    });
  }
});

module.exports = router;