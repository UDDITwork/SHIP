const mongoose = require('mongoose');

const ndrSchema = new mongoose.Schema({
  // Basic NDR Information
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  awb_number: {
    type: String,
    required: true
  },

  // NDR Details
  ndr_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  ndr_reason: {
    type: String,
    required: true,
    enum: [
      'customer_not_available',
      'address_incomplete',
      'customer_refused',
      'payment_issue',
      'wrong_address',
      'customer_rescheduled',
      'premises_closed',
      'delivery_attempted_multiple_times',
      'customer_not_contactable',
      'other'
    ]
  },
  ndr_reason_description: {
    type: String,
    required: true,
    trim: true
  },

  // Customer Information
  customer_info: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true
    },
    alternate_phone: String,
    city: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },

  // Delivery Attempts
  delivery_attempts: [{
    attempt_number: {
      type: Number,
      required: true
    },
    attempt_date: {
      type: Date,
      required: true
    },
    delivery_partner: String,
    delivery_boy_name: String,
    delivery_boy_phone: String,
    attempt_status: {
      type: String,
      enum: ['failed', 'customer_not_available', 'rescheduled'],
      required: true
    },
    failure_reason: String,
    delivery_photos: [String],
    customer_feedback: String,
    next_attempt_date: Date
  }],

  // NDR Status and Resolution
  ndr_status: {
    current_status: {
      type: String,
      enum: [
        'new_ndr',
        'customer_contacted',
        'reattempt_scheduled',
        'customer_response_pending',
        'address_updated',
        'payment_updated',
        'delivered',
        'rto_initiated',
        'rto_in_transit',
        'rto_delivered',
        'closed'
      ],
      default: 'new_ndr'
    },
    resolution_action: {
      type: String,
      enum: [
        'reattempt_delivery',
        'update_address',
        'customer_pickup',
        'initiate_rto',
        'refund_initiated',
        'delivered',
        'cancelled'
      ]
    },
    resolution_date: Date,
    resolution_notes: String
  },

  // Customer Communication
  customer_communication: {
    sms_sent: [{
      message_text: String,
      sent_date: {
        type: Date,
        default: Date.now
      },
      delivery_status: {
        type: String,
        enum: ['sent', 'delivered', 'failed'],
        default: 'sent'
      },
      template_used: String
    }],
    calls_made: [{
      call_date: {
        type: Date,
        default: Date.now
      },
      call_duration: Number, // in seconds
      call_status: {
        type: String,
        enum: ['connected', 'not_reachable', 'busy', 'switched_off'],
        required: true
      },
      call_notes: String,
      agent_name: String
    }],
    emails_sent: [{
      email_subject: String,
      email_content: String,
      sent_date: {
        type: Date,
        default: Date.now
      },
      email_status: {
        type: String,
        enum: ['sent', 'delivered', 'opened', 'failed'],
        default: 'sent'
      }
    }],
    whatsapp_messages: [{
      message_text: String,
      sent_date: {
        type: Date,
        default: Date.now
      },
      message_status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed'],
        default: 'sent'
      }
    }]
  },

  // Customer Response
  customer_response: {
    response_received: {
      type: Boolean,
      default: false
    },
    response_date: Date,
    response_type: {
      type: String,
      enum: ['call', 'sms', 'email', 'whatsapp', 'portal'],
    },
    customer_preference: {
      type: String,
      enum: ['reattempt', 'reschedule', 'change_address', 'customer_pickup', 'cancel_order']
    },
    preferred_delivery_date: Date,
    preferred_delivery_time: String,
    updated_address: String,
    updated_phone: String,
    customer_notes: String
  },

  // RTO Information
  rto_info: {
    is_rto: {
      type: Boolean,
      default: false
    },
    rto_initiated_date: Date,
    rto_reason: String,
    rto_status: {
      type: String,
      enum: ['initiated', 'in_transit', 'delivered_to_origin', 'lost_in_rto']
    },
    rto_awb: String,
    rto_delivered_date: Date,
    rto_charges: Number
  },

  // Performance Metrics
  metrics: {
    days_in_ndr: {
      type: Number,
      default: 0
    },
    total_attempts: {
      type: Number,
      default: 1
    },
    first_contact_date: Date,
    last_contact_date: Date,
    escalation_level: {
      type: Number,
      default: 1,
      min: 1,
      max: 3
    },
    priority_score: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    }
  },

  // Administrative Information
  admin_info: {
    assigned_agent: String,
    escalated_to: String,
    internal_notes: String,
    category: {
      type: String,
      enum: ['high_value', 'repeat_customer', 'first_time', 'problematic_area'],
      default: 'first_time'
    }
  },

  // Auto-resolution Rules
  auto_resolution: {
    auto_rto_eligible: {
      type: Boolean,
      default: false
    },
    auto_rto_date: Date,
    max_attempts_reached: {
      type: Boolean,
      default: false
    },
    aging_threshold_crossed: {
      type: Boolean,
      default: false
    }
  },

  // Timestamps
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Indexes
ndrSchema.index({ awb_number: 1 });
ndrSchema.index({ user_id: 1 });
ndrSchema.index({ order_id: 1 });
ndrSchema.index({ 'ndr_status.current_status': 1 });
ndrSchema.index({ 'customer_info.phone': 1 });
ndrSchema.index({ ndr_date: -1 });
ndrSchema.index({ 'metrics.days_in_ndr': 1 });
ndrSchema.index({ user_id: 1, created_at: -1 });

// Pre-save middleware
ndrSchema.pre('save', function(next) {
  // Calculate days in NDR
  if (this.ndr_date) {
    const now = new Date();
    const ndrDate = new Date(this.ndr_date);
    this.metrics.days_in_ndr = Math.floor((now - ndrDate) / (1000 * 60 * 60 * 24));
  }

  // Set auto RTO eligibility
  if (this.metrics.days_in_ndr >= 7 || this.metrics.total_attempts >= 3) {
    this.auto_resolution.auto_rto_eligible = true;
  }

  if (this.metrics.total_attempts >= 3) {
    this.auto_resolution.max_attempts_reached = true;
  }

  if (this.metrics.days_in_ndr >= 10) {
    this.auto_resolution.aging_threshold_crossed = true;
  }

  // Update total attempts
  this.metrics.total_attempts = this.delivery_attempts.length;

  // Update timestamps
  this.updated_at = Date.now();
  next();
});

// Static methods
ndrSchema.statics.getNDRStats = function(userId, dateFrom, dateTo) {
  const matchQuery = { user_id: userId };

  if (dateFrom && dateTo) {
    matchQuery.ndr_date = {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo)
    };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$ndr_status.current_status',
        count: { $sum: 1 },
        avg_days_in_ndr: { $avg: '$metrics.days_in_ndr' }
      }
    }
  ]);
};

ndrSchema.statics.getNDRsByReason = function(userId) {
  return this.aggregate([
    { $match: { user_id: userId } },
    {
      $group: {
        _id: '$ndr_reason',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

ndrSchema.statics.getEscalationCandidates = function() {
  return this.find({
    $or: [
      { 'metrics.days_in_ndr': { $gte: 7 } },
      { 'metrics.total_attempts': { $gte: 3 } },
      { 'auto_resolution.aging_threshold_crossed': true }
    ],
    'ndr_status.current_status': { $nin: ['delivered', 'rto_delivered', 'closed'] }
  });
};

// Instance methods
ndrSchema.methods.addDeliveryAttempt = function(attemptData) {
  this.delivery_attempts.push({
    attempt_number: this.delivery_attempts.length + 1,
    ...attemptData
  });

  this.metrics.total_attempts = this.delivery_attempts.length;
  return this.save();
};

ndrSchema.methods.addCustomerCommunication = function(type, data) {
  if (!this.customer_communication[type]) {
    this.customer_communication[type] = [];
  }

  this.customer_communication[type].push(data);

  // Update contact dates
  if (!this.metrics.first_contact_date) {
    this.metrics.first_contact_date = new Date();
  }
  this.metrics.last_contact_date = new Date();

  return this.save();
};

ndrSchema.methods.updateStatus = function(newStatus, resolutionAction = null, notes = '') {
  this.ndr_status.current_status = newStatus;

  if (resolutionAction) {
    this.ndr_status.resolution_action = resolutionAction;
    this.ndr_status.resolution_date = new Date();
    this.ndr_status.resolution_notes = notes;
  }

  return this.save();
};

ndrSchema.methods.initiateRTO = function(reason = 'Multiple delivery attempts failed') {
  this.rto_info.is_rto = true;
  this.rto_info.rto_initiated_date = new Date();
  this.rto_info.rto_reason = reason;
  this.rto_info.rto_status = 'initiated';
  this.ndr_status.current_status = 'rto_initiated';

  return this.save();
};

module.exports = mongoose.model('NDR', ndrSchema);