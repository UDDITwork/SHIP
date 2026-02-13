const mongoose = require('mongoose');

// Category to prefix mapping for ticket IDs
const CATEGORY_PREFIX_MAP = {
  'pickup_delivery': 'PD',
  'shipment_ndr_rto': 'NR',
  'edit_shipment_info': 'ES',
  'shipment_dispute': 'WT',  // Weight/tracking disputes
  'finance': 'FA',
  'billing_taxation': 'BT',
  'claims': 'CL',
  'kyc_bank_verification': 'KB',
  'technical_support': 'TC',
  'others': 'OT'
};

// Ticket counter schema for sequential numbering per category
const ticketCounterSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    unique: true
  },
  sequence: {
    type: Number,
    default: 0
  }
});

const TicketCounter = mongoose.model('TicketCounter', ticketCounterSchema);

const fileAttachmentSchema = new mongoose.Schema({
  file_name: {
    type: String,
    required: true
  },
  mimetype: {
    type: String
  },
  file_url: {
    type: String,
    required: true
  },
  file_type: {
    type: String,
    required: true,
    enum: ['image', 'audio', 'video', 'document']
  },
  file_size: {
    type: Number,
    required: true
  },
  upload_date: {
    type: Date,
    default: Date.now
  }
});

const conversationSchema = new mongoose.Schema({
  message_id: {
    type: String,
    required: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  message_type: {
    type: String,
    enum: ['user', 'admin', 'system'],
    required: true
  },
  sender_name: {
    type: String,
    required: true
  },
  staff_name: {
    type: String,
    trim: true
  },
  message_content: {
    type: String,
    required: true
  },
  attachments: [fileAttachmentSchema],
  timestamp: {
    type: Date,
    default: Date.now
  },
  is_internal: {
    type: Boolean,
    default: false
  }
});

const supportTicketSchema = new mongoose.Schema({
  // Basic Ticket Information
  ticket_id: {
    type: String,
    unique: true,
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Ticket Details
  category: {
    type: String,
    required: true,
    enum: [
      'pickup_delivery',
      'shipment_ndr_rto',
      'edit_shipment_info',
      'shipment_dispute',
      'finance',
      'billing_taxation',
      'claims',
      'kyc_bank_verification',
      'technical_support',
      'others'
    ]
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },

  // AWB Numbers (optional - only required for shipment-related categories)
  awb_numbers: {
    type: [String],
    default: undefined, // Allow empty array or undefined
    validate: {
      validator: function(v) {
        // If provided, ensure max 10 AWB numbers
        if (v && Array.isArray(v)) {
          return v.length <= 10;
        }
        // If undefined or empty, it's valid (not required for all categories)
        return true;
      },
      message: 'Maximum 10 AWB numbers allowed'
    }
  },

  // Related Orders
  related_orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],

  // Ticket Status
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated'],
    default: 'open'
  },

  // Assignment Information
  assignment_info: {
    assigned_to: {
      type: String,
      trim: true
    },
    assigned_date: Date,
    assigned_by: String,
    assigned_by_staff: {
      type: String,
      trim: true
    },
    assigned_by_staff_name: {
      type: String,
      trim: true,
      default: null
    },
    department: {
      type: String,
      enum: ['customer_service', 'technical', 'billing', 'operations', 'escalation'],
      default: 'customer_service'
    },
    escalation_level: {
      type: Number,
      default: 1,
      min: 1,
      max: 3
    }
  },

  // Communication Preferences
  contact_preference: {
    type: String,
    enum: ['email', 'phone', 'whatsapp', 'portal'],
    default: 'email'
  },

  // Customer Information (cached for quick access)
  customer_info: {
    name: String,
    email: String,
    phone: String,
    company_name: String
  },

  // Conversation Thread
  conversation: [conversationSchema],

  // File Attachments
  attachments: [fileAttachmentSchema],

  // Resolution Information
  resolution: {
    resolution_date: Date,
    resolution_summary: String,
    resolution_category: {
      type: String,
      enum: [
        'information_provided',
        'issue_resolved',
        'escalated_to_courier',
        'refund_processed',
        'technical_fix_applied',
        'policy_clarification',
        'account_updated',
        'duplicate_ticket',
        'no_action_required'
      ]
    },
    resolved_by_staff: {
      type: String,
      trim: true
    },
    resolved_by_staff_name: {
      type: String,
      trim: true,
      default: null
    },
    customer_satisfaction: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      feedback: String,
      survey_date: Date
    },
    internal_notes: String
  },

  // SLA Tracking
  sla_info: {
    created_at: {
      type: Date,
      default: Date.now
    },
    first_response_deadline: Date,
    first_response_time: Date,
    resolution_deadline: Date,
    total_response_time: Number, // in minutes
    breached_sla: {
      type: Boolean,
      default: false
    },
    breach_reason: String
  },

  // Auto-categorization and AI
  ai_analysis: {
    suggested_category: String,
    sentiment_score: {
      type: Number,
      min: -1,
      max: 1
    },
    urgency_score: {
      type: Number,
      min: 0,
      max: 10
    },
    keywords_extracted: [String],
    similar_tickets: [String]
  },

  // Performance Metrics
  metrics: {
    response_count: {
      type: Number,
      default: 0
    },
    avg_response_time: Number, // in minutes
    customer_response_count: {
      type: Number,
      default: 0
    },
    reopened_count: {
      type: Number,
      default: 0
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
  },
  last_customer_response: Date,
  last_admin_response: Date
});

// Indexes
supportTicketSchema.index({ ticket_id: 1 }, { unique: true });
supportTicketSchema.index({ user_id: 1 });
supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ category: 1 });
supportTicketSchema.index({ priority: 1 });
supportTicketSchema.index({ 'assignment_info.assigned_to': 1 });
supportTicketSchema.index({ created_at: -1 });
supportTicketSchema.index({ awb_numbers: 1 });

// Pre-save middleware - Generate ticket ID in format: PREFIX-SEQUENCE
// Example: WT-00001 (Weight dispute, sequence 1)
// Uses atomic counter to prevent race conditions
supportTicketSchema.pre('validate', async function(next) {
  if (!this.ticket_id) {
    try {
      // Get the category prefix
      const prefix = CATEGORY_PREFIX_MAP[this.category] || 'TK';

      // Use findOneAndUpdate with atomic increment to prevent race conditions
      // This ensures that even with concurrent requests, each gets a unique sequence number
      const counter = await TicketCounter.findOneAndUpdate(
        { category: prefix }, // Use prefix as unique key for global counter per prefix
        { $inc: { sequence: 1 } },
        {
          new: true, // Return the updated document
          upsert: true, // Create if doesn't exist
          setDefaultsOnInsert: true
        }
      );

      // Format sequence with 5 digits (e.g., 00001)
      const paddedSequence = String(counter.sequence).padStart(5, '0');

      // Generate ticket ID: PREFIX-SEQUENCE
      this.ticket_id = `${prefix}-${paddedSequence}`;

    } catch (error) {
      return next(error);
    }
  }

  next();
});

supportTicketSchema.pre('save', async function(next) {
  // Generate SLA deadlines for new tickets

  if (this.isNew) {
    const now = new Date();

    // First response SLA based on priority
    const firstResponseHours = {
      'urgent': 1,
      'high': 4,
      'medium': 24,
      'low': 48
    };

    const resolutionHours = {
      'urgent': 4,
      'high': 24,
      'medium': 72,
      'low': 168
    };

    this.sla_info.first_response_deadline = new Date(now.getTime() + firstResponseHours[this.priority] * 60 * 60 * 1000);
    this.sla_info.resolution_deadline = new Date(now.getTime() + resolutionHours[this.priority] * 60 * 60 * 1000);
  }

  // Update metrics
  this.metrics.response_count = this.conversation.filter(c => c.message_type === 'admin').length;
  this.metrics.customer_response_count = this.conversation.filter(c => c.message_type === 'user').length;

  // Update last response times
  const lastCustomerMsg = this.conversation.filter(c => c.message_type === 'user').pop();
  const lastAdminMsg = this.conversation.filter(c => c.message_type === 'admin').pop();

  if (lastCustomerMsg) {
    this.last_customer_response = lastCustomerMsg.timestamp;
  }

  if (lastAdminMsg) {
    this.last_admin_response = lastAdminMsg.timestamp;
  }

  // Check SLA breach
  if (!this.sla_info.first_response_time && this.sla_info.first_response_deadline < Date.now()) {
    this.sla_info.breached_sla = true;
    this.sla_info.breach_reason = 'First response deadline breached';
  }

  this.updated_at = Date.now();
  next();
});

// Static methods
supportTicketSchema.statics.getTicketStats = function(userId = null, dateFrom, dateTo) {
  const matchQuery = {};

  if (userId) {
    matchQuery.user_id = userId;
  }

  if (dateFrom && dateTo) {
    matchQuery.created_at = {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo)
    };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avg_resolution_time: { $avg: '$sla_info.total_response_time' }
      }
    }
  ]);
};

supportTicketSchema.statics.getCategoryStats = function(dateFrom, dateTo) {
  const matchQuery = {};

  if (dateFrom && dateTo) {
    matchQuery.created_at = {
      $gte: new Date(dateFrom),
      $lte: new Date(dateTo)
    };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avg_priority: { $avg: { $cond: [{ $eq: ['$priority', 'urgent'] }, 4, { $cond: [{ $eq: ['$priority', 'high'] }, 3, { $cond: [{ $eq: ['$priority', 'medium'] }, 2, 1] }] }] } }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

supportTicketSchema.statics.getSLAReport = function() {
  return this.aggregate([
    {
      $project: {
        ticket_id: 1,
        priority: 1,
        status: 1,
        created_at: 1,
        first_response_time: '$sla_info.first_response_time',
        first_response_deadline: '$sla_info.first_response_deadline',
        resolution_deadline: '$sla_info.resolution_deadline',
        breached_sla: '$sla_info.breached_sla',
        response_time_minutes: {
          $divide: [
            { $subtract: ['$sla_info.first_response_time', '$created_at'] },
            60000
          ]
        }
      }
    }
  ]);
};

// Instance methods
supportTicketSchema.methods.addMessage = function(messageType, senderName, content, attachments = [], isInternal = false, staffName = null) {
  this.conversation.push({
    message_type: messageType,
    sender_name: senderName,
    staff_name: staffName,
    message_content: content,
    attachments: attachments,
    is_internal: isInternal
  });

  // Update first response time if this is the first admin response
  if (messageType === 'admin' && !this.sla_info.first_response_time) {
    this.sla_info.first_response_time = new Date();
  }

  return this.save();
};

supportTicketSchema.methods.assignTo = function(agentName, assignedBy, department = 'customer_service', staffName = null) {
  this.assignment_info.assigned_to = agentName;
  this.assignment_info.assigned_date = new Date();
  this.assignment_info.assigned_by = assignedBy;
  this.assignment_info.assigned_by_staff_name = staffName;
  this.assignment_info.department = department;

  if (this.status === 'open') {
    this.status = 'in_progress';
  }

  return this.save();
};

supportTicketSchema.methods.escalate = function(reason, escalatedBy) {
  this.assignment_info.escalation_level += 1;
  this.status = 'escalated';
  this.priority = this.priority === 'low' ? 'medium' : this.priority === 'medium' ? 'high' : 'urgent';

  this.addMessage('system', 'System', `Ticket escalated to level ${this.assignment_info.escalation_level}. Reason: ${reason}`, [], true);

  return this.save();
};

supportTicketSchema.methods.resolve = function(resolution_summary, resolution_category, internal_notes = '', staffName = null) {
  this.status = 'resolved';
  this.resolution.resolution_date = new Date();
  this.resolution.resolution_summary = resolution_summary;
  this.resolution.resolution_category = resolution_category;
  this.resolution.internal_notes = internal_notes;
  this.resolution.resolved_by_staff_name = staffName;

  // Calculate total response time
  this.sla_info.total_response_time = Math.floor(
    (this.resolution.resolution_date - this.created_at) / (1000 * 60)
  );

  return this.save();
};

supportTicketSchema.methods.close = function(closure_reason = '') {
  this.status = 'closed';
  this.addMessage('system', 'System', `Ticket closed. ${closure_reason}`, [], true);

  return this.save();
};

supportTicketSchema.methods.reopen = function(reason, reopenedBy) {
  this.status = 'open';
  this.metrics.reopened_count += 1;
  this.resolution = {}; // Clear previous resolution

  this.addMessage('system', 'System', `Ticket reopened by ${reopenedBy}. Reason: ${reason}`, [], true);

  return this.save();
};

module.exports = mongoose.model('SupportTicket', supportTicketSchema);