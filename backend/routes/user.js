// Location: backend/routes/user.js
const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const cloudinaryService = require('../services/cloudinaryService');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
    }
  }
});

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.json({
      status: 'success',
      data: user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching profile'
    });
  }
});

// @desc    Update user details
// @route   PUT /api/user/profile
// @access  Private
router.put('/profile', auth, [
  body('company_name').optional().trim(),
  body('your_name').optional().trim(),
  body('email').optional().isEmail(),
  body('phone_number').optional().matches(/^[6-9]\d{9}$/),
  body('gstin').optional().matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update allowed fields
    const allowedFields = ['company_name', 'your_name', 'email', 'phone_number', 'gstin'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();

    res.json({
      status: 'success',
      message: 'Profile updated successfully',
      data: user
    });

  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Email or phone number already exists'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Server error updating profile'
    });
  }
});

// @desc    Update address
// @route   PUT /api/user/address
// @access  Private
router.put('/address', auth, [
  body('full_address').optional().trim(),
  body('landmark').optional().trim(),
  body('pincode').optional().matches(/^[1-9][0-9]{5}$/),
  body('city').optional().trim(),
  body('state').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update address fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        if (!user.address) user.address = {};
        user.address[key] = req.body[key];
      }
    });

    await user.save();

    res.json({
      status: 'success',
      message: 'Address updated successfully',
      data: user
    });

  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating address'
    });
  }
});

// @desc    Update bank details
// @route   PUT /api/user/bank-details
// @access  Private
router.put('/bank-details', auth, [
  body('bank_name').optional().trim(),
  body('account_number').optional().trim(),
  body('ifsc_code').optional().matches(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  body('branch_name').optional().trim(),
  body('account_holder_name').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Update bank details
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        if (!user.bank_details) user.bank_details = {};
        user.bank_details[key] = req.body[key];
      }
    });

    await user.save();

    res.json({
      status: 'success',
      message: 'Bank details updated successfully',
      data: user
    });

  } catch (error) {
    console.error('Update bank details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating bank details'
    });
  }
});

// @desc    Upload document
// @route   POST /api/user/upload-document
// @access  Private
router.post('/upload-document', auth, upload.single('file'), [
  body('document_type').isIn(['gst_certificate', 'photo', 'photo_selfie', 'pan', 'pan_card', 'aadhar', 'aadhaar_card', 'bank_statement']).withMessage('Valid document type is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const { document_type } = req.body;

    // Upload to Cloudinary
    const resourceType = cloudinaryService.getResourceType(req.file.mimetype);
    const uploadResult = await cloudinaryService.uploadFile(req.file.buffer, {
      folder: 'shipsarthi/documents',
      resource_type: resourceType
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload document to cloud storage'
      });
    }

    // Update user document
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Remove existing document of same type
    user.documents = user.documents.filter(doc => doc.document_type !== document_type);

    // Add new document
    user.documents.push({
      document_type: document_type,
      document_status: 'uploaded',
      file_url: uploadResult.url,
      upload_date: new Date()
    });

    await user.save();

    res.json({
      status: 'success',
      message: 'Document uploaded successfully',
      data: {
        document_type,
        file_url: uploadResult.url,
        document_status: 'uploaded'
      }
    });

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Server error uploading document'
    });
  }
});

// @desc    Reset password
// @route   POST /api/user/reset-password
// @access  Private
router.post('/reset-password', auth, [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    const { current_password, new_password } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(current_password);

    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = new_password;
    await user.save();

    res.json({
      status: 'success',
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error resetting password'
    });
  }
});

// @desc    Get API keys
// @route   GET /api/user/api-keys
// @access  Private
router.get('/api-keys', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('api_details');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.json({
      status: 'success',
      data: {
        public_key: user.api_details.public_key,
        private_key: user.api_details.private_key, // Mask in frontend
        api_documentation_version: user.api_details.api_documentation_version,
        key_generated_date: user.api_details.key_generated_date
      }
    });

  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching API keys'
    });
  }
});

// @desc    Regenerate API keys
// @route   POST /api/user/regenerate-api-keys
// @access  Private
router.post('/regenerate-api-keys', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const crypto = require('crypto');
    user.api_details.public_key = `pk_${crypto.randomBytes(16).toString('hex')}`;
    user.api_details.private_key = `sk_${crypto.randomBytes(32).toString('hex')}`;
    user.api_details.last_key_reset = new Date();

    await user.save();

    res.json({
      status: 'success',
      message: 'API keys regenerated successfully',
      data: {
        public_key: user.api_details.public_key,
        private_key: user.api_details.private_key
      }
    });

  } catch (error) {
    console.error('Regenerate API keys error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error regenerating API keys'
    });
  }
});

// @desc    Get user wallet balance
// @route   GET /api/user/wallet-balance
// @access  Private
router.get('/wallet-balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('wallet_balance');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get wallet balance from user model - ensure it's a number
    const walletBalance = parseFloat(user.wallet_balance) || 0;
    // Round to 2 decimal places
    const roundedBalance = Math.round(walletBalance * 100) / 100;

    res.json({
      success: true,
      data: {
        balance: roundedBalance,
        currency: 'INR'
      }
    });

  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching wallet balance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get user documents
// @route   GET /api/users/documents
// @access  Private
router.get('/documents', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('documents');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.json({
      status: 'success',
      data: user.documents || []
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching documents'
    });
  }
});

// @desc    Update user avatar
// @route   POST /api/users/avatar
// @access  Private
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No avatar file uploaded'
      });
    }

    // Upload to Cloudinary
    const resourceType = cloudinaryService.getResourceType(req.file.mimetype);
    const uploadResult = await cloudinaryService.uploadFile(req.file.buffer, {
      folder: 'shipsarthi/avatars',
      resource_type: resourceType
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload avatar to cloud storage'
      });
    }

    // Update user avatar
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    user.avatar_url = uploadResult.url;
    await user.save();

    res.json({
      status: 'success',
      message: 'Avatar updated successfully',
      data: {
        avatar_url: uploadResult.url
      }
    });

  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating avatar'
    });
  }
});

// @desc    Get API documentation
// @route   GET /api/users/api-docs
// @access  Private
router.get('/api-docs', auth, async (req, res) => {
  try {
    res.json({
      status: 'success',
      data: {
        version: '1.0',
        download_url: '/api/users/api-docs/download'
      }
    });

  } catch (error) {
    console.error('Get API docs error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching API documentation'
    });
  }
});

// @desc    Get KYC status
// @route   GET /api/users/kyc-status
// @access  Private
router.get('/kyc-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('kyc_status documents');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check document requirements (accept both old and new naming conventions)
    const requiredDocuments = ['gst_certificate', 'photo', 'pan', 'aadhar'];
    const uploadedDocuments = (user.documents || []).map(doc => doc.document_type);
    const docAliases = {
      'photo': ['photo', 'photo_selfie'],
      'pan': ['pan', 'pan_card'],
      'aadhar': ['aadhar', 'aadhaar_card'],
      'gst_certificate': ['gst_certificate']
    };
    const hasDoc = (type) => (docAliases[type] || [type]).some(t => uploadedDocuments.includes(t));
    const missingDocuments = requiredDocuments.filter(doc => !hasDoc(doc));

    res.json({
      status: 'success',
      data: {
        status: user.kyc_status.status,
        verified_date: user.kyc_status.verified_date,
        requirements: missingDocuments
      }
    });

  } catch (error) {
    console.error('Get KYC status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching KYC status'
    });
  }
});

// @desc    Submit KYC for verification
// @route   POST /api/users/submit-kyc
// @access  Private
router.post('/submit-kyc', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if all required documents are uploaded (accept both old and new naming conventions)
    const requiredDocuments = ['gst_certificate', 'photo', 'pan', 'aadhar'];
    const uploadedDocuments = (user.documents || []).map(doc => doc.document_type);
    const docAliases = {
      'photo': ['photo', 'photo_selfie'],
      'pan': ['pan', 'pan_card'],
      'aadhar': ['aadhar', 'aadhaar_card'],
      'gst_certificate': ['gst_certificate']
    };
    const hasDoc = (type) => (docAliases[type] || [type]).some(t => uploadedDocuments.includes(t));
    const missingDocuments = requiredDocuments.filter(doc => !hasDoc(doc));

    if (missingDocuments.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please upload all required documents before submitting KYC',
        missing_documents: missingDocuments
      });
    }

    // Update KYC status to pending
    user.kyc_status.status = 'pending';
    await user.save();

    res.json({
      status: 'success',
      message: 'KYC submitted for verification'
    });

  } catch (error) {
    console.error('Submit KYC error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error submitting KYC'
    });
  }
});

// @desc    Save user geolocation
// @route   POST /api/user/location
// @access  Private
router.post('/location', auth, [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('accuracy').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }

    const { latitude, longitude, accuracy } = req.body;
    const now = new Date();

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        'geolocation.last_location': {
          latitude, longitude, accuracy, captured_at: now
        },
        'geolocation.permission_granted': true
      },
      $push: {
        'geolocation.location_history': {
          latitude, longitude, accuracy,
          captured_at: now,
          login_timestamp: now
        }
      }
    });

    res.json({
      status: 'success',
      message: 'Location saved'
    });

  } catch (error) {
    console.error('Save location error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error saving location'
    });
  }
});

module.exports = router;