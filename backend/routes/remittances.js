const express = require('express');
const { query, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const Remittance = require('../models/Remittance');
const Order = require('../models/Order');
const logger = require('../utils/logger');
const XLSX = require('xlsx');

const router = express.Router();

// @desc    Get all remittances for logged-in user
// @route   GET /api/remittances
// @access  Private
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().trim(),
  query('state').optional().isIn(['upcoming', 'processing', 'settled', 'all']).withMessage('Invalid state filter'),
  query('date_from').optional().isISO8601().withMessage('Invalid date format'),
  query('date_to').optional().isISO8601().withMessage('Invalid date format')
], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = { user_id: req.user._id };

    // Search by remittance number
    if (req.query.search && req.query.search.trim()) {
      filterQuery.remittance_number = { $regex: req.query.search.trim(), $options: 'i' };
    }

    // Filter by state
    if (req.query.state && req.query.state !== 'all') {
      filterQuery.state = req.query.state;
    }

    // Filter by date range (processed_on)
    if (req.query.date_from || req.query.date_to) {
      filterQuery.processed_on = {};
      if (req.query.date_from) {
        filterQuery.processed_on.$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        const endDate = new Date(req.query.date_to);
        endDate.setHours(23, 59, 59, 999); // End of day
        filterQuery.processed_on.$lte = endDate;
      }
    }

    // Get total count
    const totalCount = await Remittance.countDocuments(filterQuery);

    // Fetch remittances
    const remittances = await Remittance.find(filterQuery)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select('-remittance_orders -account_details.account_number') // Exclude sensitive data
      .lean();

    // Format response
    const formattedRemittances = remittances.map(remittance => ({
      remittance_number: remittance.remittance_number,
      date: remittance.date,
      remittance_date: remittance.remittance_date || remittance.date,
      bank_transaction_id: remittance.bank_transaction_id || '-',
      state: remittance.state,
      total_remittance: remittance.total_remittance,
      total_orders: remittance.total_orders,
      processed_on: remittance.processed_on || remittance.date,
      settlement_date: remittance.settlement_date
    }));

    res.json({
      success: true,
      data: {
        remittances: formattedRemittances,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalCount / limit),
          total_count: totalCount,
          per_page: limit
        }
      }
    });
  } catch (error) {
    logger.error('Get remittances error', {
      userId: req.user._id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch remittances',
      error: error.message
    });
  }
});

// @desc    Get upcoming remittances for logged-in user
// @route   GET /api/remittances/upcoming
// @access  Private
router.get('/upcoming', auth, async (req, res) => {
  try {
    const upcomingRemittances = await Remittance.find({
      user_id: req.user._id,
      state: { $in: ['upcoming', 'processing'] }
    })
      .sort({ remittance_date: 1 })
      .lean();

    const summary = {
      total_amount: upcomingRemittances.reduce((sum, r) => sum + r.total_remittance, 0),
      total_orders: upcomingRemittances.reduce((sum, r) => sum + r.total_orders, 0),
      count: upcomingRemittances.length,
      remittances: upcomingRemittances.map(r => ({
        remittance_number: r.remittance_number,
        remittance_date: r.remittance_date || r.date,
        state: r.state,
        total_remittance: r.total_remittance,
        total_orders: r.total_orders
      }))
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('Get upcoming remittances error', {
      userId: req.user._id,
      error: error.message
    });
    res.status(500).json({ success: false, message: 'Failed to fetch upcoming remittances', error: error.message });
  }
});

// @desc    Get remittance details by remittance number
// @route   GET /api/remittances/:remittanceNumber
// @access  Private
router.get('/:remittanceNumber', auth, [
  param('remittanceNumber').notEmpty().withMessage('Remittance number is required')
], async (req, res) => {
  try {
    const { remittanceNumber } = req.params;

    const remittance = await Remittance.findOne({
      remittance_number: remittanceNumber,
      user_id: req.user._id
    }).populate('remittance_orders.order_reference', 'order_id reference_id')
      .lean();

    if (!remittance) {
      return res.status(404).json({
        success: false,
        message: 'Remittance not found'
      });
    }

    // Format response
    const formattedRemittance = {
      remittance_number: remittance.remittance_number,
      date: remittance.date,
      remittance_date: remittance.remittance_date || remittance.date,
      processed_on: remittance.processed_on || remittance.date,
      bank_transaction_id: remittance.bank_transaction_id,
      state: remittance.state,
      total_remittance: remittance.total_remittance,
      total_orders: remittance.total_orders,
      settlement_date: remittance.settlement_date,
      account_details: {
        bank: remittance.account_details?.bank || '',
        beneficiary_name: remittance.account_details?.beneficiary_name || '',
        account_number: remittance.account_details?.account_number ?
          `XXXXXXXXXX${remittance.account_details.account_number.slice(-4)}` : '',
        ifsc_code: remittance.account_details?.ifsc_code || ''
      },
      remittance_orders: remittance.remittance_orders.map(order => ({
        awb_number: order.awb_number,
        amount_collected: order.amount_collected,
        order_id: order.order_reference?.order_id || order.order_id || '',
        delivered_date: order.delivered_date
      }))
    };

    res.json({
      success: true,
      data: formattedRemittance
    });
  } catch (error) {
    logger.error('Get remittance detail error', {
      userId: req.user._id,
      remittanceNumber: req.params.remittanceNumber,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch remittance details',
      error: error.message
    });
  }
});

// @desc    Download AWB data for a remittance
// @route   GET /api/remittances/:remittanceNumber/download
// @access  Private
router.get('/:remittanceNumber/download', auth, [
  param('remittanceNumber').notEmpty().withMessage('Remittance number is required')
], async (req, res) => {
  try {
    const { remittanceNumber } = req.params;

    const remittance = await Remittance.findOne({
      remittance_number: remittanceNumber,
      user_id: req.user._id
    }).populate('remittance_orders.order_reference', 'order_id reference_id customer_info')
      .lean();

    if (!remittance) {
      return res.status(404).json({
        success: false,
        message: 'Remittance not found'
      });
    }

    // Prepare data for download
    const downloadData = remittance.remittance_orders.map(order => ({
      'AWB NUMBER': order.awb_number,
      'AMOUNT COLLECTED': order.amount_collected,
      'ORDER ID': order.order_reference?.order_id || order.order_id || ''
    }));

    // Create Excel workbook
    const worksheet = XLSX.utils.json_to_sheet(downloadData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AWB Data');

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Remittance_${remittanceNumber}_AWB_Data.xlsx"`);
    res.setHeader('Content-Length', excelBuffer.length);

    res.send(excelBuffer);
  } catch (error) {
    logger.error('Download AWB data error', {
      userId: req.user._id,
      remittanceNumber: req.params.remittanceNumber,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to download AWB data',
      error: error.message
    });
  }
});

module.exports = router;

