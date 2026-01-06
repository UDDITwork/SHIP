// Location: backend/services/delhiveryService.js
// Ensure dotenv is loaded before reading env variables
if (!process.env.DELHIVERY_API_KEY && typeof require !== 'undefined') {
    try {
        require('dotenv').config();
    } catch (e) {
        // dotenv already loaded or not available
    }
}

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class DelhiveryService {
    constructor() {
        this.baseURL = process.env.DELHIVERY_API_URL || 'https://track.delhivery.com/api';
        this.stagingURL = 'https://staging-express.delhivery.com/api';
        this.apiKey = process.env.DELHIVERY_API_KEY;
        
        // Debug: Log API key status (first 10 chars only for security)
        const envKeys = Object.keys(process.env).filter(k => k.includes('DELHIVERY'));
        console.log('🔑 Delhivery Service Initialized:', {
            hasApiKey: !!this.apiKey,
            apiKeyLength: this.apiKey?.length || 0,
            apiKeyPreview: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'MISSING',
            apiURL: this.baseURL,
            envKeysFound: envKeys,
            directEnvCheck: process.env.DELHIVERY_API_KEY ? `${process.env.DELHIVERY_API_KEY.substring(0, 10)}...` : 'NOT IN PROCESS.ENV',
            constructorCalledAt: new Date().toISOString()
        });
        
        // If API key is missing, log warning but don't fail - will fail at runtime
        if (!this.apiKey || this.apiKey === 'your-delhivery-api-key') {
            console.warn('⚠️ WARNING: Delhivery API Key not found during initialization!');
            console.warn('This may cause issues when making API calls.');
        }
        // FORCE PRODUCTION URL - Don't use staging unless explicitly set
        // Set DELHIVERY_USE_STAGING=true to use staging
        const useStaging = process.env.DELHIVERY_USE_STAGING === 'true';
        this.isProduction = !useStaging;
        this.apiURL = useStaging ? this.stagingURL : this.baseURL;
        
        // Initialize client with API key if available, otherwise will update at runtime
        this.client = axios.create({
            baseURL: this.apiURL,
            headers: {
                'Authorization': `Token ${this.apiKey || ''}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        });
        
        // Update client headers if API key becomes available later
        this.updateClientHeaders = () => {
            const activeApiKey = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (activeApiKey) {
                this.client.defaults.headers['Authorization'] = `Token ${activeApiKey}`;
            }
        };
    }

    /**
     * Generate Waybill Number
     * @returns {string} Generated waybill
     */
    generateWaybill() {
        return `SHIP${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }

    /**
     * Create Single Package Shipment (SPS)
     * @param {Object} orderData - Order data
     * @returns {Promise} Shipment creation response
     */
    async createShipment(orderData) {
        try {
            const parseBool = (v) => {
                if (typeof v === 'boolean') return v;
                if (typeof v === 'number') return v === 1;
                if (typeof v === 'string') {
                    const n = v.trim().toLowerCase();
                    return ['y', 'yes', 'true', '1'].includes(n);
                }
                return false;
            };
            const shipmentData = {
                shipments: [{
                    name: orderData.customer_info.buyer_name,
                    add: orderData.delivery_address.full_address,
                    pin: orderData.delivery_address.pincode,
                    city: orderData.delivery_address.city,
                    state: orderData.delivery_address.state,
                    country: 'India',
                    phone: orderData.customer_info.phone,
                    order: orderData.order_id,
                    payment_mode: ['Prepaid', 'COD', 'Pickup', 'REPL'].includes(orderData.payment_info.payment_mode)
                        ? orderData.payment_info.payment_mode
                        : 'Prepaid',
                    return_pin: orderData.pickup_address?.pincode || '',
                    return_city: orderData.pickup_address?.city || '',
                    return_phone: orderData.pickup_address?.phone || '',
                    return_add: orderData.pickup_address?.full_address || '',
                    return_state: orderData.pickup_address?.state || '',
                    return_country: 'India',
                    products_desc: orderData.products.map(p => p.product_name).join(', '),
                    hsn_code: orderData.products[0]?.hsn_code || '',
                    cod_amount: orderData.payment_info.cod_amount || 0,
                    order_date: new Date().toISOString().split('T')[0],
                    total_amount: orderData.payment_info.order_value || 0,
                    // Add end_date to avoid Delhivery error "NoneType object has no attribute 'end_date'"
                    end_date: null, // Explicitly set to null as per Delhivery API requirement
                    seller_add: orderData.pickup_address?.full_address || '',
                    seller_name: orderData.seller_info?.name || '',
                    seller_inv: orderData.invoice_number || '',
                    quantity: orderData.products.reduce((sum, p) => sum + p.quantity, 0),
                    // Use pre-fetched waybill if provided, otherwise let Delhivery generate it
                    waybill: orderData.waybill || '', // Pre-fetched waybill from getWaybill API
                    shipment_width: orderData.package_info.dimensions.width || 10,
                    shipment_height: orderData.package_info.dimensions.height || 10,
                    shipment_length: orderData.package_info.dimensions.length || orderData.package_info.dimensions.width || 10,
                    weight: orderData.package_info.weight * 1000, // Convert kg to grams for Delhivery API
                    seller_gst_tin: orderData.seller_info?.gst_number || '',
                    shipping_mode: orderData.shipping_mode || 'Surface',
                    address_type: orderData.address_type || 'home'
                }],
                pickup_location: {
                    name: orderData.pickup_address?.name || 'Default Pickup',
                    add: orderData.pickup_address?.full_address || '',
                    city: orderData.pickup_address?.city || '',
                    pin_code: orderData.pickup_address?.pincode || '',
                    country: 'India',
                    phone: orderData.pickup_address?.phone || ''
                }
            };

            // Validate API key before making request - check both instance and process.env
            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured', {
                    instanceApiKey: !!this.apiKey,
                    envApiKey: !!process.env.DELHIVERY_API_KEY,
                    allDelhiveryEnvKeys: Object.keys(process.env).filter(k => k.includes('DELHIVERY'))
                });
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }
            
            // Use runtime API key if instance doesn't have it
            if (!this.apiKey && process.env.DELHIVERY_API_KEY) {
                this.apiKey = process.env.DELHIVERY_API_KEY;
                logger.info('✅ API Key loaded from process.env at runtime');
            }

            // Ensure API key is set in client headers
            this.updateClientHeaders();
            
            logger.info('🚀 Creating Delhivery shipment', {
                orderId: orderData.order_id,
                paymentMode: orderData.payment_info.payment_mode,
                hasApiKey: !!apiKeyToUse,
                apiKeyLength: apiKeyToUse?.length || 0,
                url: `${this.apiURL}/cmu/create.json`
            });

            // EXACT FORMAT AS PER DELHIVERY DOCUMENTATION:
            // The data should be sent as form-urlencoded string
            // According to docs: data: 'format=json&data={JSON_STRING}'
            const dataString = JSON.stringify(shipmentData);
            const postData = `format=json&data=${dataString}`;
            
            logger.info('📤 Sending shipment data', {
                contentType: 'application/x-www-form-urlencoded',
                bodyFormat: 'format=json&data={JSON}',
                dataSize: dataString.length,
                hasWaybill: !!shipmentData.shipments[0].waybill,
                rawBody: postData.substring(0, 100) + '...'
            });

            // EXACT format from Delhivery documentation
            // Send as form-urlencoded, not JSON
            const response = await axios.post(`${this.apiURL}/cmu/create.json`, postData, {
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'  // Form-urlencoded!
                },
                timeout: 30000
            });

            // Log the full response for debugging
            logger.info('📦 Delhivery API Response', {
                orderId: orderData.order_id,
                responseDataType: typeof response.data,
                responseData: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
                responseStatus: response.status,
                responseKeys: typeof response.data === 'object' ? Object.keys(response.data || {}) : 'N/A (string)'
            });

            // Parse Delhivery API response - they can send in ANY format
            // Sometimes response.data might be a JSON string that needs parsing
            let responseData = response.data;
            if (typeof responseData === 'string') {
                try {
                    responseData = JSON.parse(responseData);
                    logger.info('📦 Parsed response.data from string to object');
                } catch (parseError) {
                    logger.error('❌ Failed to parse response.data as JSON', {
                        error: parseError.message,
                        dataType: typeof responseData,
                        dataSample: responseData.substring(0, 200)
                    });
                    // Continue with original response.data if parsing fails
                }
            }

            let awbNumber = null;
            let packages = [];
            let isSuccess = false;
            let hasError = false;
            let errorMessage = null;

            // Strategy: Extract AWB from EVERY possible location in response
            // IMPORTANT: Even if success=false, Delhivery may still generate a waybill
            // So we extract AWB first, then check for errors
            
            // 1. Check for error flag (but don't throw yet - extract AWB first)
            if (responseData.error === true || responseData.success === false) {
                hasError = true;
                errorMessage = responseData.rmk || responseData.message || 'Unknown error';
                logger.warn('⚠️ Delhivery API returned error flag (checking for AWB anyway)', {
                    orderId: orderData.order_id,
                    error: errorMessage,
                    responseData: responseData,
                    errorType: 'API_ERROR',
                    checkingForWaybill: true
                });
            }

            // 2. Extract AWB from various possible locations FIRST (even if error flag is set)
            if (responseData.packages && Array.isArray(responseData.packages) && responseData.packages.length > 0) {
                packages = responseData.packages;
                
                // Check if package has waybill (not empty string)
                const firstPackage = packages[0];
                if (firstPackage.waybill && firstPackage.waybill.trim() !== '') {
                    awbNumber = firstPackage.waybill;
                    // If carrier marks package as Fail or non-serviceable, treat as hard failure
                    const isServiceablePkg = firstPackage.hasOwnProperty('serviceable') ? parseBool(firstPackage.serviceable) : true;
                    if (firstPackage.status === 'Fail' || !isServiceablePkg) {
                        // Extract error message from remarks (could be array or string)
                        let errorReason = 'Pincode not serviceable by carrier';
                        if (firstPackage?.remarks) {
                            if (Array.isArray(firstPackage.remarks) && firstPackage.remarks.length > 0) {
                                errorReason = firstPackage.remarks[0]; // Get first remark
                            } else if (typeof firstPackage.remarks === 'string') {
                                errorReason = firstPackage.remarks;
                            }
                        } else if (errorMessage) {
                            errorReason = errorMessage;
                        }

                        // Parse common Delhivery errors and make them user-friendly
                        let userFriendlyError = errorReason;
                        if (errorReason.includes('insufficient balance')) {
                            userFriendlyError = 'Insufficient wallet balance in Delhivery account. Please recharge your Delhivery wallet to create shipments.';
                        } else if (errorReason.includes('not serviceable') || errorReason.includes('PINCODE IS NOT SERVICEABLE')) {
                            userFriendlyError = 'This pincode is not serviceable by Delhivery. Please try a different courier or contact support.';
                        } else if (errorReason.includes('Invalid pincode')) {
                            userFriendlyError = 'Invalid pincode. Please check and enter a valid 6-digit pincode.';
                        } else if (errorReason.includes('API key') || errorReason.includes('authentication')) {
                            userFriendlyError = 'Delhivery API authentication failed. Please contact support.';
                        }

                        logger.error('❌ Carrier returned non-serviceable/failed package, aborting AWB', {
                            awbNumber,
                            packageStatus: firstPackage.status,
                            serviceable: firstPackage.serviceable,
                            remarks: firstPackage.remarks,
                            extractedError: errorReason,
                            userFriendlyError: userFriendlyError
                        });
                        throw new Error(userFriendlyError);
                    }
                    isSuccess = true;
                    logger.info('✅ AWB found in packages[0].waybill', { 
                        awbNumber, 
                        packageCount: packages.length,
                        packageStatus: firstPackage.status,
                        packageRefnum: firstPackage.refnum,
                        serviceable: firstPackage.serviceable,
                        sortCode: firstPackage.sort_code
                    });
                } else {
                    // Package exists but waybill is empty (failed package)
                    logger.warn('⚠️ Package created but waybill is empty', {
                        packageStatus: firstPackage.status,
                        packageRemarks: firstPackage.remarks,
                        packageRefnum: firstPackage.refnum
                    });
                    throw new Error(firstPackage?.remarks || 'Carrier failed to create waybill');
                }
            } else if (responseData.pkgs && Array.isArray(responseData.pkgs) && responseData.pkgs.length > 0) {
                packages = responseData.pkgs;
                awbNumber = packages[0].waybill || packages[0].AWB || packages[0].wb || null;
                if (awbNumber) {
                    isSuccess = true;
                    logger.info('✅ AWB found in pkgs array', { awbNumber });
                }
            } else if (responseData.waybill) {
                awbNumber = responseData.waybill;
                packages = [{
                    waybill: responseData.waybill,
                    status: responseData.status || 'Success',
                    refnum: responseData.refnum || orderData.order_id,
                    label_url: responseData.label_url,
                    expected_delivery_date: responseData.expected_delivery_date
                }];
                isSuccess = true;
                logger.info('✅ AWB found in waybill field', { awbNumber });
            } else if (responseData.items && Array.isArray(responseData.items) && responseData.items.length > 0) {
                packages = responseData.items;
                awbNumber = packages[0].waybill || packages[0].AWB || packages[0].wb || null;
                if (awbNumber) {
                    isSuccess = true;
                    logger.info('✅ AWB found in items array', { awbNumber });
                }
            } else if (Array.isArray(responseData) && responseData.length > 0) {
                packages = responseData;
                awbNumber = packages[0].waybill || packages[0].AWB || packages[0].wb || null;
                if (awbNumber) {
                    isSuccess = true;
                    logger.info('✅ AWB found in root array', { awbNumber });
                }
            } else if (responseData.upload_wbn) {
                // upload_wbn is not the waybill, it's an upload reference
                logger.info('📤 Upload WBN found (not waybill)', { uploadWbn: responseData.upload_wbn });
            }

            // 3. If no AWB found in response, check if we sent a pre-fetched waybill
            if (!awbNumber && orderData.waybill) {
                awbNumber = orderData.waybill;
                isSuccess = true;
                logger.info('✅ Using pre-fetched waybill', { awbNumber });
            }

            // 4. If still no AWB, it's a failure
            if (!awbNumber) {
                // If we had an error AND no waybill, throw the error
                if (hasError && errorMessage) {
                    logger.error('❌ No AWB number found AND Delhivery returned error', {
                        orderId: orderData.order_id,
                        error: errorMessage,
                        responseKeys: typeof responseData === 'object' ? Object.keys(responseData || {}) : 'N/A',
                        responseSample: typeof responseData === 'string' ? responseData.substring(0, 200) : JSON.stringify(responseData).substring(0, 200),
                        sentWaybill: orderData.waybill || 'none'
                    });
                    throw new Error(errorMessage || 'Delhivery API did not return AWB number. Please check API response.');
                } else {
                logger.error('❌ No AWB number found in ANY field', {
                    orderId: orderData.order_id,
                    responseKeys: typeof responseData === 'object' ? Object.keys(responseData || {}) : 'N/A',
                    responseSample: typeof responseData === 'string' ? responseData.substring(0, 200) : JSON.stringify(responseData).substring(0, 200),
                    sentWaybill: orderData.waybill || 'none'
                });
                    throw new Error('Delhivery API did not return AWB number. Please check API response.');
                }
            }

            // 5. If we got an AWB but there was an error flag, log warning but proceed
            if (hasError && errorMessage && awbNumber) {
                logger.warn('⚠️ AWB generated successfully despite error flag', {
                    orderId: orderData.order_id,
                    awbNumber: awbNumber,
                    errorMessage: errorMessage,
                    proceedingWithAWB: true
                });
            }

            // Mark as success if we have AWB (even if error flag was set)
            isSuccess = true;

            // Success - return response (even if error flag was set, if we have AWB, it's a success)
            if (awbNumber) {
                logger.info('✅ Shipment created successfully (AWB extracted)', {
                    orderId: orderData.order_id,
                    awbNumber: awbNumber,
                    packagesCount: packages.length,
                    responseStructure: typeof responseData === 'object' ? Object.keys(responseData) : 'N/A',
                    hadErrorFlag: hasError,
                    errorMessage: errorMessage
                });

                return {
                    success: true,
                    waybill: awbNumber,
                    tracking_id: awbNumber,
                    label_url: packages[0]?.label_url || packages[0]?.label || null,
                    expected_delivery: packages[0]?.expected_delivery_date || null,
                    packages: packages.length > 0 ? packages : [{
                        waybill: awbNumber,
                        status: 'Success',
                        refnum: orderData.order_id
                    }],
                    upload_wbn: responseData.upload_wbn || null,
                    // Additional fields from actual API response
                    serviceable: packages[0]?.serviceable || false,
                    sort_code: packages[0]?.sort_code || null,
                    payment_mode: packages[0]?.payment || null,
                    cod_amount: packages[0]?.cod_amount || 0,
                    remarks: packages[0]?.remarks || [],
                    data: responseData,
                    warning: hasError ? errorMessage : null  // Include warning if error flag was set
                };
            }
        } catch (error) {
            logger.error('❌ Delhivery createShipment error', {
                orderId: orderData.order_id,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.rmk || error.message || 'Failed to create shipment'
            };
        }
    }

    /**
     * Create Multi Package Shipment (MPS)
     * @param {Object} mpsData - Multi package shipment data
     * @returns {Promise} MPS creation response
     */
    async createMPSShipment(mpsData) {
        try {
            const shipments = mpsData.packages.map((pkg, index) => ({
                order: mpsData.orderId,
                weight: pkg.weight,
                mps_amount: mpsData.payment_mode === 'COD' ? mpsData.totalAmount : 0,
                mps_children: mpsData.packages.length,
                pin: mpsData.pin,
                products_desc: pkg.productDescription,
                add: mpsData.address,
                shipment_type: 'MPS',
                state: mpsData.state,
                master_id: mpsData.masterWaybill,
                city: mpsData.city,
                waybill: pkg.waybill,
                phone: mpsData.phone,
                payment_mode: mpsData.payment_mode,
                name: mpsData.customerName,
                total_amount: mpsData.totalAmount,
                country: mpsData.country || 'India',
                shipment_width: pkg.width,
                shipment_height: pkg.height,
                shipment_length: pkg.length
            }));

            const payload = {
                pickup_location: { name: mpsData.pickupLocation },
                shipments: shipments
            };

            logger.info('🚀 Creating MPS shipment', {
                orderId: mpsData.orderId,
                packageCount: mpsData.packages.length,
                masterWaybill: mpsData.masterWaybill
            });

            const response = await this.client.post('/cmu/create.json', payload);

            logger.info('✅ MPS shipment created successfully', {
                orderId: mpsData.orderId,
                response: response.data
            });

            return {
                success: true,
                data: response.data,
                waybills: mpsData.packages.map(pkg => pkg.waybill),
                masterWaybill: mpsData.masterWaybill
            };

        } catch (error) {
            logger.error('❌ MPS shipment creation failed', {
                orderId: mpsData.orderId,
                error: error.message,
                response: error.response?.data
            });

            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Track Shipment by Waybill
     * @param {string} waybill - Waybill/AWB number
     * @returns {Promise} Tracking information
     */
    async trackShipment(waybill) {
        try {
            logger.info('📍 Tracking shipment', { waybill });

            const response = await this.client.get(`/v1/packages/json/?waybill=${waybill}`);

            if (response.data.ShipmentData && response.data.ShipmentData.length > 0) {
                const shipmentData = response.data.ShipmentData[0];
                return {
                    success: true,
                    data: {
                        AWB: shipmentData.AWB || waybill,
                        Status: shipmentData.Status || 'Unknown',
                        StatusDateTime: shipmentData.StatusDateTime || new Date().toISOString(),
                        Origin: shipmentData.Origin || '',
                        Destination: shipmentData.Destination || '',
                        Scans: shipmentData.Scans ? shipmentData.Scans.map(scan => ({
                            ScanType: scan.ScanType || scan.Scan || '',
                            ScanDateTime: scan.ScanDateTime || '',
                            ScanLocation: scan.ScanLocation || scan.ScannedLocation || '',
                            Remarks: scan.Remarks || scan.Instructions || ''
                        })) : []
                    }
                };
            } else {
                return {
                    success: false,
                    error: 'No tracking information found for this AWB number'
                };
            }
        } catch (error) {
            logger.error('❌ Tracking failed', {
                waybill,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to track shipment'
            };
        }
    }

    /**
     * Cancel Shipment
     * @param {string} waybill - Waybill number (AWB) of the shipment
     * @returns {Promise} Cancellation response
     */
    async cancelShipment(waybill) {
        try {
            // Use production URL directly as specified
            // NOTE: URL must NOT have trailing space - exact format: https://track.delhivery.com/api/p/edit
            const productionURL = 'https://track.delhivery.com';
            const cancelURL = `${productionURL}/api/p/edit`.trim(); // Ensure no trailing spaces
            
            logger.info('🚫 Cancelling shipment', {
                waybill,
                url: cancelURL,
                apiKeyLength: this.apiKey?.length || 0
            });

            // Validate API key
            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured for cancellation');
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }

            // Use runtime API key if instance doesn't have it
            if (!this.apiKey && process.env.DELHIVERY_API_KEY) {
                this.apiKey = process.env.DELHIVERY_API_KEY;
                logger.info('✅ API Key loaded from process.env at runtime');
            }

            // EXACT FORMAT AS PER DELHIVERY API DOCUMENTATION:
            // POST https://track.delhivery.com/api/p/edit
            // Body: { waybill: 'AWB_NUMBER', cancellation: 'true' }
            // Both parameters must be strings
            const response = await axios.post(cancelURL, {
                waybill: String(waybill), // Ensure waybill is a string
                cancellation: 'true'     // Must be string 'true', not boolean
            }, {
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            logger.info('✅ Shipment cancelled successfully', {
                waybill,
                status: response.status,
                responseData: response.data
            });

            return {
                success: response.status === 200 || response.status === 201,
                message: response.data?.rmk || response.data?.message || 'Shipment cancelled successfully',
                data: response.data
            };
        } catch (error) {
            // Extract error message from Delhivery response
            let errorMessage = 'Failed to cancel shipment';
            
            logger.warn('⚠️ Cancel shipment API error structure', {
                hasResponse: !!error.response,
                hasResponseData: !!error.response?.data,
                responseData: error.response?.data,
                responseStatus: error.response?.status,
                errorMessage: error.message,
                errorKeys: error.response?.data ? Object.keys(error.response.data) : []
            });
            
            if (error.response?.data) {
                const errorData = error.response.data;
                
                // Handle different error formats from Delhivery
                if (errorData.rmk) {
                    errorMessage = errorData.rmk;
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                } else if (errorData.error) {
                    errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                } else {
                    errorMessage = JSON.stringify(errorData);
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            logger.error('❌ Shipment cancellation failed', {
                waybill,
                error: errorMessage,
                status: error.response?.status,
                errorData: error.response?.data,
                extractedMessage: errorMessage
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Check Pincode Serviceability
     * @param {string} pincode - Pincode to check
     * @returns {Promise} Serviceability data
     */
    async getServiceability(pincode) {
        const productionURL = 'https://track.delhivery.com';
        const dcUrl = `${productionURL}/api/dc/fetch/serviceability/pincode`;
        const legacyUrl = `${productionURL}/c/api/pin-codes/json/?filter_codes=${pincode}`;
        const parseFlag = (value) => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value === 1;
            if (typeof value === 'string') {
                const normalized = value.trim().toLowerCase();
                return ['y', 'yes', 'true', '1'].includes(normalized);
            }
            return false;
        };

        const normalizeFromPostalCode = (serviceData) => {
            if (!serviceData) return null;

            let stateName = serviceData.state_code || 'Unknown';
            if (serviceData.inc && typeof serviceData.inc === 'string') {
                const stateMatch = serviceData.inc.match(/\(([^)]+)\)/);
                if (stateMatch && stateMatch[1]) {
                    stateName = stateMatch[1].trim();
                }
            }

            return {
                success: true,
                serviceable: serviceData.pre_paid === 'Y' || serviceData.pickup === 'Y' || serviceData.cod === 'Y',
                cash_on_delivery: serviceData.cod === 'Y',
                cash_pickup: serviceData.cash === 'Y',
                state_code: serviceData.state_code,
                state_name: stateName,
                district: serviceData.district,
                city: serviceData.city,
                pre_paid: serviceData.pre_paid === 'Y',
                pickup_available: serviceData.pickup === 'Y'
            };
        };

        const normalizeFromServiceabilityNode = (node) => {
            if (!node) return null;
            const serviceable = parseFlag(node.is_serviceable ?? node.serviceable ?? node.delivery);
            const stateCode = (node.state_code || node.state || node.statecode || 'Unknown').toString();
            const city = (node.city || node.town || node.postcity || 'Unknown').toString();

            return {
                success: true,
                serviceable,
                cash_on_delivery: parseFlag(node.is_cod ?? node.cod ?? node.cash_on_delivery),
                cash_pickup: parseFlag(node.is_pickup ?? node.pickup ?? node.cash_pickup),
                state_code: stateCode,
                state_name: (node.state || node.state_name || stateCode).toString(),
                district: (node.district || node.district_name || '').toString(),
                city,
                pre_paid: parseFlag(node.pre_paid ?? node.is_prepaid ?? node.prepaid),
                pickup_available: parseFlag(node.pickup ?? node.is_pickup ?? node.pickup_available)
            };
        };

        const normalizeResponse = (payload) => {
            if (!payload) return null;

            if (payload.serviceability) {
                const mainNode = payload.serviceability.delivery || payload.serviceability;
                return normalizeFromServiceabilityNode(mainNode);
            }

            if (payload.delivery_codes && Array.isArray(payload.delivery_codes) && payload.delivery_codes.length > 0) {
                return normalizeFromPostalCode(payload.delivery_codes[0].postal_code);
            }

            if (Array.isArray(payload) && payload.length > 0) {
                if (payload[0].postal_code) {
                    return normalizeFromPostalCode(payload[0].postal_code);
                }
                if (payload[0].serviceability) {
                    return normalizeFromServiceabilityNode(payload[0].serviceability);
                }
            }

            if (payload.postal_code) {
                return normalizeFromPostalCode(payload.postal_code);
            }

            return null;
        };

        const fetchFromDcApi = async () => {
            try {
                logger.info('🔍 Checking serviceability via DC API', {
                    pincode,
                    url: dcUrl
                });

                const response = await axios.get(dcUrl, {
                    headers: {
                        'Authorization': `Token ${this.apiKey}`,
                        'Accept': 'application/json'
                    },
                    params: {
                        product_type: process.env.DELHIVERY_PRODUCT_TYPE || 'Heavy',
                        pincode
                    },
                    timeout: 15000
                });

                const normalized = normalizeResponse(response.data);
                if (normalized) {
                    logger.info('✅ Serviceability data found via DC API', {
                        pincode,
                        serviceable: normalized.serviceable,
                        city: normalized.city,
                        state: normalized.state_name
                    });
                    return normalized;
                }

                logger.warn('⚠️ Unable to parse DC serviceability response', {
                    pincode,
                    responseType: typeof response.data
                });
                return null;
            } catch (error) {
                logger.warn('⚠️ DC serviceability API failed, will fallback to legacy endpoint', {
                    pincode,
                    status: error.response?.status,
                    message: error.response?.data || error.message
                });
                return null;
            }
        };

        const fetchFromLegacyApi = async () => {
            try {
                logger.info('🔍 Checking serviceability via legacy API', {
                    pincode,
                    url: legacyUrl
                });

                const response = await axios.get(legacyUrl, {
                    headers: {
                        'Authorization': `Token ${this.apiKey}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });

                if (typeof response.data === 'string' && response.data.includes('<!doctype html>')) {
                    logger.error('❌ Serviceability API returned HTML error page', {
                        pincode,
                        responsePreview: response.data.substring(0, 200)
                    });
                    return {
                        success: false,
                        error: 'Delhivery API returned error page - serviceability endpoint may be incorrect',
                        serviceable: false
                    };
                }

                const normalized = normalizeResponse(response.data);
                if (normalized) {
                    return normalized;
                }

                logger.info('ℹ️ Pincode not serviceable (legacy response)', {
                    pincode
                });

                return {
                    success: true,
                    serviceable: false,
                    message: 'Pincode not serviceable',
                    city: 'Not Serviceable',
                    state_code: 'Not Serviceable'
                };
            } catch (error) {
                logger.error('❌ Legacy serviceability check failed', {
                    pincode,
                    error: error.response?.data || error.message,
                    status: error.response?.status,
                    url: error.config?.url
                });

                return {
                    success: false,
                    error: error.response?.data?.message || error.message || 'Failed to check serviceability',
                    serviceable: false
                };
            }
        };

        const dcResult = await fetchFromDcApi();
        if (dcResult) {
            return dcResult;
        }

        return await fetchFromLegacyApi();
    }

    /**
     * Get Shipping Rates
     * @param {string} pickupPincode - Pickup pincode
     * @param {string} deliveryPincode - Delivery pincode
     * @param {number} weight - Weight in kg
     * @param {number} codAmount - COD amount
     * @returns {Promise} Rate information
     */
    async getRates(pickupPincode, deliveryPincode, weight, codAmount = 0) {
        try {
            // Use production URL directly as specified
            const productionURL = 'https://track.delhivery.com';
            const ratesURL = `${productionURL}/kinko/v1/invoice/charges/.json`;
            
            const params = {
                md: 'S',
                ss: 'Delivered',
                d_pin: deliveryPincode,
                o_pin: pickupPincode,
                cgm: weight * 1000,
                pt: codAmount > 0 ? 'COD' : 'Pre-paid',
                cod: codAmount > 0 ? 1 : 0
            };

            logger.info('💰 Getting rates from production URL', {
                pickupPincode,
                deliveryPincode,
                weight,
                codAmount,
                url: ratesURL,
                params
            });

            const response = await axios.get(ratesURL, {
                params: params,
                headers: {
                    'Authorization': `Token ${this.apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            logger.info('✅ Rates API response received', {
                pickupPincode,
                deliveryPincode,
                status: response.status,
                dataKeys: Object.keys(response.data || {}),
                responseType: typeof response.data
            });

            // Check if response is HTML (error page) instead of JSON
            if (typeof response.data === 'string' && response.data.includes('<!doctype html>')) {
                logger.error('❌ Rates API returned HTML error page', {
                    pickupPincode,
                    deliveryPincode,
                    responsePreview: response.data.substring(0, 200)
                });
                
                return {
                    success: false,
                    error: 'Delhivery API returned error page - rates endpoint may be incorrect'
                };
            }

            if (response.data && response.data[0]) {
                const rateData = response.data[0];
                
                logger.info('✅ Rates data found', {
                    pickupPincode,
                    deliveryPincode,
                    freightCharge: rateData.freight_charge,
                    codCharge: rateData.cod_charges,
                    deliveryDays: rateData.expected_delivery_days,
                    zone: rateData.zone
                });

                return {
                    success: true,
                    freight_charge: parseFloat(rateData.freight_charge || 0),
                    cod_charge: parseFloat(rateData.cod_charges || 0),
                    total_charge: parseFloat(rateData.total_amount || 0),
                    expected_delivery_days: parseInt(rateData.expected_delivery_days || 3),
                    zone: rateData.zone || null, // Extract zone from Delhivery response
                    currency: 'INR'
                };
            } else {
                logger.warn('⚠️ No rate information available', {
                    pickupPincode,
                    deliveryPincode,
                    responseData: response.data
                });

                return {
                    success: false,
                    error: 'No rate information available'
                };
            }
        } catch (error) {
            logger.error('❌ Rate calculation failed', {
                pickupPincode,
                deliveryPincode,
                error: error.response?.data || error.message,
                status: error.response?.status,
                url: error.config?.url
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get rates'
            };
        }
    }

    /**
     * Get Zone from Delhivery API
     * Uses invoice/charges API to get zone for given parameters
     * @param {string} pickupPincode - Origin pincode
     * @param {string} deliveryPincode - Destination pincode
     * @param {number} chargeableWeight - Chargeable weight in grams
     * @param {string} shippingMode - Billing mode: 'E' (Express) or 'S' (Surface), default: 'S'
     * @param {string} shipmentStatus - Status: 'Delivered', 'RTO', 'DTO', default: 'Delivered'
     * @param {string} paymentType - Payment type: 'Pre-paid' or 'COD', default: 'Pre-paid'
     * @returns {Promise} Zone information from Delhivery
     */
    async getZoneFromDelhivery(pickupPincode, deliveryPincode, chargeableWeight, shippingMode = 'S', shipmentStatus = 'Delivered', paymentType = 'Pre-paid') {
        try {
            // Use production URL directly
            const productionURL = 'https://track.delhivery.com';
            const chargesURL = `${productionURL}/api/kinko/v1/invoice/charges/.json`;
            
            // Ensure chargeableWeight is in grams (if passed in kg, convert)
            const weightInGrams = chargeableWeight < 1000 ? chargeableWeight * 1000 : chargeableWeight;
            
            const params = {
                md: shippingMode, // Billing Mode: E (Express) or S (Surface)
                ss: shipmentStatus, // Status: Delivered, RTO, DTO
                d_pin: deliveryPincode, // Destination pincode
                o_pin: pickupPincode, // Origin pincode
                cgm: Math.round(weightInGrams), // Chargeable weight in grams (must be integer)
                pt: paymentType // Payment Type: Pre-paid or COD
            };

            logger.info('🌍 Getting zone from Delhivery invoice/charges API', {
                pickupPincode,
                deliveryPincode,
                chargeableWeight: weightInGrams,
                shippingMode,
                shipmentStatus,
                paymentType,
                url: chargesURL,
                params
            });

            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured for zone retrieval');
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }

            const response = await axios.get(chargesURL, {
                params: params,
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            logger.info('📦 Delhivery zone API response received', {
                pickupPincode,
                deliveryPincode,
                status: response.status,
                responseKeys: response.data && Array.isArray(response.data) && response.data[0] ? Object.keys(response.data[0]) : [],
                hasData: !!response.data
            });

            // Check if response is HTML (error page) instead of JSON
            if (typeof response.data === 'string' && response.data.includes('<!doctype html>')) {
                logger.error('❌ Zone API returned HTML error page', {
                    pickupPincode,
                    deliveryPincode,
                    responsePreview: response.data.substring(0, 200)
                });
                
                return {
                    success: false,
                    error: 'Delhivery API returned error page',
                    zone: null
                };
            }

            // Normalize zone: Map D1/C1 to D/C, D2/C2 to D/C (Delhivery returns extended zones, we use simplified)
            const zoneNormalizationMap = {
                'C1': 'C',
                'C2': 'C',
                'D1': 'D',
                'D2': 'D'
            };
            const validZones = ['A', 'B', 'C', 'D', 'E', 'F'];
            
            // Extract zone from response
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                const chargeData = response.data[0];
                const rawZone = chargeData.zone || null;
                let normalizedZone = null;
                
                if (rawZone && typeof rawZone === 'string') {
                    // Normalize zone (trim whitespace, map extended zones)
                    const trimmedZone = rawZone.trim().toUpperCase();
                    normalizedZone = zoneNormalizationMap[trimmedZone] || trimmedZone;
                    
                    // Validate normalized zone is valid
                    if (!validZones.includes(normalizedZone)) {
                        logger.warn('⚠️ Invalid zone after normalization', {
                            pickupPincode,
                            deliveryPincode,
                            raw_zone: rawZone,
                            normalized_zone: normalizedZone
                        });
                        normalizedZone = null; // Set to null if invalid
                    }
                }
                
                logger.info('✅ Zone extracted and normalized from Delhivery response', {
                    pickupPincode,
                    deliveryPincode,
                    raw_zone: rawZone,
                    normalized_zone: normalizedZone,
                    fullResponse: chargeData
                });

                return {
                    success: true,
                    zone: normalizedZone, // Return normalized zone
                    raw_zone: rawZone, // Keep raw zone for reference
                    data: chargeData // Return full response for reference
                };
            } else if (response.data && response.data.zone) {
                // Handle case where response is object with zone directly
                const rawZone = response.data.zone;
                let normalizedZone = null;
                
                if (rawZone && typeof rawZone === 'string') {
                    // Normalize zone (trim whitespace, map extended zones)
                    const trimmedZone = rawZone.trim().toUpperCase();
                    normalizedZone = zoneNormalizationMap[trimmedZone] || trimmedZone;
                    
                    // Validate normalized zone is valid
                    if (!validZones.includes(normalizedZone)) {
                        logger.warn('⚠️ Invalid zone after normalization', {
                            pickupPincode,
                            deliveryPincode,
                            raw_zone: rawZone,
                            normalized_zone: normalizedZone
                        });
                        normalizedZone = null; // Set to null if invalid
                    }
                }
                
                logger.info('✅ Zone extracted and normalized from Delhivery response (object format)', {
                    pickupPincode,
                    deliveryPincode,
                    raw_zone: rawZone,
                    normalized_zone: normalizedZone
                });

                return {
                    success: true,
                    zone: normalizedZone, // Return normalized zone
                    raw_zone: rawZone, // Keep raw zone for reference
                    data: response.data
                };
            } else {
                logger.warn('⚠️ No zone information found in Delhivery response', {
                    pickupPincode,
                    deliveryPincode,
                    responseData: response.data,
                    responseType: typeof response.data
                });

                return {
                    success: false,
                    error: 'No zone information found in Delhivery response',
                    zone: null
                };
            }
        } catch (error) {
            logger.error('❌ Zone retrieval failed', {
                pickupPincode,
                deliveryPincode,
                error: error.response?.data || error.message,
                status: error.response?.status,
                url: error.config?.url
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get zone from Delhivery',
                zone: null
            };
        }
    }

    /**
     * Schedule Pickup
     * @param {Object} pickupData - Pickup details
     * @returns {Promise} Pickup scheduling response
     */
    async schedulePickup(pickupData) {
        try {
            // Use production URL directly as specified
            const productionURL = 'https://track.delhivery.com';
            const pickupURL = `${productionURL}/fm/request/new/`;
            
            logger.info('🚚 Scheduling pickup from Delhivery', {
                pickupURL,
                pickupLocation: pickupData.pickup_location,
                pickupDate: pickupData.pickup_date,
                pickupTime: pickupData.pickup_time,
                apiKeyLength: this.apiKey?.length || 0
            });

            // Validate API key
            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured for pickup request');
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }

            // Use runtime API key if instance doesn't have it
            if (!this.apiKey && process.env.DELHIVERY_API_KEY) {
                this.apiKey = process.env.DELHIVERY_API_KEY;
                logger.info('✅ API Key loaded from process.env at runtime');
            }

            const response = await axios.post(pickupURL, {
                pickup_time: pickupData.pickup_time,
                pickup_date: pickupData.pickup_date,
                pickup_location: pickupData.pickup_location,
                expected_package_count: pickupData.expected_package_count || 1
            }, {
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            logger.info('✅ Pickup scheduled successfully', {
                status: response.status,
                pickupId: response.data?.pickup_id,
                responseData: response.data
            });

            return {
                success: response.status === 200 || response.status === 201,
                pickup_id: response.data?.pickup_id,
                message: response.data?.message || 'Pickup scheduled successfully',
                data: response.data
            };
        } catch (error) {
            // Extract error message from Delhivery response
            // Delhivery can return errors in different formats:
            // 1. { prepaid: "Client wallet balance is -27.76 which is less than 500.0" }
            // 2. { error: { prepaid: "..." } }
            // 3. { message: "Error message" }
            // 4. { error: "Error message" }
            let errorMessage = 'Failed to schedule pickup';
            
            // Log full error structure for debugging
            logger.warn('⚠️ Pickup API error structure', {
                hasResponse: !!error.response,
                hasResponseData: !!error.response?.data,
                responseData: error.response?.data,
                responseStatus: error.response?.status,
                errorMessage: error.message,
                errorKeys: error.response?.data ? Object.keys(error.response.data) : []
            });
            
            if (error.response?.data) {
                const errorData = error.response.data;
                
                // Handle nested error object: { error: { prepaid: "..." } }
                if (errorData.error && typeof errorData.error === 'object') {
                    if (errorData.error.prepaid) {
                        errorMessage = errorData.error.prepaid;
                    } else if (errorData.error.message) {
                        errorMessage = errorData.error.message;
                    } else {
                        errorMessage = JSON.stringify(errorData.error);
                    }
                }
                // Check for prepaid wallet balance error (direct)
                else if (errorData.prepaid) {
                    errorMessage = errorData.prepaid;
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                } else if (errorData.error) {
                    errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                } else if (errorData.rmk) {
                    errorMessage = errorData.rmk;
                } else {
                    // Try to extract any error message from the response
                    errorMessage = JSON.stringify(errorData);
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            logger.error('❌ Pickup scheduling failed', {
                error: errorMessage,
                status: error.response?.status,
                errorData: error.response?.data,
                pickupLocation: pickupData.pickup_location,
                extractedMessage: errorMessage
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Get Waybill from Delhivery
     * @param {number} count - Number of waybills needed
     * @returns {Promise} Waybill(s)
     */
    async getWaybill(count = 1) {
        try {
            // Fetch WayBill API format as per Delhivery API Documentation:
            // GET https://track.delhivery.com/waybill/api/bulk/json/?count=count
            // params: {token: 'xxxxxxxxxxxxxxxx', count: '1'}
            // headers: {Accept: 'application/json'}
            
            // Validate API key before making request - check both instance and process.env
            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured', {
                    instanceApiKey: !!this.apiKey,
                    envApiKey: !!process.env.DELHIVERY_API_KEY
                });
                return {
                    success: false,
                    error: 'Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.'
                };
            }
            
            // Use runtime API key if instance doesn't have it
            if (!this.apiKey && process.env.DELHIVERY_API_KEY) {
                this.apiKey = process.env.DELHIVERY_API_KEY;
                logger.info('✅ API Key loaded from process.env at runtime');
            }
            
            // Use the active API key
            apiKeyToUse = this.apiKey;

            logger.info('📋 Fetching waybill from Delhivery', {
                count: count,
                apiURL: this.apiURL,
                hasApiKey: !!this.apiKey,
                apiKeyLength: this.apiKey?.length || 0
            });
            
            // Use production URL as per API documentation
            // URL: https://track.delhivery.com/waybill/api/bulk/json/?count=count
            const baseDomain = this.apiURL.includes('staging') 
                ? 'https://staging-express.delhivery.com'
                : 'https://track.delhivery.com';
            const waybillURL = `${baseDomain}/waybill/api/bulk/json/`;
            
            logger.info('📋 Waybill API Request (Following API Doc Format)', {
                waybillURL: waybillURL,
                method: 'GET',
                usingStaging: this.apiURL.includes('staging'),
                tokenParam: apiKeyToUse ? `${apiKeyToUse.substring(0, 10)}...` : 'MISSING',
                count: String(count),
                apiKeyFromInstance: !!this.apiKey,
                apiKeyFromEnv: !!process.env.DELHIVERY_API_KEY
            });
            
            // Follow exact API documentation format:
            // params: {token: 'xxxxxxxxxxxxxxxx', count: '1'}
            // headers: {Accept: 'application/json'}
            const response = await axios.request({
                method: 'GET',
                url: waybillURL,
                params: {
                    token: apiKeyToUse,  // Token as query parameter
                    count: String(count)  // Count as string as per API doc
                },
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            logger.info('📋 Waybill API Response', {
                status: response.status,
                dataLength: response.data?.length || 0,
                data: response.data,
                dataType: typeof response.data
            });

            // Handle different response formats:
            // 1. String: "44800710000302" -> convert to array
            // 2. Array: ["44800710000302"] -> use as is
            let waybills = [];
            
            if (typeof response.data === 'string') {
                // API returned single waybill as string
                waybills = [response.data];
                logger.info('✅ Waybill fetched (string format)', {
                    waybill: response.data
                });
            } else if (Array.isArray(response.data) && response.data.length > 0) {
                // API returned array
                waybills = response.data;
                logger.info('✅ Waybill fetched (array format)', {
                    waybillCount: response.data.length,
                    firstWaybill: response.data[0]
                });
            } else {
                logger.warn('⚠️ Waybill API returned empty response', {
                    responseData: response.data
                });
                return {
                    success: false,
                    error: 'No waybill available in response'
                };
            }
            
            return {
                success: true,
                waybills: waybills
            };
        } catch (error) {
            logger.error('❌ Waybill fetch failed', {
                error: error.response?.data || error.message,
                status: error.response?.status,
                url: error.config?.url
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get waybill',
                statusCode: error.response?.status
            };
        }
    }

    /**
     * Update Order
     * @param {string} waybill - Waybill number
     * @param {Object} updateData - Data to update
     * @returns {Promise} Update response
     */
    async updateOrder(waybill, updateData) {
        try {
            const response = await this.client.post('/backend/clientwarehouse/editorders/', {
                waybill: waybill,
                ...updateData
            });

            return {
                success: response.status === 200,
                message: response.data?.rmk || 'Order updated successfully'
            };
        } catch (error) {
            logger.error('❌ Order update failed', {
                waybill,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.rmk || error.message || 'Failed to update order'
            };
        }
    }

    /**
     * Get NDR Attempts
     * @param {string} waybill - Waybill number
     * @returns {Promise} NDR attempts data
     */
    async getNDRAttempts(waybill) {
        try {
            const trackingData = await this.trackShipment(waybill);

            if (trackingData.success && trackingData.data.Scans) {
                const ndrScans = trackingData.data.Scans.filter(scan =>
                    scan.ScanType.toLowerCase().includes('delivery') &&
                    !scan.ScanType.toLowerCase().includes('delivered')
                );

                return {
                    success: true,
                    attempts: ndrScans.length,
                    last_attempt_date: ndrScans.length > 0 ? ndrScans[ndrScans.length - 1].ScanDateTime : null,
                    ndr_reasons: ndrScans.map(scan => scan.Remarks),
                    next_attempt_date: this.calculateNextAttemptDate(ndrScans.length)
                };
            } else {
                return {
                    success: false,
                    error: 'Failed to get NDR information'
                };
            }
        } catch (error) {
            logger.error('❌ NDR attempts fetch failed', {
                waybill,
                error: error.message
            });

            return {
                success: false,
                error: 'Failed to get NDR attempts'
            };
        }
    }

    /**
     * Calculate Next Attempt Date
     * @param {number} attemptCount - Current attempt count
     * @returns {string|null} Next attempt date
     */
    calculateNextAttemptDate(attemptCount) {
        const nextDay = new Date();
        nextDay.setDate(nextDay.getDate() + (attemptCount < 3 ? 1 : 0));
        return attemptCount < 3 ? nextDay.toISOString().split('T')[0] : null;
    }

    /**
     * Initiate RTO
     * @param {string} waybill - Waybill number
     * @param {string} reason - RTO reason
     * @returns {Promise} RTO response
     */
    async initiateRTO(waybill, reason) {
        try {
            logger.info('🔄 Initiating RTO', { waybill, reason });

            const response = await this.client.post('/backend/clientwarehouse/editorders/', {
                waybill: waybill,
                return_type: 'RTO',
                return_reason: reason
            });

            return {
                success: response.status === 200,
                message: response.data?.rmk || 'RTO initiated successfully'
            };
        } catch (error) {
            logger.error('❌ RTO initiation failed', {
                waybill,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.rmk || error.message || 'Failed to initiate RTO'
            };
        }
    }

    /**
     * Take NDR Action (Re-Attempt or Pickup Reschedule)
     * @param {Object} ndrData - NDR action data
     * @param {string} ndrData.waybill - Waybill number
     * @param {string} ndrData.action - Action type (RE-ATTEMPT or PICKUP_RESCHEDULE)
     * @param {string} ndrData.reason - Optional reason
     * @param {string} ndrData.nslCode - Current NSL code of the shipment
     * @param {number} ndrData.attemptCount - Current attempt count
     * @returns {Promise} NDR action response with UPL ID
     */
    async takeNDRAction(ndrData) {
        try {
            const { waybill, action, reason, nslCode, attemptCount } = ndrData;

            logger.info('🎯 Taking NDR action', {
                waybill,
                action,
                reason,
                nslCode,
                attemptCount
            });

            // Validate action
            if (!['RE-ATTEMPT', 'PICKUP_RESCHEDULE'].includes(action)) {
                throw new Error('Invalid NDR action. Must be RE-ATTEMPT or PICKUP_RESCHEDULE');
            }

            // Validate attempt count
            if (attemptCount && (attemptCount < 1 || attemptCount > 2)) {
                throw new Error('Attempt count should be either 1 or 2 for NDR actions');
            }

            // Validate NSL codes based on action type
            if (action === 'RE-ATTEMPT') {
                const allowedReAttemptCodes = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
                if (nslCode && !allowedReAttemptCodes.includes(nslCode)) {
                    throw new Error(`RE-ATTEMPT not allowed for NSL code: ${nslCode}. Allowed codes: ${allowedReAttemptCodes.join(', ')}`);
                }
            } else if (action === 'PICKUP_RESCHEDULE') {
                const allowedRescheduleCodes = ['EOD-777', 'EOD-21'];
                if (nslCode && !allowedRescheduleCodes.includes(nslCode)) {
                    throw new Error(`PICKUP_RESCHEDULE not allowed for NSL code: ${nslCode}. Allowed codes: ${allowedRescheduleCodes.join(', ')}`);
                }
            }

            // Check if it's after 9 PM (recommended time for NDR actions)
            const currentHour = new Date().getHours();
            if (currentHour < 21) {
                logger.warn('⚠️ NDR action applied before 9 PM', {
                    waybill,
                    action,
                    currentHour,
                    recommendation: 'Consider applying NDR actions after 9 PM for better results'
                });
            }

            const response = await this.client.post('/p/update', {
                data: [{
                    waybill: waybill,
                    act: action
                }]
            });

            logger.info('✅ NDR action successful', {
                waybill,
                action,
                uplId: response.data?.request_id,
                nslCode,
                attemptCount
            });

            return {
                success: true,
                request_id: response.data?.request_id, // UPL ID
                message: `${action} initiated successfully`,
                data: response.data,
                waybill: waybill,
                action: action,
                nslCode: nslCode,
                attemptCount: attemptCount
            };

        } catch (error) {
            logger.error('❌ NDR action failed', {
                waybill: ndrData.waybill,
                action: ndrData.action,
                nslCode: ndrData.nslCode,
                attemptCount: ndrData.attemptCount,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to take NDR action',
                waybill: ndrData.waybill,
                action: ndrData.action
            };
        }
    }

    /**
     * Get NDR Status by UPL ID
     * @param {string} uplId - UPL ID received from NDR action
     * @returns {Promise} NDR status
     */
    async getNDRStatus(uplId) {
        try {
            logger.info('📊 Fetching NDR status', { uplId });

            const response = await this.client.get(`/cmu/get_bulk_upl/${uplId}`, {
                params: { verbose: 'true' }
            });

            return {
                success: true,
                data: response.data,
                status: response.data?.status,
                waybills: response.data?.waybills
            };

        } catch (error) {
            logger.error('❌ NDR status fetch failed', {
                uplId,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to get NDR status'
            };
        }
    }

    /**
     * Bulk NDR Action
     * @param {Object} bulkData - Bulk NDR action data
     * @param {string[]} bulkData.waybills - Array of waybill numbers
     * @param {string} bulkData.action - Action type (RE-ATTEMPT or PICKUP_RESCHEDULE)
     * @param {Array} bulkData.orders - Array of order objects for validation
     * @returns {Promise} Bulk NDR action response
     */
    async bulkNDRAction(bulkData) {
        try {
            const { waybills, action, orders } = bulkData;

            logger.info('📦 Bulk NDR action', {
                waybillCount: waybills.length,
                action
            });

            // Validate action
            if (!['RE-ATTEMPT', 'PICKUP_RESCHEDULE'].includes(action)) {
                throw new Error('Invalid NDR action. Must be RE-ATTEMPT or PICKUP_RESCHEDULE');
            }

            // Validate each order if provided
            if (orders && orders.length > 0) {
                const allowedReAttemptCodes = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
                const allowedRescheduleCodes = ['EOD-777', 'EOD-21'];

                for (const order of orders) {
                    const nslCode = order.ndr_info?.nsl_code;
                    const attemptCount = order.ndr_info?.ndr_attempts;

                    // Validate attempt count
                    if (attemptCount && (attemptCount < 1 || attemptCount > 2)) {
                        throw new Error(`Attempt count should be either 1 or 2 for waybill: ${order.delhivery_data?.waybill}`);
                    }

                    // Validate NSL codes based on action type
                    if (action === 'RE-ATTEMPT' && nslCode && !allowedReAttemptCodes.includes(nslCode)) {
                        throw new Error(`RE-ATTEMPT not allowed for waybill: ${order.delhivery_data?.waybill} with NSL code: ${nslCode}`);
                    } else if (action === 'PICKUP_RESCHEDULE' && nslCode && !allowedRescheduleCodes.includes(nslCode)) {
                        throw new Error(`PICKUP_RESCHEDULE not allowed for waybill: ${order.delhivery_data?.waybill} with NSL code: ${nslCode}`);
                    }
                }
            }

            // Check if it's after 9 PM (recommended time for NDR actions)
            const currentHour = new Date().getHours();
            if (currentHour < 21) {
                logger.warn('⚠️ Bulk NDR action applied before 9 PM', {
                    waybillCount: waybills.length,
                    action,
                    currentHour,
                    recommendation: 'Consider applying NDR actions after 9 PM for better results'
                });
            }

            const data = waybills.map(waybill => ({
                waybill: waybill,
                act: action
            }));

            const response = await this.client.post('/p/update', { data });

            logger.info('✅ Bulk NDR action successful', {
                waybillCount: waybills.length,
                uplId: response.data?.request_id,
                action
            });

            return {
                success: true,
                request_id: response.data?.request_id,
                processed_count: waybills.length,
                message: `Bulk ${action} initiated for ${waybills.length} shipments`,
                data: response.data,
                waybills: waybills,
                action: action
            };

        } catch (error) {
            logger.error('❌ Bulk NDR action failed', {
                waybillCount: bulkData.waybills?.length,
                action: bulkData.action,
                error: error.response?.data || error.message
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to execute bulk NDR action',
                waybills: bulkData.waybills,
                action: bulkData.action
            };
        }
    }

    /**
     * Create/Register Warehouse with Delhivery
     * @param {Object} warehouseData - Warehouse details
     * @returns {Promise} Warehouse creation response
     */
    async createWarehouse(warehouseData) {
        try {
            logger.info('🏭 Creating warehouse in Delhivery', {
                name: warehouseData.name,
                pincode: warehouseData.pin,
                method: 'POST', // CORRECTED: POST not PUT
                endpoint: 'https://track.delhivery.com/api/backend/clientwarehouse/create/'
            });

            // Validate API key
            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured for warehouse creation');
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }

            // Use runtime API key if instance doesn't have it
            if (!this.apiKey && process.env.DELHIVERY_API_KEY) {
                this.apiKey = process.env.DELHIVERY_API_KEY;
                logger.info('✅ API Key loaded from process.env at runtime');
            }

            // CORRECT METHOD DISCOVERED THROUGH TESTING:
            // Method: POST (NOT PUT as per documentation!)
            // URL: https://track.delhivery.com/api/backend/clientwarehouse/create/
            // Content-Type: application/json
            // Data: JSON object
            const warehouseURL = 'https://track.delhivery.com/api/backend/clientwarehouse/create/';
            const response = await axios.post(warehouseURL, warehouseData, {
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            // Enhanced success validation
            const isSuccess = response.status >= 200 && response.status < 300;
            const hasValidData = response.data && (
                response.data.data || 
                response.data.success === true || 
                response.data.status === 'success' ||
                response.data.message?.toLowerCase().includes('success')
            );

            logger.info('✅ Warehouse creation response received', {
                name: warehouseData.name,
                responseStatus: response.status,
                responseData: response.data,
                isSuccess,
                hasValidData,
                finalSuccess: isSuccess && hasValidData
            });

            if (isSuccess && hasValidData) {
                return {
                    success: true,
                    data: response.data,
                    message: 'Warehouse registered successfully',
                    delhivery_warehouse_id: response.data.data?.name || response.data.name
                };
            } else {
                logger.warn('⚠️ Delhivery API returned success status but invalid data', {
                    name: warehouseData.name,
                    status: response.status,
                    data: response.data
                });
                
                return {
                    success: false,
                    error: 'Delhivery API returned invalid response data',
                    response_data: response.data
                };
            }

        } catch (error) {
            logger.error('❌ Warehouse creation failed', {
                name: warehouseData.name,
                error: error.response?.data || error.message,
                status: error.response?.status
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to create warehouse'
            };
        }
    }

    /**
     * Update warehouse in Delhivery
     * @param {Object} warehouseData - Warehouse update data (name is mandatory for identification, pin is mandatory, phone and address are optional)
     * @returns {Promise} Update response
     */
    async updateWarehouse(warehouseData) {
        try {
            logger.info('✏️ Updating warehouse in Delhivery', {
                name: warehouseData.name,
                pincode: warehouseData.pin,
                hasPhone: !!warehouseData.phone,
                hasAddress: !!warehouseData.address,
                endpoint: 'https://track.delhivery.com/api/backend/clientwarehouse/edit/'
            });

            // Validate API key
            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured for warehouse update');
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }

            // Use runtime API key if instance doesn't have it
            if (!this.apiKey && process.env.DELHIVERY_API_KEY) {
                this.apiKey = process.env.DELHIVERY_API_KEY;
                logger.info('✅ API Key loaded from process.env at runtime');
            }

            // Validate required fields
            if (!warehouseData.name) {
                throw new Error('Warehouse name is required for update (used for identification)');
            }
            if (!warehouseData.pin) {
                throw new Error('Warehouse pincode is required for update');
            }

            const sanitizedPin = warehouseData.pin.toString().trim();
            if (!sanitizedPin) {
                throw new Error('Warehouse pincode is required for update');
            }

            // Note: Per Delhivery API, name (identifier) with pin required, phone/address optional

            // Prepare update payload per Delhivery API
            // Only phone and address can be updated (name is for identification only)
            const updatePayload = {
                name: warehouseData.name,  // Mandatory: used to identify the warehouse
                pin: sanitizedPin
            };

            // Add phone if provided (required or optional based on API)
            if (warehouseData.phone) {
                updatePayload.phone = warehouseData.phone;
            }

            // Add address if provided (format: "Address, City, State")
            if (warehouseData.address) {
                updatePayload.address = warehouseData.address;
            }

            // Add return address fields if provided
            if (warehouseData.return_address) {
                updatePayload.return_address = warehouseData.return_address;
            }
            if (warehouseData.return_pin) {
                updatePayload.return_pin = warehouseData.return_pin;
            }
            if (warehouseData.return_city) {
                updatePayload.return_city = warehouseData.return_city;
            }
            if (warehouseData.return_state) {
                updatePayload.return_state = warehouseData.return_state;
            }

            // API Endpoint: https://track.delhivery.com/api/backend/clientwarehouse/edit/
            // Using production URL
            const updateURL = 'https://track.delhivery.com/api/backend/clientwarehouse/edit/';
            
            const response = await axios.post(updateURL, updatePayload, {
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            // Validate response
            const isSuccess = response.status >= 200 && response.status < 300;
            const hasValidData = response.data && (
                response.data.data || 
                response.data.success === true || 
                response.data.status === 'success' ||
                response.data.message?.toLowerCase().includes('success') ||
                response.data.message?.toLowerCase().includes('updated')
            );

            logger.info('✅ Warehouse update response received', {
                name: warehouseData.name,
                responseStatus: response.status,
                responseData: response.data,
                isSuccess,
                hasValidData,
                finalSuccess: isSuccess && hasValidData
            });

            if (isSuccess && hasValidData) {
                return {
                    success: true,
                    data: response.data,
                    message: 'Warehouse updated successfully in Delhivery',
                    delhivery_response: response.data
                };
            } else {
                logger.warn('⚠️ Delhivery API returned success status but invalid data', {
                    name: warehouseData.name,
                    status: response.status,
                    data: response.data
                });
                
                return {
                    success: false,
                    error: 'Delhivery API returned invalid response data',
                    response_data: response.data
                };
            }

        } catch (error) {
            logger.error('❌ Warehouse update failed', {
                name: warehouseData.name,
                error: error.response?.data || error.message,
                status: error.response?.status,
                errorDetails: error.response?.data
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to update warehouse in Delhivery'
            };
        }
    }

    /**
     * Validate API Key
     * @returns {boolean} Validation status
     */
    /**
     * Validate API key and configuration
     * @returns {boolean} True if API key is valid
     */
    validateApiKey() {
        if (!this.apiKey || this.apiKey === 'your-delhivery-api-key') {
            logger.error('❌ Delhivery API Key not configured');
            return false;
        }
        
        if (this.apiKey.length < 20) {
            logger.error('❌ Delhivery API Key appears to be invalid (too short)', {
                apiKeyLength: this.apiKey.length,
                apiKeyPreview: this.apiKey.substring(0, 10) + '...'
            });
            return false;
        }
        
        logger.info('✅ Delhivery API Key validation passed', {
            apiKeyLength: this.apiKey.length,
            apiKeyPreview: this.apiKey.substring(0, 10) + '...',
            apiURL: this.apiURL
        });
        
        return true;
    }

    /**
     * Test API connectivity and authentication
     * @returns {Promise<Object>} Test result
     */
    async testApiConnection() {
        try {
            logger.info('🧪 Testing Delhivery API connection', {
                apiURL: this.apiURL,
                hasApiKey: !!this.apiKey
            });

            // Test with a dummy waybill to check API connectivity
            const testWaybill = 'TEST123456789';
            const response = await this.client.get('/v1/packages/json/', {
                params: {
                    waybill: testWaybill
                },
                timeout: 10000 // 10 second timeout
            });

            logger.info('✅ Delhivery API connection test successful', {
                status: response.status,
                statusText: response.statusText,
                responseType: typeof response.data
            });

            return {
                success: true,
                message: 'API connection successful',
                status: response.status,
                apiURL: this.apiURL
            };
        } catch (error) {
            logger.error('❌ Delhivery API connection test failed', {
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                apiURL: this.apiURL
            });

            return {
                success: false,
                message: 'API connection failed',
                error: error.message,
                status: error.response?.status,
                apiURL: this.apiURL
            };
        }
    }

    /**
     * Track Shipment
     * @param {string} waybill - Waybill number to track
     * @param {string} refIds - Reference IDs (optional)
     * @returns {Promise} Tracking response
     */
    /**
     * Track Shipment with retry mechanism
     * @param {string} waybill - Waybill number to track
     * @param {string} refIds - Reference IDs (optional)
     * @param {number} maxRetries - Maximum number of retries (default: 3)
     * @returns {Promise} Tracking response
     */
    async trackShipment(waybill, refIds = '', maxRetries = 3) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info('🔍 Tracking shipment attempt', {
                    waybill: waybill,
                    attempt: attempt,
                    maxRetries: maxRetries
                });

                // Use the correct Delhivery tracking endpoint
                // API Format: GET /v1/packages/json/?waybill=waybill_num&ref_ids=order_id
                // Ensure we're using the correct base URL
                const baseDomain = this.apiURL.includes('staging') 
                    ? 'https://staging-express.delhivery.com'
                    : 'https://track.delhivery.com';
                
                const trackingURL = `${baseDomain}/api/v1/packages/json/`;
                
                // Build params - waybill is mandatory, ref_ids is optional
                const params = {
                    waybill: waybill || ''
                };
                
                // Add ref_ids if provided (order_id) - only if not empty
                if (refIds && refIds.trim() && refIds.trim() !== '') {
                    params.ref_ids = refIds.trim();
                }
                
                // Ensure API key is available for the request
                let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
                if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                    throw new Error('Delhivery API Key not configured');
                }
                
                logger.info('🔍 Calling Delhivery Tracking API', {
                    url: trackingURL,
                    params: { waybill: params.waybill, hasRefIds: !!params.ref_ids },
                    baseDomain
                });
                
                const response = await axios.get(trackingURL, {
                    params: params,
                    headers: {
                        'Authorization': `Token ${apiKeyToUse}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                // Check if response is HTML (error page) instead of JSON
                if (typeof response.data === 'string' && response.data.includes('<!doctype html>')) {
                    logger.error('❌ Delhivery API returned HTML error page', {
                        waybill: waybill,
                        attempt: attempt,
                        responseType: typeof response.data,
                        responseLength: response.data.length,
                        responsePreview: response.data.substring(0, 200)
                    });
                    
                    // Don't retry HTML error pages - they indicate endpoint issues
                    return {
                        success: false,
                        error: 'Delhivery API returned error page - waybill may not exist or API endpoint issue',
                        waybill: waybill,
                        errorType: 'HTML_ERROR_PAGE',
                        attempts: attempt
                    };
                }

                // Validate response data structure
                if (!response.data || typeof response.data !== 'object') {
                    logger.error('❌ Invalid tracking response format', {
                        waybill: waybill,
                        attempt: attempt,
                        responseData: response.data,
                        responseType: typeof response.data
                    });
                    
                    // Retry for invalid response format
                    if (attempt < maxRetries) {
                        await this.delay(1000 * attempt); // Exponential backoff
                        continue;
                    }
                    
                    return {
                        success: false,
                        error: 'Invalid response format from Delhivery API',
                        waybill: waybill,
                        errorType: 'INVALID_RESPONSE_FORMAT',
                        attempts: attempt
                    };
                }

                logger.info('✅ Tracking successful', {
                    waybill: waybill,
                    attempt: attempt,
                    responseKeys: Object.keys(response.data)
                });

            return {
                success: true,
                data: response.data,
                    waybill: waybill,
                    attempts: attempt
            };
        } catch (error) {
                lastError = error;
                
                // Enhanced error logging
                const errorDetails = {
                waybill: waybill,
                    attempt: attempt,
                    maxRetries: maxRetries,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method,
                    headers: error.config?.headers,
                    responseData: error.response?.data,
                    errorMessage: error.message
                };

                logger.error('❌ Shipment tracking failed', errorDetails);

                // Determine error type and provide appropriate message
                let errorMessage = 'Failed to track shipment';
                let errorType = 'UNKNOWN_ERROR';
                let shouldRetry = false;

                if (error.response?.status === 404) {
                    errorMessage = 'Waybill not found - shipment may not exist or may have been purged';
                    errorType = 'WAYBILL_NOT_FOUND';
                    shouldRetry = false; // Don't retry 404 errors
                } else if (error.response?.status === 401) {
                    errorMessage = 'Authentication failed - check API key';
                    errorType = 'AUTHENTICATION_ERROR';
                    shouldRetry = false; // Don't retry auth errors
                } else if (error.response?.status === 403) {
                    errorMessage = 'Access forbidden - insufficient permissions';
                    errorType = 'PERMISSION_ERROR';
                    shouldRetry = false; // Don't retry permission errors
                } else if (error.response?.status >= 500) {
                    errorMessage = 'Delhivery server error - try again later';
                    errorType = 'SERVER_ERROR';
                    shouldRetry = true; // Retry server errors
                } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                    errorMessage = 'Network timeout - connection reset';
                    errorType = 'NETWORK_ERROR';
                    shouldRetry = true; // Retry network errors
                } else {
                    shouldRetry = true; // Retry other errors
                }

                // If this is the last attempt or we shouldn't retry, return error
                if (attempt === maxRetries || !shouldRetry) {
                    return {
                        success: false,
                        error: errorMessage,
                        waybill: waybill,
                        errorType: errorType,
                        statusCode: error.response?.status,
                        attempts: attempt
                    };
                }

                // Wait before retrying (exponential backoff)
                const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, etc.
                logger.info('⏳ Retrying tracking request', {
                    waybill: waybill,
                    attempt: attempt,
                    nextAttempt: attempt + 1,
                    delayMs: delayMs
                });
                
                await this.delay(delayMs);
            }
        }

        // This should never be reached, but just in case
            return {
                success: false,
            error: 'Max retries exceeded',
            waybill: waybill,
            errorType: 'MAX_RETRIES_EXCEEDED',
            attempts: maxRetries
        };
    }

    /**
     * Utility method for delays
     * @param {number} ms - Milliseconds to delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate Shipping Label (Packing Slip)
     * NOTE: Delhivery packing_slip API returns JSON only, not PDF URLs
     * @param {string} waybill - Waybill/AWB number
     * @param {Object} options - Options for label generation
     * @param {boolean} options.pdf - DEPRECATED: Always returns JSON (frontend must render to PDF)
     * @param {string} options.pdf_size - DEPRECATED: Not supported by Delhivery API
     * @returns {Promise} Shipping label response with JSON data
     */
    async generateShippingLabel(waybill, options = {}) {
        try {
            logger.info('🏷️ Generating shipping label', {
                waybill,
                note: 'Delhivery returns JSON only, no PDF URL'
            });

            let apiKeyToUse = this.apiKey || process.env.DELHIVERY_API_KEY;
            if (!apiKeyToUse || apiKeyToUse === 'your-delhivery-api-key') {
                logger.error('❌ Delhivery API Key not configured for label generation');
                throw new Error('Delhivery API Key not configured. Please set DELHIVERY_API_KEY in environment variables.');
            }

            if (!waybill) {
                throw new Error('Waybill number is required for label generation');
            }

            // Use production URL directly
            const productionURL = 'https://track.delhivery.com';
            const labelURL = `${productionURL}/api/p/packing_slip`;

            // Build query parameters - only wbns is required
            // Ensure waybill is a string and trim any whitespace
            const cleanWaybill = String(waybill).trim();
            
            if (!cleanWaybill || cleanWaybill.length === 0) {
                throw new Error('Waybill number is empty or invalid');
            }

            const params = {
                // Delhivery docs historically used both `wbns` (waybill numbers) and `waybill`
                // Some accounts only honour one of them, so send both for maximum compatibility
                wbns: cleanWaybill,
                waybill: cleanWaybill
            };

            // Support optional PDF generation and sizing parameters
            if (typeof options.pdf !== 'undefined') {
                params.pdf = options.pdf ? 'true' : 'false';
            }

            if (options.pdf_size) {
                params.pdf_size = options.pdf_size;
            }

            if (options.extra_params && typeof options.extra_params === 'object') {
                Object.assign(params, options.extra_params);
            }

            logger.info('📄 Calling Delhivery packing_slip API', {
                waybill: cleanWaybill,
                url: labelURL,
                params,
                note: 'This API returns JSON data only when pdf=false; pdf=true returns S3 link'
            });

            const response = await axios.get(labelURL, {
                params: params,
                headers: {
                    'Authorization': `Token ${apiKeyToUse}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                responseType: 'json',
                timeout: 30000,
                validateStatus: function (status) {
                    // Accept any status code so we can handle errors properly
                    return status >= 200 && status < 500;
                }
            });

            logger.info('📄 Delhivery API Response', {
                waybill: cleanWaybill,
                responseStatus: response.status,
                hasData: !!response.data,
                dataType: typeof response.data,
                isArray: Array.isArray(response.data),
                responseKeys: response.data ? Object.keys(response.data) : [],
                hasPackages: response.data?.packages ? true : false,
                packagesLength: response.data?.packages?.length || 0,
                packagesFound: response.data?.packages_found || 0,
                hasPdfUrl: !!(response.data?.pdf_url || response.data?.label_url || response.data?.link),
                responseDataPreview: response.data ? JSON.stringify(response.data).substring(0, 500) : null
            });

            // Check if response indicates an error from Delhivery
            if (response.status >= 400) {
                const errorMessage = response.data?.message || 
                                   response.data?.error || 
                                   response.data?.Message ||
                                   `Delhivery API returned status ${response.status}`;
                
                logger.error('❌ Delhivery API error response', {
                    waybill: cleanWaybill,
                    status: response.status,
                    error: errorMessage,
                    responseData: response.data
                });
                
                return {
                    success: false,
                    error: errorMessage,
                    response_data: response.data
                };
            }

            // Check if response.data indicates an error
            if (response.data && typeof response.data === 'object') {
                // Delhivery sometimes returns errors in the data object
                if (response.data.remarks && Array.isArray(response.data.remarks) && response.data.remarks.length > 0) {
                    const errorRemarks = response.data.remarks.filter(r => 
                        r && (r.toLowerCase().includes('error') || 
                             r.toLowerCase().includes('failed') ||
                             r.toLowerCase().includes('invalid'))
                    );
                    
                    if (errorRemarks.length > 0) {
                        logger.error('❌ Delhivery API error in remarks', {
                            waybill: cleanWaybill,
                            remarks: response.data.remarks
                        });
                        
                        return {
                            success: false,
                            error: errorRemarks.join('; ') || 'Delhivery API returned error remarks',
                            response_data: response.data
                        };
                    }
                }
            }

            // Success case - return the data
            if (response.status >= 200 && response.status < 300) {
                // Delhivery packing_slip API behaviour:
                //  - pdf=false (default): returns JSON payload with package data
                //  - pdf=true: returns an object containing an S3 link for the PDF
                const pdfUrl = response.data?.pdf_url || response.data?.label_url || response.data?.link || null;

                return {
                    success: true,
                    data: response.data,
                    json_data: response.data,
                    pdf_url: pdfUrl,
                    message: pdfUrl
                        ? 'Shipping label PDF link received from Delhivery'
                        : 'Shipping label JSON data received from Delhivery',
                    note: pdfUrl
                        ? 'PDF link supplied by Delhivery'
                        : 'Frontend must render JSON to PDF'
                };
            }

            // Fallback for unexpected status codes
            logger.warn('⚠️ Delhivery API returned unexpected status', {
                waybill: cleanWaybill,
                status: response.status,
                data: response.data
            });
            
            return {
                success: false,
                error: `Delhivery API returned unexpected status: ${response.status}`,
                response_data: response.data
            };

        } catch (error) {
            // Enhanced error logging
            const errorDetails = {
                waybill,
                errorMessage: error.message,
                errorCode: error.code
            };

            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                errorDetails.status = error.response.status;
                errorDetails.responseData = error.response.data;
                errorDetails.responseHeaders = error.response.headers;
                
                // Try to extract meaningful error message
                const errorMessage = error.response.data?.message || 
                                   error.response.data?.error || 
                                   error.response.data?.Message ||
                                   error.response.data?.remarks?.[0] ||
                                   `Delhivery API error (${error.response.status})`;
                
                logger.error('❌ Shipping label generation failed - API error', errorDetails);
                
                return {
                    success: false,
                    error: errorMessage,
                    status: error.response.status,
                    response_data: error.response.data
                };
            } else if (error.request) {
                // The request was made but no response was received
                logger.error('❌ Shipping label generation failed - No response', errorDetails);
                
                return {
                    success: false,
                    error: 'No response from Delhivery API. Please check your network connection and try again.'
                };
            } else {
                // Something happened in setting up the request that triggered an Error
                logger.error('❌ Shipping label generation failed - Request setup error', errorDetails);
                
                return {
                    success: false,
                    error: error.message || 'Failed to generate shipping label'
                };
            }
        }
    }

    /**
     * Calculate Shipping Cost
     * @param {Object} costData - Shipping cost calculation parameters
     * @returns {Promise} Shipping cost response
     */
    async calculateShippingCost(costData) {
        try {
            const params = {
                md: costData.billing_mode || 'S', // E for Express, S for Surface
                ss: costData.shipment_status || 'Delivered',
                d_pin: costData.destination_pincode,
                o_pin: costData.origin_pincode,
                cgm: costData.chargeable_weight, // in grams
                pt: costData.payment_type || 'Pre-paid'
            };

            const response = await this.client.get('/kinko/v1/invoice/charges/.json', {
                params: params
            });

            return {
                success: true,
                data: response.data,
                calculated_cost: response.data.total_amount || 0
            };
        } catch (error) {
            logger.error('❌ Shipping cost calculation failed', {
                error: error.response?.data || error.message,
                params: costData
            });

            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Failed to calculate shipping cost'
            };
        }
    }

    /**
     * Get Service Health Status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            service: 'Delhivery API',
            status: this.validateApiKey() ? 'configured' : 'not_configured',
            environment: this.isProduction ? 'production' : 'staging',
            base_url: this.apiURL,
            api_key_present: !!this.apiKey
        };
    }
}

module.exports = new DelhiveryService();