// Location: backend/models/Carrier.js
// Model for Carrier/Shipping Partners
const mongoose = require('mongoose');

const carrierSchema = new mongoose.Schema({
  // Carrier Identification
  carrier_code: {
    type: String,
    required: [true, 'Carrier code is required'],
    unique: true,
    uppercase: true,
    trim: true
    // Examples: 'DELHIVERY_SURFACE', 'DELHIVERY_AIR', 'DTDC_SURFACE', 'DTDC_AIR', 'DTDC_PREMIUM'
  },
  display_name: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true
    // Examples: 'Delhivery Surface', 'Delhivery Air', 'DTDC Surface'
  },
  carrier_group: {
    type: String,
    required: [true, 'Carrier group is required'],
    uppercase: true,
    trim: true
    // Examples: 'DELHIVERY', 'DTDC', 'BLUEDART'
  },
  service_type: {
    type: String,
    enum: ['surface', 'air', 'premium', 'express'],
    required: [true, 'Service type is required']
  },

  // Status
  is_active: {
    type: Boolean,
    default: true,
    index: true
  },

  // Zone Configuration
  zone_type: {
    type: String,
    enum: ['standard', 'regional'],
    default: 'standard'
    // 'standard': Zone A, B, C, D, E, F
    // 'regional': City, Regional, Metro, Rest of India, Special Zone
  },

  // Weight Slab Configuration
  weight_slab_type: {
    type: String,
    enum: ['option1', 'option2'],
    default: 'option1'
    // 'option1': 0.25, 0.5, 1, 1.5, 2, 2.5, 3...20kg (granular)
    // 'option2': 5kg, Add 1kg till 9kg, 10kg, add 1kg till 19kg, 20kg, add 1kg
  },

  // API Integration Details (for future use)
  api_config: {
    base_url: { type: String, default: '' },
    api_key_required: { type: Boolean, default: true },
    tracking_url_template: { type: String, default: '' },
    waybill_prefix: { type: String, default: '' }
  },

  // Metadata
  description: {
    type: String,
    default: '',
    trim: true
  },
  logo_url: {
    type: String,
    default: ''
  },
  priority_order: {
    type: Number,
    default: 0
    // For sorting carriers in lists (lower number = higher priority)
  },

  // Audit fields
  created_by: {
    type: String,
    trim: true
  },
  updated_by: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
carrierSchema.index({ carrier_code: 1 }, { unique: true });
carrierSchema.index({ is_active: 1, carrier_group: 1 });
carrierSchema.index({ display_name: 1 });
carrierSchema.index({ priority_order: 1 });

// Virtual for zone labels based on zone_type
carrierSchema.virtual('zone_labels').get(function() {
  if (this.zone_type === 'regional') {
    return ['City', 'Regional', 'Metro', 'Rest of India', 'Special Zone'];
  }
  return ['A', 'B', 'C', 'D', 'E', 'F'];
});

// Virtual for weight slab labels based on weight_slab_type
carrierSchema.virtual('weight_slab_labels').get(function() {
  if (this.weight_slab_type === 'option2') {
    return [
      '0-5 kg',
      'Add. 1 kg till 9 kg',
      '10 kg',
      'Add. 1 kg till 19 kg',
      '20 kg',
      'Add. 1 kg above 20 kg'
    ];
  }
  // option1 - granular slabs (used by current Delhivery)
  return [
    '0-250 gm',
    '250-500 gm',
    'Add. 500 gm till 5 kg',
    'Upto 5 kgs',
    'Add. 1 kgs till 10 kg',
    'Upto 10 kgs',
    'Add. 1 kgs'
  ];
});

// Static method to find active carriers
carrierSchema.statics.findActive = async function() {
  return this.find({ is_active: true }).sort({ priority_order: 1, display_name: 1 });
};

// Static method to find by carrier code
carrierSchema.statics.findByCode = async function(code) {
  return this.findOne({ carrier_code: code.toUpperCase().trim() });
};

// Static method to find by carrier group
carrierSchema.statics.findByGroup = async function(group) {
  return this.find({ carrier_group: group.toUpperCase().trim() }).sort({ priority_order: 1 });
};

const Carrier = mongoose.model('Carrier', carrierSchema);

module.exports = Carrier;
