// Location: backend/models/TrackingOrder.js
// Model to store AWB numbers of orders whose pickup request has been created
// This collection tracks orders that need to be monitored via cron job

const mongoose = require('mongoose');

const trackingOrderSchema = new mongoose.Schema({
  // Order Reference
  order_id: {
    type: String,
    required: [true, 'Order ID is required'],
    unique: true,
    index: true,
    trim: true
  },

  // User Reference
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // AWB/Waybill Number (Primary tracking identifier)
  awb_number: {
    type: String,
    required: [true, 'AWB number is required'],
    unique: true,
    index: true,
    trim: true
  },

  // Reference ID (order reference)
  reference_id: {
    type: String,
    index: true,
    trim: true
  },

  // Pickup Request Information
  pickup_request_id: {
    type: String,
    index: true,
    trim: true
  },

  pickup_request_date: {
    type: Date,
    index: true
  },

  pickup_request_status: {
    type: String,
    enum: ['pending', 'scheduled', 'in_transit', 'completed', 'failed'],
    default: 'scheduled',
    index: true
  },

  // Current Status (from tracking API)
  current_status: {
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
      'rto_in_transit',
      'rto_delivered',
      'cancelled',
      'lost'
    ],
    default: 'pickups_manifests',
    index: true
  },

  // Delhivery Status (raw status from API)
  delhivery_status: {
    type: String,
    trim: true
  },

  // Status from Delhivery API response (Status.Status field)
  api_status: {
    type: String,
    trim: true
  },

  // Tracking Status
  is_tracking_active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Stop tracking once delivered
  is_delivered: {
    type: Boolean,
    default: false,
    index: true
  },

  // Last tracking information
  last_tracked_at: {
    type: Date,
    index: true
  },

  last_tracking_response: {
    type: mongoose.Schema.Types.Mixed // Store full API response
  },

  // Status History (from tracking API)
  status_history: [{
    status: {
      type: String,
      required: true
    },
    status_type: {
      type: String
    },
    status_date_time: {
      type: Date
    },
    status_location: {
      type: String
    },
    instructions: {
      type: String
    },
    nsl_code: {
      type: String
    },
    sort_code: {
      type: String
    },
    raw_data: {
      type: mongoose.Schema.Types.Mixed
    },
    tracked_at: {
      type: Date,
      default: Date.now
    }
  }],

  // Tracking metadata
  tracking_count: {
    type: Number,
    default: 0
  },

  tracking_failures: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    error: {
      type: String
    },
    error_type: {
      type: String
    },
    status_code: {
      type: Number
    }
  }],

  // Delivery information (when delivered)
  delivered_at: {
    type: Date
  },

  delivered_by: {
    type: String
  },

  delivery_location: {
    type: String
  },

  // Cancellation information
  cancelled_at: {
    type: Date
  },

  cancellation_reason: {
    type: String
  },

  // RTO information
  rto_at: {
    type: Date
  },

  rto_reason: {
    type: String
  },

  // NDR information
  ndr_attempts: {
    type: Number,
    default: 0
  },

  last_ndr_date: {
    type: Date
  },

  ndr_reason: {
    type: String
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
trackingOrderSchema.index({ is_tracking_active: 1, is_delivered: 1 });
trackingOrderSchema.index({ current_status: 1, is_tracking_active: 1 });
trackingOrderSchema.index({ last_tracked_at: 1 });
trackingOrderSchema.index({ createdAt: -1 });
trackingOrderSchema.index({ user_id: 1, is_tracking_active: 1 });

// Compound index for cron job queries
trackingOrderSchema.index({ 
  is_tracking_active: 1, 
  is_delivered: 0,
  pickup_request_id: 1 
});

// Static method to get all active tracking orders
trackingOrderSchema.statics.getActiveTrackingOrders = function() {
  return this.find({
    is_tracking_active: true,
    is_delivered: false
  }).sort({ last_tracked_at: 1 }); // Track oldest first
};

// Static method to get tracking orders by status
trackingOrderSchema.statics.getTrackingOrdersByStatus = function(status) {
  return this.find({
    is_tracking_active: true,
    is_delivered: false,
    current_status: status
  });
};

// Static method to mark as delivered
trackingOrderSchema.methods.markAsDelivered = function(deliveryData = {}) {
  this.is_delivered = true;
  this.is_tracking_active = false;
  this.current_status = 'delivered';
  this.delivered_at = deliveryData.delivered_at || new Date();
  this.delivered_by = deliveryData.delivered_by;
  this.delivery_location = deliveryData.delivery_location;
  return this.save();
};

// Static method to mark as cancelled
trackingOrderSchema.methods.markAsCancelled = function(cancellationData = {}) {
  this.is_tracking_active = false;
  this.current_status = 'cancelled';
  this.cancelled_at = cancellationData.cancelled_at || new Date();
  this.cancellation_reason = cancellationData.reason;
  return this.save();
};

// Static method to mark as RTO
trackingOrderSchema.methods.markAsRTO = function(rtoData = {}) {
  this.is_tracking_active = false;
  this.current_status = 'rto';
  this.rto_at = rtoData.rto_at || new Date();
  this.rto_reason = rtoData.reason;
  return this.save();
};

// Static method to add status to history
trackingOrderSchema.methods.addStatusToHistory = function(statusData) {
  if (!this.status_history) {
    this.status_history = [];
  }

  // Check if this status already exists (avoid duplicates)
  const existingStatus = this.status_history.find(
    s => s.status === statusData.status && 
         s.status_date_time && 
         statusData.status_date_time &&
         s.status_date_time.getTime() === new Date(statusData.status_date_time).getTime()
  );

  if (!existingStatus) {
    this.status_history.push({
      status: statusData.status,
      status_type: statusData.status_type,
      status_date_time: statusData.status_date_time ? new Date(statusData.status_date_time) : new Date(),
      status_location: statusData.status_location,
      instructions: statusData.instructions,
      nsl_code: statusData.nsl_code,
      sort_code: statusData.sort_code,
      raw_data: statusData.raw_data,
      tracked_at: new Date()
    });
  }

  return this;
};

// Static method to create or update tracking order from Order model
trackingOrderSchema.statics.createFromOrder = async function(order) {
  // AWB is required; pickup_request_id is optional (orders can have AWB before pickup)
  if (!order.delhivery_data?.waybill) {
    throw new Error('Order does not have an AWB number');
  }

  // Find or create tracking order
  let trackingOrder = await this.findOne({ order_id: order.order_id });

  if (trackingOrder) {
    // Update existing tracking order
    trackingOrder.awb_number = order.delhivery_data.waybill;
    trackingOrder.pickup_request_id = order.delhivery_data.pickup_request_id || trackingOrder.pickup_request_id;
    trackingOrder.pickup_request_date = order.delhivery_data.pickup_request_date || trackingOrder.pickup_request_date;
    trackingOrder.pickup_request_status = order.delhivery_data.pickup_request_status || trackingOrder.pickup_request_status || 'pending';
    trackingOrder.is_tracking_active = !trackingOrder.is_delivered;
  } else {
    // Create new tracking order
    trackingOrder = new this({
      order_id: order.order_id,
      user_id: order.user_id,
      awb_number: order.delhivery_data.waybill,
      reference_id: order.reference_id,
      pickup_request_id: order.delhivery_data.pickup_request_id || null,
      pickup_request_date: order.delhivery_data.pickup_request_date || null,
      pickup_request_status: order.delhivery_data.pickup_request_status || 'pending',
      current_status: order.status || 'ready_to_ship',
      is_tracking_active: true,
      is_delivered: false
    });
  }

  await trackingOrder.save();
  return trackingOrder;
};

const TrackingOrder = mongoose.model('TrackingOrder', trackingOrderSchema);

module.exports = TrackingOrder;

