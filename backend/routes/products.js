const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const Product = require('../models/Product');

const router = express.Router();

// @desc    Get all products with filters
// @route   GET /api/products
// @access  Private
router.get('/', auth, [
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
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filterQuery = { user_id: userId, is_active: true };

    if (req.query.category) {
      filterQuery.category = new RegExp(req.query.category, 'i');
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { name: searchRegex },
        { product_name: searchRegex },
        { category: searchRegex },
        { sku: searchRegex },
        { hsn_code: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    const products = await Product.find(filterQuery)
      .sort({ is_default: -1, usage_count: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalProducts = await Product.countDocuments(filterQuery);

    res.json({
      status: 'success',
      data: {
        products,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalProducts / limit),
          total_products: totalProducts,
          per_page: limit
        }
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching products'
    });
  }
});

// @desc    Create new product
// @route   POST /api/products
// @access  Private
router.post('/', auth, [
  body('name').trim().notEmpty().withMessage('Product template name is required'),
  body('product_name').trim().notEmpty().withMessage('Product name is required'),
  body('unit_price').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
  body('discount').optional().isFloat({ min: 0 })
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

    const productData = {
      ...req.body,
      user_id: req.user._id
    };

    // Process tags if provided as string
    if (typeof productData.tags === 'string') {
      productData.tags = productData.tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    const product = new Product(productData);
    await product.save();

    res.status(201).json({
      status: 'success',
      message: 'Product created successfully',
      data: product
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error creating product',
      error: error.message
    });
  }
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private
router.put('/:id', auth, [
  body('name').optional().trim().notEmpty(),
  body('product_name').optional().trim().notEmpty(),
  body('unit_price').optional().isFloat({ min: 0 }),
  body('tax').optional().isFloat({ min: 0 }),
  body('discount').optional().isFloat({ min: 0 })
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

    const product = await Product.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    // Process tags if provided as string
    if (typeof req.body.tags === 'string') {
      req.body.tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);
    }

    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        product[key] = req.body[key];
      }
    });

    await product.save();

    res.json({
      status: 'success',
      message: 'Product updated successfully',
      data: product
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating product'
    });
  }
});

// @desc    Delete product (soft delete)
// @route   DELETE /api/products/:id
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    product.is_active = false;
    await product.save();

    res.json({
      status: 'success',
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error deleting product'
    });
  }
});

// @desc    Set product as default
// @route   PATCH /api/products/:id/set-default
// @access  Private
router.patch('/:id/set-default', auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      user_id: req.user._id,
      is_active: true
    });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
    }

    product.is_default = true;
    await product.save();

    res.json({
      status: 'success',
      message: 'Product set as default successfully',
      data: product
    });

  } catch (error) {
    console.error('Set default product error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error setting default product'
    });
  }
});

module.exports = router;
