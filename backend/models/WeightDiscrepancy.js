const mongoose = require('mongoose');

const weightDiscrepancySchema = new mongoose.Schema({
  // AWB Information
  awb_number: {
    type: String,
    required: [true, 'AWB number is required'],
    trim: true,
    index: true,
    validate: {
      validator: function(v) {
        // Validate 14-digit AWB format
        return /^\d{14}$/.test(v);
      },
      message: 'AWB number must be 14 digits'
    }
  },

  // Client Reference - CRITICAL for linking to client dashboard
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Client ID is required'],
    index: true
  },

  // Order Reference
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true
  },

  // Discrepancy Details
  discrepancy_date: {
    type: Date,
    required: [true, 'Discrepancy date is required'],
    index: true
  },

  awb_status: {
    type: String,
    required: [true, 'AWB status is required'],
    enum: ['In Transit', 'Out for Delivery', 'Delivered', 'RTO', 'NDR', 'Cancelled', 'Lost'],
    trim: true
  },

  // Weight Information (in grams)
  client_declared_weight: {
    type: Number,
    required: [true, 'Client declared weight is required'],
    min: [0, 'Weight cannot be negative']
  },

  delhivery_updated_weight: {
    type: Number,
    required: [true, 'Delhivery updated weight is required'],
    min: [0, 'Weight cannot be negative']
  },

  weight_discrepancy: {
    type: Number,
    required: [true, 'Weight discrepancy is required'],
    min: [0, 'Discrepancy cannot be negative']
  },

  // Financial Information
  deduction_amount: {
    type: Number,
    required: [true, 'Deduction amount is required'],
    min: [0, 'Deduction amount cannot be negative']
  },

  // Processing Status
  processed: {
    type: Boolean,
    default: false,
    index: true
  },

  // Dispute Status - NEW, DISPUTE, FINAL WEIGHT
  dispute_status: {
    type: String,
    enum: ['NEW', 'DISPUTE', 'FINAL WEIGHT'],
    default: 'NEW',
    index: true
  },

  // Action taken by admin
  action_taken: {
    type: String,
    enum: [null, 'DISPUTE ACCEPTED BY COURIER', 'DISPUTE REJECTED BY COURIER', 'No Action taken by Courier'],
    default: null
  },

  // Timestamp when client raised dispute
  dispute_raised_at: {
    type: Date,
    default: null
  },

  // Timestamp when admin took action
  action_taken_at: {
    type: Date,
    default: null
  },

  // Refund transaction reference (if dispute accepted)
  refund_transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    index: true
  },

  // Transaction Reference
  transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    index: true
  },

  // Additional Information
  notes: {
    type: String,
    trim: true
  },

  // Tracking
  upload_batch_id: {
    type: String,
    trim: true,
    index: true
  },

  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
weightDiscrepancySchema.index({ client_id: 1, discrepancy_date: -1 });
weightDiscrepancySchema.index({ awb_number: 1 });
weightDiscrepancySchema.index({ processed: 1, discrepancy_date: -1 });
weightDiscrepancySchema.index({ upload_batch_id: 1 });
weightDiscrepancySchema.index({ dispute_status: 1, dispute_raised_at: 1 });

// Virtual for calculated discrepancy percentage
weightDiscrepancySchema.virtual('discrepancy_percentage').get(function() {
  if (this.client_declared_weight > 0) {
    return ((this.weight_discrepancy / this.client_declared_weight) * 100).toFixed(2);
  }
  return 0;
});

// Instance method to check if discrepancy is significant (>5%)
weightDiscrepancySchema.methods.isSignificant = function() {
  return (this.weight_discrepancy / this.client_declared_weight) > 0.05;
};

module.exports = mongoose.model('WeightDiscrepancy', weightDiscrepancySchema);

