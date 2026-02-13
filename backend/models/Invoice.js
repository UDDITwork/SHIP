// Location: backend/models/Invoice.js
const mongoose = require('mongoose');

// Individual shipment charge - matches your Transaction.order_info structure
const shipmentChargeSchema = new mongoose.Schema({
  awb_number: {
    type: String,
    required: false, // Changed to false - orders without AWB can still be invoiced
    index: true,
    sparse: true // Allow null values in index
  },
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  internal_order_id: String, // Your order_id string (e.g., "ORD123456")
  
  // Dates
  order_date: Date,
  delivery_date: Date,
  
  // Status at billing time
  shipment_status: {
    type: String,
    enum: ['delivered', 'rto', 'in_transit', 'cancelled', 'lost']
  },
  
  // Weight Information (stored in GRAMS to match your RateCardService)
  weight: {
    declared_weight: Number, // User declared (grams)
    actual_weight: Number, // Delhivery measured (grams)
    volumetric_weight: Number, // L*B*H/5000 * 1000 (grams)
    charged_weight: Number // Max of actual/volumetric (grams)
  },
  
  // Zone (matches your RateCardService zones)
  zone: {
    type: String,
    enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    required: false // Changed to false - zone might be null if Delhivery API fails
  },
  
  // Pincodes
  pickup_pincode: String,
  delivery_pincode: String,
  
  // Charge Breakdown (matches your RateCardService output)
  charges: {
    forward_charge: { type: Number, default: 0 },
    rto_charge: { type: Number, default: 0 },
    cod_charge: { type: Number, default: 0 },
    fuel_surcharge: { type: Number, default: 0 },
    weight_discrepancy_charge: { type: Number, default: 0 },
    other_charges: { type: Number, default: 0 }
  },
  
  // Total for this shipment
  total_charge: {
    type: Number,
    required: true
  },
  
  // Payment mode
  payment_mode: {
    type: String,
    enum: ['Prepaid', 'COD']
  },
  
  // COD details (if applicable)
  cod_amount: Number // Actual COD collected
  
}, { _id: false });

// Main Invoice Schema
const invoiceSchema = new mongoose.Schema({
  // User Reference
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Invoice Identification
  invoice_number: {
    type: String,
    unique: true,
    required: true
  },
  
  // Delhivery Invoice Reference (if synced)
  delhivery_invoice_id: {
    type: String,
    sparse: true,
    index: true
  },
  // Billing Period (15-day cycles like Delhivery)
  billing_period: {
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    cycle_number: {
      type: Number,
      enum: [1, 2], // 1 = 1st-15th, 2 = 16th-end of month
      required: true
    },
    month: { type: Number, required: true }, // 1-12
    year: { type: Number, required: true }
  },
  // Invoice Dates
  invoice_date: { type: Date, required: true },
  due_date: { type: Date, required: true },
  // Service Type (matches Delhivery screenshot)
  service_type: {
    type: String,
    enum: ['Domestic B2C', 'Domestic B2B', 'Domestic B2C/Heavy', 'Express', 'Surface'],
    default: 'Domestic B2C'
  },
  // GST Information (for Indian compliance)
  gst_info: {
    seller_gstin: { type: String, default: '06AAPCS9575E1ZR' }, // Delhivery's GSTIN
    buyer_gstin: String, // User's GSTIN from User model
    place_of_supply: String, // State code (e.g., "08" for Rajasthan)
    place_of_supply_name: String, // State name
    is_igst: { type: Boolean, default: true }, // Inter-state = IGST
    sac_code: { type: String, default: '996719' }
  },
  // Billing Address Snapshot (captured at invoice time)
  billing_address: {
    company_name: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  // Amount Breakdown (matches Delhivery Bill Info section)
  amounts: {
    // Subtotal (Freight before tax)
    subtotal: { type: Number, required: true, default: 0 },
    
    // GST Breakdown
    cgst_rate: { type: Number, default: 9 },
    cgst_amount: { type: Number, default: 0 },
    sgst_rate: { type: Number, default: 9 },
    sgst_amount: { type: Number, default: 0 },
    igst_rate: { type: Number, default: 18 },
    igst_amount: { type: Number, default: 0 },
    
    // Total Tax
    total_tax: { type: Number, default: 0 },
    
    // Grand Total (what user pays)
    grand_total: { type: Number, required: true, default: 0 },
    
    // Detailed Breakdown
    total_forward_charges: { type: Number, default: 0 },
    total_rto_charges: { type: Number, default: 0 },
    total_cod_charges: { type: Number, default: 0 },
    total_fuel_surcharge: { type: Number, default: 0 },
    total_weight_discrepancy: { type: Number, default: 0 },
    total_other_charges: { type: Number, default: 0 }
  },
  // Payment Status (matches Delhivery: Paid, Overdue, etc.)
  payment_status: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'partially_paid', 'disputed'],
    default: 'pending',
    index: true
  },
  
  amount_paid: { type: Number, default: 0 },
  balance_due: { type: Number, default: 0 },
  
  // Payment Details (when paid)
  payment_info: {
    payment_date: Date,
    payment_method: {
      type: String,
      enum: ['wallet_deduction', 'bank_transfer', 'upi', 'auto_debit', 'razorpay']
    },
    payment_reference: String,
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    }
  },
  // Shipment Summary
  shipment_summary: {
    total_shipments: { type: Number, default: 0 },
    delivered_shipments: { type: Number, default: 0 },
    rto_shipments: { type: Number, default: 0 },
    cancelled_shipments: { type: Number, default: 0 },
    in_transit_shipments: { type: Number, default: 0 },
    
    prepaid_shipments: { type: Number, default: 0 },
    cod_shipments: { type: Number, default: 0 },
    
    total_weight: { type: Number, default: 0 }, // Total charged weight (grams)
    total_cod_collected: { type: Number, default: 0 }
  },
  // Individual Shipment Details (Transaction List in Delhivery)
  shipment_charges: [shipmentChargeSchema],
  // Document URLs
  documents: {
    invoice_pdf_url: String,
    transaction_list_csv_url: String,
    manual_invoice_url: String,
    manual_invoice_uploaded_by: String,
    manual_invoice_uploaded_at: Date,
    excel_shipment_list_url: String
  },
  // IRN for e-invoicing (GST compliance)
  irn: String,
  irn_date: Date,
  // Manual adjustments
  manual_adjustments: {
    is_manually_adjusted: { type: Boolean, default: false },
    adjusted_by_staff: String,
    adjusted_at: Date,
    adjustment_notes: String
  },
  // Credit/Debit Notes
  adjustments: [{
    type: { type: String, enum: ['credit_note', 'debit_note'] },
    note_number: String,
    amount: Number,
    reason: String,
    date: Date,
    related_awb: String
  }],
  // Invoice Status
  status: {
    type: String,
    enum: ['draft', 'generated', 'sent', 'paid', 'overdue', 'disputed', 'cancelled'],
    default: 'draft',
    index: true
  },
  // Linked Billing Cycle
  billing_cycle_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BillingCycle'
  },
  // User Category at invoice time (for audit)
  user_category_snapshot: {
    type: String,
    enum: ['Basic User', 'Lite User', 'New User', 'Advanced', 'Advanced User']
  },
  // Notes
  internal_notes: String,
  dispute_reason: String,
  dispute_date: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
invoiceSchema.index({ user_id: 1, invoice_date: -1 });
invoiceSchema.index({ user_id: 1, payment_status: 1 });
invoiceSchema.index({ user_id: 1, 'billing_period.year': 1, 'billing_period.month': 1 });
invoiceSchema.index({ delhivery_invoice_id: 1 });
invoiceSchema.index({ status: 1 });

// Virtual: Check if overdue
invoiceSchema.virtual('is_overdue').get(function() {
  return this.payment_status !== 'paid' && new Date() > this.due_date;
});

// Virtual: Days until due / days overdue
invoiceSchema.virtual('days_status').get(function() {
  const now = new Date();
  const due = new Date(this.due_date);
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Pre-save: Generate invoice number
invoiceSchema.pre('save', async function(next) {
  if (this.isNew && !this.invoice_number) {
    const year = this.billing_period.year.toString().slice(-2);
    const month = this.billing_period.month.toString().padStart(2, '0');
    const cycle = this.billing_period.cycle_number;
    
    // Count existing invoices for this user
    const count = await this.constructor.countDocuments({ user_id: this.user_id });
    
    // Format: INV2511C1-00001 (Year, Month, Cycle, Sequence)
    this.invoice_number = `INV${year}${month}C${cycle}-${(count + 1).toString().padStart(5, '0')}`;
  }
  next();
});

// Pre-save: Calculate balance and update status
invoiceSchema.pre('save', function(next) {
  // Calculate balance due
  this.balance_due = Math.max(0, this.amounts.grand_total - this.amount_paid);
  
  // Auto-update payment status
  if (this.amount_paid >= this.amounts.grand_total && this.amounts.grand_total > 0) {
    this.payment_status = 'paid';
  } else if (this.amount_paid > 0 && this.amount_paid < this.amounts.grand_total) {
    this.payment_status = 'partially_paid';
  } else if (this.due_date && new Date() > this.due_date && this.payment_status !== 'paid') {
    this.payment_status = 'overdue';
  }
  
  next();
});

// Method: Calculate taxes based on GST rules
invoiceSchema.methods.calculateTaxes = function() {
  const subtotal = this.amounts.subtotal;
  
  if (this.gst_info.is_igst) {
    // Inter-state: IGST only
    this.amounts.igst_amount = Math.round(subtotal * (this.amounts.igst_rate / 100) * 100) / 100;
    this.amounts.cgst_amount = 0;
    this.amounts.sgst_amount = 0;
  } else {
    // Intra-state: CGST + SGST
    this.amounts.cgst_amount = Math.round(subtotal * (this.amounts.cgst_rate / 100) * 100) / 100;
    this.amounts.sgst_amount = Math.round(subtotal * (this.amounts.sgst_rate / 100) * 100) / 100;
    this.amounts.igst_amount = 0;
  }
  
  this.amounts.total_tax = this.amounts.cgst_amount + this.amounts.sgst_amount + this.amounts.igst_amount;
  this.amounts.grand_total = Math.round((subtotal + this.amounts.total_tax) * 100) / 100;
  
  return this;
};

// Method: Add shipment to invoice
invoiceSchema.methods.addShipment = function(shipmentData) {
  this.shipment_charges.push(shipmentData);
  
  // Update summary counts
  this.shipment_summary.total_shipments += 1;
  this.shipment_summary.total_weight += shipmentData.weight?.charged_weight || 0;
  
  // Update status counts
  if (shipmentData.shipment_status === 'delivered') {
    this.shipment_summary.delivered_shipments += 1;
  } else if (shipmentData.shipment_status === 'rto') {
    this.shipment_summary.rto_shipments += 1;
  } else if (shipmentData.shipment_status === 'cancelled') {
    this.shipment_summary.cancelled_shipments += 1;
  }
  
  // Update payment mode counts
  if (shipmentData.payment_mode === 'COD') {
    this.shipment_summary.cod_shipments += 1;
    this.shipment_summary.total_cod_collected += shipmentData.cod_amount || 0;
  } else {
    this.shipment_summary.prepaid_shipments += 1;
  }
  
  // Update charge totals
  this.amounts.subtotal += shipmentData.total_charge || 0;
  this.amounts.total_forward_charges += shipmentData.charges?.forward_charge || 0;
  this.amounts.total_rto_charges += shipmentData.charges?.rto_charge || 0;
  this.amounts.total_cod_charges += shipmentData.charges?.cod_charge || 0;
  
  return this;
};

// Method: Finalize invoice (calculate taxes and mark as generated)
invoiceSchema.methods.finalize = function() {
  this.calculateTaxes();
  this.status = 'generated';
  return this.save();
};

// Method: Mark as paid
invoiceSchema.methods.markAsPaid = function(paymentInfo) {
  this.payment_status = 'paid';
  this.amount_paid = this.amounts.grand_total;
  this.balance_due = 0;
  this.payment_info = {
    payment_date: paymentInfo.payment_date || new Date(),
    payment_method: paymentInfo.payment_method,
    payment_reference: paymentInfo.payment_reference,
    transaction_id: paymentInfo.transaction_id
  };
  this.status = 'paid';
  return this.save();
};

// Static: Get invoices by date range (for Invoice List page)
invoiceSchema.statics.getInvoicesByDateRange = function(userId, startDate, endDate) {
  return this.find({
    user_id: userId,
    invoice_date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  })
  .select('-shipment_charges') // Exclude heavy array for list view
  .sort({ invoice_date: -1 });
};

// Static: Get invoice summary for dashboard
invoiceSchema.statics.getInvoiceSummary = async function(userId) {
  const summary = await this.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$payment_status',
        count: { $sum: 1 },
        total_amount: { $sum: '$amounts.grand_total' },
        total_paid: { $sum: '$amount_paid' }
      }
    }
  ]);
  
  // Transform to object
  const result = {
    total_invoices: 0,
    total_amount: 0,
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    overdue: { count: 0, amount: 0 }
  };
  
  summary.forEach(item => {
    result.total_invoices += item.count;
    result.total_amount += item.total_amount;
    
    if (item._id === 'paid') {
      result.paid = { count: item.count, amount: item.total_paid };
    } else if (item._id === 'pending') {
      result.pending = { count: item.count, amount: item.total_amount };
    } else if (item._id === 'overdue') {
      result.overdue = { count: item.count, amount: item.total_amount };
    }
  });
  
  return result;
};

// Static: Get pending amount
invoiceSchema.statics.getTotalPendingAmount = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        user_id: new mongoose.Types.ObjectId(userId),
        payment_status: { $in: ['pending', 'overdue', 'partially_paid'] }
      }
    },
    {
      $group: {
        _id: null,
        total_pending: { $sum: '$balance_due' }
      }
    }
  ]);
  
  return result[0]?.total_pending || 0;
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;

