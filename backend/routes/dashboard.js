const express = require('express');
const moment = require('moment');
const { auth } = require('../middleware/auth');
const Order = require('../models/Order');

const SupportTicket = require('../models/Support');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Dashboard Routes
 * 
 * IMPORTANT: These routes fetch ALL data directly from MongoDB.
 * Dashboard data is completely independent of WebSocket updates:
 * - Wallet balance: Fetched directly from User model (wallet_balance field)
 * - Average shipping charges: Calculated directly from Order model aggregation
 * - All metrics: Fetched directly from MongoDB collections via aggregation queries
 * 
 * These endpoints ensure dashboard data is always accurate and reflects the current database state.
 * WebSocket notifications are NOT used for dashboard data to ensure consistency.
 */

// @desc    Get dashboard overview
// @route   GET /api/dashboard/overview
// @access  Private
// @note    Fetches data directly from MongoDB - wallet balance, orders, revenue, and average shipping charges
//          All data is calculated from live database queries, not WebSocket updates
router.get('/overview', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Dashboard overview request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    date_from: req.query.date_from,
    date_to: req.query.date_to
  });

  try {
    const userId = req.user._id;
    
    // Get date range from query params or default to last 30 days
    let startDate, endDate;
    if (req.query.date_from && req.query.date_to) {
      startDate = moment(req.query.date_from).startOf('day');
      endDate = moment(req.query.date_to).endOf('day');
    } else {
      // Default to last 30 days
      endDate = moment().endOf('day');
      startDate = moment().subtract(30, 'days').startOf('day');
    }
    
    const today = moment().startOf('day');
    const yesterday = moment().subtract(1, 'day').startOf('day');
    const last30Days = moment().subtract(30, 'days').startOf('day');

    logger.debug('Dashboard overview - calculating metrics', {
      userId,
      dateRange: {
        today: today.format(),
        yesterday: yesterday.format(),
        last30Days: last30Days.format()
      }
    });

    // Build date filter for order_date
    const orderDateFilter = {
      $gte: startDate.toDate(),
      $lte: endDate.toDate()
    };

    // Get previous period for comparison (same duration before start date)
    const periodDuration = endDate.diff(startDate, 'days');
    const previousStartDate = moment(startDate).subtract(periodDuration + 1, 'days');
    const previousEndDate = moment(startDate).subtract(1, 'days').endOf('day');

    // Run all 6 queries in parallel for maximum speed
    const [rangeOrders, previousRangeOrders, rangeRevenue, previousRangeRevenue, avgShippingCost, user] = await Promise.all([
      Order.countDocuments({
        user_id: userId,
        order_date: orderDateFilter
      }),
      Order.countDocuments({
        user_id: userId,
        order_date: {
          $gte: previousStartDate.toDate(),
          $lte: previousEndDate.toDate()
        }
      }),
      Order.aggregate([
        {
          $match: {
            user_id: userId,
            order_date: orderDateFilter,
            status: { $ne: 'cancelled' }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$payment_info.order_value' }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            user_id: userId,
            order_date: {
              $gte: previousStartDate.toDate(),
              $lte: previousEndDate.toDate()
            },
            status: { $ne: 'cancelled' }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$payment_info.order_value' }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            user_id: userId,
            order_date: orderDateFilter,
            'payment_info.shipping_charges': { $gt: 0 }
          }
        },
        {
          $group: {
            _id: null,
            average: { $avg: '$payment_info.shipping_charges' }
          }
        }
      ]),
      User.findById(userId).select('wallet_balance').lean()
    ]);

    const responseData = {
      todays_orders: {
        count: rangeOrders,
        previous_count: previousRangeOrders,
        change_percentage: previousRangeOrders > 0 ?
          ((rangeOrders - previousRangeOrders) / previousRangeOrders * 100).toFixed(2) : 0
      },
      todays_revenue: {
        amount: rangeRevenue[0]?.total || 0,
        previous_amount: previousRangeRevenue[0]?.total || 0,
        change_percentage: previousRangeRevenue[0]?.total > 0 ?
          (((rangeRevenue[0]?.total || 0) - previousRangeRevenue[0]?.total) / previousRangeRevenue[0]?.total * 100).toFixed(2) : 0
      },
      average_shipping_cost: avgShippingCost[0]?.average || 0,
      wallet_balance: user?.wallet_balance || 0
    };

    const responseTime = Date.now() - startTime;
    logger.info('Dashboard overview completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      metrics: {
        rangeOrders,
        previousRangeOrders,
        rangeRevenue: rangeRevenue[0]?.total || 0,
        previousRangeRevenue: previousRangeRevenue[0]?.total || 0,
        avgShippingCost: avgShippingCost[0]?.average || 0,
        walletBalance: user?.wallet_balance || 0,
        dateFrom: startDate.format(),
        dateTo: endDate.format()
      }
    });

    res.json({
      status: 'success',
      data: responseData
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Dashboard overview error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching dashboard overview'
    });
  }
});

// @desc    Get shipment status metrics
// @route   GET /api/dashboard/shipment-status
// @access  Private
router.get('/shipment-status', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Shipment status request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip
  });

  try {
    const userId = req.user._id;

    // Get date range from query params or default to all
    let dateFilter = {};
    if (req.query.date_from && req.query.date_to) {
      const startDate = moment(req.query.date_from).startOf('day');
      const endDate = moment(req.query.date_to).endOf('day');
      dateFilter = {
        order_date: {
          $gte: startDate.toDate(),
          $lte: endDate.toDate()
        }
      };
    }

    const shipmentStats = await Order.aggregate([
      { $match: { user_id: userId, ...dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Initialize all status counts
    const statusCounts = {
      total_orders: 0,
      new_orders: 0,
      pickup_pending: 0,
      in_transit: 0,
      delivered: 0,
      ndr_pending: 0,
      rto: 0
    };

    // Map the aggregation results
    shipmentStats.forEach(stat => {
      switch (stat._id) {
        case 'new':
        case 'ready_to_ship':
          statusCounts.new_orders += stat.count;
          break;
        case 'pickup_pending':
        case 'manifested':
          statusCounts.pickup_pending += stat.count;
          break;
        case 'in_transit':
        case 'out_for_delivery':
          statusCounts.in_transit += stat.count;
          break;
        case 'delivered':
          statusCounts.delivered += stat.count;
          break;
        case 'ndr':
          statusCounts.ndr_pending += stat.count;
          break;
        case 'rto':
          statusCounts.rto += stat.count;
          break;
      }
      statusCounts.total_orders += stat.count;
    });

    const responseTime = Date.now() - startTime;
    logger.info('Shipment status completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      statusCounts
    });

    res.json({
      status: 'success',
      data: statusCounts
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Shipment status error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching shipment status'
    });
  }
});

// @desc    Get NDR status metrics
// @route   GET /api/dashboard/ndr-status
// @access  Private
router.get('/ndr-status', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('NDR status request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip
  });

  try {
    const userId = req.user._id;

    // Get date range from query params or default to all
    let dateFilter = {};
    if (req.query.date_from && req.query.date_to) {
      const startDate = moment(req.query.date_from).startOf('day');
      const endDate = moment(req.query.date_to).endOf('day');
      dateFilter = {
        created_at: {
          $gte: startDate.toDate(),
          $lte: endDate.toDate()
        }
      };
    }

    // Query Order.ndr_info (single source of truth for NDR data)
    const ndrDateFilter = {};
    if (req.query.date_from && req.query.date_to) {
      ndrDateFilter['ndr_info.last_ndr_date'] = {
        $gte: moment(req.query.date_from).startOf('day').toDate(),
        $lte: moment(req.query.date_to).endOf('day').toDate()
      };
    }

    const ndrStats = await Order.aggregate([
      {
        $match: {
          user_id: userId,
          'ndr_info.is_ndr': true,
          ...ndrDateFilter
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            resolution_action: '$ndr_info.resolution_action'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const ndrCounts = {
      total_ndr: 0,
      action_required: 0,
      action_taken: 0,
      ndr_delivered: 0,
      rto: 0
    };

    ndrStats.forEach(stat => {
      ndrCounts.total_ndr += stat.count;
      if (stat._id.status === 'delivered') {
        ndrCounts.ndr_delivered += stat.count;
      } else if (stat._id.status === 'rto') {
        ndrCounts.rto += stat.count;
      } else if (stat._id.resolution_action === null) {
        ndrCounts.action_required += stat.count;
      } else {
        ndrCounts.action_taken += stat.count;
      }
    });

    const responseTime = Date.now() - startTime;
    logger.info('NDR status completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      ndrCounts
    });

    res.json({
      status: 'success',
      data: ndrCounts
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('NDR status error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching NDR status'
    });
  }
});

// @desc    Get COD status metrics
// @route   GET /api/dashboard/cod-status
// @access  Private
router.get('/cod-status', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('COD status request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip
  });

  try {
    const userId = req.user._id;

    // Get date range from query params or default to all
    let dateFilter = {};
    if (req.query.date_from && req.query.date_to) {
      const startDate = moment(req.query.date_from).startOf('day');
      const endDate = moment(req.query.date_to).endOf('day');
      dateFilter = {
        order_date: {
          $gte: startDate.toDate(),
          $lte: endDate.toDate()
        }
      };
    }

    // Get total COD amount
    const totalCOD = await Order.aggregate([
      {
        $match: {
          user_id: userId,
          'payment_info.payment_mode': 'cod',
          'status': 'delivered',
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment_info.cod_amount' }
        }
      }
    ]);

    // Get last COD remitted
    const lastRemitted = await Transaction.findOne({
      user_id: userId,
      transaction_category: 'cod_remittance',
      status: 'completed'
    }).sort({ transaction_date: -1 }).lean();

    // Get next COD available (delivered but not remitted)
    const nextCODAvailable = await Order.aggregate([
      {
        $match: {
          user_id: userId,
          'payment_info.payment_mode': 'cod',
          'status': 'delivered',
          ...dateFilter
          // Add condition to check if not yet remitted
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment_info.cod_amount' }
        }
      }
    ]);

    const responseData = {
      total_cod: totalCOD[0]?.total || 0,
      last_cod_remitted: lastRemitted?.amount || 0,
      next_cod_available: nextCODAvailable[0]?.total || 0
    };

    const responseTime = Date.now() - startTime;
    logger.info('COD status completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      codData: responseData
    });

    res.json({
      status: 'success',
      data: responseData
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('COD status error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching COD status'
    });
  }
});

// @desc    Get wallet transactions
// @route   GET /api/dashboard/wallet-transactions
// @access  Private
router.get('/wallet-transactions', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Wallet transactions request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip,
    limit: req.query.limit
  });

  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    // Build transaction query with optional date filter
    const transactionQuery = {
      user_id: userId,
      status: 'completed'
    };

    if (req.query.date_from && req.query.date_to) {
      const startDate = moment(req.query.date_from).startOf('day');
      const endDate = moment(req.query.date_to).endOf('day');
      transactionQuery.transaction_date = {
        $gte: startDate.toDate(),
        $lte: endDate.toDate()
      };
    }

    const transactions = await Transaction.find(transactionQuery)
    .sort({ transaction_date: -1 })
    .limit(limit)
    .select('transaction_id transaction_type transaction_category amount description transaction_date balance_info.closing_balance')
    .lean();

    const responseTime = Date.now() - startTime;
    logger.info('Wallet transactions completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      transactionCount: transactions.length,
      limit
    });

    res.json({
      status: 'success',
      data: transactions
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Wallet transactions error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching wallet transactions'
    });
  }
});

// @desc    Get shipment distribution for chart
// @route   GET /api/dashboard/shipment-distribution
// @access  Private
router.get('/shipment-distribution', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Shipment distribution request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip
  });

  try {
    const userId = req.user._id;

    // Apply date filter if provided
    let dateMatch = {};
    if (req.query.date_from && req.query.date_to) {
      dateMatch = {
        order_date: {
          $gte: moment(req.query.date_from).startOf('day').toDate(),
          $lte: moment(req.query.date_to).endOf('day').toDate()
        }
      };
    }

    const distribution = await Order.aggregate([
      { $match: { user_id: userId, ...dateMatch } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Calculate total for percentages
    const total = distribution.reduce((sum, item) => sum + item.count, 0);

    const chartData = distribution.map(item => ({
      status: item.status,
      count: item.count,
      percentage: total > 0 ? ((item.count / total) * 100).toFixed(2) : 0
    }));

    const responseData = {
      distribution: chartData,
      total_orders: total
    };

    const responseTime = Date.now() - startTime;
    logger.info('Shipment distribution completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      totalOrders: total,
      distributionCount: chartData.length
    });

    res.json({
      status: 'success',
      data: responseData
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Shipment distribution error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching shipment distribution'
    });
  }
});

// @desc    Get support ticket overview
// @route   GET /api/dashboard/support-overview
// @access  Private
router.get('/support-overview', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Support overview request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip
  });

  try {
    const userId = req.user._id;

    const ticketStats = await SupportTicket.aggregate([
      { $match: { user_id: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const supportOverview = {
      open_tickets: 0,
      resolved_tickets: 0,
      closed_tickets: 0,
      total_tickets: 0
    };

    ticketStats.forEach(stat => {
      switch (stat._id) {
        case 'open':
        case 'in_progress':
          supportOverview.open_tickets += stat.count;
          break;
        case 'resolved':
          supportOverview.resolved_tickets += stat.count;
          break;
        case 'closed':
          supportOverview.closed_tickets += stat.count;
          break;
      }
      supportOverview.total_tickets += stat.count;
    });

    const responseTime = Date.now() - startTime;
    logger.info('Support overview completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      supportOverview
    });

    res.json({
      status: 'success',
      data: supportOverview
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Support overview error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching support overview'
    });
  }
});

// @desc    Get recent activity
// @route   GET /api/dashboard/recent-activity
// @access  Private
router.get('/recent-activity', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Recent activity request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip,
    limit: req.query.limit
  });

  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 5;

    // Get recent orders
    const recentOrders = await Order.find({
      user_id: userId
    })
    .sort({ created_at: -1 })
    .limit(limit)
    .select('order_id customer_info.buyer_name status created_at payment_info.order_value')
    .lean();

    // Get recent NDR orders (from Order.ndr_info — single source of truth)
    const recentNDRs = await Order.find({
      user_id: userId,
      'ndr_info.is_ndr': true
    })
    .sort({ 'ndr_info.last_ndr_date': -1 })
    .limit(limit)
    .select('order_id delhivery_data.waybill customer_info.buyer_name ndr_info.ndr_reason ndr_info.last_ndr_date ndr_info.resolution_action')
    .lean();

    // Get recent transactions
    const recentTransactions = await Transaction.find({
      user_id: userId,
      status: 'completed'
    })
    .sort({ transaction_date: -1 })
    .limit(limit)
    .select('transaction_id transaction_type amount description transaction_date')
    .lean();

    const responseData = {
      recent_orders: recentOrders,
      recent_ndrs: recentNDRs,
      recent_transactions: recentTransactions
    };

    const responseTime = Date.now() - startTime;
    logger.info('Recent activity completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      activityCounts: {
        orders: recentOrders.length,
        ndrs: recentNDRs.length,
        transactions: recentTransactions.length
      }
    });

    res.json({
      status: 'success',
      data: responseData
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Recent activity error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching recent activity'
    });
  }
});

// @desc    Get performance metrics
// @route   GET /api/dashboard/performance
// @access  Private
router.get('/performance', auth, async (req, res) => {
  const startTime = Date.now();
  logger.info('Performance metrics request started', {
    userId: req.user._id,
    email: req.user.email,
    ip: req.ip,
    period: req.query.period
  });

  try {
    const userId = req.user._id;
    const { period = '30' } = req.query; // days
    const startDate = moment().subtract(parseInt(period), 'days').startOf('day');

    logger.debug('Performance metrics - calculating stats', {
      userId,
      period: parseInt(period),
      startDate: startDate.format()
    });

    // Calculate delivery success rate
    const deliveryStats = await Order.aggregate([
      {
        $match: {
          user_id: userId,
          created_at: { $gte: startDate.toDate() }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    let totalOrders = 0;
    let deliveredOrders = 0;
    let ndrOrders = 0;
    let rtoOrders = 0;

    deliveryStats.forEach(stat => {
      totalOrders += stat.count;
      if (stat._id === 'delivered') deliveredOrders += stat.count;
      if (stat._id === 'ndr') ndrOrders += stat.count;
      if (stat._id === 'rto') rtoOrders += stat.count;
    });

    const deliverySuccessRate = totalOrders > 0 ? ((deliveredOrders / totalOrders) * 100).toFixed(2) : 0;
    const ndrRate = totalOrders > 0 ? ((ndrOrders / totalOrders) * 100).toFixed(2) : 0;
    const rtoRate = totalOrders > 0 ? ((rtoOrders / totalOrders) * 100).toFixed(2) : 0;

    // Calculate average order value
    const avgOrderValue = await Order.aggregate([
      {
        $match: {
          user_id: userId,
          created_at: { $gte: startDate.toDate() },
          'status': { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          average: { $avg: '$payment_info.order_value' }
        }
      }
    ]);

    const responseData = {
      total_orders: totalOrders,
      delivery_success_rate: parseFloat(deliverySuccessRate),
      ndr_rate: parseFloat(ndrRate),
      rto_rate: parseFloat(rtoRate),
      average_order_value: avgOrderValue[0]?.average || 0,
      period_days: parseInt(period)
    };

    const responseTime = Date.now() - startTime;
    logger.info('Performance metrics completed successfully', {
      userId,
      responseTime: `${responseTime}ms`,
      performanceData: responseData
    });

    res.json({
      status: 'success',
      data: responseData
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Performance metrics error occurred', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      responseTime: `${responseTime}ms`
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching performance metrics'
    });
  }
});

module.exports = router;