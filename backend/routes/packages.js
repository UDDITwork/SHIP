const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const Package = require('../models/Package');

const router = express.Router();

// Test endpoint for debugging
router.post('/test', auth, (req, res) => {
  console.log('Test endpoint hit');
  console.log('Request body:', req.body);
  console.log('User:', req.user);
  res.json({
    status: 'success',
    message: 'Test endpoint working',
    data: req.body,
    user: req.user._id
  });
});

// Simple package creation test
router.post('/test-create', auth, async (req, res) => {
  try {
    console.log('=== TEST PACKAGE CREATION ===');
    console.log('User:', req.user._id);
    
    const testPackage = new Package({
      name: 'Test Package',
      package_type: 'Single Package (B2C)',
      product_name: 'Test Product',
      dimensions: {
        length: 10,
        width: 10,
        height: 10
      },
      weight: 1.0,
      user_id: req.user._id
    });
    
    console.log('Test package object:', testPackage);
    const savedPackage = await testPackage.save();
    console.log('Test package saved:', savedPackage._id);
    
    res.json({
      status: 'success',
      message: 'Test package created successfully',
      data: savedPackage
    });
  } catch (error) {
    console.error('Test package creation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Test package creation failed',
      error: error.message
    });
  }
});

// @desc    Get all packages with filters
// @route   GET /api/packages
// @access  Private
router.get('/', auth, [
  query('package_type').optional().isIn(['Single Package (B2C)', 'Multiple Package (B2C)', 'Multiple Package (B2B)', 'all']),
  query('category').optional().trim(),
  query('search').optional().trim(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
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
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = { user_id: userId, is_active: true };

    if (req.query.package_type && req.query.package_type !== 'all') {
      filterQuery.package_type = req.query.package_type;
    }

    if (req.query.category) {
      filterQuery.category = new RegExp(req.query.category, 'i');
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { product_name: searchRegex },
        { category: searchRegex },
        { sku: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    // Get packages with pagination
    const packages = await Package.find(filterQuery)
      .sort({ is_default: -1, usage_count: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPackages = await Package.countDocuments(filterQuery);

    res.json({
      status: 'success',
      data: {
        packages,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalPackages / limit),
          total_packages: totalPackages,
          per_page: limit
        }
      }
    });

  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching packages'
    });
  }
});

// @desc    Search packages
// @route   GET /api/packages/search
// @access  Private
router.get('/search', auth, [
  query('q').trim().notEmpty().withMessage('Search query is required')
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
    const searchTerm = req.query.q;

    const packages = await Package.searchPackages(userId, searchTerm);

    res.json({
      status: 'success',
      data: packages
    });

  } catch (error) {
    console.error('Search packages error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error searching packages'
    });
  }
});

// @desc    Get popular packages
// @route   GET /api/packages/popular
// @access  Private
router.get('/popular', auth, [
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    const packages = await Package.getPopularPackages(userId, limit);

    res.json({
      status: 'success',
      data: packages
    });

  } catch (error) {
    console.error('Get popular packages error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching popular packages'
    });
  }
});

// @desc    Get package statistics
// @route   GET /api/packages/statistics
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Package.getPackageCountByType(userId);
    const totalPackages = await Package.countDocuments({ user_id: userId, is_active: true });
    const popularPackages = await Package.getPopularPackages(userId, 5);

    res.json({
      status: 'success',
      data: {
        total_packages: totalPackages,
        count_by_type: stats,
        popular_packages: popularPackages
      }
    });

  } catch (error) {
    console.error('Get package statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching package statistics'
    });
  }
});

// @desc    Get single package by ID
// @route   GET /api/packages/:id
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const package = await Package.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      is_active: true
    });

    if (!package) {
      return res.status(404).json({
        status: 'error',
        message: 'Package not found'
      });
    }

    res.json({
      status: 'success',
      data: package
    });

  } catch (error) {
    console.error('Get package error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching package'
    });
  }
});

// @desc    Create new package
// @route   POST /api/packages
// @access  Private
router.post('/', auth, [
  body('name').trim().notEmpty().withMessage('Package name is required'),
  body('package_type').isIn(['Single Package (B2C)', 'Multiple Package (B2C)', 'Multiple Package (B2B)']).withMessage('Valid package type is required'),
  body('dimensions.length').isFloat({ min: 1 }).withMessage('Valid length is required'),
  body('dimensions.width').isFloat({ min: 1 }).withMessage('Valid width is required'),
  body('dimensions.height').isFloat({ min: 1 }).withMessage('Valid height is required'),
  body('weight').isFloat({ min: 0.1 }).withMessage('Valid weight is required'),
  body('product_name').trim().notEmpty().withMessage('Product name is required'),
  body('number_of_boxes').optional().isInt({ min: 1 }),
  body('weight_per_box').optional().isFloat({ min: 0.1 }),
  body('unit_price').optional().isFloat({ min: 0 }),
  body('discount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    console.log('=== PACKAGE CREATION REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', req.headers);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user._id;

    console.log('Creating package for user:', userId);
    console.log('Package data:', req.body);

    // Create package data
    const packageData = {
      ...req.body,
      user_id: userId
    };

    console.log('Creating package with data:', packageData);
    const package = new Package(packageData);
    console.log('Package object created:', package);
    await package.save();
    console.log('Package saved successfully:', package._id);

    res.status(201).json({
      status: 'success',
      message: 'Package created successfully',
      data: package
    });

  } catch (error) {
    console.error('Create package error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error creating package',
      error: error.message,
      details: error
    });
  }
});

// @desc    Update package
// @route   PUT /api/packages/:id
// @access  Private
router.put('/:id', auth, [
  body('name').optional().trim().notEmpty(),
  body('package_type').optional().isIn(['Single Package (B2C)', 'Multiple Package (B2C)', 'Multiple Package (B2B)']),
  body('dimensions.length').optional().isFloat({ min: 1 }),
  body('dimensions.width').optional().isFloat({ min: 1 }),
  body('dimensions.height').optional().isFloat({ min: 1 }),
  body('weight').optional().isFloat({ min: 0.1 }),
  body('product_name').optional().trim().notEmpty(),
  body('unit_price').optional().isFloat({ min: 0 }),
  body('discount').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 })
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

    const package = await Package.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!package) {
      return res.status(404).json({
        status: 'error',
        message: 'Package not found'
      });
    }

    // Update package fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        package[key] = req.body[key];
      }
    });

    await package.save();

    res.json({
      status: 'success',
      message: 'Package updated successfully',
      data: package
    });

  } catch (error) {
    console.error('Update package error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating package'
    });
  }
});

// @desc    Delete package
// @route   DELETE /api/packages/:id
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const package = await Package.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!package) {
      return res.status(404).json({
        status: 'error',
        message: 'Package not found'
      });
    }

    // Soft delete by setting is_active to false
    package.is_active = false;
    await package.save();

    res.json({
      status: 'success',
      message: 'Package deleted successfully'
    });

  } catch (error) {
    console.error('Delete package error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error deleting package'
    });
  }
});

// @desc    Set package as default
// @route   PATCH /api/packages/:id/set-default
// @access  Private
router.patch('/:id/set-default', auth, async (req, res) => {
  try {
    const package = await Package.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      is_active: true
    });

    if (!package) {
      return res.status(404).json({
        status: 'error',
        message: 'Package not found'
      });
    }

    // Set this package as default (pre-save middleware will handle removing default from others)
    package.is_default = true;
    await package.save();

    res.json({
      status: 'success',
      message: 'Package set as default successfully',
      data: package
    });

  } catch (error) {
    console.error('Set default package error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error setting default package'
    });
  }
});

// @desc    Get packages by type
// @route   GET /api/packages/type/:type
// @access  Private
router.get('/type/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const userId = req.user._id;

    const packages = await Package.getPackagesByType(userId, type);

    res.json({
      status: 'success',
      data: packages
    });

  } catch (error) {
    console.error('Get packages by type error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching packages by type'
    });
  }
});

// @desc    Search packages
// @route   GET /api/packages/search
// @access  Private
router.get('/search', auth, [
  query('q').trim().notEmpty().withMessage('Search query is required')
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
    const searchTerm = req.query.q;

    const packages = await Package.searchPackages(userId, searchTerm);

    res.json({
      status: 'success',
      data: packages
    });

  } catch (error) {
    console.error('Search packages error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error searching packages'
    });
  }
});

// @desc    Get popular packages
// @route   GET /api/packages/popular
// @access  Private
router.get('/popular', auth, [
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    const packages = await Package.getPopularPackages(userId, limit);

    res.json({
      status: 'success',
      data: packages
    });

  } catch (error) {
    console.error('Get popular packages error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching popular packages'
    });
  }
});

// @desc    Get package statistics
// @route   GET /api/packages/statistics
// @access  Private
router.get('/statistics', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Package.getPackageCountByType(userId);
    const totalPackages = await Package.countDocuments({ user_id: userId, is_active: true });
    const popularPackages = await Package.getPopularPackages(userId, 5);

    res.json({
      status: 'success',
      data: {
        total_packages: totalPackages,
        count_by_type: stats,
        popular_packages: popularPackages
      }
    });

  } catch (error) {
    console.error('Get package statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching package statistics'
    });
  }
});

module.exports = router;

