const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Basic Transaction Information
  transaction_id: {
    type: String,
    unique: true,
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Transaction Details
  transaction_type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  transaction_category: {
    type: String,
    enum: [
      'wallet_recharge',
      'shipping_charge',
      'cod_remittance',
      'refund',
      'shipment_cancellation_refund',
      'penalty',
      'bonus',
      'cashback',
      'fuel_surcharge',
      'service_tax',
      'adjustment',
      'manual_adjustment',
      'weight_discrepancy_charge'
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },

  // Related Information
  related_order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  related_awb: String,
  reference_number: String,

  // Order Information (for linking with order details)
  order_info: {
    order_id: String,
    awb_number: String,
    weight: Number, // Weight in grams
    zone: String,
    order_date: Date
  },

  // Payment Information (for credits)
  payment_info: {
    payment_method: {
      type: String,
      // Includes HDFC/Juspay payment method types: UPI_COLLECT, UPI_PAY, NB_*, CARD, WALLET, etc.
      enum: [
        'upi', 'net_banking', 'credit_card', 'debit_card', 'wallet', 'bank_transfer', 'cash', 'hdfc_smartgateway',
        // HDFC/Juspay specific payment methods
        'UPI_COLLECT', 'UPI_PAY', 'UPI_INTENT', 'UPI_QR',
        'NB_HDFC', 'NB_ICICI', 'NB_SBI', 'NB_AXIS', 'NB_KOTAK', 'NB_YES', 'NB_PNB', 'NB_BOB', 'NB_CANARA', 'NB_UNION', 'NB_IDBI', 'NB_FEDERAL', 'NB_INDUSIND', 'NB_RBL', 'NB_SCB', 'NB_CITI', 'NB_DBS', 'NB_HSBC',
        'CARD', 'SAVED_CARD', 'EMANDATE', 'PAYLATER', 'CARDLESS_EMI', 'WALLET_PAYTM', 'WALLET_PHONEPE', 'WALLET_AMAZON', 'WALLET_FREECHARGE', 'WALLET_MOBIKWIK', 'WALLET_AIRTEL', 'WALLET_JIOMONEY', 'WALLET_OLAMONEY'
      ],
    },
    // More specific payment method type from HDFC (e.g., NB for NetBanking, UPI for UPI, etc.)
    payment_method_type: String,
    payment_gateway: {
      type: String,
      enum: ['razorpay', 'payu', 'cashfree', 'stripe', 'manual', 'hdfc']
    },
    gateway_transaction_id: String,
    gateway_order_id: String,
    gateway_session_id: String,
    gateway_reference_id: String,
    bank_ref_no: String,
    payment_status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
      default: 'pending'
    },
    payment_date: Date,
    bank_reference_number: String
  },

  // COD Remittance Information (for COD credits)
  cod_remittance: {
    remittance_date: Date,
    bank_account: {
      account_number: String,
      ifsc_code: String,
      bank_name: String,
      account_holder_name: String
    },
    remittance_amount: Number,
    tds_amount: {
      type: Number,
      default: 0
    },
    service_charges: {
      type: Number,
      default: 0
    },
    net_amount: Number,
    utr_number: String,
    remittance_status: {
      type: String,
      enum: ['pending', 'processed', 'completed', 'failed'],
      default: 'pending'
    }
  },

  // Balance Information
  balance_info: {
    opening_balance: {
      type: Number,
      required: true
    },
    closing_balance: {
      type: Number,
      required: true
    }
  },

  // Transaction Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending'
  },

  // Billing Information
  billing_info: {
    invoice_number: String,
    invoice_date: Date,
    billing_cycle: String,
    tax_amount: {
      type: Number,
      default: 0
    },
    total_amount: Number
  },

  // Timestamps
  transaction_date: {
    type: Date,
    default: Date.now
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },

  // Audit Information
  created_by: {
    type: String,
    default: 'system'
  },
  approved_by: String,
  reversal_reason: String,
  notes: String,

  // Admin/Staff who performed the transaction (for manual adjustments)
  performed_by: {
    name: String,
    email: String,
    role: {
      type: String,
      enum: ['admin', 'staff', 'system']
    }
  },

  // Idempotency key to prevent duplicate transactions
  idempotency_key: {
    type: String,
    sparse: true
  }
});

// Indexes
transactionSchema.index({ transaction_id: 1 });
transactionSchema.index({ user_id: 1 });
transactionSchema.index({ transaction_type: 1 });
transactionSchema.index({ transaction_category: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ transaction_date: -1 });
transactionSchema.index({ 'payment_info.gateway_transaction_id': 1 });
transactionSchema.index({ 'payment_info.gateway_order_id': 1 });
transactionSchema.index({ related_order_id: 1 });
transactionSchema.index({ idempotency_key: 1 }, { unique: true, sparse: true });

// Compound indexes
transactionSchema.index({ user_id: 1, transaction_date: -1 });
transactionSchema.index({ user_id: 1, status: 1 });
transactionSchema.index({ user_id: 1, transaction_type: 1 });

// Pre-save middleware
transactionSchema.pre('save', async function(next) {
  // Generate transaction ID if new
  if (this.isNew && !this.transaction_id) {
    let transactionId;
    let isUnique = false;

    while (!isUnique) {
      const randomNum = Math.floor(Math.random() * 1000000);
      const prefix = this.transaction_type === 'credit' ? 'CR' : 'DR';
      transactionId = `${prefix}${Date.now()}${randomNum.toString().padStart(6, '0')}`;
      const existingTransaction = await this.constructor.findOne({ transaction_id: transactionId });
      if (!existingTransaction) {
        isUnique = true;
      }
    }

    this.transaction_id = transactionId;
  }

  // Calculate net amount for COD remittance
  if (this.cod_remittance && this.cod_remittance.remittance_amount) {
    const { remittance_amount, tds_amount = 0, service_charges = 0 } = this.cod_remittance;
    this.cod_remittance.net_amount = remittance_amount - tds_amount - service_charges;
  }

  // Calculate total amount for billing
  if (this.billing_info && this.billing_info.tax_amount) {
    this.billing_info.total_amount = this.amount + this.billing_info.tax_amount;
  }

  this.updated_at = Date.now();
  next();
});

// Static methods
transactionSchema.statics.getWalletBalance = async function(userId) {
  const lastTransaction = await this.findOne({ user_id: userId })
    .sort({ transaction_date: -1 })
    .select('balance_info.closing_balance');

  return lastTransaction ? lastTransaction.balance_info.closing_balance : 0;
};

transactionSchema.statics.getTransactionSummary = function(userId, dateFrom, dateTo) {
  const matchQuery = { user_id: userId, status: 'completed' };

  if (dateFrom && dateTo) {
    matchQuery.transaction_date = {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo)
    };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          type: '$transaction_type',
          category: '$transaction_category'
        },
        total_amount: { $sum: '$amount' },
        count: { $sum: 1 },
        avg_amount: { $avg: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        categories: {
          $push: {
            category: '$_id.category',
            total_amount: '$total_amount',
            count: '$count',
            avg_amount: '$avg_amount'
          }
        },
        total_amount: { $sum: '$total_amount' },
        total_count: { $sum: '$count' }
      }
    }
  ]);
};

transactionSchema.statics.getCODRemittancePending = function(userId) {
  return this.find({
    user_id: userId,
    transaction_type: 'credit',
    transaction_category: 'cod_remittance',
    'cod_remittance.remittance_status': 'pending'
  }).sort({ transaction_date: -1 });
};

transactionSchema.statics.getMonthlySpending = function(userId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  return this.aggregate([
    {
      $match: {
        user_id: userId,
        transaction_type: 'debit',
        status: 'completed',
        transaction_date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          $dayOfMonth: '$transaction_date'
        },
        daily_spending: { $sum: '$amount' },
        transaction_count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

transactionSchema.statics.getPaymentMethodStats = function(userId, dateFrom, dateTo) {
  const matchQuery = {
    user_id: userId,
    transaction_type: 'credit',
    'payment_info.payment_status': 'completed'
  };

  if (dateFrom && dateTo) {
    matchQuery.transaction_date = {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo)
    };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$payment_info.payment_method',
        total_amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { total_amount: -1 } }
  ]);
};

// Instance methods
transactionSchema.methods.complete = function() {
  this.status = 'completed';
  if (this.payment_info) {
    this.payment_info.payment_status = 'completed';
    this.payment_info.payment_date = new Date();
  }
  return this.save();
};

transactionSchema.methods.fail = function(reason = '') {
  this.status = 'failed';
  if (this.payment_info) {
    this.payment_info.payment_status = 'failed';
  }
  this.notes = reason;
  return this.save();
};

transactionSchema.methods.reverse = function(reason, reversedBy) {
  this.status = 'reversed';
  this.reversal_reason = reason;
  this.approved_by = reversedBy;
  return this.save();
};

transactionSchema.methods.updateCODRemittance = function(utrNumber, status = 'completed') {
  if (this.cod_remittance) {
    this.cod_remittance.utr_number = utrNumber;
    this.cod_remittance.remittance_status = status;
    if (status === 'completed') {
      this.status = 'completed';
    }
  }
  return this.save();
};

module.exports = mongoose.model('Transaction', transactionSchema);
