const mongoose = require('mongoose');

// Standard zone schema (A-F)
const zoneSchema = new mongoose.Schema({
  A: { type: Number, required: true },
  B: { type: Number, required: true },
  C: { type: Number, required: true },
  D: { type: Number, required: true },
  E: { type: Number, required: true },
  F: { type: Number, required: true }
}, { _id: false });

// Regional zone schema (City, Regional, Metro, Rest of India, Special Zone)
const regionalZoneSchema = new mongoose.Schema({
  City: { type: Number, default: 0 },
  Regional: { type: Number, default: 0 },
  Metro: { type: Number, default: 0 },
  RestOfIndia: { type: Number, default: 0 },
  SpecialZone: { type: Number, default: 0 }
}, { _id: false });

const weightSlabSchema = new mongoose.Schema({
  condition: {
    type: String,
    required: true,
    trim: true
  },
  zones: {
    type: zoneSchema,
    required: true
  }
}, { _id: false });

const zoneDefinitionSchema = new mongoose.Schema({
  zone: {
    type: String,
    required: true,
    trim: true
  },
  definition: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const rateCardSchema = new mongoose.Schema({
  userCategory: {
    type: String,
    enum: ['New User', 'Basic User', 'Lite User', 'Advanced', 'Advanced User'],
    required: true,
    trim: true
  },
  // Legacy field - kept for backward compatibility
  carrier: {
    type: String,
    default: 'DELHIVERY',
    trim: true
  },
  // New carrier reference
  carrier_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Carrier',
    index: true
  },
  // Rate versioning for history tracking
  version: {
    type: Number,
    default: 1
  },
  effective_from: {
    type: Date,
    default: Date.now
  },
  effective_to: {
    type: Date,
    default: null // null means currently active
  },
  is_current: {
    type: Boolean,
    default: true,
    index: true
  },
  forwardCharges: {
    type: [weightSlabSchema],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Forward charges must be a non-empty array'
    }
  },
  rtoCharges: {
    type: [weightSlabSchema],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'RTO charges must be a non-empty array'
    }
  },
  codCharges: {
    percentage: {
      type: Number,
      required: true,
      min: 0
    },
    minimumAmount: {
      type: Number,
      required: true,
      min: 0
    },
    gstAdditional: {
      type: Boolean,
      default: true
    }
  },
  zoneDefinitions: {
    type: [zoneDefinitionSchema],
    required: true
  },
  termsAndConditions: {
    type: [String],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Terms and conditions must be a non-empty array'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
rateCardSchema.index({ userCategory: 1, carrier_id: 1, is_current: 1 });
rateCardSchema.index({ carrier_id: 1, is_current: 1 });
// Legacy index for backward compatibility (will be removed after migration)
rateCardSchema.index({ userCategory: 1 });

// Static method to find by user category (with normalization)
// Legacy method - works with old rate cards without carrier_id
rateCardSchema.statics.findByCategory = async function(userCategory) {
  // Normalize category name
  let normalizedCategory = userCategory;
  if (userCategory === 'Advanced User') {
    normalizedCategory = 'Advanced';
  }

  // Try exact match first (prefer current rates)
  let rateCard = await this.findOne({
    userCategory: normalizedCategory,
    is_current: { $ne: false } // Include both true and undefined (legacy)
  });

  // If not found, try case-insensitive search
  if (!rateCard) {
    rateCard = await this.findOne({
      userCategory: { $regex: new RegExp(`^${normalizedCategory}$`, 'i') },
      is_current: { $ne: false }
    });
  }

  return rateCard;
};

// Static method to find by carrier and category
rateCardSchema.statics.findByCarrierAndCategory = async function(carrierId, userCategory) {
  // Normalize category name
  let normalizedCategory = userCategory;
  if (userCategory === 'Advanced User') {
    normalizedCategory = 'Advanced';
  }

  return this.findOne({
    carrier_id: carrierId,
    userCategory: normalizedCategory,
    is_current: true
  }).populate('carrier_id');
};

// Static method to find all current rates for a carrier
rateCardSchema.statics.findCurrentByCarrier = async function(carrierId) {
  return this.find({
    carrier_id: carrierId,
    is_current: true
  }).populate('carrier_id').sort({ userCategory: 1 });
};

// Static method to find rate history for a carrier and category
rateCardSchema.statics.findRateHistory = async function(carrierId, userCategory) {
  let normalizedCategory = userCategory;
  if (userCategory === 'Advanced User') {
    normalizedCategory = 'Advanced';
  }

  return this.find({
    carrier_id: carrierId,
    userCategory: normalizedCategory
  }).populate('carrier_id').sort({ version: -1, effective_from: -1 });
};

// Instance method to archive current rate and create new version
rateCardSchema.methods.createNewVersion = async function(newRateData, updatedBy) {
  // Archive current rate
  this.is_current = false;
  this.effective_to = new Date();
  await this.save();

  // Create new version
  const RateCard = mongoose.model('RateCard');
  const newRate = new RateCard({
    ...newRateData,
    carrier_id: this.carrier_id,
    carrier: this.carrier,
    userCategory: this.userCategory,
    version: this.version + 1,
    effective_from: new Date(),
    effective_to: null,
    is_current: true
  });

  return newRate.save();
};

const RateCard = mongoose.model('RateCard', rateCardSchema);

module.exports = RateCard;

