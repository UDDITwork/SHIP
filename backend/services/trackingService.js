// Location: backend/services/trackingService.js
const cron = require('node-cron');
const Order = require('../models/Order');
const TrackingOrder = require('../models/TrackingOrder');
const delhiveryService = require('./delhiveryService');
const logger = require('../utils/logger');

class TrackingService {
    constructor() {
        this.isRunning = false;
        this.isTrackingInProgress = false; // Prevent overlapping executions
        this.startTracking();
    }

    /**
     * Start the tracking cron job
     */
    startTracking() {
        if (this.isRunning) {
            logger.warn('⚠️ Tracking service already running');
            return;
        }

        // Run every 6 hours (webhooks are primary, polling is fallback only)
        // Format: minute hour day month dayOfWeek
        // '0 */6 * * *' = every 6 hours at minute 0
        this.trackingJob = cron.schedule('0 */6 * * *', async () => {
            // Prevent overlapping executions
            if (this.isTrackingInProgress) {
                logger.warn('⚠️ Tracking already in progress, skipping this execution');
                return;
            }

            this.isTrackingInProgress = true;
            try {
                logger.info('🔄 Starting scheduled shipment tracking...');
                await this.trackAllShipments();
            } catch (error) {
                logger.error('❌ Error in scheduled tracking:', error);
            } finally {
                this.isTrackingInProgress = false;
            }
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata"
        });

        this.isRunning = true;
        logger.info('✅ Tracking service started - will run every 6 hours (webhooks are primary)');
    }

    /**
     * Stop the tracking cron job
     */
    stopTracking() {
        if (this.trackingJob) {
            this.trackingJob.destroy();
            this.isRunning = false;
            logger.info('🛑 Tracking service stopped');
        }
    }

    /**
     * Track all active shipments
     * Only tracks orders whose pickup request has been created and are not delivered
     */
    async trackAllShipments() {
        try {
            // Get all tracking orders with pickup requests that are active and not delivered
            const trackingOrders = await TrackingOrder.getActiveTrackingOrders();

            logger.info(`🔍 Found ${trackingOrders.length} orders with pickup requests to track`);

            if (trackingOrders.length === 0) {
                logger.info('ℹ️ No active orders to track');
                return;
            }

            let successCount = 0;
            let failureCount = 0;
            let deliveredCount = 0;
            const startTime = Date.now();

            for (const trackingOrder of trackingOrders) {
                try {
                    const result = await this.trackSingleTrackingOrder(trackingOrder);
                    
                    if (result.success) {
                        successCount++;
                        if (result.delivered) {
                            deliveredCount++;
                        }
                    } else {
                        failureCount++;
                    }
                    
                    // Add delay between requests to avoid rate limiting (reduced to 500ms for faster processing)
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    logger.error(`❌ Error tracking order ${trackingOrder.order_id}:`, error.message);
                    failureCount++;
                }
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info('✅ Completed scheduled shipment tracking', {
                total: trackingOrders.length,
                successful: successCount,
                failed: failureCount,
                delivered: deliveredCount,
                duration: `${duration}s`
            });
        } catch (error) {
            logger.error('❌ Error in trackAllShipments:', error);
        }
    }

    /**
     * Track a single tracking order (new method using TrackingOrder model)
     * Extracts status from Delhivery API response and updates tracking order
     */
    async trackSingleTrackingOrder(trackingOrder) {
        const awbNumber = trackingOrder.awb_number;
        const orderId = trackingOrder.order_id;
        
        if (!awbNumber) {
            logger.warn('⚠️ No AWB number found for tracking order', {
                orderId: orderId
            });
            return { success: false, error: 'No AWB number' };
        }
        
        try {
            logger.info('🔍 Tracking shipment', {
                orderId: orderId,
                awb: awbNumber,
                currentStatus: trackingOrder.current_status
            });

            // Track with Delhivery API
            const trackingResult = await delhiveryService.trackShipment(awbNumber, trackingOrder.reference_id || '');
            
            if (trackingResult.success && trackingResult.data) {
                const apiResponse = trackingResult.data;
                
                // Extract status from API response
                // Format: Status.Status or ShipmentData[0].Status.Status
                const extractedStatus = this.extractStatusFromResponse(apiResponse);
                
                // Update tracking order
                trackingOrder.last_tracked_at = new Date();
                trackingOrder.last_tracking_response = apiResponse;
                trackingOrder.tracking_count = (trackingOrder.tracking_count || 0) + 1;
                
                // Store raw status from API
                if (extractedStatus.apiStatus) {
                    trackingOrder.api_status = extractedStatus.apiStatus;
                    trackingOrder.delhivery_status = extractedStatus.apiStatus;
                }
                
                // Process ShipmentData if available
                if (apiResponse.ShipmentData && Array.isArray(apiResponse.ShipmentData) && apiResponse.ShipmentData.length > 0) {
                    const shipmentData = apiResponse.ShipmentData[0];
                    
                    // Extract status from Shipment.Status (PRIMARY STATUS FIELD)
                    // Path: ShipmentData[0].Shipment.Status.Status
                    if (shipmentData.Shipment && shipmentData.Shipment.Status) {
                        const statusObj = shipmentData.Shipment.Status;
                        const statusValue = statusObj.Status || extractedStatus.apiStatus;
                        
                        // Log raw API status extraction
                        logger.info('🔍 Extracted status from API response', {
                            orderId: orderId,
                            awb: awbNumber,
                            rawStatusValue: statusValue,
                            statusObjKeys: Object.keys(statusObj),
                            extractedStatusApiStatus: extractedStatus.apiStatus,
                            statusPath: 'ShipmentData[0].Shipment.Status.Status'
                        });
                        
                        if (statusValue) {
                            // Store raw API status
                            trackingOrder.api_status = statusValue;
                            trackingOrder.delhivery_status = statusValue;
                            
                            // Map to internal status for classification
                            logger.debug('🔄 Starting status mapping', {
                                orderId: orderId,
                                awb: awbNumber,
                                rawApiStatus: statusValue
                            });
                            
                            const mappedStatus = this.mapDelhiveryStatus(statusValue, statusObj.StatusType || extractedStatus.statusType);
                            
                            // Log mapping result
                            if (mappedStatus) {
                                logger.info('✅ Status mapping successful', {
                                    orderId: orderId,
                                    awb: awbNumber,
                                    rawApiStatus: statusValue,
                                    mappedStatus: mappedStatus,
                                    category: this.getStatusCategory(mappedStatus)
                                });
                                
                                const oldTrackingStatus = trackingOrder.current_status;
                                const statusChanged = mappedStatus !== oldTrackingStatus;
                                
                                if (statusChanged) {
                                    trackingOrder.current_status = mappedStatus;
                                    
                                    logger.info('✅ TrackingOrder status updated', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        oldStatus: oldTrackingStatus,
                                        newStatus: mappedStatus,
                                        apiStatus: statusValue,
                                        category: this.getStatusCategory(mappedStatus)
                                    });
                                } else {
                                    logger.debug('ℹ️ TrackingOrder status unchanged', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        currentStatus: oldTrackingStatus,
                                        apiStatus: statusValue,
                                        mappedStatus: mappedStatus
                                    });
                                }
                                
                                // ALWAYS update Order model when we have a mapped status
                                // This ensures Order model stays in sync with TrackingOrder
                                // Even if TrackingOrder status didn't change, Order might be out of sync
                                logger.debug('🔄 Updating Order model status', {
                                    orderId: orderId,
                                    awb: awbNumber,
                                    mappedStatus: mappedStatus,
                                    rawApiStatus: statusValue
                                });
                                
                                const updateResult = await this.updateOrderStatus(orderId, mappedStatus, {
                                    status_location: statusObj.StatusLocation || extractedStatus.statusLocation,
                                    status_date_time: statusObj.StatusDateTime || extractedStatus.statusDateTime || new Date(),
                                    awb_number: awbNumber, // Pass AWB for fallback lookup
                                    raw_api_status: statusValue, // Pass RAW status from Delhivery API for logging
                                    api_status: extractedStatus.apiStatus // Also pass extracted API status
                                });
                                
                                if (updateResult) {
                                    logger.info('✅ Order model updated successfully', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        status: mappedStatus,
                                        rawApiStatus: statusValue
                                    });
                                } else {
                                    logger.warn('⚠️ Order model update returned false', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        status: mappedStatus,
                                        rawApiStatus: statusValue,
                                        note: 'Order may not exist or update failed - check logs above'
                                    });
                                }
                            } else {
                                // MAPPING FAILED - This is the critical issue!
                                logger.error('❌ Status mapping returned NULL - Order status will NOT be updated!', {
                                    orderId: orderId,
                                    awb: awbNumber,
                                    rawApiStatus: statusValue,
                                    normalizedStatus: String(statusValue).trim().toLowerCase(),
                                    issue: 'Status from Delhivery API could not be mapped to internal status',
                                    impact: 'Order will not appear in correct category on frontend',
                                    suggestion: 'Check mapDelhiveryStatus() function - may need to add this status variant'
                                });
                                
                                // Fallback handling: Try to intelligently guess the status
                                let fallbackStatus = null;
                                
                                // Try to infer status from raw status value
                                const lowerRawStatus = String(statusValue).trim().toLowerCase();
                                
                                // Heuristic fallback mapping
                                if (lowerRawStatus.includes('transit') || lowerRawStatus.includes('in transit')) {
                                    fallbackStatus = 'in_transit';
                                    logger.warn('⚠️ Using heuristic fallback: detected transit-related status', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        rawApiStatus: statusValue,
                                        fallbackStatus: fallbackStatus
                                    });
                                } else if (lowerRawStatus.includes('deliver')) {
                                    fallbackStatus = 'delivered';
                                    logger.warn('⚠️ Using heuristic fallback: detected delivery-related status', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        rawApiStatus: statusValue,
                                        fallbackStatus: fallbackStatus
                                    });
                                } else if (lowerRawStatus.includes('out for delivery') || lowerRawStatus.includes('ofd')) {
                                    fallbackStatus = 'out_for_delivery';
                                    logger.warn('⚠️ Using heuristic fallback: detected out for delivery status', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        rawApiStatus: statusValue,
                                        fallbackStatus: fallbackStatus
                                    });
                                } else {
                                    // Last resort: keep existing status or use safe default
                                    fallbackStatus = trackingOrder.current_status || 'pickups_manifests';
                                    logger.warn('⚠️ Using existing/default status as fallback', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        fallbackStatus: fallbackStatus,
                                        rawApiStatus: statusValue,
                                        note: 'Could not map status - keeping existing status to avoid breaking order flow'
                                    });
                                }
                                
                                // If we have a fallback status, try to update (but log it as a fallback)
                                if (fallbackStatus) {
                                    logger.info('🔄 Attempting to update with fallback status', {
                                        orderId: orderId,
                                        awb: awbNumber,
                                        fallbackStatus: fallbackStatus,
                                        rawApiStatus: statusValue,
                                        note: 'This is a fallback - consider adding proper mapping for this status'
                                    });
                                    
                                    const fallbackUpdateResult = await this.updateOrderStatus(orderId, fallbackStatus, {
                                        status_location: statusObj.StatusLocation || extractedStatus.statusLocation,
                                        status_date_time: statusObj.StatusDateTime || extractedStatus.statusDateTime || new Date(),
                                        awb_number: awbNumber,
                                        raw_api_status: statusValue,
                                        api_status: extractedStatus.apiStatus,
                                        is_fallback: true // Mark as fallback update
                                    });
                                    
                                    if (fallbackUpdateResult) {
                                        logger.warn('⚠️ Order updated with fallback status (action required)', {
                                            orderId: orderId,
                                            awb: awbNumber,
                                            fallbackStatus: fallbackStatus,
                                            rawApiStatus: statusValue,
                                            action: 'Please add proper mapping for this status in mapDelhiveryStatus()'
                                        });
                                    }
                                }
                            }
                            
                            // Add to status history
                            trackingOrder.addStatusToHistory({
                                status: statusValue,
                                status_type: statusObj.StatusType || extractedStatus.statusType,
                                status_date_time: statusObj.StatusDateTime || extractedStatus.statusDateTime || new Date(),
                                status_location: statusObj.StatusLocation || extractedStatus.statusLocation,
                                instructions: statusObj.Instructions,
                                nsl_code: null, // Not in Status object
                                sort_code: null, // Not in Status object
                                raw_data: {
                                    Status: statusObj,
                                    Shipment: shipmentData.Shipment
                                }
                            });
                            
                            // Check if we should stop tracking (final statuses)
                            if (this.shouldStopTracking(mappedStatus)) {
                                if (mappedStatus === 'delivered' && !trackingOrder.is_delivered) {
                                    // Mark as delivered and stop tracking
                                    await trackingOrder.markAsDelivered({
                                        delivered_at: new Date(statusObj.StatusDateTime || extractedStatus.statusDateTime || new Date()),
                                        delivered_by: statusObj.RecievedBy || '',
                                        delivery_location: statusObj.StatusLocation || extractedStatus.statusLocation
                                    });
                                    
                                    // Update main Order model
                                    await this.updateOrderStatus(orderId, 'delivered', {
                                        delivered_at: trackingOrder.delivered_at,
                                        delivered_by: trackingOrder.delivered_by,
                                        delivery_location: trackingOrder.delivery_location
                                    });
                                    
                                    logger.info('✅ Order marked as delivered - tracking stopped', {
                                        orderId: orderId,
                                        awb: awbNumber
                                    });
                                    
                                    return { success: true, delivered: true, status: mappedStatus };
                                }
                                
                                if (mappedStatus === 'cancelled' && trackingOrder.current_status !== 'cancelled') {
                                    await trackingOrder.markAsCancelled({
                                        cancelled_at: new Date(statusObj.StatusDateTime || new Date()),
                                        reason: 'Cancelled via tracking API'
                                    });
                                    await this.updateOrderStatus(orderId, 'cancelled');
                                    return { success: true, cancelled: true, status: mappedStatus };
                                }
                                
                                if (mappedStatus === 'rto' && trackingOrder.current_status !== 'rto') {
                                    await trackingOrder.markAsRTO({
                                        rto_at: new Date(statusObj.StatusDateTime || new Date()),
                                        reason: 'RTO via tracking API'
                                    });
                                    await this.updateOrderStatus(orderId, 'rto');
                                    return { success: true, rto: true, status: mappedStatus };
                                }
                                
                                if (mappedStatus === 'lost' && trackingOrder.current_status !== 'lost') {
                                    trackingOrder.is_tracking_active = false;
                                    trackingOrder.current_status = 'lost';
                                    await trackingOrder.save();
                                    await this.updateOrderStatus(orderId, 'lost');
                                    return { success: true, lost: true, status: mappedStatus };
                                }
                            }
                        }
                    }
                }
                
                await trackingOrder.save();
                
                return { success: true, delivered: false };
                
            } else {
                // Handle tracking failures
                const errorType = trackingResult.errorType || 'UNKNOWN_ERROR';
                const errorMessage = trackingResult.error || 'Unknown tracking error';
                
                logger.warn('⚠️ Failed to track order', {
                    orderId: orderId,
                    awb: awbNumber,
                    errorType: errorType,
                    errorMessage: errorMessage,
                    statusCode: trackingResult.statusCode
                });

                // Update tracking failure info
                trackingOrder.tracking_failures = trackingOrder.tracking_failures || [];
                trackingOrder.tracking_failures.push({
                    timestamp: new Date(),
                    error: errorMessage,
                    error_type: errorType,
                    status_code: trackingResult.statusCode
                });

                // Keep only last 10 failures
                if (trackingOrder.tracking_failures.length > 10) {
                    trackingOrder.tracking_failures = trackingOrder.tracking_failures.slice(-10);
                }

                await trackingOrder.save();

                return { success: false, error: errorMessage };
            }
        } catch (error) {
            logger.error('❌ Error tracking order', {
                orderId: orderId,
                awb: awbNumber,
                error: error.message,
                stack: error.stack
            });

            // Update tracking failure info
            trackingOrder.tracking_failures = trackingOrder.tracking_failures || [];
            trackingOrder.tracking_failures.push({
                timestamp: new Date(),
                error: error.message,
                error_type: 'SYSTEM_ERROR',
                status_code: null
            });

            // Keep only last 10 failures
            if (trackingOrder.tracking_failures.length > 10) {
                trackingOrder.tracking_failures = trackingOrder.tracking_failures.slice(-10);
            }

            await trackingOrder.save();
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Track a single shipment (legacy method - kept for backward compatibility)
     */
    async trackSingleShipment(order) {
        const waybill = order.delhivery_data?.waybill;
        
        if (!waybill) {
            logger.warn('⚠️ No waybill found for order', {
                orderId: order.order_id,
                delhiveryData: order.delhivery_data
            });
            return;
        }
        
        // Check if pickup request exists - if yes, use TrackingOrder model
        if (order.delhivery_data?.pickup_request_id) {
            try {
                let trackingOrder = await TrackingOrder.findOne({ order_id: order.order_id });
                
                if (!trackingOrder) {
                    // Create tracking order from order
                    trackingOrder = await TrackingOrder.createFromOrder(order);
                }
                
                return await this.trackSingleTrackingOrder(trackingOrder);
            } catch (error) {
                logger.error('❌ Error creating/updating tracking order:', error);
            }
        }
        
        // Fallback to old method if no pickup request
        try {
            logger.info('🔍 Tracking shipment (legacy method)', {
                orderId: order.order_id,
                waybill: waybill,
                currentStatus: order.status
            });

            const trackingResult = await delhiveryService.trackShipment(waybill);
            
            if (trackingResult.success && trackingResult.data) {
                const trackingData = trackingResult.data;
                const extractedStatus = this.extractStatusFromResponse(trackingData);
                const newStatus = this.mapDelhiveryStatus(extractedStatus.apiStatus, extractedStatus.statusType);
                const oldStatus = order.status;
                
                if (newStatus && newStatus !== oldStatus) {
                    order.status = newStatus;
                    
                    order.status_history = order.status_history || [];
                    order.status_history.push({
                        status: newStatus,
                        timestamp: new Date(),
                        comment: `Status updated via tracking: ${extractedStatus.apiStatus}`,
                        location: trackingData.location || '',
                        source: 'delhivery_tracking'
                    });
                    
                    if (newStatus === 'delivered') {
                        order.delivered_date = new Date();
                    }
                    
                    order.delhivery_data.tracking_data = trackingData;
                    order.delhivery_data.last_tracked = new Date();
                    
                    await order.save();
                    
                    logger.info('✅ Order status updated', {
                        orderId: order.order_id,
                        waybill: waybill,
                        oldStatus: oldStatus,
                        newStatus: newStatus
                    });
                }
            }
        } catch (error) {
            logger.error('❌ Error tracking order', {
                orderId: order.order_id,
                waybill: waybill,
                error: error.message
            });
        }
    }

    /**
     * Extract status from Delhivery API response
     * Primary path: ShipmentData[0].Shipment.Status.Status
     * This is the main status field that determines order classification
     */
    extractStatusFromResponse(apiResponse) {
        let apiStatus = null;
        let statusType = null;
        let statusLocation = null;
        let statusDateTime = null;
        let extractionPath = null;
        
        logger.debug('🔍 Extracting status from API response', {
            hasShipmentData: !!(apiResponse.ShipmentData && Array.isArray(apiResponse.ShipmentData)),
            shipmentDataLength: apiResponse.ShipmentData ? apiResponse.ShipmentData.length : 0,
            hasRootStatus: !!apiResponse.Status,
            responseKeys: Object.keys(apiResponse)
        });
        
        // Primary extraction path: ShipmentData[0].Shipment.Status.Status
        if (apiResponse.ShipmentData && Array.isArray(apiResponse.ShipmentData) && apiResponse.ShipmentData.length > 0) {
            const shipmentData = apiResponse.ShipmentData[0];
            
            // Extract from Shipment.Status object (PRIMARY STATUS)
            if (shipmentData.Shipment && shipmentData.Shipment.Status) {
                const statusObj = shipmentData.Shipment.Status;
                
                // Main status field - this is what we use for classification
                if (statusObj.Status) {
                    apiStatus = statusObj.Status;
                    extractionPath = 'ShipmentData[0].Shipment.Status.Status';
                    logger.debug('✅ Status extracted from primary path', {
                        path: extractionPath,
                        status: apiStatus,
                        statusType: statusObj.StatusType,
                        statusLocation: statusObj.StatusLocation
                    });
                } else if (typeof statusObj === 'string') {
                    apiStatus = statusObj;
                    extractionPath = 'ShipmentData[0].Shipment.Status (string)';
                    logger.debug('✅ Status extracted from Status object (string)', {
                        path: extractionPath,
                        status: apiStatus
                    });
                }
                
                // Additional status metadata
                statusType = statusObj.StatusType || null;
                statusLocation = statusObj.StatusLocation || null;
                statusDateTime = statusObj.StatusDateTime || null;
            }
            
            // Fallback: Check if Status is directly on shipmentData
            if (!apiStatus && shipmentData.Status) {
                if (shipmentData.Status.Status) {
                    apiStatus = shipmentData.Status.Status;
                    extractionPath = 'ShipmentData[0].Status.Status';
                    statusType = shipmentData.Status.StatusType || null;
                    statusLocation = shipmentData.Status.StatusLocation || null;
                    statusDateTime = shipmentData.Status.StatusDateTime || null;
                    logger.debug('✅ Status extracted from fallback path', {
                        path: extractionPath,
                        status: apiStatus
                    });
                } else if (typeof shipmentData.Status === 'string') {
                    apiStatus = shipmentData.Status;
                    extractionPath = 'ShipmentData[0].Status (string)';
                    logger.debug('✅ Status extracted from shipmentData.Status (string)', {
                        path: extractionPath,
                        status: apiStatus
                    });
                }
            }
        }
        
        // Fallback: Try root level Status
        if (!apiStatus && apiResponse.Status) {
            if (apiResponse.Status.Status) {
                apiStatus = apiResponse.Status.Status;
                extractionPath = 'Status.Status (root)';
                statusType = apiResponse.Status.StatusType || null;
                logger.debug('✅ Status extracted from root level', {
                    path: extractionPath,
                    status: apiStatus
                });
            } else if (typeof apiResponse.Status === 'string') {
                apiStatus = apiResponse.Status;
                extractionPath = 'Status (root, string)';
                logger.debug('✅ Status extracted from root Status (string)', {
                    path: extractionPath,
                    status: apiStatus
                });
            }
        }
        
        if (!apiStatus) {
            logger.warn('⚠️ Could not extract status from API response', {
                responseStructure: {
                    hasShipmentData: !!apiResponse.ShipmentData,
                    shipmentDataIsArray: Array.isArray(apiResponse.ShipmentData),
                    hasRootStatus: !!apiResponse.Status,
                    topLevelKeys: Object.keys(apiResponse)
                }
            });
        }
        
        return { 
            apiStatus, 
            statusType, 
            statusLocation, 
            statusDateTime,
            extractionPath
        };
    }

    /**
     * Map Delhivery status to internal status
     * Based on actual API response structure from tracking test results
     * Status values found: "Delivered", "Pending", "In Transit", "Dispatched", "Manifested"
     * 
     * Handles various formats:
     * - "In Transit" (with space, capitals) → "in_transit"
     * - "IN TRANSIT" (all caps) → "in_transit"
     * - "in transit" (lowercase) → "in_transit"
     * - "In-Transit" (hyphen) → "in_transit"
     * - "in_transit" (underscore) → "in_transit"
     */
    mapDelhiveryStatus(delhiveryStatus, statusType = null) {
        if (!delhiveryStatus) {
            logger.warn('⚠️ mapDelhiveryStatus called with null/undefined status');
            return null;
        }

        // Normalize status string (case-insensitive matching)
        // Remove extra whitespace and normalize to lowercase
        const normalizedStatus = String(delhiveryStatus).trim();
        const lowerStatus = normalizedStatus.toLowerCase();
        const normalizedType = statusType ? String(statusType).trim().toUpperCase() : null;

        // Log raw status for debugging
        logger.debug('🔄 Mapping Delhivery status', {
            rawStatus: delhiveryStatus,
            normalizedStatus: normalizedStatus,
            lowerStatus: lowerStatus,
            statusType: normalizedType
        });

        // IMPORTANT: Check StatusType FIRST for ambiguous statuses like "Dispatched", "Pending", "In Transit"
        // These statuses mean different things depending on whether it's forward (UD) or reverse (RT) shipment
        // Ported from webhookService.mapDelhiveryStatus for consistency
        if (normalizedType) {
            // PP - Pickup Request statuses
            if (normalizedType === 'PP') {
                const ppMap = { 'open': 'pickups_manifests', 'scheduled': 'pickups_manifests', 'dispatched': 'out_for_delivery' };
                if (ppMap[lowerStatus]) return ppMap[lowerStatus];
                return 'pickups_manifests';
            }

            // PU - Pickup Shipment statuses (after physical pickup)
            if (normalizedType === 'PU') {
                const puMap = { 'in transit': 'in_transit', 'pending': 'in_transit', 'dispatched': 'out_for_delivery' };
                if (puMap[lowerStatus]) return puMap[lowerStatus];
                return 'in_transit';
            }

            // RT - Return statuses (forward shipment converted to return / RTO)
            if (normalizedType === 'RT') {
                const rtMap = { 'in transit': 'rto_in_transit', 'pending': 'rto_in_transit', 'dispatched': 'rto_in_transit' };
                if (rtMap[lowerStatus]) return rtMap[lowerStatus];
                return 'rto_in_transit';
            }

            // CN - Canceled statuses
            if (normalizedType === 'CN') {
                return 'cancelled';
            }

            // DL - Delivered statuses (both forward and reverse)
            if (normalizedType === 'DL') {
                if (lowerStatus.includes('rto')) return 'rto_delivered';
                if (lowerStatus === 'dto') return 'delivered';
                return 'delivered';
            }
        }

        // Text-based mapping fallback (when StatusType is null or UD)
        const statusMap = {
            // Delivered - FINAL STATUS (stops tracking)
            'delivered': 'delivered',
            'delivered ': 'delivered', // Extra space
            
            // Out for Delivery - On the way to customer (still tracking)
            'out for delivery': 'out_for_delivery',
            'outfor delivery': 'out_for_delivery',
            'out-for-delivery': 'out_for_delivery',
            'out_for_delivery': 'out_for_delivery',
            'ofd': 'out_for_delivery',
            'out for delivery (ofd)': 'out_for_delivery',
            'out for delivery': 'out_for_delivery',
            'outfordelivery': 'out_for_delivery',
            
            // Pending - Waiting at destination facility (still tracking)
            'pending': 'in_transit',
            
            // In Transit - Shipment is moving (still tracking)
            // Handle all variations: "In Transit", "IN TRANSIT", "in transit", "In-Transit", etc.
            'in transit': 'in_transit',
            'intransit': 'in_transit',
            'in-transit': 'in_transit',
            'in_transit': 'in_transit',
            'in  transit': 'in_transit', // Double space
            'in-transit': 'in_transit', // Hyphen
            'in_transit': 'in_transit', // Underscore
            'intransit': 'in_transit', // No space
            // Common typos/variations
            'in transist': 'in_transit',
            'intranist': 'in_transit',
            
            // Dispatched - Out for delivery (still tracking)
            'dispatched': 'out_for_delivery',
            
            // Manifested - Initial status (still tracking)
            'manifested': 'pickups_manifests',
            'manifest': 'pickups_manifests',
            
            // RTO - Return to Origin (stops tracking)
            'rto': 'rto',
            'return to origin': 'rto',
            'returned': 'rto',
            'r.t.o': 'rto',
            'r.t.o.': 'rto',
            
            // Cancelled (stops tracking)
            'cancelled': 'cancelled',
            'canceled': 'cancelled',
            'cancel': 'cancelled',
            
            // NDR - Non-Delivery Report (still tracking)
            'ndr': 'ndr',
            'non-delivery report': 'ndr',
            'non delivery report': 'ndr',
            'non delivery': 'ndr',
            
            // Lost (stops tracking)
            'lost': 'lost',
            
            // Pickup/Manifest (still tracking)
            'pickup': 'pickups_manifests',
            'pickup and manifest': 'pickups_manifests',
            'pickups_manifests': 'pickups_manifests',
            'not picked': 'pickups_manifests',
            'notpicked': 'pickups_manifests',
            'not-picked': 'pickups_manifests',
            'not_picked': 'pickups_manifests',
            'ready to ship': 'ready_to_ship',
            'ready_to_ship': 'ready_to_ship'
        };
        
        // Direct lookup (case-insensitive)
        const mappedStatus = statusMap[lowerStatus] || null;
        
        if (!mappedStatus) {
            // StatusType-based final fallback (when text lookup fails but we have StatusType)
            if (normalizedType) {
                const typeFallback = { 'UD': 'in_transit', 'DL': 'delivered', 'RT': 'rto_in_transit', 'PP': 'pickups_manifests', 'PU': 'in_transit', 'CN': 'cancelled' };
                if (typeFallback[normalizedType]) {
                    logger.warn('⚠️ Text mapping failed, using StatusType fallback', {
                        rawStatus: delhiveryStatus,
                        statusType: normalizedType,
                        fallbackStatus: typeFallback[normalizedType]
                    });
                    return typeFallback[normalizedType];
                }
            }
            logger.warn('⚠️ Unmapped Delhivery status', {
                rawStatus: delhiveryStatus,
                normalizedStatus: normalizedStatus,
                lowerStatus: lowerStatus,
                statusType: normalizedType,
                suggestion: 'Status not found in mapping table - may need to add it'
            });
        } else {
            logger.debug('✅ Status mapped successfully', {
                rawStatus: delhiveryStatus,
                mappedStatus: mappedStatus,
                statusType: normalizedType
            });
        }

        return mappedStatus;
    }

    /**
     * Get status category for frontend classification
     * Returns the category section where order should be displayed
     */
    getStatusCategory(status) {
        const categoryMap = {
            'new': 'NEW',
            'ready_to_ship': 'READY_TO_SHIP',
            'pickups_manifests': 'PICKUPS_AND_MANIFESTS',
            'in_transit': 'IN_TRANSIT',
            'out_for_delivery': 'IN_TRANSIT', // Out for delivery is still in transit
            'delivered': 'DELIVERED',
            'ndr': 'NDR',
            'rto': 'RTO',
            'rto_in_transit': 'RTO',
            'rto_delivered': 'RTO',
            'cancelled': 'CANCELLED',
            'lost': 'LOST'
        };
        
        return categoryMap[status] || 'IN_TRANSIT';
    }

    /**
     * Check if order should stop tracking based on status
     * Once delivered, cancelled, RTO, or lost - stop tracking
     */
    shouldStopTracking(status) {
        const finalStatuses = ['delivered', 'cancelled', 'rto', 'rto_delivered', 'lost'];
        return finalStatuses.includes(status);
    }

    /**
     * Check if status indicates delivered
     */
    isStatusDelivered(status) {
        if (!status) return false;
        const normalized = String(status).trim().toLowerCase();
        return normalized === 'delivered';
    }

    /**
     * Check if status indicates cancelled
     */
    isStatusCancelled(status) {
        if (!status) return false;
        const normalized = String(status).trim().toLowerCase();
        return normalized === 'cancelled' || normalized === 'canceled';
    }

    /**
     * Check if status indicates RTO
     */
    isStatusRTO(status) {
        if (!status) return false;
        const normalized = String(status).trim().toUpperCase();
        return normalized === 'RTO' || normalized.includes('RETURN');
    }

    /**
     * Update main Order model status
     */
    async updateOrderStatus(orderId, status, additionalData = {}) {
        try {
            // Try finding order by order_id first
            let order = await Order.findOne({ order_id: orderId });
            
            // If not found, try finding by AWB (in case order_id doesn't match)
            if (!order && additionalData.awb_number) {
                order = await Order.findOne({
                    $or: [
                        { 'delhivery_data.waybill': additionalData.awb_number },
                        { 'shipping_info.awb_number': additionalData.awb_number }
                    ]
                });
                
                if (order) {
                    logger.info(`✅ Found order by AWB instead of order_id: ${orderId}`, {
                        found_order_id: order.order_id,
                        searched_order_id: orderId
                    });
                }
            }
            
            if (order) {
                const oldStatus = order.status;
                const rawApiStatus = additionalData.raw_api_status || additionalData.api_status || 'UNKNOWN';
                const isFallback = additionalData.is_fallback || false;
                
                // Validate status against Order model enum before updating
                const validStatuses = [
                    'new', 'ready_to_ship', 'pickups_manifests', 'in_transit',
                    'out_for_delivery', 'delivered', 'ndr', 'rto', 'rto_in_transit', 'rto_delivered', 'cancelled', 'lost'
                ];
                
                if (!validStatuses.includes(status)) {
                    logger.error('❌ Invalid status for Order model', {
                        orderId: orderId,
                        invalidStatus: status,
                        validStatuses: validStatuses,
                        rawApiStatus: rawApiStatus,
                        note: 'Status update blocked - status not in Order model enum'
                    });
                    return false;
                }
                
                // ALWAYS update status from Delhivery API (even if same)
                // This ensures database always has the latest status from API
                order.status = status;
                
                if (status === 'delivered' && additionalData.delivered_at) {
                    order.delivered_date = additionalData.delivered_at;
                }
                
                if (status === 'cancelled') {
                    order.cancelled_date = new Date();
                }
                
                // Only add to history if status actually changed
                if (oldStatus !== status) {
                    order.status_history = order.status_history || [];
                    order.status_history.push({
                        status: status,
                        timestamp: new Date(),
                        remarks: `Status updated via automated tracking (Delhivery API: ${rawApiStatus})`,
                        source: 'automated_tracking'
                    });
                }
                
                await order.save();
                
                if (oldStatus !== status) {
                    logger.info(`✅ Order status updated: ${orderId}`, {
                        oldStatus,
                        newStatus: status,
                        rawApiStatus: rawApiStatus, // Show what Delhivery API actually sent
                        mappedStatus: status, // Show what we mapped it to
                        order_id_in_db: order.order_id,
                        isFallback: isFallback,
                        ...(isFallback && { 
                            warning: 'This is a fallback update - consider adding proper mapping',
                            actionRequired: 'Add status mapping for: ' + rawApiStatus
                        })
                    });
                } else {
                    logger.debug(`ℹ️ Order ${orderId} status confirmed`, {
                        status: status,
                        rawApiStatus: rawApiStatus, // Show what Delhivery API actually sent
                        note: `Delhivery API sent "${rawApiStatus}", mapped to "${status}"`,
                        isFallback: isFallback
                    });
                }
                
                return true;
            } else {
                logger.warn(`⚠️ Order not found for order_id: ${orderId}`, {
                    searched_by: 'order_id',
                    awb_available: !!additionalData.awb_number
                });
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error updating order status for ${orderId}:`, {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    /**
     * Manually track a specific order
     */
    async trackOrderManually(orderId) {
        try {
            const order = await Order.findOne({ order_id: orderId });
            if (!order) {
                throw new Error('Order not found');
            }
            
            await this.trackSingleShipment(order);
            return { success: true, message: 'Order tracked successfully' };
        } catch (error) {
            logger.error(`❌ Manual tracking failed for order ${orderId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync a specific order by AWB number
     */
    async syncOrderByAWB(awbNumber) {
        try {
            logger.info(`🔄 Syncing order by AWB: ${awbNumber}`);
            
            // Find tracking order by AWB
            const trackingOrder = await TrackingOrder.findOne({ awb_number: awbNumber });
            
            if (!trackingOrder) {
                logger.warn(`⚠️ TrackingOrder not found for AWB: ${awbNumber}`);
                return {
                    success: false,
                    error: 'TrackingOrder not found for this AWB number'
                };
            }
            
            // Find order by order_id first, then try AWB if not found
            let order = await Order.findOne({ order_id: trackingOrder.order_id });
            
            if (!order) {
                // Try finding by AWB number as fallback
                order = await Order.findOne({
                    $or: [
                        { 'delhivery_data.waybill': awbNumber },
                        { 'shipping_info.awb_number': awbNumber }
                    ]
                });
            }
            
            if (!order) {
                logger.warn(`⚠️ Order not found for AWB: ${awbNumber}, order_id: ${trackingOrder.order_id}`);
                return {
                    success: false,
                    error: 'Order not found for this AWB number'
                };
            }
            
            // Update if status is different
            if (order.status !== trackingOrder.current_status) {
                await this.updateOrderStatus(order.order_id, trackingOrder.current_status, {
                    status_location: trackingOrder.delivery_location || trackingOrder.status_history?.[trackingOrder.status_history.length - 1]?.status_location,
                    status_date_time: trackingOrder.delivered_at || trackingOrder.last_tracked_at || new Date()
                });
                
                logger.info(`✅ Synced order by AWB ${awbNumber}: ${order.status} → ${trackingOrder.current_status}`);
                
                return {
                    success: true,
                    order_id: order.order_id,
                    old_status: order.status,
                    new_status: trackingOrder.current_status
                };
            } else {
                logger.info(`ℹ️ Order ${order.order_id} already has correct status: ${trackingOrder.current_status}`);
                return {
                    success: true,
                    order_id: order.order_id,
                    status: trackingOrder.current_status,
                    message: 'Status already synced'
                };
            }
        } catch (error) {
            logger.error(`❌ Error syncing order by AWB ${awbNumber}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Force refresh tracking for all active orders
     * This calls the Delhivery API to get fresh status and updates both TrackingOrder and Order
     */
    async forceRefreshAllOrders() {
        try {
            logger.info('🔄 Starting force refresh of all tracking orders...');

            // Step 0: Backfill — create TrackingOrders for orders with AWBs but no TrackingOrder
            try {
                const ordersWithAWBs = await Order.find({
                    'delhivery_data.waybill': { $exists: true, $ne: null },
                    status: { $nin: ['new'] }
                }).select('order_id user_id reference_id delhivery_data status').lean();

                const existingTOs = await TrackingOrder.find({}).select('order_id').lean();
                const existingSet = new Set(existingTOs.map(t => t.order_id));
                const missing = ordersWithAWBs.filter(o => o.order_id && !existingSet.has(o.order_id));

                if (missing.length > 0) {
                    logger.info(`📋 Backfilling ${missing.length} missing TrackingOrders...`);
                    let backfilled = 0;
                    for (const order of missing) {
                        try {
                            await TrackingOrder.createFromOrder(order);
                            backfilled++;
                        } catch (err) {
                            logger.warn(`Backfill skip: ${order.order_id} — ${err.message}`);
                        }
                    }
                    logger.info(`✅ Backfilled ${backfilled} TrackingOrders`);
                }
            } catch (backfillErr) {
                logger.warn('⚠️ Backfill step failed (non-critical, continuing with refresh):', backfillErr.message);
            }

            // Step 1: Get all tracking orders with AWBs (not just those with pickup_request_id)
            // Don't use .lean() - we need Mongoose documents for trackSingleTrackingOrder
            const trackingOrders = await TrackingOrder.find({
                awb_number: { $exists: true, $ne: null }
            });

            logger.info(`📊 Found ${trackingOrders.length} tracking orders to refresh`);
            
            let refreshedCount = 0;
            let errorCount = 0;
            const startTime = Date.now();
            
            for (const trackingOrder of trackingOrders) {
                try {
                    // Force track this order (calls API and updates status)
                    const result = await this.trackSingleTrackingOrder(trackingOrder);
                    
                    if (result.success) {
                        refreshedCount++;
                        logger.info(`✅ Refreshed order ${trackingOrder.order_id} (AWB: ${trackingOrder.awb_number})`);
                    } else {
                        errorCount++;
                        logger.warn(`⚠️ Failed to refresh order ${trackingOrder.order_id}: ${result.error}`);
                    }
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    logger.error(`❌ Error refreshing order ${trackingOrder.order_id}:`, error.message);
                    errorCount++;
                }
            }
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            logger.info('✅ Completed force refresh of tracking orders', {
                total: trackingOrders.length,
                refreshed: refreshedCount,
                errors: errorCount,
                duration: `${duration}s`
            });
            
            return {
                success: true,
                total: trackingOrders.length,
                refreshed: refreshedCount,
                errors: errorCount
            };
        } catch (error) {
            logger.error('❌ Error in forceRefreshAllOrders:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sync all TrackingOrder statuses to Order models
     * This fixes any existing orders that have status mismatches
     */
    async syncAllTrackingOrderStatuses() {
        try {
            logger.info('🔄 Starting sync of TrackingOrder statuses to Order models...');
            
            // Get all tracking orders (including delivered ones)
            const trackingOrders = await TrackingOrder.find({}).lean();
            
            logger.info(`📊 Found ${trackingOrders.length} tracking orders to sync`);
            
            let syncedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            
            for (const trackingOrder of trackingOrders) {
                try {
                    // Try finding order by order_id first
                    let order = await Order.findOne({ order_id: trackingOrder.order_id });
                    
                    // If not found, try finding by AWB number
                    if (!order && trackingOrder.awb_number) {
                        order = await Order.findOne({
                            $or: [
                                { 'delhivery_data.waybill': trackingOrder.awb_number },
                                { 'shipping_info.awb_number': trackingOrder.awb_number }
                            ]
                        });
                    }
                    
                    if (!order) {
                        logger.warn(`⚠️ Order not found for tracking order: ${trackingOrder.order_id}, AWB: ${trackingOrder.awb_number}`);
                        skippedCount++;
                        continue;
                    }
                    
                    // Normalize statuses for comparison
                    const orderStatus = (order.status || '').trim().toLowerCase();
                    const trackingStatus = (trackingOrder.current_status || '').trim().toLowerCase();
                    
                    // Check if TrackingOrder says it's delivered but status doesn't match
                    const shouldBeDelivered = trackingOrder.is_delivered === true;
                    const isActuallyDelivered = trackingStatus === 'delivered';
                    
                    logger.info(`🔍 Comparing statuses for order ${trackingOrder.order_id}:`, {
                        order_id: trackingOrder.order_id,
                        awb: trackingOrder.awb_number,
                        order_status: order.status,
                        tracking_status: trackingOrder.current_status,
                        tracking_is_delivered: trackingOrder.is_delivered,
                        should_be_delivered: shouldBeDelivered,
                        is_actually_delivered: isActuallyDelivered,
                        statuses_match: orderStatus === trackingStatus
                    });
                    
                    // Determine the correct status to use
                    let correctStatus = trackingOrder.current_status;
                    
                    // If TrackingOrder says it's delivered but status is wrong, fix it
                    if (shouldBeDelivered && !isActuallyDelivered) {
                        logger.warn(`⚠️ TrackingOrder ${trackingOrder.order_id} has is_delivered=true but current_status="${trackingOrder.current_status}" - fixing to "delivered"`);
                        correctStatus = 'delivered';
                        
                        // Update TrackingOrder status
                        const trackingOrderDoc = await TrackingOrder.findOne({ _id: trackingOrder._id });
                        if (trackingOrderDoc) {
                            trackingOrderDoc.current_status = 'delivered';
                            await trackingOrderDoc.save();
                        }
                    }
                    
                    // ALWAYS update Order model to match TrackingOrder status
                    // This ensures Order is always in sync, even if statuses appear to match
                    // (they might match but Order might be stale)
                    if (orderStatus !== correctStatus.toLowerCase()) {
                        await this.updateOrderStatus(order.order_id, correctStatus, {
                            status_location: trackingOrder.delivery_location || trackingOrder.status_history?.[trackingOrder.status_history.length - 1]?.status_location,
                            status_date_time: trackingOrder.delivered_at || trackingOrder.last_tracked_at || new Date()
                        });
                        
                        syncedCount++;
                        logger.info(`✅ Synced order ${trackingOrder.order_id} (AWB: ${trackingOrder.awb_number}): ${order.status} → ${correctStatus}`);
                    } else {
                        // Even if statuses match, ensure Order is updated (in case of other field changes)
                        // But don't count as "synced" if status already matches
                        logger.info(`ℹ️ Order ${trackingOrder.order_id} already has correct status: ${correctStatus}`);
                        skippedCount++;
                    }
                } catch (error) {
                    logger.error(`❌ Error syncing order ${trackingOrder.order_id}:`, error.message);
                    errorCount++;
                }
            }
            
            logger.info('✅ Completed sync of TrackingOrder statuses', {
                total: trackingOrders.length,
                synced: syncedCount,
                skipped: skippedCount,
                errors: errorCount
            });
            
            return {
                success: true,
                total: trackingOrders.length,
                synced: syncedCount,
                skipped: skippedCount,
                errors: errorCount
            };
        } catch (error) {
            logger.error('❌ Error in syncAllTrackingOrderStatuses:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get tracking service status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            nextRun: this.trackingJob ? this.trackingJob.nextDate() : null,
            service: 'Shipment Tracking Service'
        };
    }
}

// Export both the class (for testing) and an instance (for production use)
const trackingServiceInstance = new TrackingService();
module.exports = trackingServiceInstance;
module.exports.TrackingService = TrackingService; // Export class for testing
