// Location: backend/routes/webhooks.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

const { webhookAuth } = require('../middleware/webhookAuth');
const { validateScanPush, validateEPOD, validateSorterImage, validateQCImage } = require('../middleware/webhookValidation');
const webhookService = require('../services/webhookService');
const webhookQueue = require('../utils/webhookQueue');
const logger = require('../utils/logger');

// ============================================
// NEW DELHIVERY B2C WEBHOOKS (v1)
// ============================================

/**
 * Scan Push Webhook - Real-time shipment status updates
 * Endpoint: POST /api/v1/webhooks/delhivery/scan-status
 */
router.post('/v1/delhivery/scan-status', webhookAuth, validateScanPush, async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info('📥 Scan push webhook received', {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      payloadSize: JSON.stringify(req.body).length,
      waybill: req.body.Shipment?.AWB
    });

    // Queue webhook for processing (production-level async handling)
    const jobId = await webhookQueue.enqueue('scan-status', req.body, {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      receivedAt: new Date()
    });

    const responseTime = Date.now() - startTime;
    
    // Respond immediately (< 300ms target)
    res.status(200).json({
      status: 'success',
      message: 'Webhook received',
      requestId,
      queued: true,
      jobId
    });

    logger.info('✅ Scan push webhook queued', {
      requestId,
      jobId,
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    logger.error('❌ Scan push webhook error', {
      requestId,
      error: error.message,
      stack: error.stack
    });

    // Still return 200 OK to prevent Delhivery retries
    res.status(200).json({
      status: 'success',
      message: 'Webhook received (processing error logged)',
      requestId
    });
  }
});

/**
 * EPOD Webhook - Electronic Proof of Delivery
 * Endpoint: POST /api/v1/webhooks/delhivery/epod
 */
router.post('/v1/delhivery/epod', webhookAuth, validateEPOD, async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info('📥 EPOD webhook received', {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      waybill: req.body.waybill
    });

    // Queue webhook for processing
    const jobId = await webhookQueue.enqueue('epod', req.body, {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      receivedAt: new Date()
    });

    const responseTime = Date.now() - startTime;

    // Respond immediately
    res.status(200).json({
      status: 'success',
      message: 'EPOD received',
      requestId,
      queued: true,
      jobId
    });

    logger.info('✅ EPOD webhook queued', {
      requestId,
      jobId,
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    logger.error('❌ EPOD webhook error', {
      requestId,
      error: error.message,
      stack: error.stack
    });

    res.status(200).json({
      status: 'success',
      message: 'EPOD received (processing error logged)',
      requestId
    });
  }
});

/**
 * Sorter Image Webhook - Warehouse sorting images
 * Endpoint: POST /api/v1/webhooks/delhivery/sorter-image
 */
router.post('/v1/delhivery/sorter-image', webhookAuth, validateSorterImage, async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info('📥 Sorter image webhook received', {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      waybill: req.body.Waybill
    });

    // Queue webhook for processing
    const jobId = await webhookQueue.enqueue('sorter-image', req.body, {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      receivedAt: new Date()
    });

    const responseTime = Date.now() - startTime;

    // Respond immediately
    res.status(200).json({
      status: 'success',
      message: 'Sorter image received',
      requestId,
      queued: true,
      jobId
    });

    logger.info('✅ Sorter image webhook queued', {
      requestId,
      jobId,
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    logger.error('❌ Sorter image webhook error', {
      requestId,
      error: error.message,
      stack: error.stack
    });

    res.status(200).json({
      status: 'success',
      message: 'Sorter image received (processing error logged)',
      requestId
    });
  }
});

/**
 * QC Image Webhook - Quality check images
 * Endpoint: POST /api/v1/webhooks/delhivery/qc-image
 */
router.post('/v1/delhivery/qc-image', webhookAuth, validateQCImage, async (req, res) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info('📥 QC image webhook received', {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      waybill: req.body.waybillId
    });

    // Queue webhook for processing
    const jobId = await webhookQueue.enqueue('qc-image', req.body, {
      requestId,
      ip: req.webhookMetadata?.clientIP,
      receivedAt: new Date()
    });

    const responseTime = Date.now() - startTime;

    // Respond immediately
    res.status(200).json({
      status: 'success',
      message: 'QC image received',
      requestId,
      queued: true,
      jobId
    });

    logger.info('✅ QC image webhook queued', {
      requestId,
      jobId,
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    logger.error('❌ QC image webhook error', {
      requestId,
      error: error.message,
      stack: error.stack
    });

    res.status(200).json({
      status: 'success',
      message: 'QC image received (processing error logged)',
      requestId
    });
  }
});

router.post('/delhivery/cod-remittance', async (req, res) => {
    try {
        const { waybill, cod_amount, remittance_date, utr_number } = req.body;

        const order = await Order.findOne({
            'delhivery_data.waybill': waybill
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        order.payment_info.cod_remitted = true;
        order.payment_info.cod_remittance_date = new Date(remittance_date);
        order.payment_info.cod_utr_number = utr_number;
        order.payment_info.cod_remitted_amount = cod_amount;

        await order.save();

        console.log(`COD remittance updated for order ${order.order_id}: ${cod_amount}`);

        res.json({
            success: true,
            message: 'COD remittance updated successfully'
        });

    } catch (error) {
        console.error('COD remittance webhook error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    const queueStats = webhookQueue.getStats();
    
    res.json({
        success: true,
        message: 'Webhook endpoints are healthy',
        timestamp: new Date().toISOString(),
        queue: queueStats,
        endpoints: {
            'scan-status': '/api/webhooks/v1/delhivery/scan-status',
            'epod': '/api/webhooks/v1/delhivery/epod',
            'sorter-image': '/api/webhooks/v1/delhivery/sorter-image',
            'qc-image': '/api/webhooks/v1/delhivery/qc-image'
        }
    });
});

// Queue statistics endpoint (for monitoring)
router.get('/v1/stats', webhookAuth, (req, res) => {
    const stats = webhookQueue.getStats();
    
    res.json({
        success: true,
        stats: stats.stats,
        queueSize: stats.queueSize,
        processing: stats.processing,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
