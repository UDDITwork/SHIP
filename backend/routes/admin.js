const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');
const jwt = require('jsonwebtoken');
const router = express.Router();
const https = require('https');
const http = require('http');
const User = require('../models/User');
const Order = require('../models/Order');
const Package = require('../models/Package');
const Customer = require('../models/Customer');
const SupportTicket = require('../models/Support');
const Transaction = require('../models/Transaction');
const WeightDiscrepancy = require('../models/WeightDiscrepancy');
const Remittance = require('../models/Remittance');
const ShipmentTrackingEvent = require('../models/ShipmentTrackingEvent');
const Staff = require('../models/Staff');
const RateCard = require('../models/RateCard');
const RateCardService = require('../services/rateCardService');
const logger = require('../utils/logger');
const websocketService = require('../services/websocketService');

const STATUS_KEYS = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated'];
const PRIORITY_KEYS = ['urgent', 'high', 'medium', 'low'];

const formatStatusCounts = (stats = []) => {
  const counts = STATUS_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  stats.forEach(stat => {
    if (stat && stat._id && typeof counts[stat._id] === 'number') {
      counts[stat._id] = stat.count || 0;
    }
  });

  return counts;
};

const sanitizeFilename = (filename = 'attachment') => {
  const defaultName = 'attachment';
  if (typeof filename !== 'string' || !filename.trim()) return defaultName;
  return filename.replace(/[/\\?%*:|"<>]/g, '_');
};

const buildContentDisposition = (filename) => {
  const safeFilename = sanitizeFilename(filename);
  const asciiFilename = safeFilename.replace(/["]/g, '');
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
};

const resolveMimeType = (attachment) => {
  if (attachment?.mimetype) {
    return attachment.mimetype;
  }

  const extension = (attachment?.file_name || '').split('.').pop()?.toLowerCase();

  const extensionMap = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    mpeg: 'video/mpeg',
    mov: 'video/quicktime'
  };

  if (extension && extensionMap[extension]) {
    return extensionMap[extension];
  }

  switch (attachment?.file_type) {
    case 'image':
      return 'image/jpeg';
    case 'audio':
      return 'audio/mpeg';
    case 'video':
      return 'video/mp4';
    case 'document':
    default:
      return 'application/octet-stream';
  }
};

const findAttachmentById = (ticketDoc, attachmentId) => {
  if (!ticketDoc || !attachmentId) return null;

  if (typeof ticketDoc.attachments?.id === 'function') {
    const directAttachment = ticketDoc.attachments.id(attachmentId);
    if (directAttachment) {
      return directAttachment;
    }
  }

  if (Array.isArray(ticketDoc.conversation)) {
    for (const message of ticketDoc.conversation) {
      if (typeof message.attachments?.id === 'function') {
        const messageAttachment = message.attachments.id(attachmentId);
        if (messageAttachment) {
          return messageAttachment;
        }
      }
    }
  }

  return null;
};

const streamAttachmentFromUrl = (res, fileUrl, filename, mimeType = 'application/octet-stream') => {
  if (!fileUrl) {
    return res.status(400).json({
      success: false,
      message: 'Attachment URL missing'
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch (error) {
    logger.error('Attachment download URL parse error:', error);
    return res.status(400).json({
      success: false,
      message: 'Invalid attachment URL'
    });
  }

  const client = parsedUrl.protocol === 'https:' ? https : http;
  const request = client.get(fileUrl, (fileResponse) => {
    if (!fileResponse || fileResponse.statusCode >= 400) {
      logger.error('Attachment download upstream error', {
        statusCode: fileResponse?.statusCode,
        statusMessage: fileResponse?.statusMessage
      });
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          message: 'Failed to fetch attachment from storage'
        });
      }
      return;
    }

    const contentType =
      mimeType ||
      fileResponse.headers['content-type'] ||
      'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildContentDisposition(filename));

    if (fileResponse.headers['content-length']) {
      res.setHeader('Content-Length', fileResponse.headers['content-length']);
    }

    fileResponse.pipe(res);
  });

  request.on('error', (error) => {
    logger.error('Attachment download request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error downloading attachment'
      });
    }
  });

  request.setTimeout(30000, () => {
    request.destroy();
    if (!res.headersSent) {
      res.status(504).json({
        success: false,
        message: 'Attachment download timed out'
      });
    }
  });
};
// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  const adminEmail = req.headers['x-admin-email'];
  const adminPassword = req.headers['x-admin-password'];
  
  // Check for admin credentials first
  if (adminEmail === 'udditalerts247@gmail.com' && adminPassword === 'jpmcA123') {
    req.admin = { email: adminEmail, role: 'admin' };
    return next();
  }
  
  // Check for staff credentials
  try {
    const Staff = require('../models/Staff');
    const staff = await Staff.findByEmail(adminEmail);
    
    if (staff && staff.is_active) {
      const isPasswordValid = await staff.comparePassword(adminPassword);
      if (isPasswordValid) {
        req.staff = { 
          email: staff.email, 
          name: staff.name, 
          role: 'staff',
          _id: staff._id
        };
        return next();
      }
    }
  } catch (error) {
    // If Staff model doesn't exist or error, continue to fail
    logger.error('Staff authentication error:', error);
  }
  
  // Neither admin nor staff authentication succeeded
  return res.status(401).json({
    success: false,
    message: 'Unauthorized access. Admin or staff credentials required.'
  });
};

// Apply admin auth to all routes
router.use(adminAuth);

const CLIENT_DETAIL_PROJECTION = '-password -password_reset_token -email_verification_token';

const findClientByIdentifier = async (identifier) => {
  let client = null;

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    client = await User.findById(identifier).select(CLIENT_DETAIL_PROJECTION);
  }

  if (!client) {
    client = await User.findOne({ client_id: identifier }).select(CLIENT_DETAIL_PROJECTION);
  }

  return client;
};

const buildClientDetailsResponse = async (client) => {
  const [orderCount, packageCount, customerCount, recentOrders] = await Promise.all([
    Order.countDocuments({ user_id: client._id }),
    Package.countDocuments({ user_id: client._id }),
    Customer.countDocuments({ user_id: client._id }),
    Order.find({ user_id: client._id })
      .sort({ created_at: -1 })
      .limit(5)
      .select('order_id status total_amount created_at')
  ]);

  const clientData = typeof client.toJSON === 'function' ? client.toJSON() : client;

  return {
    ...clientData,
    stats: {
      orders: orderCount,
      packages: packageCount,
      customers: customerCount,
      recentOrders
    }
  };
};

// Get all clients with pagination and search
router.get('/clients', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      user_type = '',
      sortBy = 'created_at',
      sortOrder = -1
    } = req.query;

    const query = {};

    // Add search filter
    if (search) {
      query.$or = [
        { company_name: { $regex: search, $options: 'i' } },
        { your_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone_number: { $regex: search, $options: 'i' } },
        { client_id: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status && status !== 'all') {
      query.account_status = status;
    }

    // Add user type filter
    if (user_type && user_type !== 'all') {
      query.user_type = user_type;
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === '1' ? 1 : -1 };

    const clients = await User.find(query)
      .select('-password -password_reset_token -email_verification_token')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    console.log('👥 Fetched clients with categories:', clients.map(c => ({
      client_id: c.client_id,
      company_name: c.company_name,
      user_category: c.user_category
    })));

    const totalClients = await User.countDocuments(query);

    // Get additional stats for each client
    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const orderCount = await Order.countDocuments({ user_id: client._id });
        const packageCount = await Package.countDocuments({ user_id: client._id });
        const customerCount = await Customer.countDocuments({ user_id: client._id });
        
        return {
          ...client.toJSON(),
          stats: {
            orders: orderCount,
            packages: packageCount,
            customers: customerCount
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        clients: clientsWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalClients / limit),
          totalClients,
          hasNext: page * limit < totalClients,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching clients',
      error: error.message
    });
  }
});

// Get client details by ID
router.get('/clients/:id', async (req, res) => {
  try {
    const client = await findClientByIdentifier(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    let clientWithStats;
    try {
      clientWithStats = await buildClientDetailsResponse(client);
    } catch (statsError) {
      console.error('Error building client details response:', statsError);
      logger.error('Error building client details response', {
        error: statsError?.message,
        stack: statsError?.stack,
        clientId: req.params.id
      });

      const clientData = typeof client.toJSON === 'function' ? client.toJSON() : client;
      clientWithStats = {
        ...clientData,
        stats: {
          orders: 0,
          packages: 0,
          customers: 0,
          recentOrders: []
        }
      };
    }

    res.json({
      success: true,
      data: clientWithStats
    });

  } catch (error) {
    console.error('Error fetching client details raw error:', error);
    logger.error('Error fetching client details:', {
      error: error?.message,
      stack: error?.stack,
      clientId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching client details',
      error: error.message
    });
  }
});

router.post('/clients/:clientId/impersonate', async (req, res) => {
  try {
    const { clientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID'
      });
    }

    const client = await User.findById(clientId).select('_id company_name your_name email user_category');
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'JWT secret is not configured'
      });
    }

    const expiresIn = '15m';
    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn });

    logger.info('👤 Admin impersonation token issued', {
      adminEmail: req.admin?.email,
      clientId: client._id.toString(),
      expiresIn
    });

    res.json({
      success: true,
      message: 'Impersonation token generated successfully',
      data: {
        token,
        expires_in: expiresIn,
        client: {
          _id: client._id,
          company_name: client.company_name,
          your_name: client.your_name,
          email: client.email,
          user_category: client.user_category
        }
      }
    });
  } catch (error) {
    logger.error('Impersonation token generation failed', {
      adminEmail: req.admin?.email,
      clientId: req.params.clientId,
      error: error.message
    });
    res.status(500).json({
      success: false,
      message: 'Failed to generate impersonation token'
    });
  }
});

// Update client status
router.patch('/clients/:id/status', async (req, res) => {
  try {
    const { account_status } = req.body;
    
    if (!['active', 'inactive', 'suspended', 'pending_verification'].includes(account_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account status'
      });
    }

    const client = await User.findByIdAndUpdate(
      req.params.id,
      { account_status },
      { new: true }
    ).select('-password -password_reset_token -email_verification_token');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    logger.info(`Admin updated client ${client.client_id} status to ${account_status}`);

    res.json({
      success: true,
      message: 'Client status updated successfully',
      data: client
    });

  } catch (error) {
    logger.error('Error updating client status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating client status',
      error: error.message
    });
  }
});

// Update client KYC status
router.patch('/clients/:id/kyc', async (req, res) => {
  try {
    const { kyc_status, verification_notes } = req.body;
    
    if (!['pending', 'verified', 'rejected'].includes(kyc_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid KYC status'
      });
    }

    const updateData = {
      'kyc_status.status': kyc_status,
      'kyc_status.verified_date': new Date()
    };

    if (verification_notes) {
      updateData['kyc_status.verification_notes'] = verification_notes;
    }

    const client = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password -password_reset_token -email_verification_token');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    logger.info(`Admin updated client ${client.client_id} KYC status to ${kyc_status}`);

    res.json({
      success: true,
      message: 'KYC status updated successfully',
      data: client
    });

  } catch (error) {
    logger.error('Error updating KYC status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating KYC status',
      error: error.message
    });
  }
});

// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalClients,
      activeClients,
      pendingVerification,
      suspendedClients,
      totalOrders,
      totalPackages,
      totalCustomers,
      recentClients
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ account_status: 'active' }),
      User.countDocuments({ account_status: 'pending_verification' }),
      User.countDocuments({ account_status: 'suspended' }),
      Order.countDocuments(),
      Package.countDocuments(),
      Customer.countDocuments(),
      User.find()
        .select('company_name your_name email client_id account_status created_at')
        .sort({ created_at: -1 })
        .limit(10)
    ]);

    // Get clients by user type
    const clientsByType = await User.aggregate([
      {
        $group: {
          _id: '$user_type',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get monthly client registrations
    const monthlyRegistrations = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalClients,
          activeClients,
          pendingVerification,
          suspendedClients,
          totalOrders,
          totalPackages,
          totalCustomers
        },
        clientsByType,
        monthlyRegistrations,
        recentClients
      }
    });

  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
});

// Get client orders
router.get('/clients/:id/orders', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '' } = req.query;
    const skip = (page - 1) * limit;

    const query = { user_id: req.params.id };
    if (status && status !== 'all') {
      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    const totalOrders = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalOrders / limit),
          totalOrders,
          hasNext: page * limit < totalOrders,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching client orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client orders',
      error: error.message
    });
  }
});

// Get client packages
router.get('/clients/:id/packages', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '' } = req.query;
    const skip = (page - 1) * limit;

    const query = { user_id: req.params.id };
    if (status && status !== 'all') {
      query.status = status;
    }

    const packages = await Package.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    const totalPackages = await Package.countDocuments(query);

    res.json({
      success: true,
      data: {
        packages,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPackages / limit),
          totalPackages,
          hasNext: page * limit < totalPackages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching client packages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client packages',
      error: error.message
    });
  }
});

// Get client customers
router.get('/clients/:id/customers', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '' } = req.query;
    const skip = (page - 1) * limit;

    const query = { user_id: req.params.id };
    if (status && status !== 'all') {
      query.status = status;
    }

    const customers = await Customer.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    const totalCustomers = await Customer.countDocuments(query);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCustomers / limit),
          totalCustomers,
          hasNext: page * limit < totalCustomers,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching client customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client customers',
      error: error.message
    });
  }
});

// Get client documents for KYC verification
router.get('/clients/:id/documents', async (req, res) => {
  try {
    const client = await User.findById(req.params.id)
      .select('kyc_documents kyc_status company_name your_name email client_id');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Extract document information
    const documents = [];
    
    if (client.kyc_documents) {
      Object.keys(client.kyc_documents).forEach(docType => {
        const doc = client.kyc_documents[docType];
        if (doc && doc.url) {
          documents.push({
            type: docType,
            name: doc.name || `${docType}_document`,
            url: doc.url,
            uploadedAt: doc.uploaded_at || doc.uploadedAt,
            status: doc.status || 'uploaded'
          });
        }
      });
    }

    res.json({
      success: true,
      data: {
        client: {
          id: client._id,
          client_id: client.client_id,
          company_name: client.company_name,
          your_name: client.your_name,
          email: client.email,
          kyc_status: client.kyc_status
        },
        documents
      }
    });

  } catch (error) {
    logger.error('Error fetching client documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client documents',
      error: error.message
    });
  }
});

// ==================== ADMIN TICKET MANAGEMENT ROUTES ====================

// @desc    Get all tickets for a specific client
// @route   GET /api/admin/clients/:id/tickets
// @access  Admin
router.get('/clients/:id/tickets', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID'
      });
    }

    const { page = 1, limit = 10, status = '', category = '', priority = '' } = req.query;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = { user_id: new mongoose.Types.ObjectId(req.params.id) };
    const normalizedPriority = typeof priority === 'string' ? priority.trim().toLowerCase() : '';

    if (status && status !== 'all') {
      filterQuery.status = status;
    }

    if (category && category !== 'all') {
      filterQuery.category = category;
    }

    if (normalizedPriority && normalizedPriority !== 'all') {
      filterQuery.priority = normalizedPriority;
    }

    // Get tickets with pagination
    const tickets = await SupportTicket.find(filterQuery)
      .populate('user_id', 'your_name email phone_number company_name client_id')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filterQuery);

    // Get ticket statistics for this client
    const stats = await SupportTicket.getTicketStats(req.params.id, null, null);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTickets / limit),
          totalTickets,
          hasNext: page * limit < totalTickets,
          hasPrev: page > 1
        },
        stats: {
          total_tickets: totalTickets,
          status_breakdown: stats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          status_counts: formatStatusCounts(stats)
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching client tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client tickets',
      error: error.message
    });
  }
});

// @desc    Get ticket summary across all clients
// @route   GET /api/admin/tickets/summary
// @access  Admin
router.get('/tickets/summary', async (req, res) => {
  try {
    const statusGroupStage = STATUS_KEYS.reduce((acc, statusKey) => {
      acc[statusKey] = {
        $sum: {
          $cond: [
            { $eq: ['$status', statusKey] },
            1,
            0
          ]
        }
      };
      return acc;
    }, {});

    const priorityGroupStage = PRIORITY_KEYS.reduce((acc, priorityKey) => {
      acc[priorityKey] = {
        $sum: {
          $cond: [
            {
              $eq: [
                {
                  $trim: {
                    input: {
                      $toLower: {
                        $ifNull: ['$priority', '']
                      }
                    }
                  }
                },
                priorityKey
              ]
            },
            1,
            0
          ]
        }
      };
      return acc;
    }, {});

    const groupStage = {
      _id: '$user_id',
      totalTickets: { $sum: 1 },
      latestUpdatedAt: { $max: '$updated_at' },
      ...statusGroupStage,
      ...priorityGroupStage
    };

    const aggregationPipeline = [
      { $group: groupStage },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'client'
        }
      },
      {
        $unwind: {
          path: '$client',
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    const summaryResults = await SupportTicket.aggregate(aggregationPipeline);

    const overallTotals = STATUS_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});

    const overallPriorityTotals = PRIORITY_KEYS.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});

    let overallTotalTickets = 0;

    const clients = summaryResults.map((result) => {
      const statusCounts = STATUS_KEYS.reduce((acc, key) => {
        const value = result[key] || 0;
        acc[key] = value;
        overallTotals[key] += value;
        return acc;
      }, {});

      const priorityCounts = PRIORITY_KEYS.reduce((acc, key) => {
        const value = result[key] || 0;
        acc[key] = value;
        overallPriorityTotals[key] += value;
        return acc;
      }, {});

      const totalTickets = result.totalTickets || 0;
      overallTotalTickets += totalTickets;

      return {
        clientMongoId: result._id,
        clientId: result.client?.client_id || null,
        companyName: result.client?.company_name || 'Unknown',
        contactName: result.client?.your_name || '',
        email: result.client?.email || '',
        phoneNumber: result.client?.phone_number || '',
        statusCounts,
        priorityCounts,
        totalTickets,
        latestUpdatedAt: result.latestUpdatedAt || null
      };
    });

    const totalsResponse = {
      all: overallTotalTickets,
      ...overallTotals
    };

    const priorityTotalsResponse = {
      ...overallPriorityTotals
    };

    res.json({
      success: true,
      data: {
        totals: totalsResponse,
        priorityTotals: priorityTotalsResponse,
        clients
      }
    });
  } catch (error) {
    logger.error('Error generating ticket summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating ticket summary',
      error: error.message
    });
  }
});

// @desc    Get all tickets across all clients (admin dashboard)
// @route   GET /api/admin/tickets
// @access  Admin
router.get('/tickets', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = '', 
      category = '', 
      priority = '',
      assigned_to = '',
      date_from = '',
      date_to = ''
    } = req.query;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = {};

    if (status && status !== 'all') {
      filterQuery.status = status;
    }

    if (category && category !== 'all') {
      filterQuery.category = category;
    }

    const normalizedPriority = typeof priority === 'string' ? priority.trim().toLowerCase() : '';

    if (normalizedPriority && normalizedPriority !== 'all') {
      filterQuery.priority = normalizedPriority;
    }

    if (assigned_to && assigned_to !== 'all') {
      filterQuery['assignment_info.assigned_to'] = assigned_to;
    }

    if (date_from || date_to) {
      filterQuery.created_at = {};
      if (date_from) {
        filterQuery.created_at.$gte = new Date(date_from);
      }
      if (date_to) {
        filterQuery.created_at.$lte = new Date(date_to);
      }
    }

    // Get tickets with pagination and populate user info
    const tickets = await SupportTicket.find(filterQuery)
      .populate('user_id', 'company_name your_name email phone_number client_id')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filterQuery);

    // Get overall statistics
    const stats = await SupportTicket.getTicketStats(null, null, null);
    const categoryStats = await SupportTicket.getCategoryStats(null, null);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTickets / limit),
          totalTickets,
          hasNext: page * limit < totalTickets,
          hasPrev: page > 1
        },
        stats: {
          total_tickets: totalTickets,
          status_breakdown: stats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          status_counts: formatStatusCounts(stats),
          category_breakdown: categoryStats
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching all tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tickets',
      error: error.message
    });
  }
});

// @desc    Get specific ticket details
// @route   GET /api/admin/tickets/:id
// @access  Admin
router.get('/tickets/:id', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id)
      .populate('user_id', 'company_name your_name email phone_number client_id')
      .populate('related_orders', 'order_id customer_info.buyer_name status');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      data: ticket
    });

  } catch (error) {
    logger.error('Error fetching ticket details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ticket details',
      error: error.message
    });
  }
});

// @desc    Download ticket attachment (admin)
// @route   GET /api/admin/tickets/:ticketId/attachments/:attachmentId/download
// @access  Admin
router.get('/tickets/:ticketId/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { ticketId, attachmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(attachmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket or attachment ID'
      });
    }

    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const attachment = findAttachmentById(ticket, attachmentId);

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    streamAttachmentFromUrl(
      res,
      attachment.file_url,
      attachment.file_name,
      resolveMimeType(attachment)
    );
  } catch (error) {
    logger.error('Error downloading ticket attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading attachment'
    });
  }
});

// @desc    Admin respond to ticket
// @route   POST /api/admin/tickets/:id/messages
// @access  Admin
router.post('/tickets/:id/messages', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const { message, is_internal = false } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check for duplicate message (same content within last 10 seconds)
    const trimmedMessage = message.trim();
    const now = Date.now();
    const recentDuplicate = ticket.conversation.find(msg =>
      msg.message_content === trimmedMessage &&
      msg.message_type === 'admin' &&
      msg.timestamp &&
      (now - new Date(msg.timestamp).getTime()) < 10000
    );

    if (recentDuplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate message detected. This message was already sent.'
      });
    }

    // Get sender name (staff name or admin email)
    const senderName = req.staff ? req.staff.name : (req.admin.email || 'Admin');
    const staffName = req.staff ? req.staff.name : null;

    // Add message to conversation with staff tracking
    await ticket.addMessage('admin', senderName, message, [], is_internal, staffName);

    // Update ticket status if it was waiting for admin response
    if (ticket.status === 'waiting_customer') {
      ticket.status = 'in_progress';
      await ticket.save();
    }

    // Reload ticket to get populated user_id  
    await ticket.populate('user_id', '_id your_name');

    // Send WebSocket notification to admins
    websocketService.notifyNewMessage({
      ticket_id: ticket.ticket_id,
      _id: ticket._id,
      client_name: ticket.user_id?.your_name || 'Unknown Client'
    }, {
      message: message,
      sender: senderName,
      timestamp: new Date().toISOString()
    });

    // Send WebSocket notification to the client (only if not internal)
    if (!is_internal && ticket.user_id && ticket.user_id._id) {
      const clientNotification = {
        type: 'admin_reply',
        title: 'New Reply from Admin',
        message: `You have a new reply in ticket ${ticket.ticket_id}`,
        ticket_id: ticket.ticket_id,
        ticket_id_mongo: ticket._id.toString(),
        created_at: new Date().toISOString(),
        data: {
          message: message,
          sender: senderName,
          timestamp: new Date().toISOString()
        }
      };
      websocketService.sendNotificationToClient(ticket.user_id._id, clientNotification);
    }

    res.json({
      success: true,
      message: 'Response added successfully',
      data: {
        ticket_id: ticket.ticket_id,
        status: ticket.status,
        last_message: ticket.conversation[ticket.conversation.length - 1]
      }
    });

  } catch (error) {
    logger.error('Error adding admin response:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding response',
      error: error.message
    });
  }
});

// @desc    Admin update ticket status
// @route   PATCH /api/admin/tickets/:id/status
// @access  Admin
router.patch('/tickets/:id/status', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const { status, reason = '' } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const previousStatus = ticket.status;
    ticket.status = status;

    // Get changer name (admin or staff)
    const changerName = req.staff ? req.staff.name : (req.admin ? req.admin.email : 'System');
    const staffName = req.staff ? req.staff.name : null;
    
    // Add system message about status change with staff tracking
    const statusMessage = `Ticket status changed from "${previousStatus}" to "${status}"${reason ? `. Reason: ${reason}` : ''}`;
    await ticket.addMessage('system', changerName, statusMessage, [], true, staffName);
    
    // Fetch fresh ticket data
    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate('user_id', 'company_name your_name email phone_number client_id')
      .populate('related_orders', 'order_id customer_info.buyer_name status');

    const clientIdForStats = updatedTicket?.user_id?._id || updatedTicket?.user_id;
    let clientStatusCounts = null;

    if (clientIdForStats) {
      const stats = await SupportTicket.getTicketStats(clientIdForStats, null, null);
      clientStatusCounts = formatStatusCounts(stats);
    }

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      data: {
        ticket: updatedTicket,
        previous_status: previousStatus,
        current_status: status,
        status_counts: clientStatusCounts
      }
    });

  } catch (error) {
    logger.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating ticket status',
      error: error.message
    });
  }
});

// @desc    Admin update ticket priority
// @route   PATCH /api/admin/tickets/:id/priority
// @access  Admin
router.patch('/tickets/:id/priority', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const { priority, reason = '' } = req.body;
    const validPriorities = ['low', 'medium', 'high', 'urgent'];

    const normalizedPriorityValue = typeof priority === 'string' ? priority.trim().toLowerCase() : '';

    if (!normalizedPriorityValue || !validPriorities.includes(normalizedPriorityValue)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority value'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const previousPriority = ticket.priority;

    if (previousPriority === normalizedPriorityValue) {
      return res.json({
        success: true,
        message: 'Priority unchanged',
        data: {
          ticket_id: ticket.ticket_id,
          previous_priority: previousPriority,
          current_priority: ticket.priority
        }
      });
    }

    ticket.priority = normalizedPriorityValue;

    // Get changer name (admin or staff)
    const changerName = req.staff ? req.staff.name : (req.admin ? req.admin.email : 'System');
    const staffName = req.staff ? req.staff.name : null;
    
    const priorityMessage = `Ticket priority changed from "${previousPriority}" to "${normalizedPriorityValue}"${reason ? `. Reason: ${reason}` : ''}`;
    await ticket.addMessage('system', changerName, priorityMessage, [], true, staffName);

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate('user_id', 'company_name your_name email phone_number client_id')
      .populate('related_orders', 'order_id customer_info.buyer_name status');

    const clientIdForStats = updatedTicket?.user_id?._id || updatedTicket?.user_id;
    let clientStatusCounts = null;

    if (clientIdForStats) {
      const stats = await SupportTicket.getTicketStats(clientIdForStats, null, null);
      clientStatusCounts = formatStatusCounts(stats);
    }

    res.json({
      success: true,
      message: 'Ticket priority updated successfully',
      data: {
        ticket: updatedTicket,
        previous_priority: previousPriority,
        current_priority: normalizedPriorityValue,
        status_counts: clientStatusCounts
      }
    });

  } catch (error) {
    logger.error('Error updating ticket priority:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating ticket priority',
      error: error.message
    });
  }
});

// @desc    Assign ticket to admin
// @route   PATCH /api/admin/tickets/:id/assign
// @access  Admin
router.patch('/tickets/:id/assign', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const { assigned_to, department = 'customer_service' } = req.body;

    if (!assigned_to) {
      return res.status(400).json({
        success: false,
        message: 'Assigned to is required'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get assigner name (admin or staff)
    const assignerName = req.staff ? req.staff.name : req.admin.email;
    const staffName = req.staff ? req.staff.name : null;
    
    // Assign ticket with staff tracking
    await ticket.assignTo(assigned_to, assignerName, department, staffName);

    res.json({
      success: true,
      message: 'Ticket assigned successfully',
      data: {
        ticket_id: ticket.ticket_id,
        assigned_to: ticket.assignment_info.assigned_to,
        assigned_date: ticket.assignment_info.assigned_date,
        department: ticket.assignment_info.department,
        assigned_by_staff_name: ticket.assignment_info.assigned_by_staff_name || null
      }
    });

  } catch (error) {
    logger.error('Error assigning ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning ticket',
      error: error.message
    });
  }
});

// @desc    Resolve ticket
// @route   POST /api/admin/tickets/:id/resolve
// @access  Admin
router.post('/tickets/:id/resolve', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const { resolution_summary, resolution_category, internal_notes = '' } = req.body;

    if (!resolution_summary) {
      return res.status(400).json({
        success: false,
        message: 'Resolution summary is required'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get resolver name (admin or staff)
    const resolverName = req.staff ? req.staff.name : req.admin.email;
    const staffName = req.staff ? req.staff.name : null;
    
    // Resolve ticket with staff tracking
    await ticket.resolve(resolution_summary, resolution_category, internal_notes, staffName);

    res.json({
      success: true,
      message: 'Ticket resolved successfully',
      data: {
        ticket_id: ticket.ticket_id,
        status: ticket.status,
        resolution_date: ticket.resolution.resolution_date,
        resolved_by_staff_name: ticket.resolution.resolved_by_staff_name || null
      }
    });

  } catch (error) {
    logger.error('Error resolving ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Error resolving ticket',
      error: error.message
    });
  }
});

// ==================== NOTIFICATION ROUTES ====================

// @desc    Get admin notifications
// @route   GET /api/admin/notifications
// @access  Admin
router.get('/notifications', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Get notifications for admin - only open and in_progress tickets
    const notifications = await SupportTicket.find({
      status: { $in: ['open', 'in_progress'] }
    })
    .populate('user_id', 'your_name email company_name')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

    // Get unread count
    const unreadCount = await SupportTicket.countDocuments({
      $or: [
        { status: 'open' },
        { status: 'in_progress' }
      ]
    });

    // Format notifications
    const formattedNotifications = notifications.map(ticket => {
      const lastMessage = ticket.conversation && ticket.conversation.length > 0 
        ? ticket.conversation[ticket.conversation.length - 1]
        : null;

      return {
        _id: ticket._id.toString(),
        type: ticket.status === 'open' ? 'new_ticket' : 'ticket_update',
        title: ticket.status === 'open' ? 'New Ticket Created' : 'Ticket Updated',
        message: lastMessage ? (lastMessage.message_content || lastMessage.message || 'No message') : (ticket.description || 'No description'),
        ticket_id: ticket.ticket_id,
        client_name: ticket.user_id ? (ticket.user_id.your_name || ticket.user_id.email || 'Unknown Client') : 'Unknown Client',
        created_at: ticket.created_at || new Date().toISOString(),
        is_read: false
      };
    });

    res.json({
      success: true,
      data: {
        notifications: formattedNotifications,
        unread_count: unreadCount
      }
    });

  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

// @desc    Mark notification as read
// @route   PATCH /api/admin/notifications/:id/read
// @access  Admin
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID'
      });
    }

    // For now, we'll just return success since we're using ticket status for notifications
    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
});

// @desc    Test Delhivery API connection
// @route   GET /api/admin/test-delhivery-api
// @access  Admin
router.get('/test-delhivery-api', async (req, res) => {
  try {
    logger.info('🧪 Admin testing Delhivery API connection');

    // Test API key validation
    const apiKeyValid = delhiveryService.validateApiKey();
    
    if (!apiKeyValid) {
      return res.status(400).json({
        success: false,
        message: 'Delhivery API key is not properly configured',
        details: {
          hasApiKey: !!process.env.DELHIVERY_API_KEY,
          apiKeyLength: process.env.DELHIVERY_API_KEY?.length || 0,
          apiURL: process.env.DELHIVERY_API_URL || 'https://track.delhivery.com/api'
        }
      });
    }

    // Test API connection
    const connectionTest = await delhiveryService.testApiConnection();

    res.json({
      success: true,
      message: 'Delhivery API test completed',
      results: {
        apiKeyValidation: apiKeyValid,
        connectionTest: connectionTest,
        configuration: {
          apiURL: process.env.DELHIVERY_API_URL || 'https://track.delhivery.com/api',
          apiKeyLength: process.env.DELHIVERY_API_KEY?.length || 0,
          apiKeyPreview: process.env.DELHIVERY_API_KEY ? 
            `${process.env.DELHIVERY_API_KEY.substring(0, 10)}...` : 'NOT SET'
        }
      }
    });

  } catch (error) {
    logger.error('❌ Error testing Delhivery API:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing Delhivery API',
      error: error.message
    });
  }
});

// @desc    Get tracking failures summary
// @route   GET /api/admin/tracking-failures
// @access  Admin
router.get('/tracking-failures', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // Get orders with tracking failures
    const orders = await Order.find({
      'delhivery_data.tracking_failures': { $exists: true, $not: { $size: 0 } }
    })
    .select('order_id delhivery_data.tracking_failures delhivery_data.waybill status')
    .sort({ 'delhivery_data.tracking_failures.timestamp': -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    // Count total orders with tracking failures
    const totalCount = await Order.countDocuments({
      'delhivery_data.tracking_failures': { $exists: true, $not: { $size: 0 } }
    });

    // Get failure statistics
    const failureStats = await Order.aggregate([
      {
        $match: {
          'delhivery_data.tracking_failures': { $exists: true, $not: { $size: 0 } }
        }
      },
      {
        $unwind: '$delhivery_data.tracking_failures'
      },
      {
        $group: {
          _id: '$delhivery_data.tracking_failures.errorType',
          count: { $sum: 1 },
          latestFailure: { $max: '$delhivery_data.tracking_failures.timestamp' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        orders: orders,
        pagination: {
          total: totalCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: totalCount > parseInt(offset) + parseInt(limit)
        },
        failureStats: failureStats
      }
    });

  } catch (error) {
    logger.error('❌ Error fetching tracking failures:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tracking failures',
      error: error.message
    });
  }
});

// @desc    Recharge client wallet or adjust balance
// @route   POST /api/admin/wallet-recharge
// @access  Admin
router.post('/wallet-recharge', async (req, res) => {
  try {
    const { client_id, amount, description, type = 'credit' } = req.body;

    // Validate input
    if (!client_id || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Client ID and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Validate transaction type
    if (type !== 'credit' && type !== 'debit') {
      return res.status(400).json({
        success: false,
        message: 'Transaction type must be credit or debit'
      });
    }

    // Find the client
    const client = await User.findById(client_id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get current wallet balance
    const currentBalance = client.wallet_balance || 0;

    // Parse amount to ensure it's a proper number and round to 2 decimal places
    const parsedAmount = Math.round(parseFloat(amount) * 100) / 100;

    // Calculate new balance based on type
    // Use Math.round to avoid floating-point precision issues (e.g., 1999.97 instead of 2000)
    let newBalance;
    if (type === 'credit') {
      newBalance = Math.round((currentBalance + parsedAmount) * 100) / 100;
    } else {
      // Debit: validate sufficient balance
      if (parsedAmount > currentBalance) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Current balance: ₹${currentBalance}, Requested: ₹${parsedAmount}`
        });
      }
      newBalance = Math.round((currentBalance - parsedAmount) * 100) / 100;
    }

    // Create transaction record
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const transaction = new Transaction({
      transaction_id: transactionId,
      user_id: client_id,
      transaction_type: type, // 'credit' or 'debit'
      transaction_category: 'manual_adjustment',
      amount: parsedAmount,
      description: description || `Admin wallet ${type === 'credit' ? 'recharge' : 'deduction'} - ₹${parsedAmount}`,
      status: 'completed',
      created_at: new Date(),
      updated_at: new Date(),
      balance_info: {
        opening_balance: currentBalance,
        closing_balance: newBalance
      }
    });

    // Update client wallet balance
    client.wallet_balance = newBalance;
    client.updated_at = new Date();

    // Save both transaction and user
    await Promise.all([
      transaction.save(),
      client.save()
    ]);

    // CRITICAL: Retrieve the live updated wallet balance from database
    const updatedClient = await User.findById(client_id).select('wallet_balance email company_name');
    const liveUpdatedBalance = updatedClient.wallet_balance || 0;

    // Log the adjustment with live database balance
    logger.info(`Admin wallet ${type} completed`, {
      client_id,
      client_email: updatedClient.email,
      amount,
      type: type,
      old_balance: currentBalance,
      calculated_new_balance: newBalance,
      live_database_balance: liveUpdatedBalance,
      admin_email: req.admin.email,
      transaction_id: transactionId
    });

    // Send notification to client about wallet adjustment
    try {
      const notification = {
        type: type === 'credit' ? 'wallet_recharge' : 'wallet_deduction',
        title: type === 'credit' ? 'Wallet Recharged' : 'Wallet Deducted',
        message: type === 'credit' 
          ? `Your wallet has been recharged with ₹${amount}. New balance: ₹${liveUpdatedBalance}`
          : `₹${amount} deducted from your wallet. New balance: ₹${liveUpdatedBalance}`,
        client_id: client_id,
        client_name: updatedClient.company_name,
        amount: amount,
        transaction_type: type,
        new_balance: liveUpdatedBalance,
        created_at: new Date()
      };

      // Send WebSocket notification if client is online
      // Convert client_id to string to ensure proper matching
      websocketService.sendNotificationToClient(String(client_id), notification);

      // Send real-time wallet balance update with LIVE DATABASE BALANCE
      const walletUpdate = {
        type: 'wallet_balance_update',
        balance: liveUpdatedBalance, // Use live database balance, not calculated
        currency: 'INR',
        previous_balance: currentBalance,
        amount: amount,
        transaction_type: type,
        transaction_id: transactionId,
        timestamp: new Date().toISOString()
      };

      websocketService.sendNotificationToClient(String(client_id), walletUpdate);
      
      logger.info('💰 Real-time wallet update sent with LIVE DATABASE BALANCE', {
        client_id,
        live_database_balance: liveUpdatedBalance,
        calculated_balance: newBalance,
        amount: amount,
        type: type,
        balance_match: liveUpdatedBalance === newBalance ? 'MATCH' : 'MISMATCH'
      });
    } catch (notificationError) {
      logger.warn(`Failed to send wallet ${type} notification`, {
        error: notificationError.message,
        client_id
      });
    }

    res.json({
      success: true,
      message: `Wallet ${type === 'credit' ? 'recharged' : 'deducted'} successfully`,
      data: {
        client_id,
        client_name: updatedClient.company_name,
        client_email: updatedClient.email,
        transaction_type: type,
        amount: amount,
        previous_balance: currentBalance,
        new_balance: liveUpdatedBalance, // Use live database balance
        transaction_id: transactionId
      }
    });

  } catch (error) {
    logger.error('Admin wallet recharge error', {
      error: error.message,
      stack: error.stack,
      client_id: req.body.client_id,
      amount: req.body.amount,
      admin_email: req.admin?.email
    });

    res.status(500).json({
      success: false,
      message: 'Error recharging wallet',
      error: error.message
    });
  }
});

// @desc    Get client wallet balance
// @route   GET /api/admin/client-wallet/:clientId
// @access  Admin
router.get('/client-wallet/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await User.findById(clientId).select('_id client_id company_name email wallet_balance');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    res.json({
      success: true,
      data: {
        client_id: client._id,
        client_id_code: client.client_id,
        company_name: client.company_name,
        email: client.email,
        wallet_balance: client.wallet_balance || 0
      }
    });

  } catch (error) {
    logger.error('Get client wallet balance error', {
      error: error.message,
      client_id: req.params.clientId,
      admin_email: req.admin?.email
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching client wallet balance',
      error: error.message
    });
  }
});

// @desc    Update client user category/label
// @route   PATCH /api/admin/clients/:clientId/label
// @access  Admin
router.patch('/clients/:clientId/label', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { user_category } = req.body;

    // Validate input
    if (!user_category) {
      return res.status(400).json({
        success: false,
        message: 'User category is required'
      });
    }

    // Validate category
    const validCategories = ['Basic User', 'Lite User', 'New User', 'Advanced'];
    if (!validCategories.includes(user_category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user category. Must be one of: Basic User, Lite User, New User, Advanced'
      });
    }

    // Find the client
    const client = await User.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Update the user category
    const oldCategory = client.user_category;
    client.user_category = user_category;
    client.updated_at = new Date();

    console.log('🏷️ Updating client category:', {
      clientId,
      oldCategory,
      newCategory: user_category,
      clientEmail: client.email
    });

    const savedClient = await client.save();
    
    console.log('🏷️ Client category updated successfully:', {
      clientId: savedClient._id,
      user_category: savedClient.user_category,
      updated_at: savedClient.updated_at
    });

    // Log the update
    logger.info('Admin updated client user category', {
      client_id: clientId,
      client_email: client.email,
      old_category: oldCategory,
      new_category: user_category,
      admin_email: req.admin.email
    });

    // Send WebSocket notification to client about user category update
    try {
      const notification = {
        type: 'user_category_updated',
        title: 'User Category Updated',
        message: `Your user category has been updated to "${user_category}"`,
        client_id: clientId,
        client_name: client.company_name,
        old_category: oldCategory,
        new_category: user_category,
        created_at: new Date()
      };

      // Send WebSocket notification if client is online
      websocketService.sendNotificationToClient(String(clientId), notification);
      
      logger.info('🏷️ User category update notification sent', {
        client_id: clientId,
        new_category: user_category
      });
    } catch (notificationError) {
      logger.warn('Failed to send user category update notification', {
        error: notificationError.message,
        client_id: clientId
      });
    }

    res.json({
      success: true,
      message: 'User category updated successfully',
      data: {
        client_id: clientId,
        client_name: client.company_name,
        client_email: client.email,
        user_category: user_category
      }
    });

  } catch (error) {
    logger.error('Admin update client label error', {
      error: error.message,
      stack: error.stack,
      client_id: req.params.clientId,
      user_category: req.body.user_category,
      admin_email: req.admin?.email
    });

    res.status(500).json({
      success: false,
      message: 'Error updating user category',
      error: error.message
    });
  }
});

// ============================================
// WEIGHT DISCREPANCIES ROUTES
// ============================================

// @desc    Bulk import weight discrepancies from Excel
// @route   POST /api/admin/weight-discrepancies/bulk-import
// @access  Admin
router.post('/weight-discrepancies/bulk-import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.file;
    const batchId = `WD${Date.now()}`;
    
    console.log('📊 WEIGHT DISCREPANCY IMPORT STARTED:', {
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      batchId,
      timestamp: new Date().toISOString()
    });

    // Parse Excel file
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    console.log('📋 EXCEL PARSED:', {
      sheetName,
      rowCount: rows.length,
      columns: Object.keys(rows[0] || {})
    });

    // Expected columns mapping
    const columnMapping = {
      'AWB number': 'awb_number',
      'Date of raising the weight mismatch': 'discrepancy_date',
      'Status of AWB': 'awb_status',
      'Client Declared Weight': 'client_declared_weight',
      'Delhivery Updated Weight': 'delhivery_updated_weight',
      'Delhivery Updated chargeable weight - Client Declared chargeable weight': 'weight_discrepancy',
      'Latest deduction - Initial manifestation cost': 'deduction_amount'
    };

    const importResults = {
      total: rows.length,
      successful: 0,
      failed: 0,
      errors: [],
      details: []
    };

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // Excel row number (header is row 1)
      
      try {
        // Extract data from row based on column names
        const awb_number = String(row['AWB number'] || row['awb_number'] || row['AWB Number'] || '');
        
        if (!awb_number) {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            error: 'AWB number is missing'
          });
          continue;
        }

        // Parse and validate AWB (handle scientific notation from Excel)
        let parsedAWB = awb_number;
        if (awb_number.includes('E+')) {
          // Excel scientific notation: 4.48007E+13 -> 44800700000000
          parsedAWB = parseFloat(awb_number).toFixed(0);
          // Remove any decimal points if present (handles multiple dots)
          parsedAWB = parsedAWB.replace(/\./g, '');
        }
        // Ensure AWB is exactly 14 digits
        parsedAWB = String(parsedAWB).trim();

        // Find order by AWB
        const order = await Order.findOne({ 'delhivery_data.waybill': parsedAWB });
        
        if (!order) {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            error: `AWB ${parsedAWB} not found in orders`,
            awb: parsedAWB
          });
          continue;
        }

        const client_id = order.user_id; // CRITICAL: Link to client

        // Parse discrepancy date using the exact format from Excel
        const rawDate = row['Date of raising the weight mismatch'] || row['discrepancy_date'] || '';

        const parseDiscrepancyDate = (value) => {
          if (!value && value !== 0) return null;

          // Handle Excel serial date numbers (e.g. 45218)
          if (typeof value === 'number') {
            // Excel epoch starts at 1899-12-30
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const ms = value * 24 * 60 * 60 * 1000;
            return new Date(excelEpoch.getTime() + ms);
          }

          const str = String(value).trim();
          if (!str) return null;

          // Try DD-MM-YYYY or DD-MM-YYYY HH:MM (as seen in the Delhivery export)
          const dashParts = str.split(' ');
          const dmy = dashParts[0].split('-');
          if (dmy.length === 3) {
            const [dd, mm, yyyy] = dmy;
            const day = dd.padStart(2, '0');
            const month = mm.padStart(2, '0');
            const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
            const time = dashParts[1] || '00:00';
            return new Date(`${year}-${month}-${day}T${time}`);
          }

          // Fallback for MM/DD/YYYY or MM/DD/YYYY HH:MM
          const parts = str.split(' ');
          const slashDateParts = parts[0] ? parts[0].split('/') : [];
          if (slashDateParts.length === 3) {
            const month = slashDateParts[0].padStart(2, '0');
            const day = slashDateParts[1].padStart(2, '0');
            const year = slashDateParts[2];
            const time = parts[1] || '00:00';
            return new Date(`${year}-${month}-${day}T${time}`);
          }

          // Last resort: let JS try to parse
          return new Date(str);
        };

        const discrepancy_date = parseDiscrepancyDate(rawDate);

        if (!discrepancy_date || isNaN(discrepancy_date.getTime())) {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            error: 'Invalid discrepancy date format',
            awb: parsedAWB,
            date_string: rawDate
          });
          continue;
        }

        // Extract other fields
        const awb_status = String(row['Status of AWB'] || row['awb_status'] || 'Unknown');

        // Weights are stored in grams as uploaded from Excel
        const parseWeight = (raw) => {
          const n = parseFloat(raw || 0);
          if (!n || !isFinite(n)) return 0;
          // Round to 2 decimal places to avoid floating-point precision issues (e.g., 10 becoming 9.8999)
          return Math.round(n * 100) / 100;
        };

        const client_declared_weight = parseWeight(row['Client Declared Weight'] || row['client_declared_weight']);
        const delhivery_updated_weight = parseWeight(row['Delhivery Updated Weight'] || row['delhivery_updated_weight']);

        let weight_discrepancy = parseWeight(
          row['Delhivery Updated chargeable weight - Client Declared chargeable weight'] ||
          row['weight_discrepancy']
        );
        // If discrepancy column is missing/zero, compute from weights (in grams)
        if (!weight_discrepancy && delhivery_updated_weight && client_declared_weight) {
          // Round to avoid floating-point precision issues
          weight_discrepancy = Math.round((delhivery_updated_weight - client_declared_weight) * 100) / 100;
        }

        const deduction_amount = parseFloat(row['Latest deduction - Initial manifestation cost'] || row['deduction_amount'] || 0);

        // Validate weights
        if (!client_declared_weight || !delhivery_updated_weight) {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            error: 'Invalid weight values',
            awb: parsedAWB
          });
          continue;
        }

        // Validate that actual weight is MORE than declared weight
        if (delhivery_updated_weight <= client_declared_weight) {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            error: 'Actual weight must be greater than declared weight',
            awb: parsedAWB,
            declared: client_declared_weight,
            actual: delhivery_updated_weight
          });
          continue;
        }

        // Check if discrepancy already exists
        const existingDiscrepancy = await WeightDiscrepancy.findOne({ 
          awb_number: parsedAWB 
        });

        if (existingDiscrepancy) {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            error: 'Discrepancy already exists for this AWB',
            awb: parsedAWB
          });
          continue;
        }

        // Create weight discrepancy record
        const weightDiscrepancy = new WeightDiscrepancy({
          awb_number: parsedAWB,
          client_id: client_id,
          order_id: order._id,
          discrepancy_date: discrepancy_date,
          awb_status: awb_status,
          client_declared_weight: client_declared_weight,
          delhivery_updated_weight: delhivery_updated_weight,
          weight_discrepancy: weight_discrepancy,
          deduction_amount: deduction_amount,
          upload_batch_id: batchId,
          processed: false,
          dispute_status: 'NEW'
        });

        await weightDiscrepancy.save();

        // BUSINESS LOGIC: Deduct money ONLY if actual weight > declared weight
        // Create debit transaction for the client
        const user = await User.findById(client_id);
        if (user && deduction_amount > 0) {
          const openingBalance = user.wallet_balance || 0;
          // Use Math.round to avoid floating-point precision issues
          const closingBalance = Math.max(0, Math.round((openingBalance - deduction_amount) * 100) / 100);

          // Update wallet balance in database
          user.wallet_balance = closingBalance;
          await user.save();
          
          console.log('💰 WALLET DEDUCTED:', {
            client_id: client_id,
            awb: parsedAWB,
            opening_balance: openingBalance,
            deduction: deduction_amount,
            closing_balance: closingBalance
          });

          const transaction = new Transaction({
            transaction_id: `WD${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
            user_id: client_id,
            transaction_type: 'debit',
            transaction_category: 'weight_discrepancy_charge',
            amount: deduction_amount,
            description: `Weight discrepancy charge for AWB: ${parsedAWB}. Discrepancy: ${weight_discrepancy} g`,
            related_order_id: order._id,
            related_awb: parsedAWB,
            status: 'completed',
            balance_info: {
              opening_balance: openingBalance,
              closing_balance: closingBalance
            },
            order_info: {
              order_id: order.order_id,
              awb_number: parsedAWB,
              weight: delhivery_updated_weight,
              zone: '',
              order_date: order.order_date
            },
            transaction_date: new Date()
          });

          await transaction.save();

          // Link transaction to weight discrepancy
          weightDiscrepancy.transaction_id = transaction._id;
          weightDiscrepancy.processed = true;
          await weightDiscrepancy.save();

          // Send WebSocket notification to client with wallet update
          try {
            const notification = {
              type: 'weight_discrepancy_charge',
              title: 'Weight Discrepancy Charge',
              message: `Weight discrepancy charge of ₹${deduction_amount.toFixed(2)} applied for AWB ${parsedAWB}`,
              client_id: client_id,
              awb: parsedAWB,
              amount: deduction_amount,
              closing_balance: closingBalance,
              created_at: new Date()
            };
            websocketService.sendNotificationToClient(String(client_id), notification);
            
            // Also send wallet balance update for real-time dashboard refresh
            const walletUpdate = {
              type: 'wallet_balance_update',
              balance: closingBalance,
              currency: 'INR',
              last_updated: new Date()
            };
            websocketService.sendNotificationToClient(String(client_id), walletUpdate);
            
            console.log('📡 NOTIFICATIONS SENT:', {
              client_id: client_id,
              notification: 'weight_discrepancy_charge',
              wallet_update: 'wallet_balance_update',
              closing_balance: closingBalance
            });
          } catch (notifError) {
            console.error('Failed to send notification:', notifError);
          }
        }

        importResults.successful++;
        importResults.details.push({
          row: rowNumber,
          awb: parsedAWB,
          client_id: client_id,
          client_name: user?.company_name || 'N/A',
          status: 'Imported successfully'
        });

        console.log('✅ ROW IMPORTED:', {
          row: rowNumber,
          awb: parsedAWB,
          client_id: client_id,
          weight_discrepancy,
          deduction_amount
        });

      } catch (rowError) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          error: rowError.message,
          stack: rowError.stack
        });
        console.error('❌ ROW IMPORT ERROR:', {
          row: rowNumber,
          error: rowError.message
        });
      }
    }

    console.log('📊 IMPORT COMPLETED:', {
      batchId,
      total: importResults.total,
      successful: importResults.successful,
      failed: importResults.failed
    });

    res.json({
      success: true,
      message: `Import completed: ${importResults.successful} successful, ${importResults.failed} failed`,
      data: importResults
    });

  } catch (error) {
    console.error('❌ BULK IMPORT ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing bulk import',
      error: error.message
    });
  }
});

// @desc    Get all weight discrepancies (Admin)
// @route   GET /api/admin/weight-discrepancies
// @access  Admin
router.get('/weight-discrepancies', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', dispute_status = 'all' } = req.query;

    // Check for expired disputes (7 days old with no action)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    await WeightDiscrepancy.updateMany(
      {
        dispute_status: 'DISPUTE',
        dispute_raised_at: { $lte: sevenDaysAgo },
        action_taken: null
      },
      {
        $set: {
          dispute_status: 'FINAL WEIGHT',
          action_taken: 'No Action taken by Courier',
          action_taken_at: new Date()
        }
      }
    );

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filterQuery = {};

    // Search filter
    if (search) {
      filterQuery.$or = [
        { awb_number: { $regex: search, $options: 'i' } }
      ];
    }

    // Dispute status filter
    if (dispute_status !== 'all') {
      filterQuery.dispute_status = dispute_status;
    }

    const [discrepancies, total] = await Promise.all([
      WeightDiscrepancy.find(filterQuery)
        .populate('client_id', 'company_name email phone_number')
        .populate('order_id', 'order_id')
        .populate('refund_transaction_id', 'transaction_id amount')
        .sort({ discrepancy_date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      WeightDiscrepancy.countDocuments(filterQuery)
    ]);

    res.json({
      success: true,
      data: {
        discrepancies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get weight discrepancies error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching weight discrepancies',
      error: error.message
    });
  }
});

// @desc    Accept dispute - refund amount to client wallet
// @route   PUT /api/admin/weight-discrepancies/:id/accept-dispute
// @access  Admin
router.put('/weight-discrepancies/:id/accept-dispute', async (req, res) => {
  try {
    const discrepancy = await WeightDiscrepancy.findById(req.params.id);

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Weight discrepancy not found'
      });
    }

    if (discrepancy.dispute_status !== 'DISPUTE') {
      return res.status(400).json({
        success: false,
        message: 'Can only accept disputes with DISPUTE status'
      });
    }

    // Get client and refund the amount
    const user = await User.findById(discrepancy.client_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const refundAmount = discrepancy.deduction_amount;
    const openingBalance = user.wallet_balance || 0;
    const closingBalance = Math.round((openingBalance + refundAmount) * 100) / 100;

    // Update wallet balance
    user.wallet_balance = closingBalance;
    await user.save();

    // Create credit transaction for refund
    const transaction = new Transaction({
      transaction_id: `WDR${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      user_id: discrepancy.client_id,
      transaction_type: 'credit',
      transaction_category: 'weight_discrepancy_refund',
      amount: refundAmount,
      description: `Weight discrepancy refund for AWB: ${discrepancy.awb_number}. Dispute accepted.`,
      related_order_id: discrepancy.order_id,
      related_awb: discrepancy.awb_number,
      status: 'completed',
      balance_info: {
        opening_balance: openingBalance,
        closing_balance: closingBalance
      },
      transaction_date: new Date()
    });

    await transaction.save();

    // Update discrepancy
    discrepancy.dispute_status = 'FINAL WEIGHT';
    discrepancy.action_taken = 'DISPUTE ACCEPTED BY COURIER';
    discrepancy.action_taken_at = new Date();
    discrepancy.refund_transaction_id = transaction._id;
    await discrepancy.save();

    // Send WebSocket notification
    try {
      websocketService.sendNotificationToClient(String(discrepancy.client_id), {
        type: 'weight_discrepancy_refund',
        title: 'Weight Discrepancy Dispute Accepted',
        message: `Your dispute for AWB ${discrepancy.awb_number} has been accepted. ₹${refundAmount.toFixed(2)} has been refunded to your wallet.`,
        amount: refundAmount,
        closing_balance: closingBalance,
        created_at: new Date()
      });
      websocketService.sendNotificationToClient(String(discrepancy.client_id), {
        type: 'wallet_balance_update',
        balance: closingBalance,
        currency: 'INR',
        last_updated: new Date()
      });
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Dispute accepted and amount refunded',
      data: {
        discrepancy,
        refund_amount: refundAmount,
        new_balance: closingBalance
      }
    });

  } catch (error) {
    console.error('Accept dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error accepting dispute',
      error: error.message
    });
  }
});

// @desc    Reject dispute
// @route   PUT /api/admin/weight-discrepancies/:id/reject-dispute
// @access  Admin
router.put('/weight-discrepancies/:id/reject-dispute', async (req, res) => {
  try {
    const discrepancy = await WeightDiscrepancy.findById(req.params.id);

    if (!discrepancy) {
      return res.status(404).json({
        success: false,
        message: 'Weight discrepancy not found'
      });
    }

    if (discrepancy.dispute_status !== 'DISPUTE') {
      return res.status(400).json({
        success: false,
        message: 'Can only reject disputes with DISPUTE status'
      });
    }

    // Update discrepancy
    discrepancy.dispute_status = 'FINAL WEIGHT';
    discrepancy.action_taken = 'DISPUTE REJECTED BY COURIER';
    discrepancy.action_taken_at = new Date();
    await discrepancy.save();

    // Send WebSocket notification
    try {
      websocketService.sendNotificationToClient(String(discrepancy.client_id), {
        type: 'weight_discrepancy_rejected',
        title: 'Weight Discrepancy Dispute Rejected',
        message: `Your dispute for AWB ${discrepancy.awb_number} has been rejected.`,
        created_at: new Date()
      });
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Dispute rejected',
      data: discrepancy
    });

  } catch (error) {
    console.error('Reject dispute error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting dispute',
      error: error.message
    });
  }
});

// ============================================================================
// REMITTANCES ROUTES
// ============================================================================

// @desc    Bulk import remittances from Excel
// @route   POST /api/admin/remittances/upload
// @access  Admin
router.post('/remittances/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.file;
    const batchId = `REM${Date.now()}`;
    
    console.log('📊 REMITTANCE IMPORT STARTED:', {
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      batchId,
      timestamp: new Date().toISOString()
    });

    // Parse Excel file
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    console.log('📋 EXCEL PARSED:', {
      sheetName,
      rowCount: rows.length,
      columns: Object.keys(rows[0] || {})
    });

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Uploaded file does not contain any data rows'
      });
    }

    // Column mapping with various possible names
    const getCellValue = (row, possibleKeys) => {
      for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
          return row[key];
        }
      }
      return null;
    };

    const parseDate = (value) => {
      if (!value) return null;
      
      // Handle Excel serial date numbers (e.g. 45218)
      if (typeof value === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const ms = value * 24 * 60 * 60 * 1000;
        return new Date(excelEpoch.getTime() + ms);
      }
      
      // Handle string dates
      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      
      return null;
    };

    const parseAWB = (value) => {
      if (!value) return null;
      let parsed = String(value).trim();
      
      // Handle Excel scientific notation
      if (parsed.includes('E+') || parsed.includes('e+')) {
        parsed = parseFloat(parsed).toFixed(0);
        parsed = parsed.replace(/\./g, '');
      }
      
      return parsed;
    };

    // Group rows by REMITTANCE NUMBER
    const remittanceGroups = {};
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // Excel row number (header is row 1)
      
      // Extract remittance number
      const remittanceNumber = getCellValue(row, [
        'REMITTANCE NUMBER',
        'Remittance Number',
        'remittance_number',
        'REMITTANCE_NUMBER'
      ]);
      
      if (!remittanceNumber) {
        console.warn(`⚠️ Row ${rowNumber}: Missing remittance number, skipping`);
        continue;
      }
      
      if (!remittanceGroups[remittanceNumber]) {
        // Extract remittance metadata (from first row of this remittance)
        const date = parseDate(getCellValue(row, ['DATE', 'Date', 'date']));
        const bankTransactionId = getCellValue(row, [
          'BANK\'S TRANSACTION ID',
          'Bank\'s Transaction ID',
          'BANK TRANSACTION ID',
          'bank_transaction_id',
          'BANK_TRANSACTION_ID'
        ]);
        const stateStr = getCellValue(row, ['STATE', 'State', 'state', 'STATUS', 'Status']);
        const state = stateStr ? (String(stateStr).toLowerCase().includes('completed') ? 'completed' : 'pending') : 'pending';
        const totalRemittance = parseFloat(getCellValue(row, [
          'TOTAL REMITTANCE',
          'Total Remittance',
          'total_remittance',
          'TOTAL_REMITTANCE'
        ]) || 0);
        
        // Extract account details (optional)
        const bank = getCellValue(row, ['Bank', 'BANK', 'bank']);
        const beneficiaryName = getCellValue(row, [
          'Beneficiary Name',
          'BENEFICIARY NAME',
          'beneficiary_name',
          'Beneficiary'
        ]);
        const accountNumber = getCellValue(row, [
          'A/C Number',
          'ACCOUNT NUMBER',
          'account_number',
          'Account Number'
        ]);
        const ifscCode = getCellValue(row, [
          'IFSC Code',
          'IFSC CODE',
          'ifsc_code',
          'IFSC'
        ]);
        
        remittanceGroups[remittanceNumber] = {
          remittance_number: String(remittanceNumber).trim(),
          date: date || new Date(),
          bank_transaction_id: bankTransactionId || null,
          state: state,
          total_remittance: totalRemittance,
          account_details: {
            bank: bank || '',
            beneficiary_name: beneficiaryName || '',
            account_number: accountNumber || '',
            ifsc_code: ifscCode || ''
          },
          orders: [],
          errors: []
        };
      }
      
      // Extract AWB and amount
      const awbNumber = parseAWB(getCellValue(row, [
        'AWB NUMBER',
        'AWB Number',
        'awb_number',
        'AWB_NUMBER',
        'AWB'
      ]));
      
      const amountCollected = parseFloat(getCellValue(row, [
        'AMOUNT COLLECTED',
        'Amount Collected',
        'amount_collected',
        'AMOUNT_COLLECTED'
      ]) || 0);
      
      if (!awbNumber) {
        remittanceGroups[remittanceNumber].errors.push({
          row: rowNumber,
          error: 'AWB number is missing'
        });
        continue;
      }
      
      if (!amountCollected || amountCollected <= 0) {
        remittanceGroups[remittanceNumber].errors.push({
          row: rowNumber,
          error: 'Amount collected is missing or invalid',
          awb: awbNumber
        });
        continue;
      }
      
      remittanceGroups[remittanceNumber].orders.push({
        awb_number: awbNumber,
        amount_collected: amountCollected,
        row_number: rowNumber
      });
    }

    console.log(`📊 Grouped into ${Object.keys(remittanceGroups).length} remittances`);

    const importResults = {
      total: rows.length,
      successful: 0,
      failed: 0,
      remittances_created: 0,
      remittances_updated: 0,
      errors: [],
      details: []
    };

    // Process each remittance group
    for (const [remittanceNumber, remittanceData] of Object.entries(remittanceGroups)) {
      try {
        // Group orders by client (user_id)
        const clientGroups = {};
        
        for (const order of remittanceData.orders) {
          // Find order by AWB
          const orderDoc = await Order.findOne({ 'delhivery_data.waybill': order.awb_number });
          
          if (!orderDoc) {
            importResults.errors.push({
              remittance_number: remittanceNumber,
              row: order.row_number,
              awb: order.awb_number,
              error: `AWB ${order.awb_number} not found in orders`
            });
            continue;
          }
          
          const userId = orderDoc.user_id;
          
          if (!clientGroups[userId]) {
            clientGroups[userId] = {
              user_id: userId,
              orders: []
            };
          }
          
          clientGroups[userId].orders.push({
            awb_number: order.awb_number,
            amount_collected: order.amount_collected,
            order_id: orderDoc.order_id,
            order_ref: orderDoc._id
          });
        }
        
        // Create/update remittance for each client
        for (const [userId, clientData] of Object.entries(clientGroups)) {
          try {
            // Calculate total remittance for this client (proportional if multiple clients)
            const totalOrders = remittanceData.orders.length;
            const clientOrders = clientData.orders.length;
            const clientTotalRemittance = clientOrders === totalOrders ? 
              remittanceData.total_remittance : 
              clientData.orders.reduce((sum, o) => sum + o.amount_collected, 0);
            
            // Check if remittance already exists for this client
            let remittance = await Remittance.findOne({
              remittance_number: remittanceNumber,
              user_id: userId
            });
            
            if (remittance) {
              // Update existing remittance
              remittance.date = remittanceData.date;
              remittance.bank_transaction_id = remittanceData.bank_transaction_id;
              remittance.state = remittanceData.state;
              remittance.total_remittance = clientTotalRemittance;
              remittance.account_details = remittanceData.account_details;
              remittance.upload_batch_id = batchId;
              
              // Clear existing orders and add new ones
              remittance.remittance_orders = [];
              for (const order of clientData.orders) {
                remittance.remittance_orders.push({
                  awb_number: order.awb_number,
                  amount_collected: order.amount_collected,
                  order_id: order.order_id,
                  order_reference: order.order_ref
                });
              }
              
              remittance.total_orders = remittance.remittance_orders.length;
              
              if (remittanceData.state === 'completed' && !remittance.processed_on) {
                remittance.processed_on = new Date();
              }
              
              await remittance.save();
              importResults.remittances_updated++;
            } else {
              // Create new remittance
              remittance = new Remittance({
                remittance_number: remittanceNumber,
                user_id: userId,
                date: remittanceData.date,
                bank_transaction_id: remittanceData.bank_transaction_id,
                state: remittanceData.state,
                total_remittance: clientTotalRemittance,
                account_details: remittanceData.account_details,
                remittance_orders: clientData.orders.map(order => ({
                  awb_number: order.awb_number,
                  amount_collected: order.amount_collected,
                  order_id: order.order_id,
                  order_reference: order.order_ref
                })),
                total_orders: clientData.orders.length,
                upload_batch_id: batchId,
                uploaded_by: 'admin'
              });
              
              if (remittanceData.state === 'completed') {
                remittance.processed_on = new Date();
              }
              
              await remittance.save();
              importResults.remittances_created++;
            }
            
            importResults.successful += clientData.orders.length;
            
            importResults.details.push({
              remittance_number: remittanceNumber,
              user_id: userId,
              orders_count: clientData.orders.length,
              total_remittance: clientTotalRemittance,
              action: remittance ? 'updated' : 'created'
            });
          } catch (clientError) {
            console.error(`❌ Error processing remittance ${remittanceNumber} for user ${userId}:`, clientError);
            importResults.failed += clientData.orders.length;
            importResults.errors.push({
              remittance_number: remittanceNumber,
              user_id: userId,
              error: clientError.message
            });
          }
        }
        
        // Add remittance-level errors
        if (remittanceData.errors && remittanceData.errors.length > 0) {
          importResults.errors.push(...remittanceData.errors);
          importResults.failed += remittanceData.errors.length;
        }
      } catch (remittanceError) {
        console.error(`❌ Error processing remittance group ${remittanceNumber}:`, remittanceError);
        importResults.failed += remittanceData.orders.length;
        importResults.errors.push({
          remittance_number: remittanceNumber,
          error: remittanceError.message
        });
      }
    }

    console.log('✅ REMITTANCE IMPORT COMPLETED:', {
      batchId,
      successful: importResults.successful,
      failed: importResults.failed,
      remittances_created: importResults.remittances_created,
      remittances_updated: importResults.remittances_updated
    });

    res.json({
      success: true,
      message: 'Remittance import completed',
      data: importResults
    });
  } catch (error) {
    console.error('❌ REMITTANCE IMPORT ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing remittance import',
      error: error.message
    });
  }
});

// @desc    Get all remittances (Admin view)
// @route   GET /api/admin/remittances
// @access  Admin
router.get('/remittances', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', state = 'all' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filterQuery = {};

    // Search filter
    if (search) {
      filterQuery.remittance_number = { $regex: search, $options: 'i' };
    }

    // State filter
    if (state !== 'all') {
      filterQuery.state = state;
    }

    const [remittances, total] = await Promise.all([
      Remittance.find(filterQuery)
        .populate('user_id', 'company_name email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Remittance.countDocuments(filterQuery)
    ]);

    const formattedRemittances = remittances.map(r => ({
      remittance_number: r.remittance_number,
      user_id: r.user_id?._id,
      company_name: r.user_id?.company_name || 'N/A',
      email: r.user_id?.email || 'N/A',
      date: r.date,
      processed_on: r.processed_on || r.date,
      bank_transaction_id: r.bank_transaction_id || '-',
      state: r.state,
      total_remittance: r.total_remittance,
      total_orders: r.total_orders
    }));

    res.json({
      success: true,
      data: {
        remittances: formattedRemittances,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get remittances error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching remittances',
      error: error.message
    });
  }
});

// ============================================================================
// ADMIN BILLING ROUTES
// ============================================================================

// @desc    Get all clients for billing overview
// @route   GET /api/admin/billing/clients
// @access  Admin
router.get('/billing/clients', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { client_id: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { your_name: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [clients, total] = await Promise.all([
      User.find(query)
        .select('client_id company_name email your_name wallet_balance')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    // Get wallet stats for each client
    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const [credits, debits] = await Promise.all([
          Transaction.aggregate([
            { $match: { user_id: client._id, transaction_type: 'credit', status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Transaction.aggregate([
            { $match: { user_id: client._id, transaction_type: 'debit', status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        
        return {
          _id: client._id,
          client_id: client.client_id,
          company_name: client.company_name,
          email: client.email,
          your_name: client.your_name,
          wallet_balance: client.wallet_balance || 0,
          total_credits: credits[0]?.total || 0,
          total_debits: debits[0]?.total || 0
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        clients: clientsWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get billing clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching billing clients',
      error: error.message
    });
  }
});

// @desc    Get client details for billing
// @route   GET /api/admin/billing/clients/:clientId
// @access  Admin
router.get('/billing/clients/:clientId', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format'
      });
    }
    
    const clientId = new mongoose.Types.ObjectId(req.params.clientId);
    const client = await User.findById(clientId)
      .select('-password -password_reset_token -email_verification_token');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        _id: client._id,
        client_id: client.client_id,
        company_name: client.company_name,
        email: client.email,
        your_name: client.your_name,
        phone_number: client.phone_number
      }
    });
  } catch (error) {
    console.error('Get client billing details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client details',
      error: error.message
    });
  }
});

// @desc    Get client wallet balance
// @route   GET /api/admin/billing/clients/:clientId/wallet-balance
// @access  Admin
router.get('/billing/clients/:clientId/wallet-balance', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format'
      });
    }
    
    const clientId = new mongoose.Types.ObjectId(req.params.clientId);
    
    const client = await User.findById(clientId).select('wallet_balance');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    const pendingCredits = await Transaction.aggregate([
      {
        $match: {
          user_id: clientId,
          transaction_type: 'credit',
          status: 'pending'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const pendingDebits = await Transaction.aggregate([
      {
        $match: {
          user_id: clientId,
          transaction_type: 'debit',
          status: 'pending'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const availableBalance = client.wallet_balance || 0;
    const pendingCreditAmount = pendingCredits[0]?.total || 0;
    const pendingDebitAmount = pendingDebits[0]?.total || 0;
    
    res.json({
      success: true,
      data: {
        available_balance: parseFloat(availableBalance.toFixed(2)),
        pending_credits: parseFloat(pendingCreditAmount.toFixed(2)),
        pending_debits: parseFloat(pendingDebitAmount.toFixed(2)),
        effective_balance: parseFloat((availableBalance - pendingDebitAmount).toFixed(2)),
        currency: 'INR'
      }
    });
  } catch (error) {
    console.error('Get client wallet balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching wallet balance',
      error: error.message
    });
  }
});

// @desc    Get client wallet transactions
// @route   GET /api/admin/billing/clients/:clientId/wallet-transactions
// @access  Admin
router.get('/billing/clients/:clientId/wallet-transactions', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format'
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    
    const clientId = new mongoose.Types.ObjectId(req.params.clientId);
    
    const client = await User.findById(clientId).select('email your_name wallet_balance');
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }
    
    const filterQuery = { user_id: clientId };
    
    // Filter by transaction type
    if (req.query.type && req.query.type !== 'all') {
      filterQuery.transaction_type = req.query.type;
    }
    
    // Filter by date range
    if (req.query.date_from || req.query.date_to) {
      filterQuery.transaction_date = {};
      if (req.query.date_from) {
        filterQuery.transaction_date.$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        const endDate = new Date(req.query.date_to);
        endDate.setDate(endDate.getDate() + 1);
        filterQuery.transaction_date.$lt = endDate;
      }
    }
    
    const [transactions, totalCount] = await Promise.all([
      Transaction.find(filterQuery)
        .sort({ transaction_date: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'related_order_id',
          select: 'order_id delhivery_data package_info order_date',
          model: 'Order'
        })
        .lean(),
      Transaction.countDocuments(filterQuery)
    ]);
    
    // Calculate wallet summary
    const [credits, debits] = await Promise.all([
      Transaction.aggregate([
        { $match: { user_id: clientId, transaction_type: 'credit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { user_id: clientId, transaction_type: 'debit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    
    const totalCredits = credits[0]?.total || 0;
    const totalDebits = debits[0]?.total || 0;
    const currentBalance = client.wallet_balance || 0;
    
    // Transform transactions for frontend
    const transformedTransactions = transactions.map(txn => ({
      transaction_id: txn.transaction_id,
      transaction_type: txn.transaction_type,
      amount: txn.amount,
      description: txn.description,
      status: txn.status,
      transaction_date: txn.transaction_date,
      account_name: client.your_name || 'N/A',
      account_email: client.email || 'N/A',
      order_id: txn.order_info?.order_id || txn.related_order_id?.order_id || '',
      awb_number: txn.order_info?.awb_number || txn.related_order_id?.delhivery_data?.waybill || '',
      weight: txn.order_info?.weight || (txn.related_order_id?.package_info?.weight ? txn.related_order_id.package_info.weight * 1000 : null),
      zone: txn.order_info?.zone || '',
      closing_balance: txn.balance_info?.closing_balance || 0
    }));
    
    res.json({
      success: true,
      data: {
        transactions: transformedTransactions,
        summary: {
          current_balance: currentBalance,
          total_credits: totalCredits,
          total_debits: totalDebits
        },
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalCount / limit),
          total_count: totalCount,
          per_page: limit
        }
      }
    });
  } catch (error) {
    console.error('Get client wallet transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching wallet transactions',
      error: error.message
    });
  }
});

// ============================================================================
// ADMIN ORDERS ROUTES
// ============================================================================

// @desc    Get all clients with order counts
// @route   GET /api/admin/orders/clients
// @access  Admin
router.get('/orders/clients', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = {};
    
    if (search) {
      query.$or = [
        { client_id: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [clients, total] = await Promise.all([
      User.find(query)
        .select('client_id company_name email your_name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    // Get order counts for each client
    const clientsWithOrderStats = await Promise.all(
      clients.map(async (client) => {
        const orderCounts = await Order.aggregate([
          { $match: { user_id: client._id } },
          {
            $addFields: {
              effective_status: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$status', 'cancelled'] },
                      { $eq: ['$delhivery_data.cancellation_status', 'cancelled'] }
                    ]
                  },
                  'cancelled',
                  '$status'
                ]
              }
            }
          },
          {
            $group: {
              _id: '$effective_status',
              count: { $sum: 1 }
            }
          }
        ]);
        
        const statusMap = {};
        orderCounts.forEach(item => {
          statusMap[item._id] = item.count;
        });
        
        const totalOrders = await Order.countDocuments({ user_id: client._id });
        
        return {
          _id: client._id,
          client_id: client.client_id,
          company_name: client.company_name,
          email: client.email,
          your_name: client.your_name,
          total_orders: totalOrders,
          orders_by_status: {
            new: statusMap['new'] || 0,
            ready_to_ship: statusMap['ready_to_ship'] || 0,
            pickups_manifests: statusMap['pickups_manifests'] || 0,
            in_transit: statusMap['in_transit'] || 0,
            out_for_delivery: statusMap['out_for_delivery'] || 0,
            delivered: statusMap['delivered'] || 0,
            ndr: statusMap['ndr'] || 0,
            rto: statusMap['rto'] || 0,
            cancelled: statusMap['cancelled'] || 0
          }
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        clients: clientsWithOrderStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get orders clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders clients',
      error: error.message
    });
  }
});

// @desc    Get client orders
// @route   GET /api/admin/orders/clients/:clientId/orders
// @access  Admin
router.get('/orders/clients/:clientId/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;
    
    let clientObjectId = null;
    if (mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      clientObjectId = new mongoose.Types.ObjectId(req.params.clientId);
    } else {
      const client = await User.findOne({ client_id: req.params.clientId }).select('_id');
      if (!client) {
        return res.status(404).json({
          status: 'error',
          message: 'Client not found'
        });
      }
      clientObjectId = client._id;
    }
    
    const filterQuery = { user_id: clientObjectId };
    
    if (req.query.status && req.query.status !== 'all') {
      filterQuery['status'] = req.query.status;
      if (req.query.status === 'pickups_manifests') {
        filterQuery['delhivery_data.cancellation_status'] = { $ne: 'cancelled' };
      }
    }
    
    if (req.query.order_type) {
      filterQuery['order_type'] = req.query.order_type;
    }
    
    if (req.query.payment_mode) {
      filterQuery['payment_info.payment_mode'] = req.query.payment_mode;
    }
    
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { order_id: searchRegex },
        { reference_id: searchRegex },
        { 'delhivery_data.waybill': searchRegex },
        { 'customer_info.buyer_name': searchRegex },
        { 'customer_info.phone': searchRegex }
      ];
    }
    
    if (req.query.date_from || req.query.date_to) {
      filterQuery.createdAt = {};
      if (req.query.date_from) {
        filterQuery.createdAt.$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        filterQuery.createdAt.$lte = new Date(req.query.date_to);
      }
    }
    
    const [orders, totalOrders] = await Promise.all([
      Order.find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filterQuery)
    ]);
    
    res.json({
      status: 'success',
      data: {
        orders,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalOrders / limit),
          total_orders: totalOrders,
          per_page: limit
        }
      }
    });
  } catch (error) {
    console.error('Get client orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching client orders',
      error: error.message
    });
  }
});

// @desc    Get complete order details for admin view
// @route   GET /api/admin/orders/:orderId/details
// @access  Admin
router.get('/orders/:orderId/details', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Order identifier is required'
      });
    }

    const lookupConditions = [];

    if (mongoose.Types.ObjectId.isValid(orderId)) {
      lookupConditions.push({ _id: new mongoose.Types.ObjectId(orderId) });
    }

    lookupConditions.push({ order_id: orderId });

    if (orderId.length >= 6) {
      lookupConditions.push({ 'delhivery_data.waybill': orderId });
    }

    const order = await Order.findOne({ $or: lookupConditions })
      .populate({
        path: 'user_id',
        select: 'client_id company_name your_name email phone_number user_category account_status kyc_status created_at'
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const trackingHistory = Array.isArray(order.delhivery_data?.waybill)
      ? []
      : order.delhivery_data?.waybill
        ? await ShipmentTrackingEvent.find({ waybill: order.delhivery_data.waybill })
            .sort({ status_date_time: -1, createdAt: -1 })
            .lean()
        : [];

    const { __v, user_id: clientRef, ...orderData } = order;

    const clientInfo = clientRef
      ? {
          _id: clientRef._id,
          client_id: clientRef.client_id,
          company_name: clientRef.company_name,
          your_name: clientRef.your_name,
          email: clientRef.email,
          phone_number: clientRef.phone_number,
          user_category: clientRef.user_category,
          account_status: clientRef.account_status,
          kyc_status: clientRef.kyc_status,
          created_at: clientRef.created_at
        }
      : null;

    const products = Array.isArray(orderData.products)
      ? orderData.products.map((product, index) => ({
          line_item: index + 1,
          total_price:
            typeof product.unit_price === 'number' && typeof product.quantity === 'number'
              ? product.unit_price * product.quantity
              : undefined,
          ...product
        }))
      : [];

    const statusHistory = Array.isArray(orderData.status_history)
      ? [...orderData.status_history].sort((a, b) => {
          const aTime = new Date(a.timestamp || a.createdAt || 0).getTime();
          const bTime = new Date(b.timestamp || b.createdAt || 0).getTime();
          return bTime - aTime;
        })
      : [];

    const packageInfo = orderData.package_info || {};
    const paymentInfo = orderData.payment_info || {};

    const metrics = {
      total_products: products.reduce((sum, product) => sum + (product.quantity || 0), 0),
      total_units: products.reduce((sum, product) => sum + (product.quantity || 0), 0),
      volumetric_weight: packageInfo.volumetric_weight || null,
      actual_weight: packageInfo.weight || null,
      order_value: paymentInfo.order_value ?? null,
      cod_amount: paymentInfo.cod_amount ?? null,
      total_amount: paymentInfo.total_amount ?? null,
      shipping_charges: paymentInfo.shipping_charges ?? null,
      grand_total: paymentInfo.grand_total ?? null
    };

    const responseData = {
      ...orderData,
      client: clientInfo,
      products,
      status_history: statusHistory,
      tracking_history: trackingHistory,
      metrics
    };

    return res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get admin order details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
});

// @desc    Get client order statistics
// @route   GET /api/admin/orders/clients/:clientId/stats
// @access  Admin
router.get('/orders/clients/:clientId/stats', async (req, res) => {
  try {
    let clientObjectId = null;
    if (mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      clientObjectId = new mongoose.Types.ObjectId(req.params.clientId);
    } else {
      const client = await User.findOne({ client_id: req.params.clientId }).select('_id');
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }
      clientObjectId = client._id;
    }
    
    const orderCounts = await Order.aggregate([
      { $match: { user_id: clientObjectId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const stats = {
      new: 0,
      ready_to_ship: 0,
      pickups_manifests: 0,
      in_transit: 0,
      out_for_delivery: 0,
      delivered: 0,
      ndr: 0,
      rto: 0,
      all: 0
    };
    
    orderCounts.forEach(item => {
      if (stats.hasOwnProperty(item._id)) {
        stats[item._id] = item.count;
      }
      stats.all += item.count;
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get client order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order statistics',
      error: error.message
    });
  }
});

// ============================================================================
// ADMIN NDR ROUTES
// ============================================================================

// @desc    Get all clients with NDR counts
// @route   GET /api/admin/ndr/clients
// @access  Admin
router.get('/ndr/clients', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = {};
    
    if (search) {
      query.$or = [
        { client_id: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [clients, total] = await Promise.all([
      User.find(query)
        .select('client_id company_name email your_name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    // Get NDR counts for each client
    const clientsWithNDRStats = await Promise.all(
      clients.map(async (client) => {
        const [actionRequired, actionTaken, delivered, rto] = await Promise.all([
          Order.countDocuments({
            user_id: client._id,
            'ndr_info.is_ndr': true,
            'ndr_info.resolution_action': { $in: [null, 'reattempt'] },
            status: 'ndr'
          }),
          Order.countDocuments({
            user_id: client._id,
            'ndr_info.is_ndr': true,
            'ndr_info.resolution_action': { $ne: null },
            status: 'ndr'
          }),
          Order.countDocuments({
            user_id: client._id,
            'ndr_info.is_ndr': true,
            status: 'delivered'
          }),
          Order.countDocuments({
            user_id: client._id,
            'ndr_info.is_ndr': true,
            status: 'rto'
          })
        ]);
        
        const totalNDRs = actionRequired + actionTaken + delivered + rto;
        
        return {
          _id: client._id,
          client_id: client.client_id,
          company_name: client.company_name,
          email: client.email,
          your_name: client.your_name,
          total_ndrs: totalNDRs,
          ndrs_by_status: {
            action_required: actionRequired,
            action_taken: actionTaken,
            delivered: delivered,
            rto: rto
          }
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        clients: clientsWithNDRStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get NDR clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching NDR clients',
      error: error.message
    });
  }
});

// @desc    Get client NDRs
// @route   GET /api/admin/ndr/clients/:clientId/ndrs
// @access  Admin
router.get('/ndr/clients/:clientId/ndrs', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid client ID format'
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const clientId = new mongoose.Types.ObjectId(req.params.clientId);
    
    const filterQuery = {
      user_id: clientId,
      'ndr_info.is_ndr': true
    };
    
    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      switch (req.query.status) {
        case 'action_required':
          filterQuery['ndr_info.resolution_action'] = { $in: [null, 'reattempt'] };
          filterQuery.status = 'ndr';
          break;
        case 'action_taken':
          filterQuery['ndr_info.resolution_action'] = { $ne: null };
          filterQuery.status = 'ndr';
          break;
        case 'delivered':
          filterQuery.status = 'delivered';
          break;
        case 'rto':
          filterQuery.status = 'rto';
          break;
      }
    }
    
    // NDR reason filter
    if (req.query.ndr_reason) {
      filterQuery['ndr_info.ndr_reason'] = new RegExp(req.query.ndr_reason, 'i');
    }
    
    // NSL code filter
    if (req.query.nsl_code) {
      filterQuery['ndr_info.nsl_code'] = req.query.nsl_code;
    }
    
    // Attempts filter
    if (req.query.attempts_min || req.query.attempts_max) {
      filterQuery['ndr_info.ndr_attempts'] = {};
      if (req.query.attempts_min) {
        filterQuery['ndr_info.ndr_attempts'].$gte = parseInt(req.query.attempts_min);
      }
      if (req.query.attempts_max) {
        filterQuery['ndr_info.ndr_attempts'].$lte = parseInt(req.query.attempts_max);
      }
    }
    
    // Date filter
    if (req.query.date_from || req.query.date_to) {
      filterQuery['ndr_info.last_ndr_date'] = {};
      if (req.query.date_from) {
        filterQuery['ndr_info.last_ndr_date'].$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        filterQuery['ndr_info.last_ndr_date'].$lte = new Date(req.query.date_to);
      }
    }
    
    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { 'delhivery_data.waybill': searchRegex },
        { order_id: searchRegex },
        { 'customer_info.buyer_name': searchRegex },
        { 'customer_info.phone': searchRegex }
      ];
    }
    
    const [orders, totalOrders] = await Promise.all([
      Order.find(filterQuery)
        .sort({ 'ndr_info.last_ndr_date': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filterQuery)
    ]);
    
    res.json({
      status: 'success',
      data: {
        orders,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalOrders / limit),
          total_orders: totalOrders,
          per_page: limit
        }
      }
    });
  } catch (error) {
    console.error('Get client NDRs error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching client NDRs',
      error: error.message
    });
  }
});

// @desc    Get client NDR statistics
// @route   GET /api/admin/ndr/clients/:clientId/stats
// @access  Admin
router.get('/ndr/clients/:clientId/stats', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.clientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID format'
      });
    }
    
    const clientId = new mongoose.Types.ObjectId(req.params.clientId);
    
    const [actionRequired, actionTaken, delivered, rto] = await Promise.all([
      Order.countDocuments({
        user_id: clientId,
        'ndr_info.is_ndr': true,
        'ndr_info.resolution_action': { $in: [null, 'reattempt'] },
        status: 'ndr'
      }),
      Order.countDocuments({
        user_id: clientId,
        'ndr_info.is_ndr': true,
        'ndr_info.resolution_action': { $ne: null },
        status: 'ndr'
      }),
      Order.countDocuments({
        user_id: clientId,
        'ndr_info.is_ndr': true,
        status: 'delivered'
      }),
      Order.countDocuments({
        user_id: clientId,
        'ndr_info.is_ndr': true,
        status: 'rto'
      })
    ]);
    
    const stats = {
      action_required: actionRequired,
      action_taken: actionTaken,
      delivered: delivered,
      rto: rto,
      all: actionRequired + actionTaken + delivered + rto
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get client NDR stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching NDR statistics',
      error: error.message
    });
  }
});

// ==================== STAFF MANAGEMENT ROUTES ====================

// Middleware to ensure only admins (not staff) can access staff management
const adminOnly = (req, res, next) => {
  if (req.staff) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Staff members cannot access staff management.'
    });
  }
  if (!req.admin) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access. Admin credentials required.'
    });
  }
  next();
};

// @desc    Create staff account
// @route   POST /api/admin/staff
// @access  Admin only
router.post('/staff', adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if staff with email already exists
    const existingStaff = await Staff.findOne({ email: email.toLowerCase().trim() });
    if (existingStaff) {
      return res.status(400).json({
        success: false,
        message: 'Staff with this email already exists'
      });
    }

    // Create staff account
    const staff = new Staff({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: password,
      role: 'staff',
      created_by: req.admin.email,
      is_active: true
    });

    await staff.save();

    // Return staff without password
    const staffData = staff.toObject();
    delete staffData.password;

    logger.info('Staff account created', {
      staffEmail: staff.email,
      createdBy: req.admin.email
    });

    res.status(201).json({
      success: true,
      message: 'Staff account created successfully',
      data: staffData
    });

  } catch (error) {
    logger.error('Error creating staff account:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating staff account',
      error: error.message
    });
  }
});

// @desc    Get all staff members
// @route   GET /api/admin/staff
// @access  Admin only
router.get('/staff', adminOnly, async (req, res) => {
  try {
    const staffList = await Staff.find({})
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: staffList
    });

  } catch (error) {
    logger.error('Error fetching staff list:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching staff list',
      error: error.message
    });
  }
});

// @desc    Update staff account
// @route   PATCH /api/admin/staff/:id
// @access  Admin only
router.patch('/staff/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, is_active } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid staff ID'
      });
    }

    const staff = await Staff.findById(id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    // Update fields
    if (name) staff.name = name.trim();
    if (email) {
      // Check if email is already taken by another staff
      const existingStaff = await Staff.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: id }
      });
      if (existingStaff) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use by another staff member'
        });
      }
      staff.email = email.toLowerCase().trim();
    }
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }
      staff.password = password; // Will be hashed by pre-save hook
    }
    if (typeof is_active === 'boolean') {
      staff.is_active = is_active;
    }

    await staff.save();

    const staffData = staff.toObject();
    delete staffData.password;

    logger.info('Staff account updated', {
      staffId: id,
      updatedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Staff account updated successfully',
      data: staffData
    });

  } catch (error) {
    logger.error('Error updating staff account:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating staff account',
      error: error.message
    });
  }
});

// @desc    Delete/Deactivate staff account
// @route   DELETE /api/admin/staff/:id
// @access  Admin only
router.delete('/staff/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid staff ID'
      });
    }

    const staff = await Staff.findById(id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    // Soft delete - set is_active to false instead of actually deleting
    staff.is_active = false;
    await staff.save();

    logger.info('Staff account deactivated', {
      staffId: id,
      deactivatedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Staff account deactivated successfully'
    });

  } catch (error) {
    logger.error('Error deactivating staff account:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating staff account',
      error: error.message
    });
  }
});

// @desc    Verify staff credentials (for login)
// @route   POST /api/admin/staff/verify
// @access  Protected (requires valid admin or staff credentials in headers)
router.post('/staff/verify', async (req, res) => {
  try {
    // This route uses adminAuth middleware, so if we reach here, credentials are valid
    if (req.staff) {
      return res.json({
        success: true,
        staff: {
          name: req.staff.name,
          email: req.staff.email,
          role: req.staff.role
        }
      });
    } else if (req.admin) {
      return res.json({
        success: true,
        admin: {
          email: req.admin.email,
          role: 'admin'
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    logger.error('Staff verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed'
    });
  }
});

// ==========================================
// RATECARD MANAGEMENT ROUTES
// ==========================================

// @desc    Get all ratecard categories
// @route   GET /api/admin/ratecard
// @access  Admin only
router.get('/ratecard', adminOnly, async (req, res) => {
  try {
    const categories = await RateCardService.getAvailableUserCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error fetching ratecard categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ratecard categories',
      error: error.message
    });
  }
});

// @desc    Get specific ratecard by user category
// @route   GET /api/admin/ratecard/:userCategory
// @access  Admin only
router.get('/ratecard/:userCategory', adminOnly, async (req, res) => {
  try {
    const { userCategory } = req.params;
    
    // Normalize category name
    let normalizedCategory = userCategory;
    if (userCategory === 'Advanced User' || userCategory === 'advanced-user') {
      normalizedCategory = 'Advanced';
    } else if (userCategory === 'New User' || userCategory === 'new-user') {
      normalizedCategory = 'New User';
    } else if (userCategory === 'Basic User' || userCategory === 'basic-user') {
      normalizedCategory = 'Basic User';
    } else if (userCategory === 'Lite User' || userCategory === 'lite-user') {
      normalizedCategory = 'Lite User';
    }
    
    const rateCard = await RateCard.findByCategory(normalizedCategory);
    
    if (!rateCard) {
      return res.status(404).json({
        success: false,
        message: `Rate card not found for user category: ${userCategory}`,
        available_categories: await RateCardService.getAvailableUserCategories()
      });
    }
    
    res.json({
      success: true,
      data: rateCard
    });
  } catch (error) {
    logger.error('Error fetching ratecard:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ratecard',
      error: error.message
    });
  }
});

// @desc    Update ratecard for a user category
// @route   PATCH /api/admin/ratecard/:userCategory
// @access  Admin only
router.patch('/ratecard/:userCategory', adminOnly, async (req, res) => {
  try {
    const { userCategory } = req.params;
    const updates = req.body;
    
    // Normalize category name
    let normalizedCategory = userCategory;
    if (userCategory === 'Advanced User' || userCategory === 'advanced-user') {
      normalizedCategory = 'Advanced';
    } else if (userCategory === 'New User' || userCategory === 'new-user') {
      normalizedCategory = 'New User';
    } else if (userCategory === 'Basic User' || userCategory === 'basic-user') {
      normalizedCategory = 'Basic User';
    } else if (userCategory === 'Lite User' || userCategory === 'lite-user') {
      normalizedCategory = 'Lite User';
    }
    
    // Find the ratecard
    const rateCard = await RateCard.findByCategory(normalizedCategory);
    
    if (!rateCard) {
      return res.status(404).json({
        success: false,
        message: `Rate card not found for user category: ${userCategory}`
      });
    }
    
    // Validate and update forwardCharges if provided
    if (updates.forwardCharges) {
      if (!Array.isArray(updates.forwardCharges)) {
        return res.status(400).json({
          success: false,
          message: 'forwardCharges must be an array'
        });
      }
      
      // Validate each charge entry
      for (const charge of updates.forwardCharges) {
        if (!charge.condition || !charge.zones) {
          return res.status(400).json({
            success: false,
            message: 'Each forwardCharge must have condition and zones'
          });
        }
        
        // Validate zones object
        const validZones = ['A', 'B', 'C', 'D', 'E', 'F'];
        for (const zone of validZones) {
          if (charge.zones[zone] === undefined || typeof charge.zones[zone] !== 'number') {
            return res.status(400).json({
              success: false,
              message: `Zone ${zone} must be a number in forwardCharges`
            });
          }
        }
      }
      
      rateCard.forwardCharges = updates.forwardCharges;
    }
    
    // Validate and update rtoCharges if provided
    if (updates.rtoCharges) {
      if (!Array.isArray(updates.rtoCharges)) {
        return res.status(400).json({
          success: false,
          message: 'rtoCharges must be an array'
        });
      }
      
      // Validate each charge entry
      for (const charge of updates.rtoCharges) {
        if (!charge.condition || !charge.zones) {
          return res.status(400).json({
            success: false,
            message: 'Each rtoCharge must have condition and zones'
          });
        }
        
        // Validate zones object
        const validZones = ['A', 'B', 'C', 'D', 'E', 'F'];
        for (const zone of validZones) {
          if (charge.zones[zone] === undefined || typeof charge.zones[zone] !== 'number') {
            return res.status(400).json({
              success: false,
              message: `Zone ${zone} must be a number in rtoCharges`
            });
          }
        }
      }
      
      rateCard.rtoCharges = updates.rtoCharges;
    }
    
    // Update codCharges if provided
    if (updates.codCharges) {
      if (updates.codCharges.percentage !== undefined) {
        if (typeof updates.codCharges.percentage !== 'number' || updates.codCharges.percentage < 0) {
          return res.status(400).json({
            success: false,
            message: 'COD percentage must be a non-negative number'
          });
        }
        rateCard.codCharges.percentage = updates.codCharges.percentage;
      }
      
      if (updates.codCharges.minimumAmount !== undefined) {
        if (typeof updates.codCharges.minimumAmount !== 'number' || updates.codCharges.minimumAmount < 0) {
          return res.status(400).json({
            success: false,
            message: 'COD minimum amount must be a non-negative number'
          });
        }
        rateCard.codCharges.minimumAmount = updates.codCharges.minimumAmount;
      }
      
      if (updates.codCharges.gstAdditional !== undefined) {
        rateCard.codCharges.gstAdditional = Boolean(updates.codCharges.gstAdditional);
      }
    }
    
    // Save the updated ratecard
    await rateCard.save();
    
    // Clear cache for this category
    RateCardService.clearCache(normalizedCategory);
    
    logger.info('Ratecard updated', {
      userCategory: normalizedCategory,
      updatedBy: req.admin?.email || req.staff?.email || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Rate card updated successfully',
      data: rateCard
    });
  } catch (error) {
    logger.error('Error updating ratecard:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating ratecard',
      error: error.message
    });
  }
});

module.exports = router;
