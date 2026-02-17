// Location: backend/services/webhookService.js
const mongoose = require('mongoose');
const Order = require('../models/Order');
const TrackingOrder = require('../models/TrackingOrder');
const ShipmentTrackingEvent = require('../models/ShipmentTrackingEvent');
const ShipmentDocument = require('../models/ShipmentDocument');
const logger = require('../utils/logger');
const websocketService = require('./websocketService');

class WebhookService {
  /**
   * Map Delhivery status to internal status
   */
  /**
   * Map Delhivery status to internal status
   * Based on Delhivery B2C webhook status tables
   * StatusType: UD (Update), DL (Delivered), RT (Return), PP (Pickup), PU (Pickup Shipment), CN (Canceled)
   */
  mapDelhiveryStatus(delhiveryStatus, statusType = null) {
    // Normalize status string and type
    const normalizedStatus = String(delhiveryStatus || '').trim();
    const normalizedType = statusType ? String(statusType).trim().toUpperCase() : null;

    // IMPORTANT: Check StatusType FIRST for ambiguous statuses like "Dispatched", "Pending", "In Transit"
    // These statuses mean different things depending on whether it's forward (UD) or reverse (PP/PU) shipment

    // Handle StatusType-specific mappings first (for reverse shipments)
    if (normalizedType) {
      // PP - Pickup Request statuses (Reverse Shipment - Before physical pickup)
      if (normalizedType === 'PP') {
        const ppMapping = {
          'Open': 'pickups_manifests',      // Pickup request created in system
          'Scheduled': 'pickups_manifests', // Pickup scheduled, moved from open
          'Dispatched': 'out_for_delivery'  // Field executive out to collect package from customer
        };
        const lowerStatus = normalizedStatus.toLowerCase();
        for (const [key, value] of Object.entries(ppMapping)) {
          if (key.toLowerCase() === lowerStatus) {
            return value;
          }
        }
        // Fallback for PP type
        return 'pickups_manifests';
      }

      // PU - Pickup Shipment statuses (Reverse Shipment - After physical pickup)
      if (normalizedType === 'PU') {
        const puMapping = {
          'In Transit': 'in_transit',       // Pickup shipment in transit to RPC from DC
          'Pending': 'in_transit',          // Reached RPC but not yet dispatched for delivery
          'Dispatched': 'out_for_delivery'  // Dispatched for delivery to client from RPC
        };
        const lowerStatus = normalizedStatus.toLowerCase();
        for (const [key, value] of Object.entries(puMapping)) {
          if (key.toLowerCase() === lowerStatus) {
            return value;
          }
        }
        // Fallback for PU type
        return 'in_transit';
      }

      // RT - Return statuses (Forward shipment converted to return)
      if (normalizedType === 'RT') {
        const rtMapping = {
          'In Transit': 'rto_in_transit',   // Return shipment in transit back to origin
          'Pending': 'rto_in_transit',      // Return reached DC nearest to origin
          'Dispatched': 'rto_in_transit'    // Return dispatched for delivery to origin
        };
        const lowerStatus = normalizedStatus.toLowerCase();
        for (const [key, value] of Object.entries(rtMapping)) {
          if (key.toLowerCase() === lowerStatus) {
            return value;
          }
        }
        // Fallback for RT type
        return 'rto_in_transit';
      }

      // CN - Canceled statuses
      if (normalizedType === 'CN') {
        return 'cancelled';
      }

      // DL - Delivered statuses (both forward and reverse)
      if (normalizedType === 'DL') {
        const dlMapping = {
          'Delivered': 'delivered',  // Forward shipment delivered to customer
          'RTO': 'rto_delivered',    // Forward shipment returned to origin
          'DTO': 'delivered'         // Reverse pickup delivered to origin (client accepted)
        };
        const lowerStatus = normalizedStatus.toLowerCase();
        for (const [key, value] of Object.entries(dlMapping)) {
          if (key.toLowerCase() === lowerStatus) {
            return value;
          }
        }
        // Check if it contains 'rto'
        if (lowerStatus.includes('rto')) {
          return 'rto_delivered';
        }
        return 'delivered';
      }
    }

    // UD (Update) and general status mapping for forward shipments
    const statusMapping = {
      // UD - Update statuses (Forward Shipment)
      'Manifested': 'pickups_manifests',
      'Not Picked': 'pickups_manifests',
      'In Transit': 'in_transit',
      'Pending': 'in_transit',
      'Dispatched': 'out_for_delivery',
      'Reached at destination': 'in_transit',
      'Reached Destination City': 'in_transit',
      'Out for Delivery': 'out_for_delivery',
      'Pickup Exception': 'pickups_manifests',

      // DL - Delivered statuses
      'Delivered': 'delivered',
      'DTO': 'delivered',

      // RT - Return statuses
      'RTO': 'rto_in_transit',
      'RTO Initiated': 'rto_in_transit',
      'RTO Delivered': 'rto_delivered',

      // NDR statuses (Undelivered reasons)
      'Undelivered': 'ndr',
      'Customer not available': 'ndr',
      'Customer refused': 'ndr',
      'Incomplete address': 'ndr',
      'Cash not ready': 'ndr',
      'Consignee not available': 'ndr',
      'Delivery attempted': 'ndr',

      // PP - Pickup Request statuses (fallback if no statusType)
      'Open': 'pickups_manifests',
      'Scheduled': 'pickups_manifests',

      // CN - Canceled statuses
      'Canceled': 'cancelled',
      'Cancelled': 'cancelled',
      'Closed': 'cancelled',

      // Other statuses
      'Lost': 'lost',
      'Damaged': 'lost'
    };

    // Try exact match
    if (statusMapping[normalizedStatus]) {
      return statusMapping[normalizedStatus];
    }

    // Try case-insensitive match
    const lowerStatus = normalizedStatus.toLowerCase();
    for (const [key, value] of Object.entries(statusMapping)) {
      if (key.toLowerCase() === lowerStatus) {
        return value;
      }
    }

    // Use StatusType as final fallback
    if (normalizedType) {
      switch (normalizedType) {
        case 'UD':
          return 'in_transit';
        case 'DL':
          return 'delivered';
        case 'RT':
          return 'rto_in_transit';
        case 'PP':
          return 'pickups_manifests';
        case 'PU':
          return 'in_transit';
        case 'CN':
          return 'cancelled';
      }
    }

    // Final fallback
    logger.warn('⚠️ Unknown status, defaulting to in_transit', {
      status: normalizedStatus,
      statusType: statusType
    });
    return 'in_transit';
  }

  /**
   * Process Scan Push Webhook with transaction support
   */
  async processScanPushWebhook(payload) {
    const startTime = Date.now();
    
    try {
      const shipment = payload.Shipment;
      if (!shipment) {
        throw new Error('Invalid payload: Shipment data missing');
      }

      const statusData = shipment.Status;
      const waybill = shipment.AWB;
      const referenceNo = shipment.ReferenceNo || null;

      if (!waybill) {
        throw new Error('Invalid payload: AWB/Waybill missing');
      }

      logger.info('📦 Processing scan push webhook', {
        waybill,
        referenceNo,
        status: statusData?.Status,
        statusType: statusData?.StatusType
      });

      // Check if event already exists (prevent duplicates) - BEFORE transaction
      const existingEvent = await ShipmentTrackingEvent.eventExists(
        waybill,
        statusData?.Status,
        statusData?.StatusDateTime ? new Date(statusData.StatusDateTime) : new Date()
      );

      if (existingEvent) {
        logger.info('⚠️ Duplicate webhook event ignored', {
          waybill,
          status: statusData?.Status,
          eventId: existingEvent._id
        });
        return {
          success: true,
          message: 'Event already processed',
          duplicate: true,
          waybill
        };
      }

      // Use transaction for data consistency
      const session = await mongoose.startSession();
      let result;
      
      try {
        await session.withTransaction(async () => {
          // Save tracking event
          const trackingEvent = new ShipmentTrackingEvent({
            waybill,
            order_id: referenceNo,
            reference_no: referenceNo,
            status: statusData?.Status || 'Unknown',
            status_type: statusData?.StatusType || '',
            status_date_time: statusData?.StatusDateTime ? new Date(statusData.StatusDateTime) : new Date(),
            status_location: statusData?.StatusLocation || '',
            instructions: statusData?.Instructions || '',
            nsl_code: shipment.NSLCode || '',
            sort_code: shipment.Sortcode || '',
            pickup_date: shipment.PickUpDate ? new Date(shipment.PickUpDate) : null,
            raw_payload: payload
          });

          try {
            await trackingEvent.save({ session });
          } catch (saveError) {
            // Handle duplicate key error from unique compound index
            if (saveError.code === 11000) {
              logger.info('⚠️ Duplicate webhook event caught by index', {
                waybill,
                status: statusData?.Status,
                statusDateTime: statusData?.StatusDateTime
              });
              return {
                success: true,
                message: 'Event already processed (index dedup)',
                duplicate: true,
                waybill
              };
            }
            throw saveError;
          }

          // Find and update order if exists
          let order = null;
          if (referenceNo) {
            order = await Order.findOne({ order_id: referenceNo }).session(session);
          }
          
          if (!order && waybill) {
            order = await Order.findOne({ 'delhivery_data.waybill': waybill }).session(session);
          }

          if (order) {
            // Map status using both Status and StatusType for accurate mapping
            const mappedStatus = this.mapDelhiveryStatus(
              statusData?.Status || '', 
              statusData?.StatusType || null
            );
            
            // Prevent backward transitions from terminal states (late/out-of-order webhooks)
            const TERMINAL_STATUSES = ['delivered', 'rto_delivered', 'cancelled'];
            const isTerminal = TERMINAL_STATUSES.includes(order.status);

            if (isTerminal && order.status !== mappedStatus) {
              logger.warn('⚠️ Skipping status update — order in terminal state', {
                orderId: order.order_id,
                waybill,
                currentStatus: order.status,
                attemptedStatus: mappedStatus,
                webhookStatus: statusData?.Status
              });
            }

            // Update order status if changed and not in terminal state
            if (!isTerminal && order.status !== mappedStatus) {
              const oldStatus = order.status;
              order.status = mappedStatus;

              // Add to status history
              if (!order.status_history) {
                order.status_history = [];
              }
              
              order.status_history.push({
                status: mappedStatus,
                timestamp: new Date(),
                location: statusData?.StatusLocation || '',
                remarks: statusData?.Instructions || `Status updated via webhook: ${statusData?.Status}`
              });

              // Update specific dates based on status
              if (mappedStatus === 'delivered') {
                order.delivered_date = new Date();
              }

              // Handle NDR — populate Order.ndr_info when delivery fails
              if (mappedStatus === 'ndr') {
                if (!order.ndr_info) {
                  order.ndr_info = {};
                }
                order.ndr_info.is_ndr = true;
                order.ndr_info.ndr_attempts = (order.ndr_info.ndr_attempts || 0) + 1;
                order.ndr_info.last_ndr_date = new Date();
                order.ndr_info.ndr_reason = statusData?.Instructions || statusData?.Status || 'Delivery failed';
                if (shipment.NSLCode) {
                  order.ndr_info.nsl_code = shipment.NSLCode;
                }
                order.ndr_info.next_attempt_date = order.ndr_info.ndr_attempts < 3
                  ? new Date(Date.now() + 24 * 60 * 60 * 1000) // next day
                  : null;
                // Reset resolution_action so it shows in "Action Required" tab
                order.ndr_info.resolution_action = null;
                if (!order.ndr_info.action_history) {
                  order.ndr_info.action_history = [];
                }

                logger.info('📋 NDR detected — Order.ndr_info updated', {
                  orderId: order.order_id,
                  waybill,
                  nslCode: shipment.NSLCode,
                  attempts: order.ndr_info.ndr_attempts,
                  reason: order.ndr_info.ndr_reason
                });
              }

              // Handle RTO In Transit — shipment returning to origin
              if (mappedStatus === 'rto_in_transit') {
                if (order.ndr_info) {
                  order.ndr_info.is_ndr = false;
                }
                logger.info('📦 RTO In Transit — shipment returning to origin', {
                  orderId: order.order_id,
                  waybill
                });
              }

              // Handle RTO Delivered — shipment returned to seller
              if (mappedStatus === 'rto_delivered') {
                order.rto_delivered_date = new Date();
                if (order.ndr_info) {
                  order.ndr_info.is_ndr = false;
                }
                logger.info('📦 RTO Delivered — shipment returned to seller', {
                  orderId: order.order_id,
                  waybill
                });
              }

              // Handle Cancelled — courier-initiated cancellation
              if (mappedStatus === 'cancelled') {
                if (!order.delhivery_data) {
                  order.delhivery_data = {};
                }
                order.delhivery_data.cancellation_status = 'cancelled';
                order.delhivery_data.cancellation_date = new Date();
                order.delhivery_data.cancellation_message = statusData?.Instructions || 'Cancelled by courier';
                logger.info('🚫 Order cancelled via webhook', {
                  orderId: order.order_id,
                  waybill,
                  reason: statusData?.Instructions
                });
              }

              // Handle Lost
              if (mappedStatus === 'lost') {
                logger.info('⚠️ Order marked as lost', {
                  orderId: order.order_id,
                  waybill,
                  location: statusData?.StatusLocation
                });
              }

              // Update Delhivery data
              if (!order.delhivery_data) {
                order.delhivery_data = {};
              }
              order.delhivery_data.last_status_update = new Date();
              order.delhivery_data.current_status = statusData?.Status;
              order.delhivery_data.status_type = statusData?.StatusType || null;

              await order.save({ session });

              logger.info('✅ Order status updated', {
                orderId: order.order_id,
                waybill,
                oldStatus,
                newStatus: mappedStatus
              });

              // Link tracking event to order
              trackingEvent.order_ref = order._id;
              await trackingEvent.save({ session });

              // Store order reference for WebSocket (outside transaction)
              const orderUserId = order.user_id.toString();
              const orderData = {
                order_id: order.order_id,
                waybill,
                status: mappedStatus,
                old_status: oldStatus,
                location: statusData?.StatusLocation
              };

              // Emit WebSocket event after transaction completes
              setImmediate(() => {
                try {
                  websocketService.sendNotificationToClient(orderUserId, {
                    type: 'order_status_update',
                    ...orderData,
                    timestamp: new Date()
                  });
                } catch (wsError) {
                  logger.warn('WebSocket broadcast failed', { error: wsError.message });
                }
              });

              // Also update TrackingOrder if it exists (keeps both models in sync)
              const trackingOrder = await TrackingOrder.findOne({ awb_number: waybill }).session(session);
              if (trackingOrder) {
                trackingOrder.current_status = mappedStatus;
                trackingOrder.delhivery_status = statusData?.Status;
                trackingOrder.api_status = statusData?.Status;
                trackingOrder.last_tracked_at = new Date();

                // Add to tracking order's status history
                if (!trackingOrder.status_history) {
                  trackingOrder.status_history = [];
                }
                trackingOrder.status_history.push({
                  status: statusData?.Status,
                  status_type: statusData?.StatusType,
                  status_date_time: statusData?.StatusDateTime ? new Date(statusData.StatusDateTime) : new Date(),
                  status_location: statusData?.StatusLocation || '',
                  instructions: statusData?.Instructions || '',
                  tracked_at: new Date()
                });

                // Update final status flags
                if (mappedStatus === 'delivered') {
                  trackingOrder.is_delivered = true;
                  trackingOrder.is_tracking_active = false;
                  trackingOrder.delivered_at = new Date();
                  trackingOrder.delivery_location = statusData?.StatusLocation || '';
                } else if (mappedStatus === 'cancelled') {
                  trackingOrder.is_tracking_active = false;
                  trackingOrder.cancelled_at = new Date();
                } else if (mappedStatus === 'rto_in_transit' || mappedStatus === 'rto') {
                  trackingOrder.is_tracking_active = true;
                  trackingOrder.rto_at = new Date();
                } else if (mappedStatus === 'rto_delivered') {
                  trackingOrder.is_tracking_active = false;
                  trackingOrder.rto_at = trackingOrder.rto_at || new Date();
                } else if (mappedStatus === 'ndr') {
                  trackingOrder.ndr_attempts = (trackingOrder.ndr_attempts || 0) + 1;
                  trackingOrder.last_ndr_date = new Date();
                  trackingOrder.ndr_reason = statusData?.Instructions || statusData?.Status || 'Delivery failed';
                } else if (mappedStatus === 'lost') {
                  trackingOrder.is_tracking_active = false;
                }

                await trackingOrder.save({ session });

                logger.info('✅ TrackingOrder synced with webhook update', {
                  orderId: order.order_id,
                  waybill,
                  trackingOrderStatus: mappedStatus
                });
              }
            } else {
              logger.debug('Order status unchanged', {
                orderId: order.order_id,
                waybill,
                status: mappedStatus
              });
            }
          } else {
            logger.warn('⚠️ Order not found for webhook', {
              waybill,
              referenceNo
            });
          }

          // Mark event as processed
          trackingEvent.processed = true;
          await trackingEvent.save({ session });
          
          // Store result for return
          result = {
            success: true,
            waybill,
            orderUpdated: !!order
          };
        });
      } finally {
        await session.endSession();
      }

      const duration = Date.now() - startTime;
      
      logger.info('✅ Scan push webhook processed successfully', {
        waybill,
        referenceNo,
        duration: `${duration}ms`
      });

      return {
        success: true,
        message: 'Webhook processed successfully',
        waybill,
        duration
      };

    } catch (error) {
      logger.error('❌ Scan push webhook processing failed', {
        error: error.message,
        stack: error.stack,
        payload: JSON.stringify(payload).substring(0, 500)
      });

      throw error;
    }
  }

  /**
   * Process EPOD Webhook
   */
  async processEPODWebhook(payload) {
    try {
      const { waybill, EPOD, orderID } = payload;

      if (!waybill || !EPOD) {
        throw new Error('Invalid payload: waybill and EPOD are required');
      }

      logger.info('📸 Processing EPOD webhook', {
        waybill,
        orderID,
        epodLength: EPOD?.length || 0
      });

      // Check if EPOD already exists
      // Note: We'll check after uploading to compare URLs

      // Upload image to Cloudinary
      const cloudinaryService = require('./cloudinaryService');
      
      // Handle base64 with or without data URL prefix
      let base64Data = EPOD;
      if (EPOD.includes(',')) {
        base64Data = EPOD.split(',')[1]; // Remove data:image/...;base64, prefix
      }
      
      const base64Buffer = Buffer.from(base64Data, 'base64');
      
      const uploadResult = await cloudinaryService.uploadFile(base64Buffer, {
        folder: 'shipsarthi/epod',
        resource_type: 'image',
        mimetype: 'image/jpeg'
      });

      if (!uploadResult.success) {
        throw new Error('Failed to upload EPOD image');
      }

      // Check if document already exists
      const existingDoc = await ShipmentDocument.documentExists(waybill, 'epod', uploadResult.url);
      
      if (existingDoc) {
        logger.info('⚠️ EPOD already exists', {
          waybill,
          documentId: existingDoc._id
        });
        return {
          success: true,
          message: 'EPOD already exists',
          duplicate: true,
          documentId: existingDoc._id
        };
      }

      // Find order
      let order = null;
      if (orderID) {
        order = await Order.findOne({ order_id: orderID });
      }
      if (!order && waybill) {
        order = await Order.findOne({ 'delhivery_data.waybill': waybill });
      }

      // Save document
      const document = new ShipmentDocument({
        waybill,
        order_id: orderID || null,
        document_type: 'epod',
        image_url: uploadResult.url,
        image_path: uploadResult.public_id,
        cloudinary_public_id: uploadResult.public_id,
        base64_data: EPOD, // Store for reprocessing if needed
        file_size: base64Buffer.length,
        mime_type: 'image/jpeg',
        processed: true
      });

      if (order) {
        document.order_ref = order._id;
      }

      await document.save();

      // Update order with EPOD URL if order exists
      if (order) {
        if (!order.delivery_info) {
          order.delivery_info = {};
        }
        order.delivery_info.epod_url = uploadResult.url;
        order.delivery_info.epod_date = new Date();
        await order.save();

        // Emit WebSocket event
        try {
          websocketService.sendNotificationToClient(order.user_id.toString(), {
            type: 'epod_received',
            order_id: order.order_id,
            waybill,
            epod_url: uploadResult.url,
            timestamp: new Date()
          });
        } catch (wsError) {
          logger.warn('WebSocket broadcast failed', { error: wsError.message });
        }
      }

      logger.info('✅ EPOD webhook processed successfully', {
        waybill,
        orderID,
        documentId: document._id
      });

      return {
        success: true,
        message: 'EPOD processed successfully',
        waybill,
        image_url: uploadResult.url,
        documentId: document._id
      };

    } catch (error) {
      logger.error('❌ EPOD webhook processing failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Process Sorter Image Webhook
   */
  async processSorterImageWebhook(payload) {
    try {
      const { Waybill, Weight_images, doc } = payload;

      if (!Waybill || !Weight_images) {
        throw new Error('Invalid payload: Waybill and Weight_images are required');
      }

      logger.info('📸 Processing sorter image webhook', {
        waybill: Waybill,
        imageLength: Weight_images?.length || 0
      });

      // Upload image to Cloudinary
      const cloudinaryService = require('./cloudinaryService');
      
      // Handle base64 with or without data URL prefix
      let base64Data = Weight_images;
      if (Weight_images.includes(',')) {
        base64Data = Weight_images.split(',')[1];
      }
      
      const base64Buffer = Buffer.from(base64Data, 'base64');
      
      const uploadResult = await cloudinaryService.uploadFile(base64Buffer, {
        folder: 'shipsarthi/sorter-images',
        resource_type: 'image',
        mimetype: 'image/jpeg'
      });

      if (!uploadResult.success) {
        throw new Error('Failed to upload sorter image');
      }

      // Find order
      const order = await Order.findOne({ 'delhivery_data.waybill': Waybill });

      // Save document
      const document = new ShipmentDocument({
        waybill: Waybill,
        order_id: order?.order_id || null,
        document_type: 'sorter_image',
        image_url: uploadResult.url,
        image_path: uploadResult.public_id,
        cloudinary_public_id: uploadResult.public_id,
        base64_data: Weight_images,
        file_size: base64Buffer.length,
        mime_type: 'image/jpeg',
        processed: true
      });

      if (order) {
        document.order_ref = order._id;
        
        // Update order with sorter image URL
        if (!order.package_info) {
          order.package_info = {};
        }
        if (!order.package_info.weight_photo_url) {
          order.package_info.weight_photo_url = uploadResult.url;
          await order.save();
        }
      }

      await document.save();

      logger.info('✅ Sorter image webhook processed successfully', {
        waybill: Waybill,
        documentId: document._id
      });

      return {
        success: true,
        message: 'Sorter image processed successfully',
        waybill: Waybill,
        image_url: uploadResult.url,
        documentId: document._id
      };

    } catch (error) {
      logger.error('❌ Sorter image webhook processing failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Process QC Image Webhook
   */
  async processQCImageWebhook(payload) {
    try {
      const { waybillId, returnId, Image } = payload;

      if (!waybillId || !Image) {
        throw new Error('Invalid payload: waybillId and Image are required');
      }

      logger.info('📸 Processing QC image webhook', {
        waybill: waybillId,
        returnId,
        imageLength: Image?.length || 0
      });

      // Upload image to Cloudinary
      const cloudinaryService = require('./cloudinaryService');
      
      // Handle base64 with or without data URL prefix
      let base64Data = Image;
      if (Image.includes(',')) {
        base64Data = Image.split(',')[1];
      }
      
      const base64Buffer = Buffer.from(base64Data, 'base64');
      
      const uploadResult = await cloudinaryService.uploadFile(base64Buffer, {
        folder: 'shipsarthi/qc-images',
        resource_type: 'image',
        mimetype: 'image/jpeg'
      });

      if (!uploadResult.success) {
        throw new Error('Failed to upload QC image');
      }

      // Find order
      let order = null;
      if (returnId) {
        order = await Order.findOne({ order_id: returnId });
      }
      if (!order && waybillId) {
        order = await Order.findOne({ 'delhivery_data.waybill': waybillId });
      }

      // Save document
      const document = new ShipmentDocument({
        waybill: waybillId,
        order_id: returnId || null,
        return_id: returnId || null,
        document_type: 'qc_image',
        image_url: uploadResult.url,
        image_path: uploadResult.public_id,
        cloudinary_public_id: uploadResult.public_id,
        base64_data: Image,
        file_size: base64Buffer.length,
        mime_type: 'image/jpeg',
        processed: true
      });

      if (order) {
        document.order_ref = order._id;
      }

      await document.save();

      logger.info('✅ QC image webhook processed successfully', {
        waybill: waybillId,
        returnId,
        documentId: document._id
      });

      return {
        success: true,
        message: 'QC image processed successfully',
        waybill: waybillId,
        image_url: uploadResult.url,
        documentId: document._id
      };

    } catch (error) {
      logger.error('❌ QC image webhook processing failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = new WebhookService();

