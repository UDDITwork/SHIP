// Location: backend/routes/warehouses.js
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const Warehouse = require('../models/Warehouse');
const delhiveryService = require('../services/delhiveryService');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const router = express.Router();

// @desc    Get all warehouses
// @route   GET /api/warehouses
// @access  Private
router.get('/', auth, [
  query('status').optional().isIn(['active', 'inactive', 'all'])
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
    const filterQuery = { user_id: userId };

    // Status filter
    if (req.query.status === 'active') {
      filterQuery.is_active = true;
    } else if (req.query.status === 'inactive') {
      filterQuery.is_active = false;
    }

    // Only show warehouses that are registered with Delhivery
    filterQuery.delhivery_registered = true;
    
    const warehouses = await Warehouse.find(filterQuery)
      .sort({ is_default: -1, createdAt: -1 });

    res.json({
      status: 'success',
      data: {
        warehouses,
        total_count: warehouses.length
      }
    });

  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching warehouses'
    });
  }
});

// @desc    Get warehouses for dropdown (active warehouses only)
// @route   GET /api/warehouses/dropdown
// @access  Private
router.get('/dropdown', auth, async (req, res) => {
  try {
    const warehouses = await Warehouse.find({
      user_id: req.user._id,
      is_active: true,
      delhivery_registered: true  // Only show Delhivery-registered warehouses
    })
    .select('_id name title address.city address.state address.pincode')
    .sort({ is_default: -1, createdAt: -1 });

    res.json({
      status: 'success',
      data: warehouses
    });
  } catch (error) {
    console.error('Get warehouses dropdown error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching warehouses for dropdown'
    });
  }
});

// @desc    Get single warehouse by ID
// @route   GET /api/warehouses/:id
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      delhivery_registered: true  // Only show Delhivery-registered warehouses
    });

    if (!warehouse) {
      return res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
    }

    res.json({
      status: 'success',
      data: warehouse
    });

  } catch (error) {
    console.error('Get warehouse error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching warehouse'
    });
  }
});

// @desc    Create new warehouse
// @route   POST /api/warehouses
// @access  Private
router.post('/', auth, [
  body('name').notEmpty().trim().withMessage('Warehouse name is required'),
  body('title').optional().trim(),
  body('registered_name').optional().trim(),
  body('contact_person.name').notEmpty().trim().withMessage('Contact person name is required'),
  body('contact_person.phone').matches(/^[6-9]\d{9}$/).withMessage('Valid phone number is required'),
  body('contact_person.alternative_phone').optional().matches(/^[6-9]\d{9}$/),
  body('contact_person.email').optional().isEmail(),
  body('address.full_address').notEmpty().trim().withMessage('Address is required'),
  body('address.landmark').optional().trim(),
  body('address.city').notEmpty().trim().withMessage('City is required'),
  body('address.state').notEmpty().trim().withMessage('State is required'),
  body('address.pincode').matches(/^\d{6}$/).withMessage('Valid 6-digit pincode is required'),
  body('address.country').optional().trim(),
  body('return_address.full_address').notEmpty().trim().withMessage('Return address is required for Delhivery registration'),
  body('return_address.city').notEmpty().trim().withMessage('Return city is required'),
  body('return_address.state').notEmpty().trim().withMessage('Return state is required'),
  body('return_address.pincode').matches(/^\d{6}$/).withMessage('Valid 6-digit return pincode is required'),
  body('return_address.country').optional().trim(),
  body('gstin').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
  body('support_contact.email').optional().isEmail(),
  body('support_contact.phone').optional().matches(/^[6-9]\d{9}$/),
  body('is_default').optional().isBoolean(),
  body('is_active').optional().isBoolean(),
  body('notes').optional().trim()
], async (req, res) => {
  const requestId = req.requestId || `warehouse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  try {
    logger.info('🏢 WAREHOUSE CREATION REQUEST', {
      requestId,
      userId: req.user._id,
      userEmail: req.user.email,
      warehouseName: req.body.name,
      title: req.body.title,
      rawPhone: req.body.contact_person?.phone,
      timestamp: new Date().toISOString()
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('⚠️ WAREHOUSE VALIDATION FAILED', {
        requestId,
        userId: req.user._id,
        errors: errors.array(),
        requestBody: req.body
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user._id;

    // Check if warehouse name already exists for this user
    const existingWarehouse = await Warehouse.findOne({
      user_id: userId,
      name: req.body.name
    });

    if (existingWarehouse) {
      logger.warn('⚠️ WAREHOUSE NAME ALREADY EXISTS', {
        requestId,
        userId,
        warehouseName: req.body.name,
        existingWarehouseId: existingWarehouse._id
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'Warehouse with this name already exists'
      });
    }

    // Helper function to clean phone number (remove +91 prefix if present)
    const cleanPhone = (phone) => {
      if (!phone) return phone;
      const original = phone;
      const cleaned = String(phone).replace(/\D/g, '');
      let result = cleaned;
      
      if (cleaned.length === 12 && cleaned.startsWith('91')) {
        result = cleaned.substring(2);
      } else if (cleaned.length > 10) {
        result = cleaned.substring(cleaned.length - 10);
      }
      
      if (original !== result) {
        logger.debug('📞 PHONE NUMBER CLEANED', {
          requestId,
          original,
          cleaned: result
        });
      }
      
      return result;
    };

    // Clean phone numbers before creating warehouse
    const warehouseData = { ...req.body };
    const phoneCleaning = {};
    
    if (warehouseData.contact_person?.phone) {
      const original = warehouseData.contact_person.phone;
      warehouseData.contact_person.phone = cleanPhone(warehouseData.contact_person.phone);
      phoneCleaning.contact_phone = { original, cleaned: warehouseData.contact_person.phone };
    }
    if (warehouseData.contact_person?.alternative_phone) {
      const original = warehouseData.contact_person.alternative_phone;
      warehouseData.contact_person.alternative_phone = cleanPhone(warehouseData.contact_person.alternative_phone);
      phoneCleaning.alternative_phone = { original, cleaned: warehouseData.contact_person.alternative_phone };
    }
    if (warehouseData.support_contact?.phone) {
      const original = warehouseData.support_contact.phone;
      warehouseData.support_contact.phone = cleanPhone(warehouseData.support_contact.phone);
      phoneCleaning.support_phone = { original, cleaned: warehouseData.support_contact.phone };
    }

    if (Object.keys(phoneCleaning).length > 0) {
      logger.info('📞 PHONE NUMBERS PROCESSED', {
        requestId,
        phoneCleaning
      });
    }

    logger.debug('📝 WAREHOUSE DATA PREPARED', {
      requestId,
      warehouseData: {
        name: warehouseData.name,
        title: warehouseData.title,
        city: warehouseData.address?.city,
        state: warehouseData.address?.state,
        pincode: warehouseData.address?.pincode,
        phone: warehouseData.contact_person?.phone,
        hasReturnAddress: !!warehouseData.return_address?.full_address
      }
    });

    // Prepare warehouse data for Delhivery registration
    const tempWarehouse = new Warehouse({
      ...warehouseData,
      user_id: userId
    });

    // Register with Delhivery FIRST (before saving to database)
    const delhiveryData = tempWarehouse.toDelhiveryFormat();
    
    logger.info('🚀 ATTEMPTING DELHIVERY REGISTRATION', {
      requestId,
      warehouseName: delhiveryData.name,
      delhiveryData: {
        name: delhiveryData.name,
        city: delhiveryData.city,
        pin: delhiveryData.pin
      }
    });
    
    const delhiveryResult = await delhiveryService.createWarehouse(delhiveryData);

    if (delhiveryResult.success) {
      // Only save to database if Delhivery registration succeeds
      const warehouse = new Warehouse({
        ...warehouseData,
        user_id: userId,
        delhivery_registered: true,
        delhivery_response: delhiveryResult.data,
        delhivery_warehouse_id: delhiveryResult.data.data?.name
      });

      try {
        await warehouse.save();
        logger.info('✅ WAREHOUSE SAVED TO DATABASE (Delhivery Registered)', {
          requestId,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          delhiveryWarehouseId: warehouse.delhivery_warehouse_id
        });
      } catch (saveError) {
        logger.error('❌ DATABASE SAVE ERROR AFTER DELHIVERY SUCCESS', {
          requestId,
          userId,
          error: saveError.message,
          errorStack: saveError.stack,
          warehouseData: {
            name: warehouseData.name,
            title: warehouseData.title
          },
          validationErrors: saveError.errors ? Object.keys(saveError.errors).map(key => ({
            field: key,
            message: saveError.errors[key].message
          })) : null
        });
        throw saveError;
      }

      const duration = Date.now() - startTime;
      logger.info('✅ WAREHOUSE CREATED SUCCESSFULLY', {
        requestId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        delhiveryRegistered: true,
        delhiveryWarehouseId: warehouse.delhivery_warehouse_id,
        duration: `${duration}ms`
      });

      res.status(201).json({
        status: 'success',
        message: 'Warehouse created and registered with Delhivery successfully',
        data: {
          warehouse,
          delhivery_response: delhiveryResult.data,
          business_hours: delhiveryResult.data.data?.business_hours,
          business_days: delhiveryResult.data.data?.business_days
        }
      });
    } else {
      // Delhivery registration failed - DO NOT save to database
      logger.error('❌ DELHIVERY REGISTRATION FAILED - WAREHOUSE NOT SAVED', {
        requestId,
        warehouseName: warehouseData.name,
        delhiveryError: delhiveryResult.error,
        action: 'Warehouse not saved to database due to Delhivery registration failure'
      });

      res.status(400).json({
        status: 'error',
        message: 'Failed to register warehouse with Delhivery. Warehouse not created.',
        error: {
          warehouse_name: warehouseData.name,
          delhivery_error: delhiveryResult.error,
          note: 'Warehouse is only saved after successful Delhivery registration'
        }
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Handle duplicate key error for warehouse_id index
    if (error.code === 11000 && error.keyPattern && error.keyPattern.warehouse_id) {
      logger.warn('⚠️ WAREHOUSE_ID INDEX ERROR DETECTED - Attempting auto-fix', {
        requestId,
        errorMessage: error.message,
        keyPattern: error.keyPattern
      });
      
      try {
        // Attempt to remove the problematic index
        const db = mongoose.connection.db;
        const collection = db.collection('warehouses');
        const indexes = await collection.indexes();
        const warehouseIdIndex = indexes.find(idx => 
          idx.key && idx.key.warehouse_id !== undefined
        );
        
        if (warehouseIdIndex) {
          await collection.dropIndex(warehouseIdIndex.name);
          logger.info('✅ Removed problematic warehouse_id index, retrying warehouse creation', {
            requestId,
            indexName: warehouseIdIndex.name
          });
          
          // Retry warehouse creation
          try {
            const warehouse = new Warehouse({
              ...warehouseData,
              user_id: userId
            });
            await warehouse.save();
            
            // Continue with Delhivery registration
            const delhiveryData = warehouse.toDelhiveryFormat();
            const delhiveryResult = await delhiveryService.createWarehouse(delhiveryData);
            
            if (delhiveryResult.success) {
              warehouse.delhivery_registered = true;
              warehouse.delhivery_response = delhiveryResult.data;
              warehouse.delhivery_warehouse_id = delhiveryResult.data.data?.name;
              await warehouse.save();
              
              logger.info('✅ WAREHOUSE CREATED SUCCESSFULLY (after index fix)', {
                requestId,
                warehouseId: warehouse._id
              });
              
              return res.status(201).json({
                status: 'success',
                message: 'Warehouse created successfully',
                data: {
                  warehouse,
                  delhivery_response: delhiveryResult.data
                }
              });
            } else {
              warehouse.delhivery_registered = false;
              warehouse.delhivery_response = { error: delhiveryResult.error };
              await warehouse.save();
              
              return res.status(201).json({
                status: 'partial_success',
                message: 'Warehouse created but Delhivery registration failed',
                data: { warehouse }
              });
            }
          } catch (retryError) {
            logger.error('❌ RETRY FAILED AFTER INDEX REMOVAL', {
              requestId,
              error: retryError.message
            });
            throw retryError;
          }
        }
      } catch (fixError) {
        logger.error('❌ Failed to auto-fix warehouse_id index', {
          requestId,
          error: fixError.message
        });
      }
    }
    
    logger.error('❌ WAREHOUSE CREATION ERROR', {
      requestId,
      userId: req.user?._id,
      userEmail: req.user?.email,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      duration: `${duration}ms`,
      requestBody: {
        name: req.body.name,
        title: req.body.title,
        phone: req.body.contact_person?.phone,
        city: req.body.address?.city,
        state: req.body.address?.state,
        pincode: req.body.address?.pincode
      },
      mongooseErrors: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      })) : null
    });
    
    console.error('Create warehouse error:', error);
    
    // Provide helpful error message for duplicate key errors
    let errorMessage = error.message || 'Server error creating warehouse';
    if (error.code === 11000) {
      if (error.keyPattern && error.keyPattern.warehouse_id) {
        errorMessage = 'Database index error. Please contact support or run the fix script: node backend/scripts/remove-warehouse-id-index.js';
      } else {
        const field = Object.keys(error.keyPattern || {})[0];
        errorMessage = `${field} already exists`;
      }
    }
    
    res.status(500).json({
      status: 'error',
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        errorDetails: {
          name: error.name,
          message: error.message,
          code: error.code,
          keyPattern: error.keyPattern
        }
      })
    });
  }
});

// @desc    Update warehouse
// @route   PUT /api/warehouses/:id
// @access  Private
router.put('/:id', auth, [
  body('name').optional().notEmpty().trim(),
  body('title').optional().trim(),
  body('contact_person.name').optional().notEmpty().trim(),
  body('contact_person.phone').optional().matches(/^[6-9]\d{9}$/),
  body('contact_person.alternative_phone').optional().matches(/^[6-9]\d{9}$/),
  body('contact_person.email').optional().isEmail(),
  body('address.full_address').optional().notEmpty().trim(),
  body('address.city').optional().notEmpty().trim(),
  body('address.state').optional().notEmpty().trim(),
  body('address.pincode').optional().matches(/^\d{6}$/),
  body('return_address.full_address').optional().notEmpty().trim(),
  body('return_address.city').optional().notEmpty().trim(),
  body('return_address.state').optional().notEmpty().trim(),
  body('return_address.pincode').optional().matches(/^\d{6}$/),
  body('gstin').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/),
  body('is_active').optional().isBoolean(),
  body('is_default').optional().isBoolean(),
  body('notes').optional().trim()
], async (req, res) => {
  const requestId = req.requestId || `warehouse_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!warehouse) {
      return res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
    }

    // Check if warehouse is registered with Delhivery
    if (!warehouse.delhivery_registered) {
      logger.warn('⚠️ Attempting to update warehouse not registered with Delhivery', {
        requestId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'Warehouse must be registered with Delhivery before it can be updated'
      });
    }

    // Prepare update data for Delhivery API
    // Per Delhivery API: Name used for identification, pin required, phone/address optional
    const delhiveryUpdateData = {
      name: warehouse.name  // Mandatory: warehouse name (cannot be changed, used for identification)
    };

    // Phone update (if provided)
    if (req.body.contact_person?.phone) {
      delhiveryUpdateData.phone = req.body.contact_person.phone;
    } else if (warehouse.contact_person?.phone) {
      // Use existing phone if not updating
      delhiveryUpdateData.phone = warehouse.contact_person.phone;
    }

    // Determine pincode (required by Delhivery API)
    let pincode;
    if (req.body.address?.pincode) {
      pincode = req.body.address.pincode.trim();
    } else if (warehouse.address?.pincode) {
      pincode = warehouse.address.pincode.toString().trim();
    }

    if (!pincode) {
      logger.warn('⚠️ Missing pincode for Delhivery warehouse update', {
        requestId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name
      });

      return res.status(400).json({
        status: 'error',
        message: 'Pincode is required to update warehouse in Delhivery'
      });
    }

    delhiveryUpdateData.pin = pincode;

    // Address update - format as combined string per Delhivery API format (without pin)
    // Format: "Address Line, City, State"
    let addressString = '';
    if (req.body.address) {
      const addr = req.body.address;
      const parts = [];
      if (addr.full_address) parts.push(addr.full_address);
      if (addr.city) parts.push(addr.city);
      if (addr.state) parts.push(addr.state);
      addressString = parts.join(', ');
    } else {
      // Use existing address if not updating
      const addr = warehouse.address;
      const parts = [];
      if (addr?.full_address) parts.push(addr.full_address);
      if (addr?.city) parts.push(addr.city);
      if (addr?.state) parts.push(addr.state);
      addressString = parts.join(', ');
    }

    if (addressString) {
      delhiveryUpdateData.address = addressString;
    }

    // Return address update - required for Delhivery
    // Format return address fields for Delhivery API
    let returnAddressString = '';
    let returnPincode = '';
    let returnCity = '';
    let returnState = '';

    if (req.body.return_address) {
      const retAddr = req.body.return_address;
      const parts = [];
      if (retAddr.full_address) parts.push(retAddr.full_address);
      if (retAddr.city) {
        parts.push(retAddr.city);
        returnCity = retAddr.city;
      }
      if (retAddr.state) {
        parts.push(retAddr.state);
        returnState = retAddr.state;
      }
      returnAddressString = parts.join(', ');
      if (retAddr.pincode) returnPincode = retAddr.pincode.toString().trim();
    } else if (warehouse.return_address) {
      // Use existing return address if not updating
      const retAddr = warehouse.return_address;
      const parts = [];
      if (retAddr?.full_address) parts.push(retAddr.full_address);
      if (retAddr?.city) {
        parts.push(retAddr.city);
        returnCity = retAddr.city;
      }
      if (retAddr?.state) {
        parts.push(retAddr.state);
        returnState = retAddr.state;
      }
      returnAddressString = parts.join(', ');
      if (retAddr?.pincode) returnPincode = retAddr.pincode.toString().trim();
    }

    // Fallback: if no return address, use pickup address (Delhivery requires it)
    if (!returnAddressString && addressString) {
      returnAddressString = addressString;
      returnPincode = pincode;
      returnCity = req.body.address?.city || warehouse.address?.city || '';
      returnState = req.body.address?.state || warehouse.address?.state || '';
    }

    // Add return address fields to Delhivery update payload
    if (returnAddressString) {
      delhiveryUpdateData.return_address = returnAddressString;
    }
    if (returnPincode) {
      delhiveryUpdateData.return_pin = returnPincode;
    }
    if (returnCity) {
      delhiveryUpdateData.return_city = returnCity;
    }
    if (returnState) {
      delhiveryUpdateData.return_state = returnState;
    }

    logger.info('🚀 Attempting Delhivery warehouse update', {
      requestId,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      delhiveryUpdateData: {
        name: delhiveryUpdateData.name,
        hasPin: !!delhiveryUpdateData.pin,
        hasPhone: !!delhiveryUpdateData.phone,
        hasAddress: !!delhiveryUpdateData.address
      }
    });

    // Update warehouse in Delhivery FIRST
    const delhiveryResult = await delhiveryService.updateWarehouse(delhiveryUpdateData);

    if (delhiveryResult.success) {
      // Delhivery update successful - now update database
      logger.info('✅ Delhivery warehouse update successful, updating database', {
        requestId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name
      });

      // Update database fields (merge nested objects properly)
      if (req.body.contact_person) {
        if (!warehouse.contact_person) warehouse.contact_person = {};
        Object.keys(req.body.contact_person).forEach(key => {
          if (req.body.contact_person[key] !== undefined) {
            warehouse.contact_person[key] = req.body.contact_person[key];
          }
        });
      }

      if (req.body.address) {
        if (!warehouse.address) warehouse.address = {};
        Object.keys(req.body.address).forEach(key => {
          if (req.body.address[key] !== undefined) {
            warehouse.address[key] = req.body.address[key];
          }
        });
      }

      if (req.body.return_address) {
        if (!warehouse.return_address) warehouse.return_address = {};
        Object.keys(req.body.return_address).forEach(key => {
          if (req.body.return_address[key] !== undefined) {
            warehouse.return_address[key] = req.body.return_address[key];
          }
        });
      }

      // Update other fields
      const fieldsToUpdate = ['title', 'registered_name', 'gstin', 'support_contact', 'is_active', 'is_default', 'notes'];
      fieldsToUpdate.forEach(field => {
        if (req.body[field] !== undefined) {
          warehouse[field] = req.body[field];
        }
      });

      // Store Delhivery response
      if (delhiveryResult.delhivery_response) {
        warehouse.delhivery_response = delhiveryResult.delhivery_response;
      }

      await warehouse.save();

      logger.info('✅ Warehouse updated successfully in database', {
        requestId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name
      });

      res.json({
        status: 'success',
        message: 'Warehouse updated successfully in Delhivery and database',
        data: {
          warehouse,
          delhivery_response: delhiveryResult.delhivery_response
        }
      });
    } else {
      // Delhivery update failed
      logger.error('❌ Delhivery warehouse update failed', {
        requestId,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        delhiveryError: delhiveryResult.error
      });

      return res.status(400).json({
        status: 'error',
        message: 'Failed to update warehouse in Delhivery. Database not updated.',
        error: {
          delhivery_error: delhiveryResult.error,
          note: 'Database is only updated after successful Delhivery update'
        }
      });
    }

  } catch (error) {
    logger.error('❌ Warehouse update error', {
      requestId,
      warehouseId: req.params.id,
      userId: req.user._id,
      error: error.message,
      errorStack: error.stack
    });

    console.error('Update warehouse error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating warehouse'
    });
  }
});

// @desc    Set warehouse as default
// @route   PATCH /api/warehouses/:id/set-default
// @access  Private
router.patch('/:id/set-default', auth, async (req, res) => {
  try {
    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!warehouse) {
      return res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
    }

    // Set as default (pre-save hook will handle removing default from others)
    warehouse.is_default = true;
    await warehouse.save();

    res.json({
      status: 'success',
      message: 'Warehouse set as default successfully',
      data: warehouse
    });

  } catch (error) {
    console.error('Set default warehouse error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error setting default warehouse'
    });
  }
});

// @desc    Toggle warehouse status (active/inactive)
// @route   PATCH /api/warehouses/:id/toggle-status
// @access  Private
router.patch('/:id/toggle-status', auth, async (req, res) => {
  try {
    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!warehouse) {
      return res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
    }

    // Toggle status
    warehouse.is_active = !warehouse.is_active;
    await warehouse.save();

    res.json({
      status: 'success',
      message: `Warehouse ${warehouse.is_active ? 'activated' : 'deactivated'} successfully`,
      data: warehouse
    });

  } catch (error) {
    console.error('Toggle warehouse status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error toggling warehouse status'
    });
  }
});

// @desc    Delete warehouse
// @route   DELETE /api/warehouses/:id
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!warehouse) {
      return res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
    }

    // Check if warehouse is being used in any orders
    const Order = require('../models/Order');
    const ordersCount = await Order.countDocuments({
      user_id: req.user._id,
      'pickup_address.name': warehouse.name
    });

    if (ordersCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot delete warehouse. It is being used in ${ordersCount} order(s). Please deactivate it instead.`
      });
    }

    await warehouse.deleteOne();

    res.json({
      status: 'success',
      message: 'Warehouse deleted successfully'
    });

  } catch (error) {
    console.error('Delete warehouse error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error deleting warehouse'
    });
  }
});

// @desc    Get warehouse statistics
// @route   GET /api/warehouses/statistics/overview
// @access  Private
router.get('/statistics/overview', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = {
      total_warehouses: await Warehouse.countDocuments({ user_id: userId }),
      active_warehouses: await Warehouse.countDocuments({ user_id: userId, is_active: true }),
      inactive_warehouses: await Warehouse.countDocuments({ user_id: userId, is_active: false }),
      delhivery_registered: await Warehouse.countDocuments({ user_id: userId, delhivery_registered: true })
    };

    const defaultWarehouse = await Warehouse.findOne({
      user_id: userId,
      is_default: true,
      is_active: true,
      delhivery_registered: true  // Only show Delhivery-registered warehouses
    });

    res.json({
      status: 'success',
      data: {
        stats,
        default_warehouse: defaultWarehouse
      }
    });

  } catch (error) {
    console.error('Warehouse statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching warehouse statistics'
    });
  }
});

module.exports = router;