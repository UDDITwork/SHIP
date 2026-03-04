// Location: backend/routes/ndr.js
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const moment = require('moment');
const { auth } = require('../middleware/auth');
const Order = require('../models/Order');
const SupportTicket = require('../models/Support');
const delhiveryService = require('../services/delhiveryService');

const router = express.Router();

// @desc    Get all NDR orders with filters and pagination
// @route   GET /api/ndr
// @access  Private
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn([
    'action_required', 'action_taken', 'delivered', 'rto', 'all'
  ]),
  query('ndr_reason').optional(),
  query('nsl_code').optional(),
  query('attempts_min').optional().isInt({ min: 0 }),
  query('attempts_max').optional().isInt({ min: 0, max: 3 }),
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601(),
  query('search').optional().trim(),
  query('payment_mode').optional().isIn(['COD', 'Prepaid', 'prepaid', 'cod'])
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
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = {
      user_id: userId,
      'ndr_info.is_ndr': true
    };

    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      switch (req.query.status) {
        case 'action_required':
          // Orders where no action has been submitted yet
          filterQuery['ndr_info.resolution_action'] = null;
          filterQuery.status = 'ndr';
          break;
        case 'action_taken':
          // Orders where an action (reattempt/rto) was submitted to Delhivery
          filterQuery['ndr_info.resolution_action'] = { $ne: null };
          filterQuery.status = 'ndr';
          break;
        case 'delivered':
          filterQuery.status = 'delivered';
          break;
        case 'rto':
          filterQuery.status = { $in: ['rto', 'rto_in_transit', 'rto_delivered'] };
          break;
      }
    }

    // NDR reason filter
    if (req.query.ndr_reason) {
      filterQuery['ndr_info.ndr_reason'] = new RegExp(req.query.ndr_reason, 'i');
    }

    // NSL code filter
    if (req.query.nsl_code) {
      filterQuery['ndr_info.nsl_code'] = req.query.nsl_code;
    }

    // Attempts filter
    if (req.query.attempts_min || req.query.attempts_max) {
      filterQuery['ndr_info.ndr_attempts'] = {};
      if (req.query.attempts_min) {
        filterQuery['ndr_info.ndr_attempts'].$gte = parseInt(req.query.attempts_min);
      }
      if (req.query.attempts_max) {
        filterQuery['ndr_info.ndr_attempts'].$lte = parseInt(req.query.attempts_max);
      }
    }

    // Date filter
    if (req.query.date_from || req.query.date_to) {
      filterQuery['ndr_info.last_ndr_date'] = {};
      if (req.query.date_from) {
        filterQuery['ndr_info.last_ndr_date'].$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        filterQuery['ndr_info.last_ndr_date'].$lte = new Date(req.query.date_to);
      }
    }

    // Payment mode filter (Prepaid / COD)
    if (req.query.payment_mode) {
      filterQuery['payment_info.payment_mode'] = new RegExp(`^${req.query.payment_mode}$`, 'i');
    }

    // Search filter (AWB, Order ID, Customer Name)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { 'delhivery_data.waybill': searchRegex },
        { order_id: searchRegex },
        { 'customer_info.buyer_name': searchRegex },
        { 'customer_info.phone': searchRegex }
      ];
    }

    // Get NDR orders with pagination
    const orders = await Order.find(filterQuery)
      .sort({ 'ndr_info.last_ndr_date': -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(filterQuery);

    res.json({
      status: 'success',
      data: {
        orders,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalOrders / limit),
          total_orders: totalOrders,
          per_page: limit
        }
      }
    });

  } catch (error) {
    console.error('Get NDR orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching NDR orders'
    });
  }
});

// @desc    Export NDR orders as CSV
// @route   GET /api/ndr/export
// @access  Private
// NOTE: Must be defined BEFORE /:id to avoid Express matching "export" as an :id param
router.get('/export', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Build same filter query as GET /api/ndr
    const filterQuery = {
      user_id: userId,
      'ndr_info.is_ndr': true
    };

    if (req.query.status && req.query.status !== 'all') {
      switch (req.query.status) {
        case 'action_required':
          filterQuery['ndr_info.resolution_action'] = null;
          filterQuery.status = 'ndr';
          break;
        case 'action_taken':
          filterQuery['ndr_info.resolution_action'] = { $ne: null };
          filterQuery.status = 'ndr';
          break;
        case 'delivered':
          filterQuery.status = 'delivered';
          break;
        case 'rto':
          filterQuery.status = { $in: ['rto', 'rto_in_transit', 'rto_delivered'] };
          break;
      }
    }

    if (req.query.payment_mode) {
      filterQuery['payment_info.payment_mode'] = new RegExp(`^${req.query.payment_mode}$`, 'i');
    }

    if (req.query.date_from || req.query.date_to) {
      filterQuery['ndr_info.last_ndr_date'] = {};
      if (req.query.date_from) {
        filterQuery['ndr_info.last_ndr_date'].$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        filterQuery['ndr_info.last_ndr_date'].$lte = new Date(req.query.date_to);
      }
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { 'delhivery_data.waybill': searchRegex },
        { order_id: searchRegex },
        { 'customer_info.buyer_name': searchRegex },
        { 'customer_info.phone': searchRegex }
      ];
    }

    const orders = await Order.find(filterQuery)
      .sort({ 'ndr_info.last_ndr_date': -1 })
      .limit(5000)
      .lean();

    // Build CSV
    const csvHeader = 'Order ID,Order Date,Customer Name,Phone,Product,Payment Mode,AWB,City,State,Pincode,NDR Reason,NDR Date,Attempts,Action Status,Next Attempt Date';

    const escapeCSV = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const formatDateCSV = (d) => {
      if (!d) return '';
      const date = new Date(d);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    };

    const csvRows = orders.map(order => {
      const productNames = (order.products || []).map(p => p.product_name).join('; ');
      return [
        escapeCSV(order.order_id),
        escapeCSV(formatDateCSV(order.created_at)),
        escapeCSV(order.customer_info?.buyer_name),
        escapeCSV(order.customer_info?.phone),
        escapeCSV(productNames),
        escapeCSV(order.payment_info?.payment_mode),
        escapeCSV(order.delhivery_data?.waybill),
        escapeCSV(order.delivery_address?.city),
        escapeCSV(order.delivery_address?.state),
        escapeCSV(order.delivery_address?.pincode),
        escapeCSV(order.ndr_info?.ndr_reason),
        escapeCSV(formatDateCSV(order.ndr_info?.last_ndr_date)),
        escapeCSV(order.ndr_info?.ndr_attempts),
        escapeCSV(order.ndr_info?.resolution_action || 'pending'),
        escapeCSV(formatDateCSV(order.ndr_info?.next_attempt_date))
      ].join(',');
    });

    const csv = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ndr_export_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);

  } catch (error) {
    console.error('NDR export error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error exporting NDR data'
    });
  }
});

// @desc    Get NDR order by ID
// @route   GET /api/ndr/:id
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      'ndr_info.is_ndr': true
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'NDR order not found'
      });
    }

    res.json({
      status: 'success',
      data: order
    });

  } catch (error) {
    console.error('Get NDR order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching NDR order'
    });
  }
});

// @desc    Take NDR Action (Re-Attempt or Pickup Reschedule)
// @route   POST /api/ndr/action
// @access  Private
router.post('/action', auth, [
  body('waybill').notEmpty().withMessage('Waybill is required'),
  body('action').isIn(['RE-ATTEMPT', 'PICKUP_RESCHEDULE']).withMessage('Valid action is required'),
  body('reason').optional().trim()
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

    const { waybill, action, reason } = req.body;

    // Find order
    const order = await Order.findOne({
      user_id: req.user._id,
      'delhivery_data.waybill': waybill,
      'ndr_info.is_ndr': true
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'NDR order not found'
      });
    }

    // Validate action based on NSL code
    const nslCode = order.ndr_info.nsl_code;
    const allowedReAttemptCodes = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
    const allowedRescheduleCodes = ['EOD-777', 'EOD-21'];

    if (action === 'RE-ATTEMPT' && !allowedReAttemptCodes.includes(nslCode)) {
      return res.status(400).json({
        status: 'error',
        message: `Re-attempt not allowed for NSL code: ${nslCode}`
      });
    }

    if (action === 'PICKUP_RESCHEDULE' && !allowedRescheduleCodes.includes(nslCode)) {
      return res.status(400).json({
        status: 'error',
        message: `Pickup reschedule not allowed for NSL code: ${nslCode}`
      });
    }

    // Check attempt count
    if (order.ndr_info.ndr_attempts > 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 3 attempts allowed. Please initiate RTO.'
      });
    }

    // Call Delhivery API
    const result = await delhiveryService.takeNDRAction({
      waybill,
      action,
      reason,
      nslCode: order.ndr_info.nsl_code,
      attemptCount: order.ndr_info.ndr_attempts
    });

    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: result.error || 'Failed to take NDR action'
      });
    }

    // Update order in database
    order.ndr_info.action_history.push({
      action: action,
      timestamp: new Date(),
      upl_id: result.request_id,
      status: 'PENDING',
      remarks: reason || `${action} initiated`
    });

    order.ndr_info.resolution_action = action === 'RE-ATTEMPT' ? 'reattempt' : 'rto';
    
    if (action === 'RE-ATTEMPT') {
      // Calculate next attempt date (next day)
      const nextAttempt = new Date();
      nextAttempt.setDate(nextAttempt.getDate() + 1);
      order.ndr_info.next_attempt_date = nextAttempt;
    }

    await order.save();

    // Auto-create support ticket for this NDR action
    try {
      const actionLabel = action === 'RE-ATTEMPT' ? 'Re-attempt Requested' : 'RTO / Pickup Reschedule Requested';
      const ticket = new SupportTicket({
        user_id: order.user_id,
        category: 'shipment_ndr_rto',
        priority: 'high',
        subject: `NDR Action: ${actionLabel} for AWB ${waybill}`,
        description: `NDR action taken: ${actionLabel}. AWB: ${waybill}.${reason ? ` Reason: ${reason}` : ''}`,
        awb_numbers: [waybill],
        ndr_order_id: order._id,
        related_orders: [order._id],
        status: 'open',
        conversation: [{
          message_type: 'user',
          sender_name: req.user.company_name || req.user.your_name || 'Client',
          message_content: `NDR action taken: ${actionLabel}. AWB: ${waybill}.${reason ? ` Reason: ${reason}` : ''}`
        }]
      });
      await ticket.save();

      // Link ticket back to the last action_history entry
      const lastIdx = order.ndr_info.action_history.length - 1;
      order.ndr_info.action_history[lastIdx].ticket_id = ticket.ticket_id;
      order.ndr_info.action_history[lastIdx].ticket_object_id = ticket._id.toString();
      await order.save();
    } catch (ticketErr) {
      console.error('Failed to auto-create NDR ticket:', ticketErr);
      // Non-fatal — don't fail the main response
    }

    res.json({
      status: 'success',
      message: `${action} initiated successfully`,
      data: {
        waybill: waybill,
        action: action,
        upl_id: result.request_id,
        next_attempt_date: order.ndr_info.next_attempt_date
      }
    });

  } catch (error) {
    console.error('Take NDR action error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error taking NDR action'
    });
  }
});

// @desc    Get NDR Status by UPL ID
// @route   GET /api/ndr/status/:uplId
// @access  Private
router.get('/status/:uplId', auth, async (req, res) => {
  try {
    const { uplId } = req.params;

    // Call Delhivery API to get status
    const result = await delhiveryService.getNDRStatus(uplId);

    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: result.error || 'Failed to get NDR status'
      });
    }

    // Update orders in database
    if (result.waybills && result.waybills.length > 0) {
      for (const waybill of result.waybills) {
        await Order.updateOne(
          {
            'delhivery_data.waybill': waybill,
            'ndr_info.action_history.upl_id': uplId
          },
          {
            $set: {
              'ndr_info.action_history.$.status': result.status
            }
          }
        );
      }
    }

    res.json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Get NDR status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching NDR status'
    });
  }
});

// @desc    Bulk NDR Action
// @route   POST /api/ndr/bulk-action
// @access  Private
router.post('/bulk-action', auth, [
  body('order_ids').isArray({ min: 1 }).withMessage('Order IDs array is required'),
  body('order_ids.*').isMongoId().withMessage('Valid Order IDs are required'),
  body('action').isIn(['RE-ATTEMPT', 'PICKUP_RESCHEDULE']).withMessage('Valid action is required'),
  body('reason').optional().trim()
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

    const { order_ids, action, reason } = req.body;
    const userId = req.user._id;

    // Get orders
    const orders = await Order.find({
      _id: { $in: order_ids },
      user_id: userId,
      'ndr_info.is_ndr': true
    });

    if (orders.length !== order_ids.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Some orders not found or are not NDR orders'
      });
    }

    // Collect waybills
    const waybills = orders.map(order => order.delhivery_data.waybill);

    // Call Delhivery Bulk API
    const result = await delhiveryService.bulkNDRAction({
      waybills,
      action,
      orders: orders // Pass orders for validation
    });

    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: result.error || 'Failed to execute bulk NDR action'
      });
    }

    // Update all orders
    const updatePromises = orders.map(async (order) => {
      order.ndr_info.action_history.push({
        action: action,
        timestamp: new Date(),
        upl_id: result.request_id,
        status: 'PENDING',
        remarks: reason || `Bulk ${action} initiated`
      });

      order.ndr_info.resolution_action = action === 'RE-ATTEMPT' ? 'reattempt' : 'rto';

      if (action === 'RE-ATTEMPT') {
        const nextAttempt = new Date();
        nextAttempt.setDate(nextAttempt.getDate() + 1);
        order.ndr_info.next_attempt_date = nextAttempt;
      }

      await order.save();
    });

    await Promise.all(updatePromises);

    res.json({
      status: 'success',
      message: `Bulk ${action} initiated for ${orders.length} orders`,
      data: {
        upl_id: result.request_id,
        processed_count: result.processed_count,
        waybills: waybills
      }
    });

  } catch (error) {
    console.error('Bulk NDR action error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error performing bulk NDR action'
    });
  }
});

// @desc    Get NDR Statistics/Counts
// @route   GET /api/ndr/statistics
// @access  Private
router.get('/statistics/counts', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const counts = {
      action_required: await Order.countDocuments({
        user_id: userId,
        'ndr_info.is_ndr': true,
        'ndr_info.resolution_action': null,
        status: 'ndr'
      }),
      action_taken: await Order.countDocuments({
        user_id: userId,
        'ndr_info.is_ndr': true,
        'ndr_info.resolution_action': { $ne: null },
        status: 'ndr'
      }),
      delivered: await Order.countDocuments({
        user_id: userId,
        'ndr_info.is_ndr': true,
        status: 'delivered'
      }),
      rto: await Order.countDocuments({
        user_id: userId,
        'ndr_info.is_ndr': true,
        status: { $in: ['rto', 'rto_in_transit', 'rto_delivered'] }
      })
    };

    counts.all = counts.action_required + counts.action_taken + counts.delivered + counts.rto;

    res.json({
      status: 'success',
      data: counts
    });

  } catch (error) {
    console.error('NDR statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching NDR statistics'
    });
  }
});

// @desc    Get NDR Overview Statistics
// @route   GET /api/ndr/statistics/overview
// @access  Private
router.get('/statistics/overview', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = '30' } = req.query;
    const startDate = moment().subtract(parseInt(period), 'days').startOf('day').toDate();

    const pipeline = [
      {
        $match: {
          user_id: userId,
          'ndr_info.is_ndr': true,
          'ndr_info.last_ndr_date': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$ndr_info.ndr_reason',
          count: { $sum: 1 },
          avg_attempts: { $avg: '$ndr_info.ndr_attempts' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ];

    const reasonStats = await Order.aggregate(pipeline);

    const totalNDRs = await Order.countDocuments({
      user_id: userId,
      'ndr_info.is_ndr': true,
      'ndr_info.last_ndr_date': { $gte: startDate }
    });

    res.json({
      status: 'success',
      data: {
        period_days: parseInt(period),
        total_ndrs: totalNDRs,
        reason_breakdown: reasonStats
      }
    });

  } catch (error) {
    console.error('NDR overview error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching NDR overview'
    });
  }
});

// @desc    Update customer information for NDR
// @route   PATCH /api/ndr/:id/customer-info
// @access  Private
router.patch('/:id/customer-info', auth, [
  body('updated_address').optional().trim(),
  body('updated_phone').optional().matches(/^[6-9]\d{9}$/),
  body('preferred_delivery_date').optional().isISO8601(),
  body('customer_notes').optional().trim()
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
      user_id: req.user._id,
      'ndr_info.is_ndr': true
    });

    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'NDR order not found'
      });
    }

    // Update customer information
    if (req.body.updated_address) {
      order.delivery_address.full_address = req.body.updated_address;
    }
    if (req.body.updated_phone) {
      order.customer_info.phone = req.body.updated_phone;
    }
    if (req.body.preferred_delivery_date) {
      order.ndr_info.next_attempt_date = new Date(req.body.preferred_delivery_date);
    }
    if (req.body.customer_notes) {
      order.special_instructions = req.body.customer_notes;
    }

    await order.save();

    res.json({
      status: 'success',
      message: 'Customer information updated successfully',
      data: {
        order_id: order.order_id,
        updated_fields: Object.keys(req.body)
      }
    });

  } catch (error) {
    console.error('Update customer info error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating customer information'
    });
  }
});

module.exports = router;