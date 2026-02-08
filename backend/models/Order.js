// Location: backend/models/Order.js
const mongoose = require('mongoose');

// Customer Information Schema
const customerSchema = new mongoose.Schema({
  buyer_name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please enter a valid phone number']
  },
  alternate_phone: {
    type: String,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid alternate phone number']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  gstin: {
    type: String,
    trim: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number']
  }
}, { _id: false });

// Address Schema
const addressSchema = new mongoose.Schema({
  address_line_1: {
    type: String,
    required: [true, 'Address line 1 is required'],
    trim: true
  },
  address_line_2: {
    type: String,
    trim: true
  },
  full_address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  landmark: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true
  },
  state: {
    type: String,
    required: [true, 'State is required'],
    trim: true
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    match: [/^\d{6}$/, 'Please enter a valid 6-digit pincode']
  },
  country: {
    type: String,
    default: 'India',
    trim: true
  },
  address_type: {
    type: String,
    enum: ['home', 'office'],
    default: 'home'
  }
}, { _id: false });

// Product Schema
const productSchema = new mongoose.Schema({
  product_name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  product_description: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  unit_price: {
    type: Number,
    min: [0, 'Price cannot be negative']
  },
  hsn_code: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  sku: {
    type: String,
    trim: true
  },
  discount: {
    type: Number,
    min: [0, 'Discount cannot be negative'],
    default: 0
  },
  tax: {
    type: Number,
    min: [0, 'Tax cannot be negative'],
    default: 0
  },
  tax_rate: {
    type: Number,
    min: 0,
    max: 100
  }
}, { _id: false });

// Package Information Schema
const packageSchema = new mongoose.Schema({
  weight: {
    type: Number,
    required: [true, 'Weight is required'],
    min: [0.1, 'Weight must be at least 0.1 kg']
  },
  dimensions: {
    length: {
      type: Number,
      required: [true, 'Length is required'],
      min: [1, 'Length must be at least 1 cm']
    },
    width: {
      type: Number,
      required: [true, 'Width is required'],
      min: [1, 'Width must be at least 1 cm']
    },
    height: {
      type: Number,
      required: [true, 'Height is required'],
      min: [1, 'Height must be at least 1 cm']
    }
  },
  volumetric_weight: {
    type: Number
  },
  package_type: {
    type: String,
    enum: ['Single Package (B2C)', 'Multiple Package (B2C)', 'Multiple Package (B2B)'],
    default: 'Single Package (B2C)'
  },
  number_of_boxes: {
    type: Number,
    min: [1, 'Number of boxes must be at least 1'],
    default: 1
  },
  weight_per_box: {
    type: Number,
    min: [0.1, 'Weight per box must be at least 0.1 kg']
  },
  rov_type: {
    type: String,
    trim: true
  },
  rov_owner: {
    type: String,
    trim: true
  },
  weight_photo_url: {
    type: String,
    trim: true
  },
  dimensions_photo_url: {
    type: String,
    trim: true
  },
  save_dimensions: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Payment Information Schema
const paymentSchema = new mongoose.Schema({
  payment_mode: {
    type: String,
    required: [true, 'Payment mode is required'],
    enum: {
      values: ['Prepaid', 'COD', 'Pickup', 'REPL'],
      message: 'Payment mode must be Prepaid, COD, Pickup, or REPL'
    }
  },
  cod_amount: {
    type: Number,
    min: [0, 'COD amount cannot be negative'],
    validate: {
      validator: function(value) {
        // COD amount is required when payment mode is COD
        if (this.payment_mode === 'COD') {
          return value > 0;
        }
        return true;
      },
      message: 'COD amount is required when payment mode is COD'
    }
  },
  order_value: {
    type: Number,
    required: [true, 'Order value is required'],
    min: [0, 'Order value cannot be negative']
  },
  total_amount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  shipping_charges: {
    type: Number,
    min: [0, 'Shipping charges cannot be negative'],
    default: 0
  },
  grand_total: {
    type: Number,
    min: [0, 'Grand total cannot be negative']
  }
}, { _id: false });

// Seller Information Schema
const sellerSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  gst_number: {
    type: String,
    trim: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GST number']
  },
  address: {
    type: String,
    trim: true
  },
  reseller_name: {
    type: String,
    trim: true
  }
}, { _id: false });

// Pickup/Warehouse Schema
const pickupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Pickup location name is required'],
    trim: true
  },
  full_address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    match: [/^\d{6}$/, 'Please enter a valid 6-digit pincode']
  },
  phone: {
    type: String,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid phone number']
  }
}, { _id: false });

// Delhivery Integration Schema
const delhiverySchema = new mongoose.Schema({
  waybill: {
    type: String,
    unique: true,
    sparse: true
  },
  package_id: {
    type: String
  },
  label_url: {
    type: String
  },
  tracking_url: {
    type: String
  },
  expected_delivery_date: {
    type: Date
  },
  manifest_id: {
    type: String
  },
  pickup_scheduled: {
    type: Boolean,
    default: false
  },
  pickup_id: {
    type: String
  },
  pickup_date: {
    type: Date
  },
  pickup_request_id: {
    type: String
  },
  pickup_request_status: {
    type: String,
    enum: ['pending', 'scheduled', 'in_transit', 'completed', 'failed'],
    default: 'pending'
  },
  pickup_request_date: {
    type: Date
  },
  pickup_request_time: {
    type: String
  },
  // Cancellation fields
  cancellation_status: {
    type: String,
    enum: ['cancelled', 'pending', null],
    default: null
  },
  cancellation_date: {
    type: Date
  },
  cancellation_message: {
    type: String
  },
  cancellation_response: {
    type: mongoose.Schema.Types.Mixed // Store full Delhivery response
  },
  status_type: {
    type: String,
    enum: ['CN', 'RT', 'UD', null], // CN = Cancellation, RT = Return to Origin, UD = Undelivered
    default: null
  }
}, { _id: false, strict: false }); // Allow additional fields beyond schema

// MPS (Multi Package Shipment) Schema
const mpsSchema = new mongoose.Schema({
  is_mps: {
    type: Boolean,
    default: false
  },
  master_waybill: {
    type: String
  },
  child_waybills: [{
    type: String
  }],
  package_count: {
    type: Number,
    min: [2, 'MPS requires at least 2 packages']
  },
  mps_amount: {
    type: Number,
    default: 0
  },
  packages: [{
    waybill: {
      type: String,
      required: true
    },
    weight: {
      type: Number,
      required: true
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    product_description: String
  }]
}, { _id: false });

// Status History Schema
const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  location: {
    type: String
  },
  remarks: {
    type: String
  },
  updated_by: {
    type: String
  }
}, { _id: false });

// NDR Schema
const ndrSchema = new mongoose.Schema({
  is_ndr: {
    type: Boolean,
    default: false
  },
  ndr_attempts: {
    type: Number,
    default: 0
  },
  last_ndr_date: {
    type: Date
  },
  ndr_reason: {
    type: String
  },
  nsl_code: {
    type: String
  },
  next_attempt_date: {
    type: Date
  },
  resolution_action: {
    type: String,
    enum: [null, 'reattempt', 'rto', 'hold', 'delivered'],
    default: null
  },
  action_history: [{
    action: { type: String },
    timestamp: { type: Date, default: Date.now },
    upl_id: { type: String },
    status: { type: String },
    remarks: { type: String }
  }]
}, { _id: false });

// Main Order Schema
const orderSchema = new mongoose.Schema({
  // User Reference
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Order Identification
  order_id: {
    type: String,
    required: [true, 'Order ID is required'],
    unique: true,
    trim: true
  },

  reference_id: {
    type: String,
    trim: true,
    index: true
  },

  invoice_number: {
    type: String,
    trim: true
  },

  order_date: {
    type: Date,
    required: [true, 'Order date is required'],
    default: Date.now,
    index: true
  },

  // Customer Information
  customer_info: {
    type: customerSchema,
    required: [true, 'Customer information is required']
  },

  // Addresses
  delivery_address: {
    type: addressSchema,
    required: [true, 'Delivery address is required']
  },

  pickup_address: {
    type: pickupSchema,
    required: [true, 'Pickup address is required']
  },

  // Return Address (for RVP/REPL)
  return_address: {
    type: addressSchema
  },

  // Products
  products: {
    type: [productSchema],
    required: [true, 'At least one product is required'],
    validate: {
      validator: function(products) {
        return products && products.length > 0;
      },
      message: 'Order must have at least one product'
    }
  },

  // Package Information
  package_info: {
    type: packageSchema,
    required: [true, 'Package information is required']
  },

  // Payment Information
  payment_info: {
    type: paymentSchema,
    required: [true, 'Payment information is required']
  },

  // Seller Information
  seller_info: {
    type: sellerSchema
  },

  // Shipping Details
  shipping_mode: {
    type: String,
    enum: ['Surface', 'Express'],
    default: 'Surface'
  },

  // Order Type
  order_type: {
    type: String,
    enum: ['forward', 'reverse'],
    default: 'forward',
    index: true
  },

  // Status
  status: {
    type: String,
    enum: [
      'new',
      'ready_to_ship',
      'pickups_manifests',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'ndr',
      'rto',
      'cancelled',
      'lost',
      'all'
    ],
    default: 'new',
    index: true
  },

  // Delhivery Integration
  delhivery_data: {
    type: delhiverySchema
  },

  // MPS Data
  mps_data: {
    type: mpsSchema
  },

  // NDR Information
  ndr_info: {
    type: ndrSchema
  },

  // Status History
  status_history: [statusHistorySchema],

  // Additional Flags
  is_fragile: {
    type: Boolean,
    default: false
  },

  is_dangerous_good: {
    type: Boolean,
    default: false
  },

  plastic_packaging: {
    type: Boolean,
    default: false
  },

  ewaybill_number: {
    type: String,
    trim: true
  },

  // Dates
  order_date: {
    type: Date,
    default: Date.now,
    index: true
  },

  pickup_scheduled_date: {
    type: Date
  },

  delivered_date: {
    type: Date
  },

  cancelled_date: {
    type: Date
  },

  // Cancellation
  cancellation_reason: {
    type: String
  },

  cancelled_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Notes
  special_instructions: {
    type: String,
    trim: true
  },

  internal_notes: {
    type: String,
    trim: true
  },

  // Billing Information (NEW - for invoice generation)
  billing_info: {
    // Zone determined from Delhivery API
    zone: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'E', 'F']
    },
    
    // Weight tracking (all in GRAMS to match RateCardService)
    declared_weight: Number, // Weight user declared (grams)
    volumetric_weight: Number, // L*B*H/5000 * 1000 (grams)
    charged_weight: Number, // Max(declared, volumetric) (grams)
    actual_weight: Number, // If Delhivery measures differently (grams)
    weight_discrepancy: Number, // actual - charged (grams)
    
    // Charge breakdown (from RateCardService)
    charges: {
      forward_charge: { type: Number, default: 0 },
      rto_charge: { type: Number, default: 0 },
      cod_charge: { type: Number, default: 0 },
      fuel_surcharge: { type: Number, default: 0 },
      weight_discrepancy_charge: { type: Number, default: 0 },
      other_charges: { type: Number, default: 0 },
      total_charge: { type: Number, default: 0 }
    },
    
    // Billing status tracking
    billing_status: {
      type: String,
      enum: ['unbilled', 'billed', 'disputed', 'adjusted'],
      default: 'unbilled',
      index: true
    },
    
    // References
    billing_cycle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BillingCycle'
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    
    // Wallet transaction reference
    wallet_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    
    // Rate card info (for audit)
    user_category_at_order: String, // "Basic User", etc.
    
    // Billing timestamps
    charged_at: Date, // When wallet was deducted
    billed_at: Date // When added to invoice
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
orderSchema.index({ user_id: 1, status: 1 });
orderSchema.index({ user_id: 1, order_date: -1 });
orderSchema.index({ 'delhivery_data.waybill': 1 });
orderSchema.index({ order_type: 1, status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'billing_info.billing_status': 1, 'billing_info.billing_cycle_id': 1 });
orderSchema.index({ 'billing_info.zone': 1 });
orderSchema.index({ user_id: 1, order_date: -1, status: 1 });

// Virtual for total products count
orderSchema.virtual('total_products').get(function() {
  if (!Array.isArray(this.products) || this.products.length === 0) {
    return 0;
  }
  return this.products.reduce((sum, product) => sum + (product.quantity || 0), 0);
});

// Pre-save middleware to calculate volumetric weight
orderSchema.pre('save', function(next) {
  if (this.package_info && this.package_info.dimensions) {
    const { length, width, height } = this.package_info.dimensions;
    // Volumetric weight formula: (L x W x H) / 5000
    this.package_info.volumetric_weight = (length * width * height) / 5000;
  }
  next();
});

// Pre-save middleware to add status to history
orderSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.status_history.push({
      status: this.status,
      timestamp: new Date(),
      remarks: `Status changed to ${this.status}`
    });
  }
  next();
});

// Method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  const nonCancellableStatuses = ['delivered', 'cancelled', 'rto'];
  return !nonCancellableStatuses.includes(this.status);
};

// Method to check if order is in transit
orderSchema.methods.isInTransit = function() {
  const transitStatuses = ['pickups_manifests', 'in_transit', 'out_for_delivery'];
  return transitStatuses.includes(this.status);
};

// Method to update status
orderSchema.methods.updateStatus = async function(newStatus, remarks = '') {
  this.status = newStatus;
  
  // Update specific dates based on status
  if (newStatus === 'delivered') {
    this.delivered_date = new Date();
  } else if (newStatus === 'cancelled') {
    this.cancelled_date = new Date();
  }

  await this.save();
};

// Static method to get orders by status
orderSchema.statics.getOrdersByStatus = function(userId, status) {
  const query = { user_id: userId };
  if (status !== 'all') {
    query.status = status;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get orders count by status
orderSchema.statics.getOrdersCountByStatus = async function(userId) {
  const statuses = [
    'new', 'ready_to_ship', 'pickups_manifests', 'in_transit',
    'out_for_delivery', 'delivered', 'ndr', 'rto', 'cancelled', 'lost'
  ];

  const counts = {};
  
  for (const status of statuses) {
    counts[status] = await this.countDocuments({ user_id: userId, status });
  }
  
  counts.all = await this.countDocuments({ user_id: userId });
  
  return counts;
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;