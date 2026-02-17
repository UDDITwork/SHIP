const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const delhiveryService = require('../services/delhiveryService');
const Order = require('../models/Order');
const Carrier = require('../models/Carrier');

const { body, validationResult } = require('express-validator');
const RateCardService = require('../services/rateCardService');
const logger = require('../utils/logger');

const normalizeTrackingResponse = (trackingResult, fallbackWaybill = '') => {
    if (!trackingResult) {
        return null;
    }

    const rawData = trackingResult.data ?? trackingResult;
    const candidateArrays = [
        rawData?.ShipmentData,
        rawData?.data?.ShipmentData,
        rawData?.Success?.ShipmentData,
        rawData?.success?.ShipmentData,
        rawData?.Success?.data?.ShipmentData,
        rawData?.Packages,
        rawData?.packages,
        Array.isArray(rawData) ? rawData : null
    ];

    let shipments = null;

    for (const candidate of candidateArrays) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            shipments = candidate;
            break;
        }
    }

    if (!shipments) {
        if (rawData && typeof rawData === 'object' && rawData.AWB) {
            shipments = [rawData];
        } else {
            return null;
        }
    }

    const shipmentNode = shipments[0];
    const shipment =
        shipmentNode?.Shipment ||
        shipmentNode?.shipment ||
        shipmentNode;

    if (!shipment || typeof shipment !== 'object') {
        return null;
    }

    const normalizeString = (value) => {
        if (value === undefined || value === null) {
            return '';
        }
        return String(value).trim();
    };

    const formatLocation = (value) => {
        if (!value) {
            return '';
        }

        if (typeof value === 'string') {
            return normalizeString(value);
        }

        if (typeof value === 'object') {
            const parts = [
                value.city || value.City,
                value.state || value.State,
                value.country || value.Country,
                value.name || value.Name,
                value.location || value.Location,
                value.area || value.Area,
                value.state_code || value.StateCode
            ]
                .map((part) => normalizeString(part))
                .filter(Boolean);

            return parts.join(', ');
        }

        return '';
    };

    const extractStatus = (value) => {
        if (!value) {
            return {};
        }

        if (typeof value === 'string') {
            return {
                status: normalizeString(value)
            };
        }

        if (typeof value === 'object') {
            return {
                status: normalizeString(
                    value.Status ||
                    value.status ||
                    value.StatusType ||
                    value.status_type ||
                    value.scan_type ||
                    value.code
                ),
                statusDateTime: normalizeString(
                    value.StatusDateTime ||
                    value.status_datetime ||
                    value.time ||
                    value.date ||
                    value.datetime
                ),
                location: formatLocation(
                    value.StatusLocation ||
                    value.status_location ||
                    value.location ||
                    value.City ||
                    value.city
                )
            };
        }

        return {};
    };

    const scansCandidates = [
        shipment.Scans,
        shipment.scans,
        shipment.ScanDetail,
        shipment.scanDetails,
        shipment.scans_list,
        shipment.scansList,
        shipment.Scans?.ScanDetail,
        shipment.Scans?.scanDetail,
        shipment.Scans?.Scan_Detail,
        shipment.scans?.ScanDetail,
        shipment.scans?.scanDetail,
        shipment.scans?.scan_detail
    ];

    let scansSource = [];
    for (const candidate of scansCandidates) {
        if (Array.isArray(candidate)) {
            scansSource = candidate;
            break;
        }

        if (candidate && Array.isArray(candidate.ScanDetail)) {
            scansSource = candidate.ScanDetail;
            break;
        }

        if (candidate && Array.isArray(candidate.scanDetail)) {
            scansSource = candidate.scanDetail;
            break;
        }

        if (candidate && Array.isArray(candidate.scan_detail)) {
            scansSource = candidate.scan_detail;
            break;
        }
    }

    const scans = scansSource
        .map((scan) => {
            const scanObj = scan || {};
            const nestedStatus = extractStatus(
                scanObj.Status || scanObj.status || scanObj.status_detail
            );

            const scanType = normalizeString(
                scanObj.ScanType ||
                scanObj.Scan ||
                scanObj.Status ||
                scanObj.status ||
                scanObj.scan_type ||
                nestedStatus.status
            );

            const scanDateTime = normalizeString(
                scanObj.ScanDateTime ||
                scanObj.ScannedDateTime ||
                scanObj.Date ||
                scanObj.datetime ||
                scanObj.UpdatedDate ||
                scanObj.updated_at ||
                nestedStatus.statusDateTime
            );

            const scanLocation = normalizeString(
                scanObj.ScanLocation ||
                scanObj.ScannedLocation ||
                scanObj.Location ||
                scanObj.location ||
                nestedStatus.location
            );

            const remarks = normalizeString(
                scanObj.Remarks ||
                scanObj.Instructions ||
                scanObj.Remark ||
                scanObj.remark
            );

            return {
                ScanType: scanType,
                ScanDateTime: scanDateTime,
                ScanLocation: scanLocation,
                Remarks: remarks
            };
        })
        .filter(
            (scan) =>
                scan.ScanType ||
                scan.ScanDateTime ||
                scan.ScanLocation ||
                scan.Remarks
        );

    const statusInfo = extractStatus(
        shipment.Status ||
        shipment.status ||
        shipment.CurrentStatus ||
        shipment.current_status
    );

    const statusDateTime =
        statusInfo.statusDateTime ||
        normalizeString(
            shipment.StatusDateTime ||
            shipment.status_datetime ||
            shipment.StatusDate ||
            shipment.status_date
        );

    const originRaw =
        shipment.Origin ||
        shipment.origin ||
        shipment.OriginDetail ||
        shipment.origin_detail ||
        shipment.OriginDetails ||
        shipment.origin_details;

    const destinationRaw =
        shipment.Destination ||
        shipment.destination ||
        shipment.DestinationDetail ||
        shipment.destination_detail ||
        shipment.DestinationDetails ||
        shipment.destination_details;

    return {
        AWB: normalizeString(
            shipment.AWB ||
            shipment.waybill ||
            shipment.Waybill ||
            trackingResult.waybill ||
            fallbackWaybill
        ),
        Status: normalizeString(
            statusInfo.status ||
            shipment.Status ||
            shipment.status ||
            shipment.CurrentStatus ||
            shipment.current_status
        ) || 'Unknown',
        StatusDateTime: statusDateTime,
        Origin:
            formatLocation(originRaw) ||
            normalizeString(
                shipment.From ||
                shipment.from ||
                shipment.Source ||
                shipment.source
            ),
        Destination:
            formatLocation(destinationRaw) ||
            normalizeString(
                shipment.To ||
                shipment.to ||
                shipment.Consignee ||
                shipment.consignee
            ),
        Scans: scans
    };
};

router.post('/create-shipment',
    auth,
    [
        body('order_id').notEmpty().withMessage('Order ID is required'),
        body('customer_info.buyer_name').notEmpty().withMessage('Buyer name is required'),
        body('customer_info.phone').isMobilePhone('en-IN').withMessage('Valid phone number is required'),
        body('delivery_address.pincode').isLength({ min: 6, max: 6 }).withMessage('Valid pincode is required'),
        body('package_info.weight').isFloat({ min: 0.1 }).withMessage('Valid weight is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            if (!delhiveryService.validateApiKey()) {
                return res.status(503).json({
                    success: false,
                    message: 'Delhivery API not configured'
                });
            }

            const order = await Order.findOne({
                order_id: req.body.order_id,
                user_id: req.user.id
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            if (order.shipping_info.waybill) {
                return res.status(400).json({
                    success: false,
                    message: 'Shipment already created for this order'
                });
            }

            const shipmentResult = await delhiveryService.createShipment({
                ...req.body,
                pickup_address: req.user.warehouse_address
            });

            if (shipmentResult.success) {
                order.shipping_info.waybill = shipmentResult.waybill;
                order.shipping_info.tracking_id = shipmentResult.tracking_id;
                order.shipping_info.label_url = shipmentResult.label_url;
                order.shipping_info.expected_delivery = shipmentResult.expected_delivery;
                order.order_status.current_status = 'Shipped';
                order.order_status.status_history.push({
                    status: 'Shipped',
                    timestamp: new Date(),
                    comment: 'Shipment created with Delhivery'
                });

                await order.save();

                res.json({
                    success: true,
                    message: 'Shipment created successfully',
                    data: {
                        waybill: shipmentResult.waybill,
                        tracking_id: shipmentResult.tracking_id,
                        label_url: shipmentResult.label_url,
                        expected_delivery: shipmentResult.expected_delivery
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to create shipment',
                    error: shipmentResult.error
                });
            }
        } catch (error) {
            console.error('Create shipment error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

// Public tracking endpoint (no authentication required)
router.get('/public/track/:waybill', async (req, res) => {
    try {
        if (!delhiveryService.validateApiKey()) {
            return res.status(503).json({
                success: false,
                message: 'Delhivery API not configured'
            });
        }

        const waybill = String(req.params.waybill || '').trim();
        const refIds =
            typeof req.query.ref_ids === 'string'
                ? req.query.ref_ids.trim()
                : '';

        const trackingResult = await delhiveryService.trackShipment(
            waybill,
            refIds
        );

        if (trackingResult.success) {
            // Return the complete Delhivery response structure
            const rawData = trackingResult.data || {};
            
            // Extract ShipmentData if it exists
            const shipmentData = rawData.ShipmentData || [];
            
            if (!shipmentData || shipmentData.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        'AWB number not found. Please verify the number and try again.'
                });
            }

            // Also provide normalized version for backward compatibility
            const normalized = normalizeTrackingResponse(
                trackingResult,
                waybill
            );

            return res.json({
                success: true,
                data: {
                    // Complete Delhivery response structure
                    ShipmentData: shipmentData,
                    // Normalized version for backward compatibility
                    normalized: normalized || null
                },
                meta: {
                    waybill: waybill,
                    attempts: trackingResult.attempts ?? 1,
                    hasRefIds: Boolean(refIds)
                }
            });
        }

        const statusCode =
            trackingResult.statusCode === 404 ||
            trackingResult.errorType === 'WAYBILL_NOT_FOUND'
                ? 404
                : trackingResult.statusCode || 400;

        return res.status(statusCode).json({
            success: false,
            message:
                trackingResult.error ||
                'Failed to track shipment. Please try again later.',
            errorType: trackingResult.errorType || 'UNKNOWN_ERROR'
        });
    } catch (error) {
        logger.error('Public track shipment error', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Authenticated tracking endpoint (for logged-in users)
router.get('/track/:waybill', auth, async (req, res) => {
    try {
        if (!delhiveryService.validateApiKey()) {
            return res.status(503).json({
                success: false,
                message: 'Delhivery API not configured'
            });
        }

        const order = await Order.findOne({
            'shipping_info.waybill': req.params.waybill,
            user_id: req.user.id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const trackingResult = await delhiveryService.trackShipment(req.params.waybill);

        if (trackingResult.success) {
            if (order.order_status.current_status !== trackingResult.status) {
                order.order_status.current_status = trackingResult.status;
                order.order_status.status_history.push({
                    status: trackingResult.status,
                    timestamp: new Date(),
                    comment: trackingResult.current_location
                });
                await order.save();
            }

            res.json({
                success: true,
                data: trackingResult
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to track shipment',
                error: trackingResult.error
            });
        }
    } catch (error) {
        console.error('Track shipment error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

router.post('/cancel/:waybill', auth, async (req, res) => {
    try {
        if (!delhiveryService.validateApiKey()) {
            return res.status(503).json({
                success: false,
                message: 'Delhivery API not configured'
            });
        }

        const order = await Order.findOne({
            'shipping_info.waybill': req.params.waybill,
            user_id: req.user.id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (['Delivered', 'RTO', 'Cancelled'].includes(order.order_status.current_status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel shipment in current status'
            });
        }

        const cancelResult = await delhiveryService.cancelShipment(req.params.waybill);

        if (cancelResult.success) {
            order.order_status.current_status = 'Cancelled';
            order.order_status.status_history.push({
                status: 'Cancelled',
                timestamp: new Date(),
                comment: req.body.reason || 'Shipment cancelled by user'
            });
            await order.save();

            res.json({
                success: true,
                message: cancelResult.message
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to cancel shipment',
                error: cancelResult.error
            });
        }
    } catch (error) {
        console.error('Cancel shipment error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

router.get('/serviceability/:pincode', auth, async (req, res) => {
    try {
        if (!delhiveryService.validateApiKey()) {
            return res.status(503).json({
                success: false,
                message: 'Delhivery API not configured'
            });
        }

        const serviceabilityResult = await delhiveryService.getServiceability(req.params.pincode);

        res.json({
            success: true,
            data: serviceabilityResult
        });
    } catch (error) {
        console.error('Check serviceability error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

router.post('/rates',
    auth,
    [
        body('pickup_pincode').isLength({ min: 6, max: 6 }).withMessage('Valid pickup pincode is required'),
        body('delivery_pincode').isLength({ min: 6, max: 6 }).withMessage('Valid delivery pincode is required'),
        body('weight').isFloat({ min: 0.1 }).withMessage('Valid weight is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            if (!delhiveryService.validateApiKey()) {
                return res.status(503).json({
                    success: false,
                    message: 'Delhivery API not configured'
                });
            }

            const { pickup_pincode, delivery_pincode, weight, cod_amount } = req.body;

            const ratesResult = await delhiveryService.getRates(
                pickup_pincode,
                delivery_pincode,
                weight,
                cod_amount || 0
            );

            res.json({
                success: true,
                data: ratesResult
            });
        } catch (error) {
            console.error('Get rates error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

router.post('/schedule-pickup',
    auth,
    [
        body('pickup_date').isISO8601().withMessage('Valid pickup date is required'),
        body('pickup_time').notEmpty().withMessage('Pickup time is required'),
        body('pickup_location').notEmpty().withMessage('Pickup location is required'),
        body('expected_package_count').isInt({ min: 1 }).withMessage('Valid package count is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            if (!delhiveryService.validateApiKey()) {
                return res.status(503).json({
                    success: false,
                    message: 'Delhivery API not configured'
                });
            }

            const pickupData = {
                pickup_time: req.body.pickup_time,
                pickup_date: req.body.pickup_date,
                pickup_location: req.body.pickup_location,
                expected_package_count: req.body.expected_package_count
            };

            const pickupResult = await delhiveryService.schedulePickup(pickupData);

            res.json({
                success: pickupResult.success,
                message: pickupResult.message,
                data: pickupResult.pickup_id ? { pickup_id: pickupResult.pickup_id } : null
            });
        } catch (error) {
            console.error('Schedule pickup error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

router.get('/waybill', auth, async (req, res) => {
    try {
        if (!delhiveryService.validateApiKey()) {
            return res.status(503).json({
                success: false,
                message: 'Delhivery API not configured'
            });
        }

        const waybillResult = await delhiveryService.getWaybill();

        res.json({
            success: waybillResult.success,
            data: waybillResult.success ? { waybill: waybillResult.waybill } : null,
            error: waybillResult.error
        });
    } catch (error) {
        console.error('Get waybill error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

router.post('/initiate-rto/:waybill',
    auth,
    [
        body('reason').notEmpty().withMessage('RTO reason is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            if (!delhiveryService.validateApiKey()) {
                return res.status(503).json({
                    success: false,
                    message: 'Delhivery API not configured'
                });
            }

            const order = await Order.findOne({
                'shipping_info.waybill': req.params.waybill,
                user_id: req.user.id
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            const rtoResult = await delhiveryService.initiateRTO(req.params.waybill, req.body.reason);

            if (rtoResult.success) {
                order.order_status.current_status = 'RTO Initiated';
                order.order_status.status_history.push({
                    status: 'RTO Initiated',
                    timestamp: new Date(),
                    comment: req.body.reason
                });

                // Update NDR info on the order (Order.ndr_info is the single source of truth)
                if (order.ndr_info && order.ndr_info.is_ndr) {
                    order.ndr_info.resolution_action = 'rto';
                }

                await order.save();

                res.json({
                    success: true,
                    message: rtoResult.message
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to initiate RTO',
                    error: rtoResult.error
                });
            }
        } catch (error) {
            console.error('Initiate RTO error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

// Calculate shipping cost endpoint
router.post('/calculate-cost',
    auth,
    [
        body('billing_mode').optional().isIn(['E', 'S']).withMessage('Billing mode must be E (Express) or S (Surface)'),
        body('destination_pincode').isLength({ min: 6, max: 6 }).withMessage('Valid destination pincode is required'),
        body('origin_pincode').isLength({ min: 6, max: 6 }).withMessage('Valid origin pincode is required'),
        body('chargeable_weight').isInt({ min: 1 }).withMessage('Valid chargeable weight is required'),
        body('payment_type').optional().isIn(['Pre-paid', 'COD']).withMessage('Payment type must be Pre-paid or COD')
    ],
    async (req, res) => {
        try {
            // Check if Delhivery API is configured
            if (!delhiveryService.validateApiKey()) {
                return res.status(503).json({
                    success: false,
                    message: 'Delhivery API not configured'
                });
            }

            // Validate request
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const costData = {
                billing_mode: req.body.billing_mode || 'S',
                shipment_status: req.body.shipment_status || 'Delivered',
                destination_pincode: req.body.destination_pincode,
                origin_pincode: req.body.origin_pincode,
                chargeable_weight: req.body.chargeable_weight,
                payment_type: req.body.payment_type || 'Pre-paid'
            };

            const costResult = await delhiveryService.calculateShippingCost(costData);

            if (costResult.success) {
                res.json({
                    success: true,
                    message: 'Shipping cost calculated successfully',
                    data: {
                        calculated_cost: costResult.calculated_cost,
                        cost_details: costResult.data
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to calculate shipping cost',
                    error: costResult.error
                });
            }
        } catch (error) {
            console.error('Calculate shipping cost error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

// Calculate shipping cost based on rate card system
// Accepts either: (zone) OR (pickup_pincode + delivery_pincode) to get zone from Delhivery
router.post('/public/calculate-rate-card',
    [
        body('weight').isFloat({ min: 0.1 }).withMessage('Valid weight is required'),
        body('dimensions.length').isFloat({ min: 0.1 }).withMessage('Valid length is required'),
        body('dimensions.breadth').isFloat({ min: 0.1 }).withMessage('Valid breadth is required'),
        body('dimensions.height').isFloat({ min: 0.1 }).withMessage('Valid height is required'),
        body('zone').optional().isIn(['A', 'B', 'C', 'D', 'E', 'F']).withMessage('Valid zone is required (C1, D1 removed - use C, D instead)'),
        body('pickup_pincode').optional().isLength({ min: 6, max: 6 }).withMessage('Pickup pincode must be 6 digits'),
        body('delivery_pincode').optional().isLength({ min: 6, max: 6 }).withMessage('Delivery pincode must be 6 digits'),
        body('shipping_mode').optional().isIn(['Surface', 'Express', 'S', 'E']).withMessage('Shipping mode must be Surface/Express or S/E'),
        body('payment_mode').optional().isIn(['Prepaid', 'COD', 'Pre-paid']).withMessage('Payment mode must be Prepaid or COD'),
        body('cod_amount').optional().isFloat({ min: 0 }).withMessage('COD amount must be positive'),
        body('order_type').optional().isIn(['forward', 'rto']).withMessage('Order type must be "forward" or "rto"'),
        body('service_type').optional().isIn(['surface', 'air']).withMessage('Service type must be "surface" or "air"'),
        body('carrier_id').optional().isMongoId().withMessage('Carrier ID must be valid MongoDB ObjectId')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const {
                weight,
                dimensions,
                zone,
                pickup_pincode,
                delivery_pincode,
                shipping_mode,
                payment_mode,
                cod_amount,
                order_type = 'forward',
                service_type,
                carrier_id
            } = req.body;

            const userCategory = 'New User';
            const availableCategories = await RateCardService.getAvailableUserCategories();

            if (!availableCategories.includes(userCategory)) {
                return res.status(500).json({
                    success: false,
                    message: 'Rate card not configured for new user category',
                    user_category: userCategory
                });
            }

            const rateCard = await RateCardService.getRateCard(userCategory);
            if (!rateCard) {
                return res.status(500).json({
                    success: false,
                    message: `Rate card not available for user category: ${userCategory}`,
                    user_category: userCategory
                });
            }

            if (!['forward', 'rto'].includes(order_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order type. Must be "forward" or "rto"',
                    order_type: order_type
                });
            }

            const zoneNormalizationMap = {
                'C1': 'C',
                'C2': 'C',
                'D1': 'D',
                'D2': 'D'
            };
            const validZones = ['A', 'B', 'C', 'D', 'E', 'F'];
            let finalZone = null;

            if (zone) {
                finalZone = zoneNormalizationMap[zone] || zone;
                if (!validZones.includes(finalZone)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid zone "${finalZone}". Supported zones are: A, B, C, D, E, F.`,
                        provided_zone: zone,
                        normalized_zone: finalZone
                    });
                }
            }

            if (!finalZone) {
                if (!pickup_pincode || !delivery_pincode) {
                    return res.status(400).json({
                        success: false,
                        message: 'Either zone OR (pickup_pincode + delivery_pincode) must be provided'
                    });
                }

                if (!delhiveryService.validateApiKey()) {
                    return res.status(503).json({
                        success: false,
                        message: 'Delhivery API not configured'
                    });
                }

                const volumetricWeightKg = (dimensions.length * dimensions.breadth * dimensions.height) / 5000;
                const volumetricWeightGrams = volumetricWeightKg * 1000;
                const chargeableWeightGrams = Math.max(weight, volumetricWeightGrams);
                const shippingModeForDelhivery = shipping_mode === 'Express' || shipping_mode === 'E' ? 'E' : 'S';
                const paymentTypeForDelhivery = payment_mode === 'COD' ? 'COD' : 'Pre-paid';

                const zoneResult = await delhiveryService.getZoneFromDelhivery(
                    pickup_pincode,
                    delivery_pincode,
                    chargeableWeightGrams,
                    shippingModeForDelhivery,
                    'Delivered',
                    paymentTypeForDelhivery
                );

                if (!zoneResult.success || !zoneResult.zone) {
                    logger.error('❌ Failed to get zone from Delhivery for public rate calculation', {
                        pickup_pincode,
                        delivery_pincode,
                        error: zoneResult.error
                    });
                    return res.status(400).json({
                        success: false,
                        message: zoneResult.error || 'Failed to get zone information from Delhivery',
                        error: zoneResult.error
                    });
                }

                const rawZone = zoneResult.zone;
                finalZone = zoneNormalizationMap[rawZone] || rawZone;

                if (!finalZone || !validZones.includes(finalZone)) {
                    logger.error('❌ Invalid zone after normalization for public rate calculation', {
                        pickup_pincode,
                        delivery_pincode,
                        raw_zone: rawZone,
                        normalized_zone: finalZone
                    });
                    return res.status(400).json({
                        success: false,
                        message: `Invalid zone "${finalZone}" received from Delhivery. Please contact support.`,
                        raw_zone: rawZone,
                        normalized_zone: finalZone
                    });
                }

                logger.info('🌍 Zone retrieved and normalized from Delhivery for public rate calculation', {
                    pickup_pincode,
                    delivery_pincode,
                    raw_zone: rawZone,
                    normalized_zone: finalZone,
                    chargeableWeightGrams: chargeableWeightGrams
                });
            }

            if (!finalZone || typeof finalZone !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Zone is required for shipping charges calculation. Please provide zone or pincodes.',
                    zone_provided: !!zone,
                    pincodes_provided: !!(pickup_pincode && delivery_pincode)
                });
            }

            // Determine carrier for rate calculation
            let selectedCarrierId = carrier_id;
            let carrierServiceType = null;

            if (!selectedCarrierId && service_type) {
                // Lookup carrier by service type
                const carrier = await Carrier.findOne({
                    carrier_group: 'DELHIVERY',
                    service_type: service_type.toLowerCase(),
                    is_active: true
                });

                if (!carrier) {
                    return res.status(400).json({
                        success: false,
                        message: `No active carrier found for service type: ${service_type}`
                    });
                }

                selectedCarrierId = carrier._id;
                carrierServiceType = carrier.service_type;
            }

            // Calculate shipping charges (with carrier support)
            let result;
            if (selectedCarrierId) {
                result = await RateCardService.calculateShippingChargesByCarrier(
                    userCategory,
                    weight,
                    dimensions,
                    finalZone,
                    cod_amount || 0,
                    order_type,
                    selectedCarrierId
                );
            } else {
                // Legacy: no carrier specified, use default (Surface)
                result = await RateCardService.calculateShippingCharges(
                    userCategory,
                    weight,
                    dimensions,
                    finalZone,
                    cod_amount || 0,
                    order_type
                );
            }

            res.json({
                success: true,
                message: 'Shipping charges calculated successfully',
                data: {
                    ...result,
                    zone: finalZone,
                    user_category: userCategory,
                    rate_card_applied: rateCard.userCategory,
                    service_type: carrierServiceType || service_type || 'surface'
                }
            });
        } catch (error) {
            console.error('Public calculate rate card cost error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

router.post('/calculate-rate-card',
    auth,
    [
        body('weight').isFloat({ min: 0.1 }).withMessage('Valid weight is required'),
        body('dimensions.length').isFloat({ min: 0.1 }).withMessage('Valid length is required'),
        body('dimensions.breadth').isFloat({ min: 0.1 }).withMessage('Valid breadth is required'),
        body('dimensions.height').isFloat({ min: 0.1 }).withMessage('Valid height is required'),
        body('zone').optional().isIn(['A', 'B', 'C', 'D', 'E', 'F']).withMessage('Valid zone is required (C1, D1 removed - use C, D instead)'),
        body('pickup_pincode').optional().isLength({ min: 6, max: 6 }).withMessage('Pickup pincode must be 6 digits'),
        body('delivery_pincode').optional().isLength({ min: 6, max: 6 }).withMessage('Delivery pincode must be 6 digits'),
        body('shipping_mode').optional().isIn(['Surface', 'Express', 'S', 'E']).withMessage('Shipping mode must be Surface/Express or S/E'),
        body('payment_mode').optional().isIn(['Prepaid', 'COD', 'Pre-paid']).withMessage('Payment mode must be Prepaid or COD'),
        body('cod_amount').optional().isFloat({ min: 0 }).withMessage('COD amount must be positive'),
        body('order_type').optional().isIn(['forward', 'rto']).withMessage('Order type must be "forward" or "rto"'),
        body('service_type').optional().isIn(['surface', 'air']).withMessage('Service type must be "surface" or "air"'),
        body('carrier_id').optional().isMongoId().withMessage('Carrier ID must be valid MongoDB ObjectId')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const { weight, dimensions, zone, pickup_pincode, delivery_pincode, shipping_mode, payment_mode, cod_amount, order_type = 'forward', service_type, carrier_id } = req.body;
            const userCategory = req.user.user_category || 'Basic User';

            // SECURITY: Validate user category exists and is valid
            const availableCategories = await RateCardService.getAvailableUserCategories();
            
            if (!availableCategories.includes(userCategory)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid user category. Please contact admin to update your account.',
                    user_category: userCategory,
                    available_categories: availableCategories
                });
            }

            // Validate rate card exists for user category
            const rateCard = await RateCardService.getRateCard(userCategory);
            if (!rateCard) {
                return res.status(400).json({
                    success: false,
                    message: `Rate card not available for your user category: ${userCategory}`,
                    user_category: userCategory
                });
            }

            // Validate order type
            if (!['forward', 'rto'].includes(order_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order type. Must be "forward" or "rto"',
                    order_type: order_type
                });
            }

            // Normalize zone if provided directly (map D1/C1 to D/C)
            const zoneNormalizationMap = {
                'C1': 'C',
                'C2': 'C',
                'D1': 'D',
                'D2': 'D'
            };
            const validZones = ['A', 'B', 'C', 'D', 'E', 'F'];
            let finalZone = null;
            
            if (zone) {
                // Normalize provided zone
                finalZone = zoneNormalizationMap[zone] || zone;
                
                // Validate normalized zone is valid
                if (!validZones.includes(finalZone)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid zone "${finalZone}". Supported zones are: A, B, C, D, E, F.`,
                        provided_zone: zone,
                        normalized_zone: finalZone
                    });
                }
            }
            
            // Determine zone: either provided directly OR get from Delhivery API using pincodes
            if (!finalZone) {
                // Zone not provided - get from Delhivery API using pincodes
                if (!pickup_pincode || !delivery_pincode) {
                    return res.status(400).json({
                        success: false,
                        message: 'Either zone OR (pickup_pincode + delivery_pincode) must be provided'
                    });
                }

                // Calculate chargeable weight (in grams) for zone API call
                // NOTE: Frontend sends weight in GRAMS, so no conversion needed
                // Volumetric weight calculation: (LxBxH)/5000 gives kg, then convert to grams
                const volumetricWeightKg = (dimensions.length * dimensions.breadth * dimensions.height) / 5000;
                const volumetricWeightGrams = volumetricWeightKg * 1000; // Convert kg to grams
                // weight is already in grams from frontend, so use directly
                const chargeableWeightGrams = Math.max(weight, volumetricWeightGrams);

                // Determine shipping mode for Delhivery API
                const shippingModeForDelhivery = shipping_mode === 'Express' || shipping_mode === 'E' ? 'E' : 'S';
                const paymentTypeForDelhivery = payment_mode === 'COD' ? 'COD' : 'Pre-paid';

                // Get zone from Delhivery API
                const zoneResult = await delhiveryService.getZoneFromDelhivery(
                    pickup_pincode,
                    delivery_pincode,
                    chargeableWeightGrams,
                    shippingModeForDelhivery,
                    'Delivered',
                    paymentTypeForDelhivery
                );

                if (!zoneResult.success || !zoneResult.zone) {
                    logger.error('❌ Failed to get zone from Delhivery for rate calculation', {
                        pickup_pincode,
                        delivery_pincode,
                        error: zoneResult.error
                    });
                    return res.status(400).json({
                        success: false,
                        message: zoneResult.error || 'Failed to get zone information from Delhivery',
                        error: zoneResult.error
                    });
                }

                // Normalize zone: Map D1/C1 to D/C, D2/C2 to D/C (Delhivery returns extended zones, we use simplified)
                let rawZone = zoneResult.zone;
                const zoneNormalizationMap = {
                    'C1': 'C',
                    'C2': 'C',
                    'D1': 'D',
                    'D2': 'D'
                };
                finalZone = zoneNormalizationMap[rawZone] || rawZone;
                
                // Validate normalized zone is one of the supported zones (validZones already declared above)
                if (!finalZone || !validZones.includes(finalZone)) {
                    logger.error('❌ Invalid zone after normalization', {
                        pickup_pincode,
                        delivery_pincode,
                        raw_zone: rawZone,
                        normalized_zone: finalZone
                    });
                    return res.status(400).json({
                        success: false,
                        message: `Invalid zone "${finalZone}" received from Delhivery. Please contact support.`,
                        raw_zone: rawZone,
                        normalized_zone: finalZone
                    });
                }
                
                logger.info('🌍 Zone retrieved and normalized from Delhivery for rate calculation', {
                    pickup_pincode,
                    delivery_pincode,
                    raw_zone: rawZone,
                    normalized_zone: finalZone,
                    chargeableWeightGrams: chargeableWeightGrams
                });
            }

            // Validate finalZone is set and valid before calculation
            if (!finalZone || typeof finalZone !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Zone is required for shipping charges calculation. Please provide zone or pincodes.',
                    zone_provided: !!zone,
                    pincodes_provided: !!(pickup_pincode && delivery_pincode)
                });
            }

            // Determine carrier for rate calculation
            let selectedCarrierId = carrier_id;
            let carrierServiceType = null;

            if (!selectedCarrierId && service_type) {
                // Lookup carrier by service type
                const carrier = await Carrier.findOne({
                    carrier_group: 'DELHIVERY',
                    service_type: service_type.toLowerCase(),
                    is_active: true
                });

                if (!carrier) {
                    return res.status(400).json({
                        success: false,
                        message: `No active carrier found for service type: ${service_type}`
                    });
                }

                selectedCarrierId = carrier._id;
                carrierServiceType = carrier.service_type;
            }

            // Calculate shipping charges with correct order type
            // NOTE: RateCardService expects weight in GRAMS (as per service implementation)
            // Frontend sends weight in grams, so we pass it directly
            // The service will recalculate volumetric weight internally and use chargeable weight
            let result;
            if (selectedCarrierId) {
                result = await RateCardService.calculateShippingChargesByCarrier(
                    userCategory,
                    weight, // Already in grams from frontend
                    dimensions,
                    finalZone,
                    cod_amount || 0,
                    order_type,
                    selectedCarrierId
                );
            } else {
                // Legacy: no carrier specified, use default (Surface)
                result = await RateCardService.calculateShippingCharges(
                    userCategory,
                    weight,
                    dimensions,
                    finalZone,
                    cod_amount || 0,
                    order_type
                );
            }

            // Log rate calculation for audit
            console.log('💰 Rate calculated:', {
                user_id: req.user._id,
                user_category: userCategory,
                weight: weight,
                zone: finalZone,
                cod_amount: cod_amount || 0,
                total_charges: result.totalCharges,
                service_type: carrierServiceType || service_type || 'surface',
                zone_source: zone ? 'provided' : 'delhivery_api',
                timestamp: new Date().toISOString()
            });

            res.json({
                success: true,
                message: 'Shipping charges calculated successfully',
                data: {
                    ...result,
                    zone: finalZone, // Include zone in response
                    user_category: userCategory,
                    rate_card_applied: rateCard.userCategory,
                    service_type: carrierServiceType || service_type || 'surface'
                }
            });
        } catch (error) {
            console.error('Calculate rate card cost error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
);

// Get rate card for user category
router.get('/rate-card/:userCategory', auth, async (req, res) => {
    try {
        const { userCategory } = req.params;
        const userCategoryFromToken = req.user.user_category || 'Basic User';
        
        // SECURITY: Validate that user can only access their own category's rate card
        // Handle "Advanced User" vs "Advanced" mismatch
        const normalizedUserCategory = userCategoryFromToken === 'Advanced User' ? 'Advanced' : userCategoryFromToken;
        const normalizedRequestedCategory = userCategory === 'Advanced User' ? 'Advanced' : userCategory;
        
        if (normalizedRequestedCategory !== normalizedUserCategory) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view your own user category rate card.',
                user_category: userCategoryFromToken,
                requested_category: userCategory
            });
        }
        
        // Import rate card service
        const RateCardService = require('../services/rateCardService');
        
        // Use normalized category for rate card lookup
        const rateCard = await RateCardService.getRateCard(normalizedRequestedCategory);
        
        if (!rateCard) {
            const availableCategories = await RateCardService.getAvailableUserCategories();
            return res.status(404).json({
                success: false,
                message: `Rate card not found for user category: ${userCategory}`,
                available_categories: availableCategories
            });
        }

        // Log rate card access for audit
        console.log('📊 Rate card accessed:', {
            user_id: req.user._id,
            user_category: userCategory,
            client_email: req.user.email,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            data: rateCard
        });
    } catch (error) {
        console.error('Get rate card error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get available user categories
router.get('/user-categories', auth, async (req, res) => {
    try {
        // Import rate card service
        const RateCardService = require('../services/rateCardService');
        
        const categories = await RateCardService.getAvailableUserCategories();

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get user categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

router.get('/health', async (req, res) => {
    try {
        const healthStatus = delhiveryService.getHealthStatus();
        res.json({
            success: true,
            data: healthStatus
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get health status',
            error: error.message
        });
    }
});

module.exports = router;