const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const cloudinaryService = require('../services/cloudinaryService');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

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

// Configure multer for avatar uploads (JPEG/PNG only)
const avatarUpload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed for profile photos'));
    }
  }
});

// Configure multer for company logo uploads (JPEG/PNG only)
const logoUpload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, JPG, and SVG images are allowed for company logos'));
    }
  }
});

// Get user profile data
router.get('/profile', auth, async (req, res) => {
  try {
    // Use _id instead of id for better compatibility
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('-password -api_details.private_key');
    
    if (!user) {
      logger.error('❌ USER NOT FOUND', { userId, userFromAuth: req.user });
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Return user data with original field names for frontend compatibility
    const userProfile = {
      _id: user._id,
      company_name: user.company_name,
      your_name: user.your_name,
      email: user.email,
      phone_number: user.phone_number,
      user_type: user.user_type,
      monthly_shipments: user.monthly_shipments,
      state: user.state,
      gstin: user.gstin,
      client_id: user.client_id,
      account_status: user.account_status,
      wallet_balance: user.wallet_balance,
      kyc_status: user.kyc_status,
      joined_date: user.joined_date,
      address: user.address,
      bank_details: user.bank_details,
      documents: user.documents,
      api_details: user.api_details,
      email_verified: user.email_verified,
      phone_verified: user.phone_verified,
      avatar_url: user.avatar_url,
      company_logo_url: user.company_logo_url,
      company_logo_public_id: user.company_logo_public_id,
      company_logo_uploaded_at: user.company_logo_uploaded_at
    };

    res.json({
      status: 'success',
      data: userProfile
    });
  } catch (error) {
    logger.error('❌ Error fetching user profile', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { company_name, your_name, phone_number, gstin, address, bank_details } = req.body;
    
    // Use _id instead of id for better compatibility
    const userId = req.user._id || req.user.id;
    
    // Debug: Log incoming data
    logger.debug('📥 BACKEND RECEIVED DATA', {
      userId: userId,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // Fetch user to check KYC status
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      logger.warn('❌ USER NOT FOUND', { userId });
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // KYC field locking - prevent editing if KYC is verified
    let updateData = {};
    if (existingUser.kyc_status?.status === 'verified') {
      // These fields are locked post-KYC verification
      const lockedFields = ['company_name', 'your_name', 'gstin', 'phone_number', 'email', 'bank_details'];
      const attemptedChanges = [];

      if (company_name && company_name !== existingUser.company_name) attemptedChanges.push('company_name');
      if (your_name && your_name !== existingUser.your_name) attemptedChanges.push('your_name');
      if (gstin && gstin !== existingUser.gstin) attemptedChanges.push('gstin');
      if (phone_number && phone_number !== existingUser.phone_number) attemptedChanges.push('phone_number');

      // Deep equality check for bank_details object
      if (bank_details && JSON.stringify(bank_details) !== JSON.stringify(existingUser.bank_details || {})) {
        attemptedChanges.push('bank_details');
      }

      if (attemptedChanges.length > 0) {
        logger.warn('🔒 KYC VERIFIED - FIELD UPDATE BLOCKED', {
          userId,
          attemptedChanges
        });
        return res.status(403).json({
          success: false,
          message: 'Your KYC has been approved. Profile details cannot be edited. Please contact admin or raise a support ticket.',
          locked_fields: attemptedChanges
        });
      }

      // Only address updates allowed for verified users
      if (address) updateData.address = address;
    } else {
      // KYC not verified - allow all updates
      if (company_name) updateData.company_name = company_name;
      if (your_name) updateData.your_name = your_name;
      if (phone_number) updateData.phone_number = phone_number;
      if (gstin) updateData.gstin = gstin;
      if (address) updateData.address = address;
      if (bank_details) updateData.bank_details = bank_details;
    }
    
    logger.debug('🔄 UPDATE DATA TO SAVE', updateData);

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -api_details.private_key');

    if (!user) {
      logger.warn('❌ USER NOT FOUND AFTER UPDATE', { userId });
      return res.status(404).json({
        status: 'error',
        message: 'User not found or was deleted'
      });
    }

    logger.info('✅ DATABASE UPDATED SUCCESSFULLY', {
      userId: user._id,
      updatedFields: Object.keys(updateData),
      newData: {
        company_name: user.company_name,
        your_name: user.your_name,
        phone_number: user.phone_number,
        gstin: user.gstin
      }
    });

    res.json({
      status: 'success',
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    logger.error('❌ Error updating user profile', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id,
      updateData: req.body
    });
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = {};
      Object.keys(error.errors).forEach(key => {
        validationErrors[key] = error.errors[key].message;
      });
      
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Handle other errors
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get user dashboard data
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('company_name wallet_balance joined_date');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // This would typically fetch from Orders, Shipments, etc.
    // For now, returning mock data
    const dashboardData = {
      user: {
        companyName: user.company_name,
        walletBalance: user.wallet_balance,
        joinedDate: user.joined_date
      },
      metrics: {
        todaysOrders: { current: 100, previous: 60 },
        todaysRevenue: { current: 100, previous: 80 },
        averageShippingCost: { amount: 15000, totalOrders: 900 }
      },
      shipmentStatus: {
        totalOrder: 1400,
        newOrder: 1800,
        pickupPending: 300,
        inTransit: 900,
        delivered: 2400,
        ndrPending: 1400,
        rto: 60
      }
    };

    res.json({
      status: 'success',
      data: dashboardData
    });
  } catch (error) {
    logger.error('❌ Error fetching dashboard data', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Helper function to generate initials
function generateInitials(companyName) {
  const words = companyName.trim().split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return companyName.substring(0, 2).toUpperCase();
}

// @desc    Upload document
// @route   POST /api/users/upload-document
// @access  Private
router.post('/upload-document', auth, upload.single('file'), [
  body('document_type').isIn(['gst_certificate', 'photo_selfie', 'pan_card', 'aadhaar_card']).withMessage('Valid document type is required')
], async (req, res) => {
  logger.info('📥 UPLOAD ENDPOINT HIT', {
    method: req.method,
    url: req.url,
    body: req.body,
    file: req.file ? 'File received' : 'No file',
    timestamp: new Date().toISOString()
  });
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
    logger.info('📤 UPLOADING TO CLOUDINARY', {
      fileName: req.file.originalname,
      mimetype: req.file.mimetype,
      resourceType: resourceType,
      fileSize: req.file.size,
      isPDF: req.file.mimetype === 'application/pdf'
    });
    
    // ✅ Use dedicated document upload method for PDFs
    const uploadResult = await cloudinaryService.uploadDocument(req.file.buffer, {
      folder: 'shipsarthi/documents',
      mimetype: req.file.mimetype  // ✅ Pass mimetype for proper resource type
    });

    if (!uploadResult.success) {
      logger.error('❌ CLOUDINARY UPLOAD FAILED', { uploadResult });
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload document to cloud storage',
        details: uploadResult.error || 'Unknown error'
      });
    }
    
    logger.info('✅ CLOUDINARY UPLOAD SUCCESS', {
      publicId: uploadResult.public_id,
      url: uploadResult.secure_url,
      resourceType: uploadResult.resource_type
    });

    // Update user document
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

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
      upload_date: new Date(),
      mimetype: req.file.mimetype,
      original_filename: req.file.originalname
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
    logger.error('❌ Upload document error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: error.message || 'Server error uploading document'
    });
  }
});

// @desc    Get user documents
// @route   GET /api/users/documents
// @access  Private
router.get('/documents', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('documents');

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
    logger.error('❌ Get documents error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching documents'
    });
  }
});

// @desc    Proxy document download with proper headers
// @route   GET /api/users/documents/download
// @access  Private
router.get('/documents/download', auth, async (req, res) => {
  const requestId = `doc_dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  logger.info('📥 Document download request started', {
    requestId,
    userId: req.user._id || req.user.id,
    documentType: req.query.documentType,
    url: req.query.url ? req.query.url.substring(0, 100) + '...' : null, // Log partial URL for security
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  try {
    const { url, documentType } = req.query;

    // Aggressive validation and logging
    if (!url || !documentType) {
      logger.warn('❌ Document download validation failed', {
        requestId,
        userId: req.user._id || req.user.id,
        missingFields: { url: !url, documentType: !documentType },
        providedQuery: req.query
      });
      return res.status(400).json({
        status: 'error',
        message: 'URL and documentType are required'
      });
    }

    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      logger.error('❌ Invalid URL format in document download', {
        requestId,
        userId: req.user._id || req.user.id,
        url: url.substring(0, 50),
        documentType
      });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid URL format'
      });
    }

    const userId = req.user._id || req.user.id;
    
    logger.debug('🔍 Fetching user documents', {
      requestId,
      userId,
      documentType
    });

    let user;
    try {
      user = await User.findById(userId).select('documents');
    } catch (dbError) {
      logger.error('❌ Database error fetching user for document download', {
        requestId,
        userId,
        error: dbError.message,
        stack: dbError.stack,
        documentType
      });
      return res.status(500).json({
        status: 'error',
        message: 'Database error'
      });
    }

    if (!user) {
      logger.warn('⚠️ User not found for document download', {
        requestId,
        userId,
        documentType
      });
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    logger.debug('🔍 Verifying document ownership', {
      requestId,
      userId,
      documentType,
      totalDocuments: user.documents?.length || 0
    });

    // Verify the document belongs to this user
    const document = user.documents?.find(doc => doc.document_type === documentType && doc.file_url === url);
    if (!document) {
      logger.warn('⚠️ Document access denied or not found', {
        requestId,
        userId,
        documentType,
        urlExists: !!url,
        userDocuments: user.documents?.map(d => d.document_type) || []
      });
      return res.status(403).json({
        status: 'error',
        message: 'Document not found or access denied'
      });
    }

    // Use stored MIME type from database
    let mimeType = document.mimetype || 'application/octet-stream';
    let extension = '.bin';
    
    // Determine extension from stored MIME type
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'application/pdf': '.pdf'
    };
    
    extension = mimeToExt[mimeType] || extension;
    
    // Generate filename with correct extension
    const documentTypeNames = {
      'gst_certificate': 'GST_Certificate',
      'photo_selfie': 'Photo_Selfie',
      'pan_card': 'PAN_Card',
      'aadhaar_card': 'Aadhaar_Card'
    };
    const filename = `${documentTypeNames[documentType] || 'document'}${extension}`;

    logger.info('✅ Document ownership verified', {
      requestId,
      userId,
      documentType,
      documentId: document._id || 'unknown',
      storedMimeType: mimeType,
      extension,
      filename
    });

    // Fetch file from Cloudinary URL
    const https = require('https');
    const http = require('http');
    const URL = require('url');
    
    let fileUrl;
    try {
      fileUrl = URL.parse(url);
    } catch (parseError) {
      logger.error('❌ URL parsing error', {
        requestId,
        userId,
        url: url.substring(0, 100),
        error: parseError.message,
        stack: parseError.stack
      });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid URL format'
      });
    }

    if (!fileUrl.hostname) {
      logger.error('❌ Invalid URL - no hostname', {
        requestId,
        userId,
        parsedUrl: fileUrl
      });
      return res.status(400).json({
        status: 'error',
        message: 'Invalid URL - missing hostname'
      });
    }

    const client = fileUrl.protocol === 'https:' ? https : http;

    // Track if response has been sent to prevent double-send errors
    let responseSent = false;
    
    const sendError = (statusCode, message, errorData = {}) => {
      if (responseSent) {
        logger.error('❌ Attempted to send response after already sent', {
          requestId,
          statusCode,
          message,
          errorData
        });
        return;
      }
      responseSent = true;
      res.status(statusCode).json({
        status: 'error',
        message
      });
    };

    // Set request timeout (30 seconds)
    const requestTimeout = setTimeout(() => {
      if (!responseSent) {
        logger.error('❌ Document download timeout', {
          requestId,
          userId,
          documentType,
          url: url.substring(0, 100),
          timeout: '30s'
        });
        sendError(504, 'Request timeout - file download took too long');
      }
    }, 30000);

    // Fetch the file
    logger.debug('🌐 Initiating file fetch from Cloudinary', {
      requestId,
      userId,
      documentType,
      hostname: fileUrl.hostname,
      protocol: fileUrl.protocol
    });

    const fileRequest = client.get(url, (fileResponse) => {
      const duration = Date.now() - startTime;

      logger.debug('📡 Cloudinary response received', {
        requestId,
        userId,
        statusCode: fileResponse.statusCode,
        headers: {
          'content-type': fileResponse.headers['content-type'],
          'content-length': fileResponse.headers['content-length']
        },
        duration: `${duration}ms`
      });

      // Clear timeout on response
      clearTimeout(requestTimeout);

      // Check if response already sent (defensive check)
      if (responseSent) {
        logger.warn('⚠️ Response already sent, ignoring file response', {
          requestId,
          statusCode: fileResponse.statusCode
        });
        fileResponse.destroy(); // Clean up the stream
        return;
      }

      // Check for redirect
      if (fileResponse.statusCode === 301 || fileResponse.statusCode === 302) {
        const redirectUrl = fileResponse.headers.location;
        logger.info('🔄 Redirect detected', {
          requestId,
          userId,
          redirectUrl: redirectUrl ? redirectUrl.substring(0, 100) : null,
          statusCode: fileResponse.statusCode
        });
        if (redirectUrl) {
          responseSent = true;
          return res.redirect(redirectUrl);
        }
      }

      if (fileResponse.statusCode !== 200) {
        logger.error('❌ Cloudinary returned non-200 status', {
          requestId,
          userId,
          documentType,
          statusCode: fileResponse.statusCode,
          statusMessage: fileResponse.statusMessage,
          headers: fileResponse.headers
        });
        sendError(fileResponse.statusCode, 'Failed to fetch document from storage');
        return;
      }

      // Use Cloudinary MIME type only as fallback if not stored in database
      const cloudinaryContentType = fileResponse.headers['content-type'];
      if (cloudinaryContentType && !document.mimetype) {
        mimeType = cloudinaryContentType.split(';')[0].trim();
        logger.debug('📄 Content-Type from Cloudinary (fallback)', {
          requestId,
          userId,
          originalContentType: cloudinaryContentType,
          parsedMimeType: mimeType
        });
        
        // Update extension if needed
        const mimeToExt = {
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/png': '.png',
          'image/gif': '.gif',
          'application/pdf': '.pdf'
        };
        
        if (mimeToExt[mimeType]) {
          extension = mimeToExt[mimeType];
          const documentTypeNames = {
            'gst_certificate': 'GST_Certificate',
            'photo_selfie': 'Photo_Selfie',
            'pan_card': 'PAN_Card',
            'aadhaar_card': 'Aadhaar_Card'
          };
          filename = `${documentTypeNames[documentType] || 'document'}${extension}`;
        }
      }

      logger.info('📤 Setting download headers', {
        requestId,
        userId,
        filename,
        contentType: mimeType,
        contentLength: fileResponse.headers['content-length']
      });

      try {
        // Set proper headers
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        responseSent = true;

        // Track stream errors
        fileResponse.on('error', (streamError) => {
          logger.error('❌ Stream error during file download', {
            requestId,
            userId,
            documentType,
            error: streamError.message,
            stack: streamError.stack
          });
          if (!res.headersSent) {
            sendError(500, 'Error streaming document');
          }
        });

        // Track when stream finishes
        fileResponse.on('end', () => {
          const totalDuration = Date.now() - startTime;
          logger.info('✅ Document download completed', {
            requestId,
            userId,
            documentType,
            filename,
            totalDuration: `${totalDuration}ms`,
            contentLength: fileResponse.headers['content-length']
          });
        });

        // Pipe the response
        fileResponse.pipe(res);
      } catch (headerError) {
        logger.error('❌ Error setting response headers', {
          requestId,
          userId,
          error: headerError.message,
          stack: headerError.stack
        });
        sendError(500, 'Error setting download headers');
      }
    });

    // Handle request errors
    fileRequest.on('error', (error) => {
      clearTimeout(requestTimeout);
      logger.error('❌ Network error fetching document', {
        requestId,
        userId,
        documentType,
        error: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        hostname: fileUrl.hostname,
        stack: error.stack
      });
      if (!responseSent) {
        sendError(500, 'Network error downloading document', {
          code: error.code,
          message: error.message
        });
      }
    });

    // Handle request timeout
    fileRequest.setTimeout(25000, () => {
      clearTimeout(requestTimeout);
      fileRequest.destroy();
      logger.error('❌ Request timeout fetching document', {
        requestId,
        userId,
        documentType,
        timeout: '25s'
      });
      if (!responseSent) {
        sendError(504, 'Request timeout - file download took too long');
      }
    });

  } catch (error) {
    logger.error('❌ Unexpected error in document download', {
      requestId,
      userId: req.user._id || req.user.id,
      documentType: req.query.documentType,
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: 'Server error downloading document'
      });
    }
  }
});

// @desc    Reset password
// @route   POST /api/users/reset-password
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

    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(current_password);
    if (!isPasswordValid) {
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
      message: 'Password updated successfully'
    });

  } catch (error) {
    logger.error('❌ Reset password error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: error.message || 'Server error updating password'
    });
  }
});

// @desc    Get API keys
// @route   GET /api/users/api-keys
// @access  Private
router.get('/api-keys', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('api_details');

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
        private_key: user.api_details.private_key,
        api_documentation_version: user.api_details.api_documentation_version
      }
    });

  } catch (error) {
    logger.error('❌ Get API keys error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching API keys'
    });
  }
});

// @desc    Regenerate API keys
// @route   POST /api/users/regenerate-api-keys
// @access  Private
router.post('/regenerate-api-keys', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Generate new API keys
    const crypto = require('crypto');
    const newPublicKey = `pk_${crypto.randomBytes(16).toString('hex')}`;
    const newPrivateKey = `sk_${crypto.randomBytes(32).toString('hex')}`;

    user.api_details.public_key = newPublicKey;
    user.api_details.private_key = newPrivateKey;
    user.api_details.last_key_reset = new Date();

    await user.save();

    res.json({
      status: 'success',
      message: 'API keys regenerated successfully',
      data: {
        public_key: newPublicKey,
        private_key: newPrivateKey
      }
    });

  } catch (error) {
    logger.error('❌ Regenerate API keys error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error regenerating API keys'
    });
  }
});

// @desc    Get KYC status
// @route   GET /api/users/kyc-status
// @access  Private
router.get('/kyc-status', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('kyc_status documents');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check document requirements
    const requiredDocuments = ['gst_certificate', 'photo_selfie', 'pan_card', 'aadhaar_card'];
    const uploadedDocuments = user.documents.map(doc => doc.document_type);
    const missingDocuments = requiredDocuments.filter(doc => !uploadedDocuments.includes(doc));

    res.json({
      status: 'success',
      data: {
        status: user.kyc_status.status,
        verified_date: user.kyc_status.verified_date,
        requirements: missingDocuments
      }
    });

  } catch (error) {
    logger.error('❌ Get KYC status error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
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
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if all required documents are uploaded
    const requiredDocuments = ['gst_certificate', 'photo_selfie', 'pan_card', 'aadhaar_card'];
    const uploadedDocuments = user.documents.map(doc => doc.document_type);
    const missingDocuments = requiredDocuments.filter(doc => !uploadedDocuments.includes(doc));

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
    logger.error('❌ Submit KYC error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error submitting KYC'
    });
  }
});

// @desc    Update user avatar
// @route   POST /api/users/avatar
// @access  Private
router.post('/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No avatar file uploaded'
      });
    }

    // Validate file type (JPEG/PNG only)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        status: 'error',
        message: 'Only JPEG and PNG images are allowed for profile photos'
      });
    }

    // Upload to Cloudinary
    const resourceType = cloudinaryService.getResourceType(req.file.mimetype);
    const uploadResult = await cloudinaryService.uploadFile(req.file.buffer, {
      folder: 'shipsarthi/avatars',
      resource_type: resourceType,
      mimetype: req.file.mimetype
    });

    if (!uploadResult.success) {
      logger.error('❌ Cloudinary upload failed', { uploadResult });
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload avatar to cloud storage'
      });
    }

    // Update user avatar
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete old avatar from Cloudinary if exists
    if (user.avatar_url) {
      try {
        const oldPublicId = user.avatar_url.split('/').pop().split('.')[0];
        const oldFolder = 'shipsarthi/avatars';
        await cloudinaryService.deleteFile(`${oldFolder}/${oldPublicId}`, 'image');
      } catch (deleteError) {
        logger.warn('⚠️ Failed to delete old avatar', { error: deleteError.message });
        // Continue even if deletion fails
      }
    }

    user.avatar_url = uploadResult.url;
    await user.save();

    logger.info('✅ Avatar updated successfully', {
      userId,
      avatarUrl: uploadResult.url
    });

    res.json({
      status: 'success',
      message: 'Avatar updated successfully',
      data: {
        avatar_url: uploadResult.url
      }
    });

  } catch (error) {
    logger.error('❌ Update avatar error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error updating avatar'
    });
  }
});

// @desc    Upload or update company logo
// @route   POST /api/users/company-logo
// @access  Private
router.post('/company-logo', auth, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No logo file uploaded'
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        status: 'error',
        message: 'Only JPEG, PNG, JPG, and SVG images are allowed for company logos'
      });
    }

    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const uploadResult = await cloudinaryService.uploadFile(req.file.buffer, {
      folder: 'shipsarthi/company-logos',
      resource_type: 'image',
      mimetype: req.file.mimetype
    });

    if (!uploadResult.success) {
      logger.error('❌ Cloudinary logo upload failed', { uploadResult });
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload company logo to cloud storage'
      });
    }

    if (user.company_logo_public_id) {
      try {
        await cloudinaryService.deleteFile(user.company_logo_public_id, 'image');
      } catch (deleteError) {
        logger.warn('⚠️ Failed to delete old company logo', {
          userId,
          error: deleteError.message
        });
      }
    }

    user.company_logo_url = uploadResult.url;
    user.company_logo_public_id = uploadResult.public_id;
    user.company_logo_uploaded_at = new Date();
    await user.save();

    logger.info('✅ Company logo updated successfully', {
      userId,
      companyLogoUrl: uploadResult.url
    });

    res.json({
      status: 'success',
      message: 'Company logo updated successfully',
      data: {
        company_logo_url: user.company_logo_url,
        company_logo_public_id: user.company_logo_public_id,
        company_logo_uploaded_at: user.company_logo_uploaded_at
      }
    });
  } catch (error) {
    logger.error('❌ Update company logo error', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id || req.user?.id
    });
    res.status(500).json({
      status: 'error',
      message: 'Server error updating company logo'
    });
  }
});

// @desc    Get label settings for authenticated user
// @route   GET /api/users/label-settings
// @access  Private
router.get('/label-settings', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId).select('label_settings company_logo_url');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Return label settings, defaulting to company_logo_url if logo_url not set
    const labelSettings = user.label_settings || {};
    if (!labelSettings.logo_url && user.company_logo_url) {
      labelSettings.logo_url = user.company_logo_url;
    }

    res.json({
      status: 'success',
      data: labelSettings
    });
  } catch (error) {
    logger.error('❌ Error fetching label settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching label settings'
    });
  }
});

// @desc    Update label settings for authenticated user
// @route   POST /api/users/label-settings
// @access  Private
router.post('/label-settings', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const {
      label_types,
      use_order_channel_logo,
      component_visibility,
      logo_url
    } = req.body;

    // Initialize label_settings if it doesn't exist
    if (!user.label_settings) {
      user.label_settings = {
        label_types: ['Standard'],
        use_order_channel_logo: false,
        component_visibility: {
          logo: true,
          customer_phone: false,
          dimensions: false,
          weight: false,
          payment_type: true,
          invoice_number: true,
          invoice_date: true,
          company_name: false,
          company_gstin: false,
          pickup_address: true,
          company_phone: false,
          sku: false,
          product_name: true,
          shipping_charges: false,
          amount_prepaid: true,
          amount_cod: true,
          message: true
        },
        logo_url: null
      };
    }

    // Initialize component_visibility if it doesn't exist
    if (!user.label_settings.component_visibility) {
      user.label_settings.component_visibility = {};
    }

    // Update label types if provided
    if (label_types !== undefined) {
      // Validate label types
      const validTypes = ['Standard', '2 In One', '4 In One', 'Thermal'];
      const invalidTypes = label_types.filter(type => !validTypes.includes(type));
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid label types: ${invalidTypes.join(', ')}`
        });
      }
      user.label_settings.label_types = label_types;
    }

    // Update use_order_channel_logo if provided
    if (use_order_channel_logo !== undefined) {
      user.label_settings.use_order_channel_logo = use_order_channel_logo;
    }

    // Update component visibility if provided
    if (component_visibility !== undefined) {
      Object.keys(component_visibility).forEach(key => {
        if (typeof component_visibility[key] === 'boolean') {
          user.label_settings.component_visibility[key] = component_visibility[key];
        }
      });
    }

    // Update logo_url if provided
    if (logo_url !== undefined) {
      user.label_settings.logo_url = logo_url;
    }

    await user.save();

    logger.info('✅ Label settings updated successfully', { userId });

    res.json({
      status: 'success',
      message: 'Label settings updated successfully',
      data: user.label_settings
    });
  } catch (error) {
    logger.error('❌ Error updating label settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating label settings'
    });
  }
});

module.exports = router;
