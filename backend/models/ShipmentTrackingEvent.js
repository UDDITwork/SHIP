// Location: backend/models/ShipmentTrackingEvent.js
const mongoose = require('mongoose');

const shipmentTrackingEventSchema = new mongoose.Schema({
  // Waybill/AWB Number (Primary identifier)
  waybill: {
    type: String,
    required: [true, 'Waybill/AWB is required'],
    index: true,
    trim: true
  },

  // Order Reference
  order_id: {
    type: String,
    index: true,
    trim: true
  },

  reference_no: {
    type: String,
    index: true,
    trim: true
  },

  // Status Information
  status: {
    type: String,
    required: [true, 'Status is required'],
    trim: true
  },

  status_type: {
    type: String,
    trim: true
  },

  status_date_time: {
    type: Date,
    required: [true, 'Status date time is required'],
    index: true
  },

  status_location: {
    type: String,
    trim: true
  },

  instructions: {
    type: String,
    trim: true
  },

  // NSL Code (Delhivery specific)
  nsl_code: {
    type: String,
    trim: true
  },

  // Sort Code
  sort_code: {
    type: String,
    trim: true
  },

  // Pickup Date
  pickup_date: {
    type: Date
  },

  // Raw payload from Delhivery (for debugging and audit)
  raw_payload: {
    type: mongoose.Schema.Types.Mixed
  },

  // Processing metadata
  processed: {
    type: Boolean,
    default: false
  },

  processing_error: {
    type: String,
    trim: true
  },

  // Order reference (if linked)
  order_ref: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
shipmentTrackingEventSchema.index({ waybill: 1, status_date_time: -1 });
shipmentTrackingEventSchema.index({ order_id: 1, status_date_time: -1 });
shipmentTrackingEventSchema.index({ reference_no: 1, status_date_time: -1 });
shipmentTrackingEventSchema.index({ status_date_time: -1 });
shipmentTrackingEventSchema.index({ processed: 1, createdAt: -1 });

// Compound index for tracking history
shipmentTrackingEventSchema.index({ waybill: 1, createdAt: -1 });

// Unique compound index to prevent duplicate webhook events at DB level
shipmentTrackingEventSchema.index(
  { waybill: 1, status: 1, status_date_time: 1 },
  { unique: true }
);

// Static method to get tracking history for a waybill
shipmentTrackingEventSchema.statics.getTrackingHistory = function(waybill) {
  return this.find({ waybill })
    .sort({ status_date_time: -1 })
    .lean();
};

// Static method to get latest status for a waybill
shipmentTrackingEventSchema.statics.getLatestStatus = function(waybill) {
  return this.findOne({ waybill })
    .sort({ status_date_time: -1 })
    .lean();
};

// Static method to check if event already exists (prevent duplicates)
shipmentTrackingEventSchema.statics.eventExists = function(waybill, status, statusDateTime) {
  return this.findOne({
    waybill,
    status,
    status_date_time: statusDateTime
  });
};

const ShipmentTrackingEvent = mongoose.model('ShipmentTrackingEvent', shipmentTrackingEventSchema);

module.exports = ShipmentTrackingEvent;

