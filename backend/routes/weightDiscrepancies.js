const express = require('express');
const { auth } = require('../middleware/auth');
const WeightDiscrepancy = require('../models/WeightDiscrepancy');

const router = express.Router();

// @desc    Get client's weight discrepancies
// @route   GET /api/weight-discrepancies
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 25, search = '', status = 'all' } = req.query;
    const userId = req.user._id;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filterQuery = {
      client_id: userId // CRITICAL: Only current client's data
    };

    // Search filter
    if (search) {
      filterQuery.$or = [
        { awb_number: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status !== 'all') {
      filterQuery.awb_status = status;
    }

    const [discrepancies, total] = await Promise.all([
      WeightDiscrepancy.find(filterQuery)
        .populate('order_id', 'order_id')
        .populate('transaction_id', 'transaction_id amount')
        .sort({ discrepancy_date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      WeightDiscrepancy.countDocuments(filterQuery)
    ]);

    // Calculate summary statistics
    const summary = await WeightDiscrepancy.aggregate([
      { $match: { client_id: userId } },
      {
        $group: {
          _id: null,
          total_discrepancies: { $sum: 1 },
          total_weight_discrepancy: { $sum: '$weight_discrepancy' },
          total_deduction: { $sum: '$deduction_amount' },
          disputes_accepted: {
            $sum: {
              $cond: [{ $eq: ['$action_taken', 'DISPUTE ACCEPTED BY COURIER'] }, 1, 0]
            }
          },
          disputes_rejected: {
            $sum: {
              $cond: [{ $eq: ['$action_taken', 'DISPUTE REJECTED BY COURIER'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const summaryData = summary[0] || {
      total_discrepancies: 0,
      total_weight_discrepancy: 0,
      total_deduction: 0,
      disputes_accepted: 0,
      disputes_rejected: 0
    };

    res.json({
      success: true,
      data: {
        discrepancies,
        summary: summaryData,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get weight discrepancies error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching weight discrepancies',
      error: error.message
    });
  }
});

// @desc    Raise dispute for a weight discrepancy
// @route   POST /api/weight-discrepancies/:id/raise-dispute
// @access  Private
router.post('/:id/raise-dispute', auth, async (req, res) => {
  try {
    const discrepancy = await WeightDiscrepancy.findOne({
      _id: req.params.id,
      client_id: req.user._id
    });

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Weight discrepancy not found'
      });
    }

    // Can only raise dispute if status is NEW
    if (discrepancy.dispute_status !== 'NEW') {
      return res.status(400).json({
        success: false,
        message: 'Dispute has already been raised for this discrepancy'
      });
    }

    // Update status to DISPUTE
    discrepancy.dispute_status = 'DISPUTE';
    discrepancy.dispute_raised_at = new Date();
    await discrepancy.save();

    res.json({
      success: true,
      message: 'Dispute raised successfully',
      data: discrepancy
    });

  } catch (error) {
    console.error('Raise dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error raising dispute',
      error: error.message
    });
  }
});

module.exports = router;

