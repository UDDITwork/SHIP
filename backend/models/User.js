const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const documentSchema = new mongoose.Schema({
  document_type: {
    type: String,
    enum: ['gst_certificate', 'photo_selfie', 'pan_card', 'aadhaar_card'],
    required: true
  },
  document_status: {
    type: String,
    enum: ['uploaded', 'pending', 'verified', 'rejected'],
    default: 'uploaded'
  },
  file_url: {
    type: String,
    required: true
  },
  upload_date: {
    type: Date,
    default: Date.now
  },
  verification_date: Date,
  rejection_reason: String,
  mimetype: String,
  original_filename: String
});

const userSchema = new mongoose.Schema({
  // Registration Data
  user_type: {
    type: String,
    enum: ['e-commerce-sellers', 'direct-to-consumer-brands', 'manufacturers-wholesalers', 'corporate-enterprise', 'courier-service-providers', 'individual-shippers'],
    required: true
  },
  monthly_shipments: {
    type: String,
    enum: ['10-300', '300-1000', '1000-2500', '2500-5000', 'Above 5000 Orders'],
    required: true
  },
  company_name: {
    type: String,
    required: true,
    trim: true
  },
  your_name: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  phone_number: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v);
      },
      message: 'Please enter a valid 10-digit phone number'
    }
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  reference_code: String,
  terms_accepted: {
    type: Boolean,
    required: true,
    validate: {
      validator: function(v) {
        return v === true;
      },
      message: 'Terms and conditions must be accepted'
    }
  },

  // Profile Enhancement Data
  client_id: {
    type: String,
    unique: true,
    sparse: true
  },
  gstin: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Please enter a valid GSTIN'
    }
  },
  joined_date: {
    type: Date,
    default: Date.now
  },

  // Address Information
  address: {
    full_address: String,
    landmark: String,
    pincode: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^[1-9][0-9]{5}$/.test(v);
        },
        message: 'Please enter a valid pincode'
      }
    },
    city: String,
    state: String
  },

  // Bank Details (encrypted)
  bank_details: {
    bank_name: String,
    account_number: String, // Will be encrypted
    ifsc_code: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
        },
        message: 'Please enter a valid IFSC code'
      }
    },
    branch_name: String,
    account_holder_name: String
  },

  // KYC Information
  kyc_status: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    verified_date: Date,
    verification_notes: String
  },

  // API Configuration
  api_details: {
    private_key: String, // Will be encrypted
    public_key: String,
    api_documentation_version: {
      type: String,
      default: '1.0'
    },
    key_generated_date: {
      type: Date,
      default: Date.now
    },
    last_key_reset: Date
  },

  // Document Management
  documents: [documentSchema],

  // Account Status
  account_status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending_verification'],
    default: 'pending_verification'
  },
  user_category: {
    type: String,
    enum: ['Basic User', 'Lite User', 'New User', 'Advanced', 'Advanced User'],
    default: 'Basic User'
  },
  wallet_balance: {
    type: Number,
    default: 0,
    min: 0
  },
  last_login: Date,
  login_attempts: {
    type: Number,
    default: 0
  },
  locked_until: Date,

  // Verification
  email_verified: {
    type: Boolean,
    default: false
  },
  phone_verified: {
    type: Boolean,
    default: false
  },
  email_verification_token: String,
  email_verification_expires: Date,
  password_reset_token: String,
  password_reset_expires: Date,

  // OTP Verification
  otp_verified: {
    type: Boolean,
    default: false
  },
  otp_token: String,
  otp_expires: Date,
  otp_attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  otp_locked_until: Date,

  // Profile Photo
  avatar_url: {
    type: String,
    default: null
  },
  company_logo_url: {
    type: String,
    default: null
  },
  company_logo_public_id: {
    type: String,
    default: null
  },
  company_logo_uploaded_at: {
    type: Date,
    default: null
  },

  // Label Settings
  label_settings: {
    label_types: {
      type: [String],
      enum: ['Standard', '2 In One', '4 In One', 'Thermal'],
      default: ['Standard']
    },
    use_order_channel_logo: {
      type: Boolean,
      default: false
    },
    component_visibility: {
      logo: { type: Boolean, default: true },
      customer_phone: { type: Boolean, default: false },
      dimensions: { type: Boolean, default: false },
      weight: { type: Boolean, default: false },
      payment_type: { type: Boolean, default: true },
      invoice_number: { type: Boolean, default: true },
      invoice_date: { type: Boolean, default: true },
      company_name: { type: Boolean, default: false },
      company_gstin: { type: Boolean, default: false },
      pickup_address: { type: Boolean, default: true },
      company_phone: { type: Boolean, default: false },
      sku: { type: Boolean, default: false },
      product_name: { type: Boolean, default: true },
      shipping_charges: { type: Boolean, default: false },
      amount_prepaid: { type: Boolean, default: true },
      amount_cod: { type: Boolean, default: true },
      message: { type: Boolean, default: true }
    },
    logo_url: {
      type: String,
      default: null
    }
  },

  // Geolocation (for fraud prevention)
  geolocation: {
    last_location: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number },
      captured_at: { type: Date }
    },
    location_history: [{
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      accuracy: { type: Number },
      captured_at: { type: Date, default: Date.now },
      login_timestamp: { type: Date }
    }],
    permission_granted: { type: Boolean, default: false }
  },

  // Timestamps
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Indexes (removed email index as it's already unique)
userSchema.index({ phone_number: 1 });
userSchema.index({ client_id: 1 });
userSchema.index({ 'api_details.public_key': 1 });
userSchema.index({ user_category: 1 });

// Pre-save middleware to generate client_id
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.client_id) {
    let clientId;
    let isUnique = false;
    
    while (!isUnique) {
      const randomNum = Math.floor(Math.random() * 100000);
      clientId = `SS${randomNum.toString().padStart(5, '0')}`;
      const existingUser = await this.constructor.findOne({ client_id: clientId });
      if (!existingUser) {
        isUnique = true;
      }
    }
    
    this.client_id = clientId;
  }

  // Generate API keys if not present
  if (this.isNew && !this.api_details.public_key) {
    const crypto = require('crypto');
    this.api_details.public_key = `pk_${crypto.randomBytes(16).toString('hex')}`;
    this.api_details.private_key = `sk_${crypto.randomBytes(32).toString('hex')}`;
  }

  // Update timestamp
  this.updated_at = Date.now();
  next();
});

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.password_reset_token = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.password_reset_expires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Instance method to generate email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const crypto = require('crypto');
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.email_verification_token = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  this.email_verification_expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Instance method to generate OTP token
userSchema.methods.createOTPToken = function() {
  const crypto = require('crypto');
  const otpToken = crypto.randomBytes(32).toString('hex');
  
  this.otp_token = crypto
    .createHash('sha256')
    .update(otpToken)
    .digest('hex');
  
  this.otp_expires = Date.now() + 5 * 60 * 1000; // 5 minutes
  this.otp_attempts = 0;
  this.otp_locked_until = undefined;
  
  return otpToken;
};

// Instance method to verify OTP token
userSchema.methods.verifyOTPToken = function(token) {
  const crypto = require('crypto');
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return this.otp_token === hashedToken && this.otp_expires > Date.now();
};

// Instance method to check if OTP is locked
userSchema.methods.isOTPLocked = function() {
  return this.otp_locked_until && this.otp_locked_until > Date.now();
};

// Instance method to increment OTP attempts
userSchema.methods.incrementOTPAttempts = function() {
  this.otp_attempts += 1;
  
  if (this.otp_attempts >= 3) {
    this.otp_locked_until = Date.now() + 15 * 60 * 1000; // Lock for 15 minutes
  }
  
  return this.save();
};

// Instance method to reset OTP attempts
userSchema.methods.resetOTPAttempts = function() {
  this.otp_attempts = 0;
  this.otp_locked_until = undefined;
  this.otp_verified = true;
  this.phone_verified = true;
  this.otp_token = undefined;
  this.otp_expires = undefined;
  
  return this.save();
};

// Static method to find by email or phone
// Returns a Mongoose query object (not executed) so that methods like .select() can be chained
userSchema.statics.findByEmailOrPhone = function(identifier) {
  const mongoose = require('mongoose');
  const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  const phoneRegex = /^[6-9]\d{9}$/;
  
  // Check database connection state before building query
  if (mongoose.connection.readyState !== 1) {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    const error = new Error(`Database is ${states[mongoose.connection.readyState]}`);
    error.name = 'DatabaseConnectionError';
    error.dbState = mongoose.connection.readyState;
    throw error;
  }
  
  let query = {};
  if (emailRegex.test(identifier)) {
    query = { email: identifier.toLowerCase() };
  } else if (phoneRegex.test(identifier)) {
    query = { phone_number: identifier };
  } else {
    // Return a query that will return null when executed
    return this.findOne({ _id: null });
  }
  
  // Return the query object without executing it
  return this.findOne(query);
};

// Additional indexes for faster login queries
// Note: email already has unique index (from unique: true), phone_number index exists at line 243
// Compound index for faster findByEmailOrPhone queries (sparse allows null values)
userSchema.index({ email: 1, phone_number: 1 }, { sparse: true, name: 'email_phone_lookup' });

// Transform output
userSchema.set('toJSON', {
  transform: function(doc, ret, options) {
    delete ret.password;
    delete ret.password_reset_token;
    delete ret.password_reset_expires;
    delete ret.email_verification_token;
    delete ret.email_verification_expires;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);