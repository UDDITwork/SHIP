// Location: backend/models/Staff.js
// Model for Staff accounts created by admins
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const staffSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Staff name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false // Don't return password by default
  },
  role: {
    type: String,
    enum: ['admin', 'staff'],
    default: 'staff'
  },
  created_by: {
    type: String,
    required: true,
    trim: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  // Staff permissions - all default false (admin must grant)
  permissions: {
    // Menu access permissions
    dashboard: { type: Boolean, default: true },
    clients: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    tickets: { type: Boolean, default: true },
    billing: { type: Boolean, default: true },
    remittances: { type: Boolean, default: true },
    ndr: { type: Boolean, default: true },
    weight_discrepancies: { type: Boolean, default: true },
    // Optional menu access (admin must enable)
    wallet_recharge: { type: Boolean, default: false },
    rate_cards: { type: Boolean, default: false },
    carriers: { type: Boolean, default: false },
    staff_management: { type: Boolean, default: false },
    // Action permissions
    can_recharge_wallet: { type: Boolean, default: false },
    can_change_client_category: { type: Boolean, default: false },
    can_generate_monthly_billing: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
staffSchema.index({ email: 1 }, { unique: true });
staffSchema.index({ role: 1 });
staffSchema.index({ is_active: 1 });

// Hash password before saving
staffSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Hash password with cost of 10
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
staffSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Static method to find by email
staffSchema.statics.findByEmail = async function(email) {
  return this.findOne({ email: email.toLowerCase().trim() }).select('+password');
};

const Staff = mongoose.model('Staff', staffSchema);

module.exports = Staff;

