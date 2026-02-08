// Location: backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // User Reference
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Product Template Name (display name for saved template)
  name: {
    type: String,
    required: [true, 'Product template name is required'],
    trim: true,
    index: true
  },

  // Product Details
  product_name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },

  unit_price: {
    type: Number,
    min: [0, 'Unit price cannot be negative'],
    default: 0
  },

  tax: {
    type: Number,
    min: [0, 'Tax cannot be negative'],
    default: 0
  },

  discount: {
    type: Number,
    min: [0, 'Discount cannot be negative'],
    default: 0
  },

  hsn_code: {
    type: String,
    trim: true
  },

  category: {
    type: String,
    trim: true,
    index: true
  },

  sku: {
    type: String,
    trim: true,
    index: true
  },

  // Status
  is_default: {
    type: Boolean,
    default: false
  },

  is_active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Usage Statistics
  usage_count: {
    type: Number,
    default: 0
  },

  last_used: {
    type: Date
  },

  // Tags for easy searching
  tags: [{
    type: String,
    trim: true
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
productSchema.index({ user_id: 1, is_active: 1 });
productSchema.index({ user_id: 1, category: 1 });
productSchema.index({ user_id: 1, name: 1 });
productSchema.index({ user_id: 1, tags: 1 });

// Pre-save middleware to ensure only one default product per user
productSchema.pre('save', async function(next) {
  if (this.is_default && this.isModified('is_default')) {
    await this.constructor.updateMany(
      {
        user_id: this.user_id,
        _id: { $ne: this._id }
      },
      { is_default: false }
    );
  }
  next();
});

// Method to increment usage count
productSchema.methods.incrementUsage = function() {
  this.usage_count += 1;
  this.last_used = new Date();
  return this.save();
};

// Static method to search products
productSchema.statics.searchProducts = function(userId, searchTerm) {
  const searchRegex = new RegExp(searchTerm, 'i');
  return this.find({
    user_id: userId,
    is_active: true,
    $or: [
      { name: searchRegex },
      { product_name: searchRegex },
      { category: searchRegex },
      { sku: searchRegex },
      { hsn_code: searchRegex },
      { tags: { $in: [searchRegex] } }
    ]
  }).sort({ usage_count: -1, createdAt: -1 });
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
