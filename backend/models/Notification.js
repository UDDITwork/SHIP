const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Notification Schema for admin-client communication
const notificationSchema = new Schema({
  // Recipient information
  recipient_type: {
    type: String,
    enum: ['client', 'admin'],
    default: 'client',
    required: true
  },
  recipient_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Sender information
  sender_type: {
    type: String,
    enum: ['admin', 'staff', 'system'],
    default: 'system'
  },
  sender_id: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    default: null
  },
  sender_name: {
    type: String,
    default: 'System'
  },

  // Notification type
  notification_type: {
    type: String,
    enum: [
      'bulk_announcement',
      'client_comment',
      'kyc_update',
      'wallet_recharge',
      'ticket_update',
      'billing_generated',
      'order_update',
      'category_change',
      'general'
    ],
    required: true,
    index: true
  },

  // Content
  heading: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },

  // Read status
  is_read: {
    type: Boolean,
    default: false,
    index: true
  },
  read_at: {
    type: Date,
    default: null
  },

  // Related entity (for linking to tickets, invoices, etc.)
  related_entity: {
    entity_type: {
      type: String,
      enum: ['ticket', 'kyc', 'invoice', 'wallet', 'order', 'none'],
      default: 'none'
    },
    entity_id: {
      type: Schema.Types.ObjectId,
      default: null
    }
  },

  // Bulk send tracking
  bulk_send_id: {
    type: String,
    default: null,
    index: true
  },

  // Delivery tracking
  delivery_status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  websocket_sent: {
    type: Boolean,
    default: false
  },

  // Timestamps
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
notificationSchema.index({ recipient_id: 1, is_read: 1, created_at: -1 });
notificationSchema.index({ recipient_id: 1, created_at: -1 });
notificationSchema.index({ bulk_send_id: 1 }, { sparse: true });

// Instance Methods

/**
 * Mark notification as read
 */
notificationSchema.methods.markAsRead = function() {
  this.is_read = true;
  this.read_at = new Date();
  return this.save();
};

// Static Methods

/**
 * Get notifications for a user with pagination
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options (page, limit, unreadOnly)
 * @returns {Promise<Object>} Notifications and metadata
 */
notificationSchema.statics.getNotificationsByUser = async function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false
  } = options;

  const query = { recipient_id: userId };
  if (unreadOnly) {
    query.is_read = false;
  }

  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    this.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    this.countDocuments(query),
    this.countDocuments({ recipient_id: userId, is_read: false })
  ]);

  return {
    notifications,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    },
    unread_count: unreadCount
  };
};

/**
 * Mark all notifications as read for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>} Update result
 */
notificationSchema.statics.markAllAsReadByUser = async function(userId) {
  return this.updateMany(
    { recipient_id: userId, is_read: false },
    {
      $set: {
        is_read: true,
        read_at: new Date()
      }
    }
  );
};

/**
 * Get unread count for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Number>} Unread count
 */
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient_id: userId, is_read: false });
};

/**
 * Create bulk notifications
 * @param {Array} userIds - Array of user IDs
 * @param {Object} notificationData - Notification content
 * @param {Object} senderInfo - Sender information
 * @returns {Promise<Array>} Created notifications
 */
notificationSchema.statics.createBulkNotifications = async function(userIds, notificationData, senderInfo = {}) {
  const bulkSendId = `BULK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const notifications = userIds.map(userId => ({
    recipient_type: 'client',
    recipient_id: userId,
    sender_type: senderInfo.sender_type || 'system',
    sender_id: senderInfo.sender_id || null,
    sender_name: senderInfo.sender_name || 'System',
    notification_type: notificationData.notification_type || 'bulk_announcement',
    heading: notificationData.heading,
    message: notificationData.message,
    related_entity: notificationData.related_entity || { entity_type: 'none', entity_id: null },
    bulk_send_id: bulkSendId,
    delivery_status: 'pending',
    websocket_sent: false
  }));

  return this.insertMany(notifications);
};

/**
 * Create single notification
 * @param {ObjectId} userId - User ID
 * @param {Object} notificationData - Notification content
 * @param {Object} senderInfo - Sender information
 * @returns {Promise<Object>} Created notification
 */
notificationSchema.statics.createNotification = async function(userId, notificationData, senderInfo = {}) {
  return this.create({
    recipient_type: 'client',
    recipient_id: userId,
    sender_type: senderInfo.sender_type || 'system',
    sender_id: senderInfo.sender_id || null,
    sender_name: senderInfo.sender_name || 'System',
    notification_type: notificationData.notification_type,
    heading: notificationData.heading,
    message: notificationData.message,
    related_entity: notificationData.related_entity || { entity_type: 'none', entity_id: null },
    delivery_status: 'pending',
    websocket_sent: false
  });
};

/**
 * Get notifications by bulk send ID
 * @param {String} bulkSendId - Bulk send ID
 * @returns {Promise<Array>} Notifications
 */
notificationSchema.statics.getByBulkSendId = async function(bulkSendId) {
  return this.find({ bulk_send_id: bulkSendId })
    .populate('recipient_id', 'client_id company_name email')
    .sort({ created_at: -1 })
    .lean();
};

/**
 * Delete old read notifications (cleanup utility)
 * @param {Number} daysOld - Delete notifications older than X days
 * @returns {Promise<Object>} Delete result
 */
notificationSchema.statics.deleteOldNotifications = async function(daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return this.deleteMany({
    is_read: true,
    created_at: { $lt: cutoffDate }
  });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
