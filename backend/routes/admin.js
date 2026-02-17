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
const Carrier = require('../models/Carrier');
const Notification = require('../models/Notification');
const Invoice = require('../models/Invoice');
const RateCardService = require('../services/rateCardService');
const logger = require('../utils/logger');
const websocketService = require('../services/websocketService');
const cloudinaryService = require('../services/cloudinaryService');
const excelService = require('../services/excelService');

const STATUS_KEYS = ['open', 'in_progress', 'resolved', 'closed', 'escalated'];
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

// Global search endpoint - search by AWB, Order ID, or Contact Number
router.get('/global-search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: {
          orders: [],
          packages: [],
          customers: [],
          clients: []
        }
      });
    }

    const searchQuery = query.trim();
    const isPhoneNumber = /^[6-9]\d{9}$/.test(searchQuery);
    const isPartialPhone = /^\d+$/.test(searchQuery) && searchQuery.length >= 3;

    // Search orders by order_id or AWB
    const orderQuery = {
      $or: [
        { order_id: { $regex: searchQuery, $options: 'i' } },
        { awb_number: { $regex: searchQuery, $options: 'i' } }
      ]
    };

    // Search packages by AWB
    const packageQuery = {
      awb_number: { $regex: searchQuery, $options: 'i' }
    };

    // Search customers by phone number
    const customerQuery = isPhoneNumber || isPartialPhone
      ? { phone: { $regex: searchQuery, $options: 'i' } }
      : { _id: null }; // No results if not a phone number pattern

    // Search clients by phone number, company name, or client_id
    const clientQuery = {
      $or: [
        ...(isPhoneNumber || isPartialPhone ? [{ phone_number: { $regex: searchQuery, $options: 'i' } }] : []),
        { company_name: { $regex: searchQuery, $options: 'i' } },
        { client_id: { $regex: searchQuery, $options: 'i' } }
      ]
    };

    const [orders, packages, customers, clients] = await Promise.all([
      Order.find(orderQuery)
        .select('order_id awb_number status created_at user_id consignee')
        .populate('user_id', 'company_name client_id')
        .sort({ created_at: -1 })
        .limit(10)
        .lean(),
      Package.find(packageQuery)
        .select('awb_number status created_at user_id product_name')
        .populate('user_id', 'company_name client_id')
        .sort({ created_at: -1 })
        .limit(10)
        .lean(),
      Customer.find(customerQuery)
        .select('name phone email user_id')
        .populate('user_id', 'company_name client_id')
        .limit(10)
        .lean(),
      User.find(clientQuery)
        .select('company_name client_id phone_number email account_status')
        .limit(10)
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        orders: orders.map(o => ({
          _id: o._id,
          order_id: o.order_id,
          awb_number: o.awb_number,
          status: o.status,
          created_at: o.created_at,
          client_name: o.user_id?.company_name || 'N/A',
          client_id: o.user_id?.client_id || 'N/A',
          consignee_name: o.consignee?.name || 'N/A'
        })),
        packages: packages.map(p => ({
          _id: p._id,
          awb_number: p.awb_number,
          status: p.status,
          created_at: p.created_at,
          product_name: p.product_name,
          client_name: p.user_id?.company_name || 'N/A',
          client_id: p.user_id?.client_id || 'N/A'
        })),
        customers: customers.map(c => ({
          _id: c._id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          client_name: c.user_id?.company_name || 'N/A',
          client_id: c.user_id?.client_id || 'N/A',
          user_id: c.user_id?._id
        })),
        clients: clients.map(c => ({
          _id: c._id,
          company_name: c.company_name,
          client_id: c.client_id,
          phone_number: c.phone_number,
          email: c.email,
          account_status: c.account_status
        }))
      }
    });

  } catch (error) {
    logger.error('Error in global search:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
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

// Get individual client dashboard with comprehensive stats
router.get('/clients/:id/dashboard', async (req, res) => {
  try {
    const clientId = req.params.id;

    // Fetch client basic info
    const client = await User.findById(clientId)
      .select('company_name your_name email phone_number client_id account_status kyc_status wallet_balance user_type user_category created_at');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Fetch ticket statistics
    const ticketStats = await SupportTicket.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(clientId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const ticketCounts = {
      open: 0,
      in_progress: 0,
      escalated: 0,
      resolved: 0,
      closed: 0,
      total: 0
    };

    ticketStats.forEach(stat => {
      if (stat._id && ticketCounts.hasOwnProperty(stat._id)) {
        ticketCounts[stat._id] = stat.count;
        ticketCounts.total += stat.count;
      }
    });

    // Fetch order statistics by status
    const orderStats = await Order.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(clientId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const orderCounts = {
      new: 0,
      ready_to_ship: 0,
      pickup_scheduled: 0,
      in_transit: 0,
      out_for_delivery: 0,
      delivered: 0,
      ndr: 0,
      rto_in_transit: 0,
      rto_delivered: 0,
      cancelled: 0,
      lost: 0,
      total: 0
    };

    orderStats.forEach(stat => {
      const status = stat._id?.toLowerCase().replace(/\s+/g, '_');
      if (status) {
        if (orderCounts.hasOwnProperty(status)) {
          orderCounts[status] = stat.count;
        }
        orderCounts.total += stat.count;
      }
    });

    // Fetch NDR statistics
    const ndrStats = await Order.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(clientId),
          status: { $in: ['ndr', 'NDR', 'Ndr'] }
        }
      },
      {
        $group: {
          _id: '$ndr_status',
          count: { $sum: 1 }
        }
      }
    ]);

    const ndrCounts = {
      pending: 0,
      reattempt_requested: 0,
      rto_requested: 0,
      resolved: 0,
      total: 0
    };

    ndrStats.forEach(stat => {
      const status = stat._id?.toLowerCase().replace(/\s+/g, '_');
      if (status && ndrCounts.hasOwnProperty(status)) {
        ndrCounts[status] = stat.count;
      }
      ndrCounts.total += stat.count;
    });

    // Fetch COD statistics
    const codStats = await Order.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(clientId),
          payment_mode: { $in: ['cod', 'COD', 'Cash on Delivery'] }
        }
      },
      {
        $group: {
          _id: '$status',
          total_amount: { $sum: '$cod_amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const codSummary = {
      total_cod_orders: 0,
      total_cod_amount: 0,
      delivered_cod: 0,
      pending_cod: 0,
      rto_cod: 0
    };

    codStats.forEach(stat => {
      codSummary.total_cod_orders += stat.count;
      codSummary.total_cod_amount += stat.total_amount || 0;
      const status = stat._id?.toLowerCase();
      if (status === 'delivered') {
        codSummary.delivered_cod += stat.total_amount || 0;
      } else if (['rto', 'rto_in_transit', 'rto_delivered'].includes(status)) {
        codSummary.rto_cod += stat.total_amount || 0;
      } else {
        codSummary.pending_cod += stat.total_amount || 0;
      }
    });

    // Fetch remittance summary
    const remittanceStats = await Remittance.aggregate([
      { $match: { client_id: new mongoose.Types.ObjectId(clientId) } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$remittance_amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const remittanceSummary = {
      total_remitted: 0,
      pending_remittance: 0,
      total_records: 0
    };

    remittanceStats.forEach(stat => {
      remittanceSummary.total_records += stat.count;
      if (stat._id === 'completed' || stat._id === 'remitted') {
        remittanceSummary.total_remitted += stat.total || 0;
      } else {
        remittanceSummary.pending_remittance += stat.total || 0;
      }
    });

    // Fetch recent wallet transactions
    const recentTransactions = await Transaction.find({ user_id: clientId })
      .sort({ created_at: -1 })
      .limit(5)
      .select('type amount description status created_at');

    // Fetch recent orders
    const recentOrders = await Order.find({ user_id: clientId })
      .sort({ created_at: -1 })
      .limit(5)
      .select('order_id awb_number status consignee.name created_at');

    res.json({
      success: true,
      data: {
        client: {
          _id: client._id,
          company_name: client.company_name,
          your_name: client.your_name,
          email: client.email,
          phone_number: client.phone_number,
          client_id: client.client_id,
          account_status: client.account_status,
          kyc_status: client.kyc_status,
          wallet_balance: client.wallet_balance,
          user_type: client.user_type,
          user_category: client.user_category,
          created_at: client.created_at
        },
        tickets: ticketCounts,
        orders: orderCounts,
        ndr: ndrCounts,
        cod: codSummary,
        remittance: remittanceSummary,
        recentTransactions,
        recentOrders
      }
    });

  } catch (error) {
    logger.error('Error fetching client dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching client dashboard',
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
      .select('documents kyc_status company_name your_name email client_id');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Extract document information from the documents array
    // User model schema: documents is an array with {document_type, document_status, file_url, upload_date, original_filename, mimetype}
    const documents = [];

    if (client.documents && Array.isArray(client.documents)) {
      client.documents.forEach(doc => {
        if (doc && doc.file_url) {
          documents.push({
            type: doc.document_type,
            name: doc.original_filename || `${doc.document_type}_document`,
            url: doc.file_url,
            uploadedAt: doc.upload_date,
            status: doc.document_status || 'uploaded'
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

// @desc    Get master tickets table with priority summary
// @route   GET /api/admin/tickets/master
// @access  Admin
router.get('/tickets/master', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      status = '',
      priority = '',
      date_from = '',
      date_to = '',
      search = ''
    } = req.query;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = {};

    if (status && status !== 'all') {
      filterQuery.status = status;
    }

    const normalizedPriority = typeof priority === 'string' ? priority.trim().toLowerCase() : '';
    if (normalizedPriority && normalizedPriority !== 'all') {
      filterQuery.priority = normalizedPriority;
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

    // If search is provided, search across multiple fields
    let tickets;
    let totalTickets;

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');

      // Find user IDs that match the search
      const matchingUsers = await User.find({
        $or: [
          { company_name: searchRegex },
          { email: searchRegex },
          { client_id: searchRegex }
        ]
      }).select('_id').lean();

      const userIds = matchingUsers.map(u => u._id);

      // Search in tickets
      const searchFilter = {
        ...filterQuery,
        $or: [
          { ticket_id: searchRegex },
          { awb_numbers: searchRegex },
          { user_id: { $in: userIds } }
        ]
      };

      tickets = await SupportTicket.find(searchFilter)
        .populate('user_id', 'company_name email phone_number client_id')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      totalTickets = await SupportTicket.countDocuments(searchFilter);
    } else {
      tickets = await SupportTicket.find(filterQuery)
        .populate('user_id', 'company_name email phone_number client_id')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      totalTickets = await SupportTicket.countDocuments(filterQuery);
    }

    // Calculate priority summary with SLA breach info
    const prioritySummary = {
      urgent: { count: 0, sla_breached: 0 },
      high: { count: 0, sla_breached: 0 },
      medium: { count: 0, sla_breached: 0 },
      low: { count: 0, sla_breached: 0 }
    };

    const allTicketsForSummary = await SupportTicket.find(filterQuery).select('priority sla_info').lean();

    allTicketsForSummary.forEach(ticket => {
      const priority = ticket.priority || 'medium';
      if (prioritySummary[priority]) {
        prioritySummary[priority].count++;
        if (ticket.sla_info?.breached_sla) {
          prioritySummary[priority].sla_breached++;
        }
      }
    });

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
        priority_summary: prioritySummary
      }
    });

  } catch (error) {
    logger.error('Error fetching master tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching master tickets',
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
      date_to = '',
      search = '',
      sort_by = 'created_at',
      sort_order = '-1'
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

    // Build sort options
    const sortOptions = {};
    sortOptions[sort_by] = parseInt(sort_order);

    // If search is provided, we need to search in populated fields
    let tickets;
    let totalTickets;

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');

      // First, find user IDs that match the search in User collection
      const matchingUsers = await User.find({
        $or: [
          { company_name: searchRegex },
          { your_name: searchRegex },
          { email: searchRegex },
          { client_id: searchRegex },
          { phone_number: searchRegex }
        ]
      }).select('_id').lean();

      const userIds = matchingUsers.map(u => u._id);

      // Search in tickets - either in ticket fields or in user references
      const searchFilter = {
        ...filterQuery,
        $or: [
          { ticket_id: searchRegex },
          { subject: searchRegex },
          { category: searchRegex },
          { awb_numbers: searchRegex },
          { user_id: { $in: userIds } }
        ]
      };

      tickets = await SupportTicket.find(searchFilter)
        .populate('user_id', 'company_name your_name email phone_number client_id')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      totalTickets = await SupportTicket.countDocuments(searchFilter);
    } else {
      // Get tickets with pagination and populate user info
      tickets = await SupportTicket.find(filterQuery)
        .populate('user_id', 'company_name your_name email phone_number client_id')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      totalTickets = await SupportTicket.countDocuments(filterQuery);
    }

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
router.post('/tickets/:id/messages', upload.fields([
  { name: 'attachments', maxCount: 5 },
  { name: 'files', maxCount: 5 }
]), async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ticket ID'
      });
    }

    const { message, is_internal = false } = req.body;

    // Normalize Multer files (support both attachments and files fields)
    const uploadedFileGroups = req.files || {};
    const normalizedFiles = Array.isArray(uploadedFileGroups)
      ? uploadedFileGroups
      : Object.values(uploadedFileGroups).flat();

    // Require either a message or files
    if ((!message || !message.trim()) && normalizedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message or attachment is required'
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check for duplicate message (same content within last 10 seconds) - only if message provided
    const trimmedMessage = (message || '').trim();
    if (trimmedMessage) {
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
    }

    // Process file attachments (upload to Cloudinary)
    const attachments = [];
    if (normalizedFiles.length > 0) {
      for (const file of normalizedFiles) {
        const validation = cloudinaryService.validateFile(file);
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            message: validation.error
          });
        }

        logger.info('[Admin Message Upload] Processing file', {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        });

        let uploadResult;
        try {
          uploadResult = await cloudinaryService.uploadFile(file.buffer, {
            folder: 'shipsarthi/support/admin-messages',
            mimetype: file.mimetype
          });
        } catch (uploadError) {
          logger.error('[Admin Message Upload] Failed to upload file', {
            name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            error: uploadError
          });

          return res.status(500).json({
            success: false,
            message: 'Failed to upload attachment to cloud storage'
          });
        }

        if (!uploadResult || !uploadResult.success) {
          logger.error('[Admin Message Upload] Unexpected upload response', {
            name: file.originalname,
            uploadResult
          });

          return res.status(500).json({
            success: false,
            message: 'Failed to upload attachment to cloud storage'
          });
        }

        logger.info('[Admin Message Upload] Upload successful', {
          name: file.originalname,
          public_id: uploadResult.public_id,
          resource_type: uploadResult.resource_type
        });

        const fileType = cloudinaryService.getFileType(file.mimetype);

        attachments.push({
          file_name: file.originalname,
          mimetype: file.mimetype,
          file_url: uploadResult.url,
          file_type: fileType,
          file_size: file.size
        });
      }
    }

    // Get sender name (staff name or admin email)
    const senderName = req.staff ? req.staff.name : (req.admin?.email || 'Admin');
    const staffName = req.staff ? req.staff.name : null;

    // Add message to conversation with staff tracking and attachments
    await ticket.addMessage('admin', senderName, trimmedMessage || '[Attachment]', attachments, is_internal, staffName);

    // Reload ticket to get populated user_id
    await ticket.populate('user_id', '_id your_name');

    // Send WebSocket notification to admins
    websocketService.notifyNewMessage({
      ticket_id: ticket.ticket_id,
      _id: ticket._id,
      client_name: ticket.user_id?.your_name || 'Unknown Client'
    }, {
      message: trimmedMessage || '[Attachment]',
      sender: senderName,
      timestamp: new Date().toISOString(),
      has_attachments: attachments.length > 0
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
          message: trimmedMessage || '[Attachment]',
          sender: senderName,
          timestamp: new Date().toISOString(),
          has_attachments: attachments.length > 0
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

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed', 'escalated'];
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
    const { client_id, amount, description, type = 'credit', idempotency_key } = req.body;

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

    // --- DUPLICATE PREVENTION ---

    // Check 1: Idempotency key (if provided by frontend)
    if (idempotency_key) {
      const existingByKey = await Transaction.findOne({ idempotency_key });
      if (existingByKey) {
        logger.warn('Duplicate wallet recharge blocked by idempotency key', {
          idempotency_key,
          existing_transaction_id: existingByKey.transaction_id,
          client_id,
          amount
        });
        // Return the existing transaction as if it succeeded (idempotent response)
        const existingClient = await User.findById(client_id).select('wallet_balance company_name email');
        return res.json({
          success: true,
          message: `Wallet ${type === 'credit' ? 'recharged' : 'deducted'} successfully`,
          data: {
            client_id,
            client_name: existingClient?.company_name,
            client_email: existingClient?.email,
            transaction_type: existingByKey.transaction_type,
            amount: existingByKey.amount,
            previous_balance: existingByKey.balance_info?.opening_balance,
            new_balance: existingClient?.wallet_balance || 0,
            transaction_id: existingByKey.transaction_id,
            duplicate: true
          }
        });
      }
    }

    // Check 2: Time-window deduplication (same client, amount, type within 60 seconds)
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const recentDuplicate = await Transaction.findOne({
      user_id: client_id,
      amount: Math.round(parseFloat(amount) * 100) / 100,
      transaction_type: type,
      transaction_category: 'manual_adjustment',
      status: 'completed',
      created_at: { $gte: sixtySecondsAgo }
    });

    if (recentDuplicate) {
      logger.warn('Duplicate wallet recharge blocked by time-window check', {
        existing_transaction_id: recentDuplicate.transaction_id,
        client_id,
        amount,
        type,
        created_at: recentDuplicate.created_at
      });
      const existingClient = await User.findById(client_id).select('wallet_balance company_name email');
      return res.json({
        success: true,
        message: `Wallet ${type === 'credit' ? 'recharged' : 'deducted'} successfully`,
        data: {
          client_id,
          client_name: existingClient?.company_name,
          client_email: existingClient?.email,
          transaction_type: recentDuplicate.transaction_type,
          amount: recentDuplicate.amount,
          previous_balance: recentDuplicate.balance_info?.opening_balance,
          new_balance: existingClient?.wallet_balance || 0,
          transaction_id: recentDuplicate.transaction_id,
          duplicate: true
        }
      });
    }

    // --- END DUPLICATE PREVENTION ---

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

    // Track who performed the transaction (staff or admin)
    const performedBy = {
      name: req.staff ? req.staff.name : (req.admin?.email || 'Admin'),
      email: req.staff ? req.staff.email : (req.admin?.email || ''),
      role: req.staff ? 'staff' : 'admin'
    };

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
      },
      performed_by: performedBy,
      created_by: performedBy.name,
      ...(idempotency_key && { idempotency_key })
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
        .populate('user_id', 'company_name email client_id')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Remittance.countDocuments(filterQuery)
    ]);

    const formattedRemittances = remittances.map(r => ({
      _id: r._id,
      remittance_number: r.remittance_number,
      user_id: r.user_id?._id,
      client_id: r.user_id?.client_id || 'N/A',
      company_name: r.user_id?.company_name || 'N/A',
      email: r.user_id?.email || 'N/A',
      date: r.date,
      remittance_date: r.remittance_date || r.date,
      processed_on: r.processed_on || r.date,
      bank_transaction_id: r.bank_transaction_id || '-',
      state: r.state,
      total_remittance: r.total_remittance,
      total_orders: r.total_orders,
      settlement_date: r.settlement_date
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

// @desc    Simplified COD AWB upload for remittance
// @route   POST /api/admin/remittances/upload-cod
// @access  Admin
const { generateRemittanceNumber, getNextFriday, validateAWBForRemittance } = require('../utils/remittanceHelper');

router.post('/remittances/upload-cod', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'Excel file is empty' });
    }

    // Normalise column headers
    const normalised = rows.map((row, idx) => {
      const normalRow = {};
      for (const key of Object.keys(row)) {
        normalRow[key.trim().toLowerCase().replace(/[\s]+/g, '_')] = row[key];
      }
      return { ...normalRow, _row: idx + 2 };
    });

    // Extract AWB list
    const awbList = normalised.map(r => String(r.awb_number || r.awb || '').trim()).filter(Boolean);
    if (!awbList.length) {
      return res.status(400).json({ success: false, message: 'No AWB numbers found. Required column: "AWB Number"' });
    }

    // Batch fetch orders and existing remittances
    const [orders, existingRemittances] = await Promise.all([
      Order.find({ 'delhivery_data.waybill': { $in: awbList } })
        .populate('user_id', 'client_id company_name bank_details')
        .lean(),
      Remittance.find({ 'remittance_orders.awb_number': { $in: awbList } })
        .select('remittance_orders.awb_number remittance_number state')
        .lean()
    ]);

    // Build lookup maps
    const orderByAwb = {};
    orders.forEach(o => { if (o.delhivery_data?.waybill) orderByAwb[o.delhivery_data.waybill] = o; });

    const remittedAwbSet = new Set();
    const awbToRemittanceMap = new Map();
    existingRemittances.forEach(r => {
      r.remittance_orders.forEach(o => {
        remittedAwbSet.add(o.awb_number);
        awbToRemittanceMap.set(o.awb_number, { number: r.remittance_number, state: r.state });
      });
    });

    // Validate each row
    const errors = [];
    const validRows = [];

    for (const row of normalised) {
      const awb = String(row.awb_number || row.awb || '').trim();
      const remittanceDateRaw = row.remittance_date || row.date;
      const rowNum = row._row;

      if (!awb) {
        errors.push({ row: rowNum, awb: '', error: 'AWB number is empty' });
        continue;
      }

      let remittanceDate;
      if (remittanceDateRaw instanceof Date) {
        remittanceDate = remittanceDateRaw;
      } else {
        remittanceDate = new Date(remittanceDateRaw);
      }
      if (isNaN(remittanceDate.getTime())) {
        errors.push({ row: rowNum, awb, error: 'Invalid remittance date' });
        continue;
      }

      const order = orderByAwb[awb];
      const validation = validateAWBForRemittance(order, remittedAwbSet, awbToRemittanceMap);

      if (!validation.valid) {
        errors.push({ row: rowNum, awb, error: validation.error });
        continue;
      }

      const fridayDate = getNextFriday(remittanceDate);
      validRows.push({
        awb,
        order,
        fridayDate,
        codAmount: order.payment_info.cod_amount,
        userId: order.user_id._id,
        clientId: order.user_id.client_id,
        companyName: order.user_id.company_name,
        bankDetails: order.user_id.bank_details,
        orderId: order.order_id,
        orderRef: order._id,
        deliveredDate: order.delivered_date
      });
    }

    // Group valid rows by (userId + fridayDate)
    const groups = {};
    for (const row of validRows) {
      const key = `${row.userId}_${row.fridayDate.toISOString().split('T')[0]}`;
      if (!groups[key]) {
        groups[key] = {
          userId: row.userId,
          clientId: row.clientId,
          companyName: row.companyName,
          bankDetails: row.bankDetails,
          fridayDate: row.fridayDate,
          orders: []
        };
      }
      groups[key].orders.push(row);
    }

    // Create remittance documents
    const createdRemittances = [];
    for (const group of Object.values(groups)) {
      const remittanceNumber = await generateRemittanceNumber(group.clientId, group.fridayDate);
      const totalAmount = group.orders.reduce((sum, o) => sum + o.codAmount, 0);

      const remittance = new Remittance({
        remittance_number: remittanceNumber,
        user_id: group.userId,
        date: new Date(),
        remittance_date: group.fridayDate,
        state: 'upcoming',
        total_remittance: totalAmount,
        account_details: {
          bank: group.bankDetails?.bank_name || '',
          beneficiary_name: group.bankDetails?.account_holder_name || '',
          account_number: group.bankDetails?.account_number || '',
          ifsc_code: group.bankDetails?.ifsc_code || ''
        },
        remittance_orders: group.orders.map(o => ({
          awb_number: o.awb,
          amount_collected: o.codAmount,
          order_id: o.orderId,
          order_reference: o.orderRef,
          delivered_date: o.deliveredDate
        })),
        uploaded_by: req.admin?.email || req.staff?.name || 'admin'
      });

      await remittance.save();
      createdRemittances.push({
        remittance_number: remittanceNumber,
        client: group.companyName,
        client_id: group.clientId,
        total_amount: totalAmount,
        orders_count: group.orders.length,
        remittance_date: group.fridayDate
      });
    }

    // Build error report as downloadable Excel if errors exist
    let errorReportBuffer = null;
    if (errors.length > 0) {
      const errorWb = XLSX.utils.book_new();
      const errorWs = XLSX.utils.json_to_sheet(errors.map(e => ({
        'Row': e.row,
        'AWB Number': e.awb,
        'Error': e.error
      })));
      XLSX.utils.book_append_sheet(errorWb, errorWs, 'Errors');
      errorReportBuffer = XLSX.write(errorWb, { type: 'base64', bookType: 'xlsx' });
    }

    res.json({
      success: true,
      data: {
        total_rows: normalised.length,
        valid: validRows.length,
        failed: errors.length,
        remittances_created: createdRemittances.length,
        remittances: createdRemittances,
        errors: errors,
        error_report_base64: errorReportBuffer
      }
    });
  } catch (error) {
    console.error('COD remittance upload error:', error);
    res.status(500).json({ success: false, message: 'Error processing COD remittance upload', error: error.message });
  }
});

// @desc    Get client-wise remittance summary
// @route   GET /api/admin/remittances/client-summary
// @access  Admin
router.get('/remittances/client-summary', async (req, res) => {
  try {
    const summary = await Remittance.aggregate([
      { $group: {
        _id: '$user_id',
        total_remittance_amount: { $sum: '$total_remittance' },
        total_remittances: { $sum: 1 },
        total_orders: { $sum: '$total_orders' },
        upcoming_count: { $sum: { $cond: [{ $eq: ['$state', 'upcoming'] }, 1, 0] } },
        upcoming_amount: { $sum: { $cond: [{ $eq: ['$state', 'upcoming'] }, '$total_remittance', 0] } },
        processing_count: { $sum: { $cond: [{ $eq: ['$state', 'processing'] }, 1, 0] } },
        processing_amount: { $sum: { $cond: [{ $eq: ['$state', 'processing'] }, '$total_remittance', 0] } },
        settled_count: { $sum: { $cond: [{ $eq: ['$state', 'settled'] }, 1, 0] } },
        settled_amount: { $sum: { $cond: [{ $eq: ['$state', 'settled'] }, '$total_remittance', 0] } }
      }},
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: {
        user_id: '$_id',
        client_name: '$user.company_name',
        client_id: '$user.client_id',
        email: '$user.email',
        total_remittance_amount: 1,
        total_remittances: 1,
        total_orders: 1,
        upcoming_count: 1, upcoming_amount: 1,
        processing_count: 1, processing_amount: 1,
        settled_count: 1, settled_amount: 1
      }},
      { $sort: { total_remittance_amount: -1 } }
    ]);

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Get remittance client summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching client summary', error: error.message });
  }
});

// @desc    Get single remittance detail
// @route   GET /api/admin/remittances/:id
// @access  Admin
router.get('/remittances/:id', async (req, res) => {
  try {
    const remittance = await Remittance.findById(req.params.id)
      .populate('user_id', 'company_name email client_id bank_details phone_number')
      .populate('remittance_orders.order_reference', 'order_id status delivered_date payment_info')
      .lean();

    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Remittance not found' });
    }

    res.json({ success: true, data: remittance });
  } catch (error) {
    console.error('Get remittance detail error:', error);
    res.status(500).json({ success: false, message: 'Error fetching remittance detail', error: error.message });
  }
});

// @desc    Add AWB to existing remittance
// @route   POST /api/admin/remittances/:id/add-awb
// @access  Admin only (not staff)
router.post('/remittances/:id/add-awb', adminOnly, async (req, res) => {
  try {
    const { awb_number } = req.body;
    if (!awb_number) {
      return res.status(400).json({ success: false, message: 'AWB number is required' });
    }

    const remittance = await Remittance.findById(req.params.id);
    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Remittance not found' });
    }

    if (remittance.state === 'settled') {
      return res.status(400).json({ success: false, message: 'Cannot modify a settled remittance' });
    }

    // Validate the AWB
    const order = await Order.findOne({ 'delhivery_data.waybill': awb_number });

    // Check if already in this remittance
    const alreadyInThis = remittance.remittance_orders.find(o => o.awb_number === awb_number);
    if (alreadyInThis) {
      return res.status(400).json({ success: false, message: 'AWB already in this remittance' });
    }

    // Check if in another remittance
    const existingRemittance = await Remittance.findOne({
      'remittance_orders.awb_number': awb_number,
      _id: { $ne: remittance._id }
    });

    const remittedAwbSet = existingRemittance ? new Set([awb_number]) : new Set();
    const awbToRemittanceMap = existingRemittance
      ? new Map([[awb_number, { number: existingRemittance.remittance_number }]])
      : new Map();

    const validation = validateAWBForRemittance(order, remittedAwbSet, awbToRemittanceMap);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    // Ensure AWB belongs to the same client
    if (String(order.user_id) !== String(remittance.user_id)) {
      return res.status(400).json({ success: false, message: 'AWB belongs to a different client' });
    }

    await remittance.addOrder(
      awb_number,
      order.payment_info.cod_amount,
      order.order_id,
      order._id,
      order.delivered_date
    );

    res.json({ success: true, message: 'AWB added successfully', data: remittance });
  } catch (error) {
    console.error('Add AWB to remittance error:', error);
    res.status(500).json({ success: false, message: 'Error adding AWB', error: error.message });
  }
});

// @desc    Remove AWB from remittance
// @route   DELETE /api/admin/remittances/:id/remove-awb
// @access  Admin only (not staff)
router.delete('/remittances/:id/remove-awb', adminOnly, async (req, res) => {
  try {
    const { awb_number } = req.body;
    if (!awb_number) {
      return res.status(400).json({ success: false, message: 'AWB number is required' });
    }

    const remittance = await Remittance.findById(req.params.id);
    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Remittance not found' });
    }

    if (remittance.state === 'settled') {
      return res.status(400).json({ success: false, message: 'Cannot modify a settled remittance' });
    }

    const existingOrder = remittance.remittance_orders.find(o => o.awb_number === awb_number);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'AWB not found in this remittance' });
    }

    await remittance.removeOrder(awb_number);

    // If remittance is now empty, delete it
    if (remittance.remittance_orders.length === 0) {
      await Remittance.findByIdAndDelete(remittance._id);
      return res.json({ success: true, message: 'AWB removed. Remittance deleted (no remaining AWBs)', deleted: true });
    }

    res.json({ success: true, message: 'AWB removed successfully', data: remittance });
  } catch (error) {
    console.error('Remove AWB from remittance error:', error);
    res.status(500).json({ success: false, message: 'Error removing AWB', error: error.message });
  }
});

// @desc    Move remittance to processing
// @route   PATCH /api/admin/remittances/:id/process
// @access  Admin
router.patch('/remittances/:id/process', async (req, res) => {
  try {
    const remittance = await Remittance.findById(req.params.id);
    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Remittance not found' });
    }

    if (remittance.state !== 'upcoming') {
      return res.status(400).json({ success: false, message: `Cannot process a remittance with state "${remittance.state}". Must be "upcoming".` });
    }

    await remittance.markAsProcessing();
    res.json({ success: true, message: 'Remittance moved to processing', data: remittance });
  } catch (error) {
    console.error('Process remittance error:', error);
    res.status(500).json({ success: false, message: 'Error processing remittance', error: error.message });
  }
});

// @desc    Settle remittance with UTR/bank transaction ID
// @route   PATCH /api/admin/remittances/:id/settle
// @access  Admin
router.patch('/remittances/:id/settle', async (req, res) => {
  try {
    const { bank_transaction_id } = req.body;
    if (!bank_transaction_id) {
      return res.status(400).json({ success: false, message: 'Bank Transaction ID / UTR number is required' });
    }

    const remittance = await Remittance.findById(req.params.id);
    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Remittance not found' });
    }

    if (remittance.state !== 'processing') {
      return res.status(400).json({ success: false, message: `Cannot settle a remittance with state "${remittance.state}". Must be "processing".` });
    }

    const settledBy = req.admin?.email || req.staff?.name || 'admin';
    await remittance.markAsSettled(bank_transaction_id, settledBy);

    // Bulk update all orders in this remittance
    const awbNumbers = remittance.remittance_orders.map(o => o.awb_number);
    await Order.updateMany(
      { 'delhivery_data.waybill': { $in: awbNumbers } },
      {
        $set: {
          'payment_info.cod_remitted': true,
          'payment_info.cod_remittance_date': new Date(),
          'payment_info.cod_utr_number': bank_transaction_id,
        }
      }
    );

    // Also set cod_remitted_amount per order
    for (const remOrder of remittance.remittance_orders) {
      await Order.updateOne(
        { 'delhivery_data.waybill': remOrder.awb_number },
        { $set: { 'payment_info.cod_remitted_amount': remOrder.amount_collected } }
      );
    }

    res.json({ success: true, message: 'Remittance settled successfully', data: remittance });
  } catch (error) {
    console.error('Settle remittance error:', error);
    res.status(500).json({ success: false, message: 'Error settling remittance', error: error.message });
  }
});

// @desc    Dashboard analytics (COD/Prepaid, Weight, Zone, Courier)
// @route   GET /api/admin/dashboard/analytics
// @access  Admin
router.get('/dashboard/analytics', async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const dateFilter = {};
    if (date_from) dateFilter.createdAt = { $gte: new Date(date_from) };
    if (date_to) dateFilter.createdAt = { ...dateFilter.createdAt, $lte: new Date(date_to) };

    const [codVsPrepaid, weightDist, zoneDist, courierDist] = await Promise.all([
      // COD vs Prepaid
      Order.aggregate([
        { $match: { ...dateFilter, 'payment_info.payment_mode': { $in: ['COD', 'Prepaid'] } } },
        { $group: { _id: '$payment_info.payment_mode', count: { $sum: 1 } } }
      ]),

      // Weight distribution
      Order.aggregate([
        { $match: { ...dateFilter, 'billing_info.charged_weight': { $exists: true, $gt: 0 } } },
        { $bucket: {
          groupBy: '$billing_info.charged_weight',
          boundaries: [0, 500, 1000, 2000, 5000, 10000, Infinity],
          default: 'other',
          output: { count: { $sum: 1 } }
        }}
      ]),

      // Zone distribution
      Order.aggregate([
        { $match: { ...dateFilter, 'billing_info.zone': { $exists: true } } },
        { $group: { _id: '$billing_info.zone', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),

      // Courier distribution
      Order.aggregate([
        { $match: dateFilter },
        { $lookup: { from: 'carriers', localField: 'carrier_id', foreignField: '_id', as: 'carrier' } },
        { $unwind: { path: '$carrier', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: { $ifNull: ['$carrier.display_name', 'Unknown'] },
          count: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          rto: { $sum: { $cond: [{ $in: ['$status', ['rto', 'rto_in_transit', 'rto_delivered']] }, 1, 0] } }
        }},
        { $sort: { count: -1 } }
      ])
    ]);

    // Format COD vs Prepaid
    const codCount = codVsPrepaid.find(r => r._id === 'COD')?.count || 0;
    const prepaidCount = codVsPrepaid.find(r => r._id === 'Prepaid')?.count || 0;
    const total = codCount + prepaidCount;

    // Format weight distribution
    const weightBucketLabels = {
      0: '0-0.5kg', 500: '0.5-1kg', 1000: '1-2kg', 2000: '2-5kg', 5000: '5-10kg', 10000: '10kg+'
    };
    const weightDistribution = weightDist.map(b => ({
      bucket: weightBucketLabels[b._id] || `${b._id}g+`,
      count: b.count
    }));

    res.json({
      success: true,
      data: {
        cod_vs_prepaid: {
          cod_count: codCount,
          prepaid_count: prepaidCount,
          cod_percentage: total > 0 ? Math.round((codCount / total) * 1000) / 10 : 0,
          prepaid_percentage: total > 0 ? Math.round((prepaidCount / total) * 1000) / 10 : 0
        },
        weight_distribution: weightDistribution,
        zone_distribution: zoneDist.map(z => ({ zone: z._id, count: z.count })),
        courier_distribution: courierDist.map(c => ({
          carrier_name: c._id,
          count: c.count,
          delivered: c.delivered,
          rto: c.rto
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ success: false, message: 'Error fetching analytics', error: error.message });
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
      closing_balance: txn.balance_info?.closing_balance || 0,
      // Include who performed the transaction (for manual adjustments)
      performed_by: txn.performed_by || null,
      created_by: txn.created_by || 'system',
      transaction_category: txn.transaction_category || ''
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

// @desc    Generate monthly billing for all clients
// @route   POST /api/admin/billing/generate-monthly
// @access  Admin
router.post('/billing/generate-monthly', async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    // Get the start and end dates for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Check if staff has permission (if not admin)
    if (req.staff && !req.staff.permissions?.can_generate_monthly_billing) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to generate monthly billing'
      });
    }

    // Get all active clients
    const clients = await User.find({ account_status: 'active' }).select('_id client_id company_name');

    let processed = 0;
    let totalAmount = 0;

    // For each client, calculate billing for the month
    for (const client of clients) {
      try {
        // Get all completed orders for this client in the specified month
        const orders = await Order.find({
          user_id: client._id,
          status: 'delivered',
          delivered_date: { $gte: startDate, $lte: endDate }
        });

        if (orders.length === 0) continue;

        // Calculate total shipping charges for the month
        let monthlyTotal = 0;
        for (const order of orders) {
          const shippingCharges = order.payment_info?.shipping_charges || 0;
          monthlyTotal += shippingCharges;
        }

        if (monthlyTotal > 0) {
          processed++;
          totalAmount += monthlyTotal;
        }
      } catch (clientError) {
        logger.error('Error processing client billing', {
          clientId: client._id,
          error: clientError.message
        });
      }
    }

    const performerInfo = req.staff
      ? { name: req.staff.name, email: req.staff.email, role: 'staff' }
      : { name: req.admin?.email || 'Admin', email: req.admin?.email || '', role: 'admin' };

    logger.info('Monthly billing generated', {
      month,
      year,
      processed,
      totalAmount,
      performedBy: performerInfo
    });

    res.json({
      success: true,
      message: `Monthly billing generated for ${getMonthName(month)} ${year}`,
      data: {
        processed,
        totalAmount
      }
    });
  } catch (error) {
    logger.error('Generate monthly billing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating monthly billing',
      error: error.message
    });
  }
});

function getMonthName(monthNum) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthNum - 1] || '';
}

// @desc    Generate bills for multiple clients
// @route   POST /api/admin/billing/generate-bulk
// @access  Admin
router.post('/billing/generate-bulk', adminAuth, async (req, res) => {
  try {
    const { client_ids, billing_period } = req.body;

    if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'client_ids array is required'
      });
    }

    if (!billing_period || !billing_period.start_date || !billing_period.end_date) {
      return res.status(400).json({
        success: false,
        message: 'billing_period with start_date and end_date is required'
      });
    }

    const results = {
      generated: 0,
      failed: 0,
      errors: []
    };

    // Process each client
    for (const clientId of client_ids) {
      try {
        const client = await User.findById(clientId).select('_id client_id company_name email wallet_balance user_category gst_number billing_address');

        if (!client) {
          results.failed++;
          results.errors.push({
            client_id: clientId,
            error: 'Client not found'
          });
          continue;
        }

        // Get orders for billing period
        const orders = await Order.find({
          user_id: client._id,
          status: { $in: ['delivered', 'rto', 'rto_in_transit', 'rto_delivered'] },
          delivered_date: {
            $gte: new Date(billing_period.start_date),
            $lte: new Date(billing_period.end_date)
          }
        }).select('order_id awb_number status delivered_date weight zone payment_info pickup_address delivery_address package_info');

        if (orders.length === 0) {
          results.failed++;
          results.errors.push({
            client_id: client.client_id,
            error: 'No billable orders in period'
          });
          continue;
        }

        // Create new invoice
        const invoice = new Invoice({
          user_id: client._id,
          billing_period: {
            start_date: new Date(billing_period.start_date),
            end_date: new Date(billing_period.end_date),
            cycle_number: billing_period.cycle_number || 1,
            month: billing_period.month || new Date(billing_period.start_date).getMonth() + 1,
            year: billing_period.year || new Date(billing_period.start_date).getFullYear()
          },
          invoice_date: new Date(),
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          gst_info: {
            seller_gstin: '06AAPCS9575E1ZR',
            buyer_gstin: client.gst_number || '',
            is_igst: true
          },
          billing_address: {
            company_name: client.company_name,
            address: client.billing_address?.address || '',
            city: client.billing_address?.city || '',
            state: client.billing_address?.state || '',
            pincode: client.billing_address?.pincode || ''
          },
          user_category_snapshot: client.user_category
        });

        // Add each order as a shipment charge
        for (const order of orders) {
          const shipmentData = {
            awb_number: order.awb_number,
            order_id: order._id,
            internal_order_id: order.order_id,
            order_date: order.created_at,
            delivery_date: order.delivered_date,
            shipment_status: order.status,
            weight: {
              declared_weight: order.weight?.declared_weight || 0,
              actual_weight: order.weight?.actual_weight || 0,
              volumetric_weight: order.weight?.volumetric_weight || 0,
              charged_weight: order.weight?.charged_weight || order.weight?.actual_weight || 0
            },
            zone: order.zone,
            pickup_pincode: order.pickup_address?.pincode || '',
            delivery_pincode: order.delivery_address?.pincode || '',
            charges: {
              forward_charge: order.payment_info?.forward_charge || 0,
              rto_charge: order.payment_info?.rto_charge || 0,
              cod_charge: order.payment_info?.cod_charge || 0,
              fuel_surcharge: order.payment_info?.fuel_surcharge || 0,
              weight_discrepancy_charge: order.payment_info?.weight_discrepancy_charge || 0,
              other_charges: order.payment_info?.other_charges || 0
            },
            total_charge: order.payment_info?.shipping_charges || 0,
            payment_mode: order.package_info?.payment_mode || 'Prepaid',
            cod_amount: order.package_info?.cod_amount || 0
          };

          invoice.addShipment(shipmentData);
        }

        // Finalize and save invoice
        await invoice.finalize();

        // Generate Excel shipment list
        try {
          const excelUrl = await excelService.generateInvoiceShipmentExcel(invoice);
          invoice.documents.excel_shipment_list_url = excelUrl;
          await invoice.save();
        } catch (excelError) {
          logger.error('Error generating Excel for invoice:', {
            invoice_id: invoice._id,
            error: excelError.message
          });
        }

        // Create notification
        const notification = new Notification({
          recipient_id: client._id,
          recipient_type: 'client',
          sender_type: 'system',
          sender_name: 'System',
          notification_type: 'billing_generated',
          heading: 'New Invoice Generated',
          message: `Invoice ${invoice.invoice_number} has been generated for Rs ${invoice.amounts.grand_total.toFixed(2)}`,
          related_entity: {
            entity_type: 'invoice',
            entity_id: invoice._id
          }
        });
        await notification.save();

        // Send WebSocket notification
        try {
          websocketService.sendToUser(client._id.toString(), {
            type: 'notification',
            notification: {
              _id: notification._id,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              created_at: notification.created_at
            }
          });
        } catch (wsError) {
          logger.error('Error sending WebSocket notification:', wsError);
        }

        results.generated++;
        logger.info('Invoice generated for client', {
          client_id: client.client_id,
          invoice_number: invoice.invoice_number,
          amount: invoice.amounts.grand_total
        });
      } catch (clientError) {
        results.failed++;
        results.errors.push({
          client_id: clientId,
          error: clientError.message
        });
        logger.error('Error generating invoice for client:', {
          client_id: clientId,
          error: clientError.message
        });
      }
    }

    res.json({
      success: true,
      message: `Generated ${results.generated} invoices, ${results.failed} failed`,
      data: results
    });
  } catch (error) {
    logger.error('Bulk invoice generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating bulk invoices',
      error: error.message
    });
  }
});

// @desc    Upload manual invoice PDF
// @route   PATCH /api/admin/billing/invoices/:id/manual-upload
// @access  Admin
const upload = multer({ storage: multer.memoryStorage() });
router.patch('/billing/invoices/:id/manual-upload', adminAuth, upload.single('invoice_pdf'), async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment_notes } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file uploaded'
      });
    }

    // Validate file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        message: 'Only PDF files are allowed'
      });
    }

    // Validate file size (10MB max)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Upload PDF to Cloudinary
    const uploadResult = await cloudinaryService.uploadDocument(req.file.buffer, {
      folder: 'shipsarthi/invoices/manual',
      mimetype: req.file.mimetype
    });

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload PDF'
      });
    }

    // Get staff info
    const staffName = req.staff?.name || req.admin?.email || 'Admin';

    // Update invoice
    invoice.documents.manual_invoice_url = uploadResult.url;
    invoice.documents.manual_invoice_uploaded_by = staffName;
    invoice.documents.manual_invoice_uploaded_at = new Date();
    invoice.manual_adjustments = {
      is_manually_adjusted: true,
      adjusted_by_staff: staffName,
      adjusted_at: new Date(),
      adjustment_notes: adjustment_notes || 'Manual invoice uploaded'
    };

    await invoice.save();

    // Create notification
    const notification = new Notification({
      recipient_id: invoice.user_id,
      recipient_type: 'client',
      sender_type: 'admin',
      sender_name: staffName,
      notification_type: 'billing_generated',
      heading: 'Invoice Updated',
      message: `Manual invoice has been uploaded for ${invoice.invoice_number}`,
      related_entity: {
        entity_type: 'invoice',
        entity_id: invoice._id
      }
    });
    await notification.save();

    // Send WebSocket notification
    try {
      websocketService.sendToUser(invoice.user_id.toString(), {
        type: 'notification',
        notification: {
          _id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          created_at: notification.created_at
        }
      });
    } catch (wsError) {
      logger.error('Error sending WebSocket notification:', wsError);
    }

    logger.info('Manual invoice uploaded', {
      invoice_id: invoice._id,
      invoice_number: invoice.invoice_number,
      uploaded_by: staffName
    });

    res.json({
      success: true,
      message: 'Manual invoice uploaded successfully',
      data: {
        invoice_id: invoice._id,
        manual_invoice_url: invoice.documents.manual_invoice_url
      }
    });
  } catch (error) {
    logger.error('Manual invoice upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading manual invoice',
      error: error.message
    });
  }
});

// @desc    Get/generate Excel shipment list for invoice
// @route   GET /api/admin/billing/invoices/:id/excel
// @access  Admin
router.get('/billing/invoices/:id/excel', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // If Excel already exists, return URL
    if (invoice.documents.excel_shipment_list_url) {
      return res.json({
        success: true,
        data: {
          excel_url: invoice.documents.excel_shipment_list_url
        }
      });
    }

    // Generate Excel
    const excelUrl = await excelService.generateInvoiceShipmentExcel(invoice);

    // Update invoice
    invoice.documents.excel_shipment_list_url = excelUrl;
    await invoice.save();

    logger.info('Excel shipment list generated', {
      invoice_id: invoice._id,
      invoice_number: invoice.invoice_number
    });

    res.json({
      success: true,
      message: 'Excel generated successfully',
      data: {
        excel_url: excelUrl
      }
    });
  } catch (error) {
    logger.error('Excel generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating Excel',
      error: error.message
    });
  }
});

// @desc    Get all invoices with filters
// @route   GET /api/admin/billing/invoices
// @access  Admin
router.get('/billing/invoices', adminAuth, async (req, res) => {
  try {
    const {
      client_id,
      date_from,
      date_to,
      status,
      page = 1,
      limit = 25
    } = req.query;

    const query = {};

    // Filter by client
    if (client_id) {
      const client = await User.findOne({ client_id }).select('_id');
      if (client) {
        query.user_id = client._id;
      }
    }

    // Filter by date range
    if (date_from || date_to) {
      query.invoice_date = {};
      if (date_from) {
        query.invoice_date.$gte = new Date(date_from);
      }
      if (date_to) {
        query.invoice_date.$lte = new Date(date_to);
      }
    }

    // Filter by status
    if (status) {
      query.payment_status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get invoices with client info
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .select('-shipment_charges') // Exclude heavy array
        .populate('user_id', 'client_id company_name email')
        .sort({ invoice_date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Invoice.countDocuments(query)
    ]);

    // Calculate summary
    const summaryData = await Invoice.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total_amount: { $sum: '$amounts.grand_total' },
          paid_amount: { $sum: '$amount_paid' },
          pending_amount: { $sum: '$balance_due' }
        }
      }
    ]);

    const summary = summaryData[0] || {
      total_amount: 0,
      paid_amount: 0,
      pending_amount: 0
    };

    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / parseInt(limit)),
          total_count: total,
          per_page: parseInt(limit)
        },
        summary
      }
    });
  } catch (error) {
    logger.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
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
            rto_in_transit: statusMap['rto_in_transit'] || 0,
            rto_delivered: statusMap['rto_delivered'] || 0,
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
            status: { $in: ['rto', 'rto_in_transit', 'rto_delivered'] }
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
          filterQuery.status = { $in: ['rto', 'rto_in_transit', 'rto_delivered'] };
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
        status: { $in: ['rto', 'rto_in_transit', 'rto_delivered'] }
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
    const { name, email, password, is_active, permissions } = req.body;

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

    // Update permissions if provided
    if (permissions && typeof permissions === 'object') {
      // Initialize permissions object if not exists
      if (!staff.permissions) {
        staff.permissions = {};
      }

      // Update each permission
      const validPermissions = [
        'dashboard', 'clients', 'orders', 'tickets', 'billing',
        'remittances', 'ndr', 'weight_discrepancies', 'wallet_recharge',
        'rate_cards', 'carriers', 'staff_management',
        'can_recharge_wallet', 'can_change_client_category', 'can_generate_monthly_billing'
      ];

      validPermissions.forEach(key => {
        if (typeof permissions[key] === 'boolean') {
          staff.permissions[key] = permissions[key];
        }
      });

      // Mark permissions as modified for mongoose to detect changes
      staff.markModified('permissions');
    }

    await staff.save();

    const staffData = staff.toObject();
    delete staffData.password;

    logger.info('Staff account updated', {
      staffId: id,
      updatedBy: req.admin.email,
      permissionsUpdated: !!permissions
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

// ==================== CARRIER MANAGEMENT ROUTES ====================

// @desc    Get all carriers (with filter/sort options)
// @route   GET /api/admin/carriers
// @access  Admin only
router.get('/carriers', adminOnly, async (req, res) => {
  try {
    const { sort, filter, active_only } = req.query;

    // Build query
    let query = {};
    if (active_only === 'true') {
      query.is_active = true;
    }
    if (filter) {
      query.$or = [
        { carrier_code: { $regex: filter, $options: 'i' } },
        { display_name: { $regex: filter, $options: 'i' } },
        { carrier_group: { $regex: filter, $options: 'i' } }
      ];
    }

    // Build sort
    let sortOption = { priority_order: 1, display_name: 1 };
    if (sort === 'a-z') {
      sortOption = { display_name: 1 };
    } else if (sort === 'z-a') {
      sortOption = { display_name: -1 };
    } else if (sort === 'newest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'oldest') {
      sortOption = { createdAt: 1 };
    }

    const carriers = await Carrier.find(query).sort(sortOption).lean();

    // Get rate card counts for each carrier
    const carrierIds = carriers.map(c => c._id);
    const rateCounts = await RateCard.aggregate([
      { $match: { carrier_id: { $in: carrierIds }, is_current: true } },
      { $group: { _id: '$carrier_id', count: { $sum: 1 } } }
    ]);

    const rateCountMap = {};
    rateCounts.forEach(rc => {
      rateCountMap[rc._id.toString()] = rc.count;
    });

    const carriersWithCounts = carriers.map(c => ({
      ...c,
      rate_card_count: rateCountMap[c._id.toString()] || 0
    }));

    res.json({
      success: true,
      data: carriersWithCounts,
      total: carriersWithCounts.length
    });
  } catch (error) {
    logger.error('Error fetching carriers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching carriers',
      error: error.message
    });
  }
});

// @desc    Get single carrier by ID
// @route   GET /api/admin/carriers/:id
// @access  Admin only
router.get('/carriers/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id).lean();

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    // Get current rate cards for this carrier
    const rateCards = await RateCard.find({
      carrier_id: id,
      is_current: true
    }).lean();

    res.json({
      success: true,
      data: {
        ...carrier,
        rate_cards: rateCards
      }
    });
  } catch (error) {
    logger.error('Error fetching carrier:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching carrier',
      error: error.message
    });
  }
});

// @desc    Create new carrier
// @route   POST /api/admin/carriers
// @access  Admin only
router.post('/carriers', adminOnly, async (req, res) => {
  try {
    const {
      carrier_code,
      display_name,
      carrier_group,
      service_type,
      zone_type,
      weight_slab_type,
      description,
      priority_order,
      api_config
    } = req.body;

    // Validation
    if (!carrier_code || !display_name || !carrier_group || !service_type) {
      return res.status(400).json({
        success: false,
        message: 'Carrier code, display name, carrier group, and service type are required'
      });
    }

    // Check if carrier code already exists
    const existingCarrier = await Carrier.findByCode(carrier_code);
    if (existingCarrier) {
      return res.status(400).json({
        success: false,
        message: 'Carrier with this code already exists'
      });
    }

    const carrier = new Carrier({
      carrier_code: carrier_code.toUpperCase().trim(),
      display_name: display_name.trim(),
      carrier_group: carrier_group.toUpperCase().trim(),
      service_type,
      zone_type: zone_type || 'standard',
      weight_slab_type: weight_slab_type || 'option1',
      description: description || '',
      priority_order: priority_order || 0,
      api_config: api_config || {},
      is_active: true,
      created_by: req.admin.email
    });

    await carrier.save();

    logger.info('Carrier created', {
      carrierCode: carrier.carrier_code,
      createdBy: req.admin.email
    });

    res.status(201).json({
      success: true,
      message: 'Carrier created successfully',
      data: carrier
    });
  } catch (error) {
    logger.error('Error creating carrier:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating carrier',
      error: error.message
    });
  }
});

// @desc    Update carrier
// @route   PATCH /api/admin/carriers/:id
// @access  Admin only
router.patch('/carriers/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'display_name', 'description', 'priority_order',
      'zone_type', 'weight_slab_type', 'api_config', 'logo_url'
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        carrier[field] = updates[field];
      }
    });

    carrier.updated_by = req.admin.email;
    await carrier.save();

    logger.info('Carrier updated', {
      carrierCode: carrier.carrier_code,
      updatedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Carrier updated successfully',
      data: carrier
    });
  } catch (error) {
    logger.error('Error updating carrier:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating carrier',
      error: error.message
    });
  }
});

// @desc    Delete carrier (soft delete)
// @route   DELETE /api/admin/carriers/:id
// @access  Admin only
router.delete('/carriers/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    // Soft delete by setting is_active to false
    carrier.is_active = false;
    carrier.updated_by = req.admin.email;
    await carrier.save();

    logger.info('Carrier deleted (deactivated)', {
      carrierCode: carrier.carrier_code,
      deletedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Carrier deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting carrier:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting carrier',
      error: error.message
    });
  }
});

// @desc    Activate carrier
// @route   POST /api/admin/carriers/:id/activate
// @access  Admin only
router.post('/carriers/:id/activate', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    carrier.is_active = true;
    carrier.updated_by = req.admin.email;
    await carrier.save();

    logger.info('Carrier activated', {
      carrierCode: carrier.carrier_code,
      activatedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Carrier activated successfully',
      data: carrier
    });
  } catch (error) {
    logger.error('Error activating carrier:', error);
    res.status(500).json({
      success: false,
      message: 'Error activating carrier',
      error: error.message
    });
  }
});

// @desc    Deactivate carrier
// @route   POST /api/admin/carriers/:id/deactivate
// @access  Admin only
router.post('/carriers/:id/deactivate', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    carrier.is_active = false;
    carrier.updated_by = req.admin.email;
    await carrier.save();

    logger.info('Carrier deactivated', {
      carrierCode: carrier.carrier_code,
      deactivatedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Carrier deactivated successfully',
      data: carrier
    });
  } catch (error) {
    logger.error('Error deactivating carrier:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating carrier',
      error: error.message
    });
  }
});

// @desc    Get current rates for a carrier (all categories)
// @route   GET /api/admin/carriers/:id/rates
// @access  Admin only
router.get('/carriers/:id/rates', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id).lean();

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    const rateCards = await RateCard.findCurrentByCarrier(id);

    // Group by user category
    const ratesByCategory = {};
    const categories = ['New User', 'Lite User', 'Basic User', 'Advanced'];

    categories.forEach(cat => {
      const rate = rateCards.find(r => r.userCategory === cat);
      ratesByCategory[cat] = rate || null;
    });

    res.json({
      success: true,
      data: {
        carrier,
        rates: ratesByCategory,
        categories
      }
    });
  } catch (error) {
    logger.error('Error fetching carrier rates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching carrier rates',
      error: error.message
    });
  }
});

// @desc    Get rate history for a carrier and category
// @route   GET /api/admin/carriers/:id/rates/history
// @access  Admin only
router.get('/carriers/:id/rates/history', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id).lean();

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    let query = { carrier_id: id };
    if (category) {
      // Normalize category
      let normalizedCategory = category;
      if (category.toLowerCase().includes('advanced')) {
        normalizedCategory = 'Advanced';
      } else if (category.toLowerCase().includes('new')) {
        normalizedCategory = 'New User';
      } else if (category.toLowerCase().includes('lite')) {
        normalizedCategory = 'Lite User';
      } else if (category.toLowerCase().includes('basic')) {
        normalizedCategory = 'Basic User';
      }
      query.userCategory = normalizedCategory;
    }

    const rateHistory = await RateCard.find(query)
      .sort({ userCategory: 1, version: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        carrier,
        history: rateHistory
      }
    });
  } catch (error) {
    logger.error('Error fetching rate history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching rate history',
      error: error.message
    });
  }
});

// @desc    Create or update rate card for a carrier category
// @route   POST /api/admin/carriers/:id/rates/:category
// @access  Admin only
router.post('/carriers/:id/rates/:category', adminOnly, async (req, res) => {
  try {
    const { id, category } = req.params;
    const rateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    // Normalize category
    let normalizedCategory = category;
    if (category.toLowerCase().includes('advanced')) {
      normalizedCategory = 'Advanced';
    } else if (category.toLowerCase().includes('new')) {
      normalizedCategory = 'New User';
    } else if (category.toLowerCase().includes('lite')) {
      normalizedCategory = 'Lite User';
    } else if (category.toLowerCase().includes('basic')) {
      normalizedCategory = 'Basic User';
    }

    // Validate rate data
    if (!rateData.forwardCharges || !Array.isArray(rateData.forwardCharges) || rateData.forwardCharges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Forward charges are required and must be a non-empty array'
      });
    }

    if (!rateData.rtoCharges || !Array.isArray(rateData.rtoCharges) || rateData.rtoCharges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'RTO charges are required and must be a non-empty array'
      });
    }

    // Check if current rate exists
    const existingRate = await RateCard.findOne({
      carrier_id: id,
      userCategory: normalizedCategory,
      is_current: true
    });

    let newRateCard;

    if (existingRate) {
      // Archive existing and create new version
      newRateCard = await existingRate.createNewVersion({
        forwardCharges: rateData.forwardCharges,
        rtoCharges: rateData.rtoCharges,
        codCharges: rateData.codCharges || existingRate.codCharges,
        zoneDefinitions: rateData.zoneDefinitions || existingRate.zoneDefinitions,
        termsAndConditions: rateData.termsAndConditions || existingRate.termsAndConditions
      });
    } else {
      // Create new rate card
      newRateCard = new RateCard({
        userCategory: normalizedCategory,
        carrier: carrier.carrier_code,
        carrier_id: carrier._id,
        forwardCharges: rateData.forwardCharges,
        rtoCharges: rateData.rtoCharges,
        codCharges: rateData.codCharges || {
          percentage: 2,
          minimumAmount: 30,
          gstAdditional: true
        },
        zoneDefinitions: rateData.zoneDefinitions || [
          { zone: 'A', definition: 'Local - Within city' },
          { zone: 'B', definition: 'Regional - Up to 500 km' },
          { zone: 'C', definition: 'Metro to Metro - 501-2500 km (metro areas only)' },
          { zone: 'D', definition: 'Rest of India - 501-2500 km' },
          { zone: 'E', definition: 'Special - NE, J&K, or >2500 km' },
          { zone: 'F', definition: 'Extended - Remote areas' }
        ],
        termsAndConditions: rateData.termsAndConditions || [
          'Rates are exclusive of GST',
          'Volumetric weight calculation: L x B x H / 5000'
        ],
        version: 1,
        effective_from: new Date(),
        effective_to: null,
        is_current: true
      });

      await newRateCard.save();
    }

    // Clear rate card cache
    RateCardService.clearCache(normalizedCategory);

    logger.info('Rate card created/updated for carrier', {
      carrierId: id,
      carrierCode: carrier.carrier_code,
      category: normalizedCategory,
      version: newRateCard.version,
      updatedBy: req.admin.email
    });

    res.status(201).json({
      success: true,
      message: 'Rate card saved successfully',
      data: newRateCard
    });
  } catch (error) {
    logger.error('Error saving carrier rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving carrier rate',
      error: error.message
    });
  }
});

// @desc    Update existing rate card for a carrier category
// @route   PATCH /api/admin/carriers/:id/rates/:category
// @access  Admin only
router.patch('/carriers/:id/rates/:category', adminOnly, async (req, res) => {
  try {
    const { id, category } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid carrier ID'
      });
    }

    const carrier = await Carrier.findById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: 'Carrier not found'
      });
    }

    // Normalize category
    let normalizedCategory = category;
    if (category.toLowerCase().includes('advanced')) {
      normalizedCategory = 'Advanced';
    } else if (category.toLowerCase().includes('new')) {
      normalizedCategory = 'New User';
    } else if (category.toLowerCase().includes('lite')) {
      normalizedCategory = 'Lite User';
    } else if (category.toLowerCase().includes('basic')) {
      normalizedCategory = 'Basic User';
    }

    const rateCard = await RateCard.findOne({
      carrier_id: id,
      userCategory: normalizedCategory,
      is_current: true
    });

    if (!rateCard) {
      return res.status(404).json({
        success: false,
        message: 'Rate card not found for this carrier and category'
      });
    }

    // Update fields
    if (updates.forwardCharges) {
      rateCard.forwardCharges = updates.forwardCharges;
    }
    if (updates.rtoCharges) {
      rateCard.rtoCharges = updates.rtoCharges;
    }
    if (updates.codCharges) {
      if (updates.codCharges.percentage !== undefined) {
        rateCard.codCharges.percentage = updates.codCharges.percentage;
      }
      if (updates.codCharges.minimumAmount !== undefined) {
        rateCard.codCharges.minimumAmount = updates.codCharges.minimumAmount;
      }
      if (updates.codCharges.gstAdditional !== undefined) {
        rateCard.codCharges.gstAdditional = updates.codCharges.gstAdditional;
      }
    }
    if (updates.zoneDefinitions) {
      rateCard.zoneDefinitions = updates.zoneDefinitions;
    }
    if (updates.termsAndConditions) {
      rateCard.termsAndConditions = updates.termsAndConditions;
    }

    await rateCard.save();

    // Clear cache
    RateCardService.clearCache(normalizedCategory);

    logger.info('Rate card updated for carrier', {
      carrierId: id,
      carrierCode: carrier.carrier_code,
      category: normalizedCategory,
      updatedBy: req.admin.email
    });

    res.json({
      success: true,
      message: 'Rate card updated successfully',
      data: rateCard
    });
  } catch (error) {
    logger.error('Error updating carrier rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating carrier rate',
      error: error.message
    });
  }
});

// ========================================
// NOTIFICATION ROUTES
// ========================================

/**
 * POST /api/admin/notifications/bulk
 * Send bulk notification to multiple clients
 */
router.post('/notifications/bulk', adminAuth, async (req, res) => {
  try {
    const { heading, message, recipients } = req.body;

    // Validation
    if (!heading || !message) {
      return res.status(400).json({
        success: false,
        message: 'Heading and message are required'
      });
    }

    if (!recipients || (!recipients.client_ids && !recipients.excel_file)) {
      return res.status(400).json({
        success: false,
        message: 'Recipients are required (either client_ids or excel_file)'
      });
    }

    let clientIds = [];
    let invalidIds = [];

    // Handle manual selection
    if (recipients.selection_type === 'manual' && recipients.client_ids) {
      clientIds = recipients.client_ids;
    }
    // Handle Excel upload
    else if (recipients.selection_type === 'excel' && req.files && req.files.excel_file) {
      try {
        const excelFile = req.files.excel_file;
        const workbook = XLSX.read(excelFile.data, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        // Extract client IDs from Excel (expecting columns: Client ID, Name, Mobile)
        for (const row of data) {
          const clientId = row['Client ID'] || row['client_id'] || row['ClientID'];
          const name = row['Name'] || row['name'];
          const mobile = row['Mobile'] || row['mobile'] || row['phone'];

          if (clientId) {
            clientIds.push(clientId);
          } else if (name || mobile) {
            // Try to find client by name or mobile
            const query = {};
            if (name) query.company_name = new RegExp(name, 'i');
            if (mobile) query.phone_number = mobile;

            const user = await User.findOne(query).select('_id');
            if (user) {
              clientIds.push(user._id);
            }
          }
        }
      } catch (excelError) {
        logger.error('Error parsing Excel file:', excelError);
        return res.status(400).json({
          success: false,
          message: 'Error parsing Excel file',
          error: excelError.message
        });
      }
    }

    if (clientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid client IDs found'
      });
    }

    // Validate client IDs exist
    const validUserIds = [];
    for (const clientId of clientIds) {
      let user;
      // Check if it's a MongoDB ObjectId or client_id string
      if (mongoose.Types.ObjectId.isValid(clientId) && String(clientId).length === 24) {
        user = await User.findById(clientId).select('_id');
      } else {
        user = await User.findOne({ client_id: clientId }).select('_id');
      }

      if (user) {
        validUserIds.push(user._id);
      } else {
        invalidIds.push(clientId);
      }
    }

    if (validUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid clients found',
        invalid_ids: invalidIds
      });
    }

    // Create sender info
    const senderInfo = {
      sender_type: req.staff ? 'staff' : 'admin',
      sender_id: req.staff ? req.staff._id : null,
      sender_name: req.staff ? req.staff.name : (req.admin ? req.admin.email : 'Admin')
    };

    // Create bulk notifications
    const notifications = await Notification.createBulkNotifications(
      validUserIds,
      {
        notification_type: 'bulk_announcement',
        heading,
        message,
        related_entity: { entity_type: 'none', entity_id: null }
      },
      senderInfo
    );

    // Send WebSocket notifications to online clients
    let sentCount = 0;
    if (websocketService && websocketService.notifyMultipleClients) {
      try {
        sentCount = websocketService.notifyMultipleClients(validUserIds, notifications[0]);
      } catch (wsError) {
        logger.error('Error sending WebSocket notifications:', wsError);
      }
    }

    logger.info('Bulk notification sent', {
      sent: validUserIds.length,
      invalid: invalidIds.length,
      websocket_sent: sentCount,
      sender: senderInfo.sender_name
    });

    res.json({
      success: true,
      message: 'Bulk notification sent successfully',
      data: {
        sent: validUserIds.length,
        invalid: invalidIds.length,
        invalid_ids: invalidIds,
        websocket_sent: sentCount,
        bulk_send_id: notifications[0].bulk_send_id
      }
    });
  } catch (error) {
    logger.error('Error sending bulk notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending bulk notification',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/clients/:id/comments
 * Send comment to specific client
 */
router.post('/clients/:id/comments', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { heading, message } = req.body;

    // Validation
    if (!heading || !message) {
      return res.status(400).json({
        success: false,
        message: 'Heading and message are required'
      });
    }

    // Find client
    const client = await User.findById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Create sender info
    const senderInfo = {
      sender_type: req.staff ? 'staff' : 'admin',
      sender_id: req.staff ? req.staff._id : null,
      sender_name: req.staff ? req.staff.name : (req.admin ? req.admin.email : 'Admin')
    };

    // Create notification
    const notification = await Notification.createNotification(
      client._id,
      {
        notification_type: 'client_comment',
        heading,
        message,
        related_entity: { entity_type: 'none', entity_id: null }
      },
      senderInfo
    );

    // Send WebSocket notification
    if (websocketService && websocketService.notifyClient) {
      try {
        websocketService.notifyClient(client._id, notification);
      } catch (wsError) {
        logger.error('Error sending WebSocket notification:', wsError);
      }
    }

    logger.info('Client comment sent', {
      client_id: client.client_id,
      sender: senderInfo.sender_name,
      notification_id: notification._id
    });

    res.json({
      success: true,
      message: 'Comment sent successfully',
      data: notification
    });
  } catch (error) {
    logger.error('Error sending client comment:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending comment',
      error: error.message
    });
  }
});

// ========================================
// KYC MANAGEMENT ROUTES
// ========================================

/**
 * GET /api/admin/clients/:id/kyc/documents
 * Get all KYC documents for a client
 */
router.get('/clients/:id/kyc/documents', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const client = await User.findById(id).select('client_id company_name your_name email phone_number documents kyc_status');
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Return documents as array with all fields
    const documents = client.documents.map(doc => ({
      _id: doc._id,
      document_type: doc.document_type,
      document_status: doc.document_status,
      file_url: doc.file_url,
      upload_date: doc.upload_date,
      verification_date: doc.verification_date,
      mimetype: doc.mimetype,
      original_filename: doc.original_filename,
      rejection_reason: doc.rejection_reason
    }));

    res.json({
      success: true,
      data: {
        client: {
          _id: client._id,
          client_id: client.client_id,
          company_name: client.company_name,
          your_name: client.your_name,
          email: client.email,
          phone_number: client.phone_number,
          kyc_status: {
            status: client.kyc_status.status,
            verified_date: client.kyc_status.verified_date,
            verification_notes: client.kyc_status.verification_notes,
            verified_by_staff_name: client.kyc_status.verified_by_staff_name,
            verification_history: client.kyc_status.verification_history || []
          }
        },
        documents: documents
      }
    });
  } catch (error) {
    logger.error('Error fetching KYC documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching KYC documents',
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/clients/:id/kyc/verify
 * Approve or reject KYC
 */
router.patch('/clients/:id/kyc/verify', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    // Validation
    if (!action || !['verify', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "verify" or "reject"'
      });
    }

    const client = await User.findById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get staff info
    const staffName = req.staff ? req.staff.name : (req.admin ? req.admin.email : 'Admin');
    const staffId = req.staff ? req.staff._id : null;

    // Update KYC status
    if (action === 'verify') {
      client.kyc_status.status = 'verified';
      client.kyc_status.verified_date = new Date();
      client.kyc_status.verified_by_staff_id = staffId;
      client.kyc_status.verified_by_staff_name = staffName;
      client.kyc_status.verification_notes = notes || 'KYC documents verified';

      // Lock profile fields when verified
      client.profile_locked_fields = {
        company_name: true,
        your_name: true,
        gstin: true,
        phone_number: true,
        email: true,
        bank_details: true
      };
    } else {
      client.kyc_status.status = 'rejected';
      client.kyc_status.verified_date = new Date();
      client.kyc_status.verified_by_staff_id = staffId;
      client.kyc_status.verified_by_staff_name = staffName;
      client.kyc_status.verification_notes = notes || 'KYC documents rejected';
    }

    // Add to verification history
    client.kyc_status.verification_history.push({
      action: action === 'verify' ? 'verified' : 'rejected',
      staff_id: staffId,
      staff_name: staffName,
      notes: notes || '',
      timestamp: new Date()
    });

    await client.save();

    // Create notification for client
    const notificationData = {
      notification_type: 'kyc_update',
      heading: action === 'verify' ? 'KYC Verified' : 'KYC Rejected',
      message: action === 'verify'
        ? 'Your KYC has been verified successfully. Your profile fields are now locked.'
        : `Your KYC has been rejected. ${notes || 'Please re-upload correct documents.'}`,
      related_entity: {
        entity_type: 'kyc',
        entity_id: client._id
      }
    };

    const senderInfo = {
      sender_type: req.staff ? 'staff' : 'admin',
      sender_id: staffId,
      sender_name: staffName
    };

    const notification = await Notification.createNotification(
      client._id,
      notificationData,
      senderInfo
    );

    // Send WebSocket notification
    if (websocketService && websocketService.notifyClient) {
      try {
        websocketService.notifyClient(client._id, notification);
      } catch (wsError) {
        logger.error('Error sending WebSocket notification:', wsError);
      }
    }

    logger.info('KYC status updated', {
      client_id: client.client_id,
      action,
      staff: staffName
    });

    res.json({
      success: true,
      message: `KYC ${action === 'verify' ? 'verified' : 'rejected'} successfully`,
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

/**
 * POST /api/admin/clients/:id/kyc/notes
 * Send KYC notes without verifying/rejecting
 */
router.post('/clients/:id/kyc/notes', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({
        success: false,
        message: 'Notes are required'
      });
    }

    const client = await User.findById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Get staff info
    const staffName = req.staff ? req.staff.name : (req.admin ? req.admin.email : 'Admin');
    const staffId = req.staff ? req.staff._id : null;

    // Add to verification history
    client.kyc_status.verification_history.push({
      action: 'note_sent',
      staff_id: staffId,
      staff_name: staffName,
      notes,
      timestamp: new Date()
    });

    await client.save();

    // Create notification for client
    const notificationData = {
      notification_type: 'kyc_update',
      heading: 'KYC Note from Admin',
      message: notes,
      related_entity: {
        entity_type: 'kyc',
        entity_id: client._id
      }
    };

    const senderInfo = {
      sender_type: req.staff ? 'staff' : 'admin',
      sender_id: staffId,
      sender_name: staffName
    };

    const notification = await Notification.createNotification(
      client._id,
      notificationData,
      senderInfo
    );

    // Send WebSocket notification
    if (websocketService && websocketService.notifyClient) {
      try {
        websocketService.notifyClient(client._id, notification);
      } catch (wsError) {
        logger.error('Error sending WebSocket notification:', wsError);
      }
    }

    logger.info('KYC note sent', {
      client_id: client.client_id,
      staff: staffName
    });

    res.json({
      success: true,
      message: 'Note sent successfully',
      data: notification
    });
  } catch (error) {
    logger.error('Error sending KYC note:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending note',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/clients/:id/kyc/documents/:doc_type/view
 * Proxy document view (opens inline in new tab, not download)
 */
router.get('/clients/:id/kyc/documents/:doc_type/view', adminAuth, async (req, res) => {
  try {
    const { id, doc_type } = req.params;

    const client = await User.findById(id).select('documents');
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Find document by type (handle both new and legacy names)
    const typeMap = {
      'gst_certificate': ['gst_certificate'],
      'photo_selfie': ['photo', 'photo_selfie'],
      'pan_card': ['pan', 'pan_card'],
      'aadhaar_card': ['aadhar', 'aadhaar_card']
    };

    const matchingTypes = typeMap[doc_type] || [doc_type];
    const document = client.documents.find(doc =>
      matchingTypes.includes(doc.document_type)
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Set Content-Disposition to inline (not attachment) for viewing in browser
    const safeFilename = document.original_filename || `${doc_type}.pdf`;
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.setHeader('Content-Type', document.mimetype || 'application/pdf');

    // Redirect to Cloudinary URL (or proxy the content if needed)
    res.redirect(document.file_url);
  } catch (error) {
    logger.error('Error viewing document:', error);
    res.status(500).json({
      success: false,
      message: 'Error viewing document',
      error: error.message
    });
  }
});

// ============================================================================
// MANUAL AWB MAPPING
// ============================================================================

/**
 * Helper: Parse Excel date serial number to JavaScript Date
 */
function parseExcelDate(excelDate) {
  if (!excelDate) return new Date();

  // If already a Date object or valid date string
  if (excelDate instanceof Date) return excelDate;
  if (typeof excelDate === 'string') {
    const parsed = new Date(excelDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Excel date serial number (days since 1900-01-01)
  if (typeof excelDate === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const days = Math.floor(excelDate) - 2; // Excel has a bug for leap year 1900
    return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
  }

  return new Date();
}

/**
 * Helper: Normalize phone number to 10 digits
 */
function normalizePhone(phone) {
  if (!phone) return '';
  const cleaned = phone.toString().replace(/\D/g, '');
  return cleaned.slice(-10); // Take last 10 digits
}

/**
 * Helper: Normalize pincode to 6 digits
 */
function normalizePincode(pincode) {
  if (!pincode) return '';
  return pincode.toString().replace(/\D/g, '').slice(0, 6);
}

/**
 * Helper: Normalize Service Type from Excel
 * @param {string} serviceType - Raw service type from Excel
 * @returns {string} - Normalized service type ('surface' or 'air')
 */
function normalizeServiceType(serviceType) {
  if (!serviceType) return 'surface'; // Default to surface if missing

  const normalized = serviceType.toString().trim().toLowerCase();

  // Accept variations
  if (['air', 'delhivery air', 'express'].includes(normalized)) {
    return 'air';
  }

  // Default to surface for invalid values
  return 'surface';
}

/**
 * Helper: Create manually mapped order from Excel row
 */
async function createManualMappedOrder(row, client, adminUser) {
  const { generateOrderId } = require('../utils/orderIdGenerator');

  // Validate AWB uniqueness
  const existingOrder = await Order.findOne({ 'delhivery_data.waybill': row['*awb']?.toString().trim() });
  if (existingOrder) {
    throw new Error(`AWB ${row['*awb']} already exists in system`);
  }

  // Normalize and lookup carrier by service type
  const serviceType = normalizeServiceType(row['Service Type']); // Optional column
  let carrierId = null;

  try {
    const carrier = await Carrier.findOne({
      carrier_group: 'DELHIVERY',
      service_type: serviceType,
      is_active: true
    });

    if (carrier) {
      carrierId = carrier._id;
    } else {
      logger.warn(`Carrier not found for service_type: ${serviceType}, defaulting to null`);
    }
  } catch (carrierErr) {
    logger.error('Error looking up carrier:', carrierErr);
    // Continue without carrier_id - non-critical
  }

  // Parse and validate data
  const orderData = {
    user_id: client._id,
    order_id: row['*Order ID']?.toString().trim() || generateOrderId(),
    reference_id: row['Ref Id']?.toString().trim() || undefined,
    invoice_number: row['Invoice No.']?.toString().trim() || undefined,
    order_date: parseExcelDate(row['*Order Date']),

    // Customer info
    customer_info: {
      buyer_name: row['*Customer Name']?.toString().trim(),
      phone: normalizePhone(row['*Customer Phone']),
      email: client.email
    },

    // Delivery address
    delivery_address: {
      address_line_1: row['*Shipping Address Line1']?.toString().trim(),
      address_line_2: row['Shipping Address Line2']?.toString().trim() || '',
      full_address: row['*Shipping Address Line1']?.toString().trim(),
      city: row['*Shipping City']?.toString().trim(),
      state: row['*Shipping State']?.toString().trim(),
      pincode: normalizePincode(row['*Shipping Pincode']),
      country: 'India'
    },

    // Pickup address
    pickup_address: {
      name: row['*Pickup Location Name']?.toString().trim(),
      full_address: row['*Pickup Location Name']?.toString().trim(),
      city: '',
      state: '',
      pincode: '',
      country: 'India'
    },

    // Products
    products: [{
      product_name: row['*Product name']?.toString().trim(),
      quantity: parseInt(row['*Quantity']) || 1,
      unit_price: parseFloat(row['*Unit price']) || 0,
      hsn_code: row['HSN']?.toString().trim() || '',
      category: row['product category']?.toString().trim() || '',
      sku: row['SKU']?.toString().trim() || '',
      discount: parseFloat(row['Discount']) || 0,
      tax: parseFloat(row['Tax']) || 0
    }],

    // Package info
    package_info: {
      weight: parseFloat(row['*Weight (kg)']),
      dimensions: {
        length: parseFloat(row['*Length (cm)']),
        width: parseFloat(row['*Breadth (cm)']),
        height: parseFloat(row['*Height (cm)'])
      },
      package_type: row['*Package type']?.toString().trim(),
      number_of_boxes: parseInt(row['*No. of box']) || 1
    },

    // Payment info
    payment_info: {
      payment_mode: row['*Payment type']?.toString().toUpperCase() === 'COD' ? 'COD' : 'Prepaid',
      cod_amount: parseFloat(row['*COD Amount']) || 0,
      order_value: parseFloat(row['*Unit Item Price']) || 0,
      total_amount: parseFloat(row['*total payment']) || 0,
      grand_total: parseFloat(row['*total payment']) || 0
    },

    // Delhivery data with pre-assigned AWB
    delhivery_data: {
      waybill: row['*awb']?.toString().trim(),
      status: 'ready_to_ship'
    },

    // Manual mapping metadata
    is_manually_mapped: true,
    manually_mapped_by: adminUser.email,
    manually_mapped_at: new Date(),
    manual_mapping_source: 'excel_upload',

    // Status
    status: 'ready_to_ship',
    shipping_mode: serviceType === 'air' ? 'Express' : 'Surface',
    order_type: 'forward',
    carrier_used: carrierId,

    // Special flags
    is_fragile: row['Fragile Shipment'] === 'Y' || row['Fragile Shipment'] === '1',
    ewaybill_number: row['e-Way Bill Number']?.toString().trim() || ''
  };

  // Create order
  const order = new Order(orderData);
  await order.save();

  logger.info('✅ Manual mapping created:', {
    orderId: order.order_id,
    awb: order.delhivery_data.waybill,
    clientId: client.client_id,
    mappedBy: adminUser.email
  });

  return order;
}

/**
 * POST /admin/orders/manual-mapping/upload
 * Admin uploads Excel file with manual AWB mappings
 */
router.post('/orders/manual-mapping/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Parse Excel file
    const XLSX = require('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Excel file is empty'
      });
    }

    const results = {
      total: rows.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Mandatory fields (marked with * in Excel)
    const mandatoryFields = [
      '*awb', '*Client mail id', '*Pickup Location Name',
      '*Customer Name', '*Customer Phone',
      '*Shipping Address Line1', '*Shipping City', '*Shipping State', '*Shipping Pincode',
      '*Order ID', '*Order Date', '*Product name', '*Quantity', '*Unit price',
      '*Unit Item Price', '*total payment', '*Payment type', '*COD Amount',
      '*Package type', '*Length (cm)', '*Breadth (cm)', '*Height (cm)',
      '*No. of box', '*Weight (kg)'
    ];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        // Validate mandatory fields
        const missingFields = mandatoryFields.filter(field => !row[field] && row[field] !== 0);
        if (missingFields.length > 0) {
          throw new Error(`Missing mandatory fields: ${missingFields.join(', ')}`);
        }

        // Find client by email
        const clientEmail = row['*Client mail id']?.toString().trim().toLowerCase();
        const client = await User.findOne({
          email: clientEmail,
          user_type: { $in: ['seller', 'brand', 'manufacturer', 'distributor'] }
        });

        if (!client) {
          throw new Error(`Client not found with email: ${clientEmail}`);
        }

        // Validate phone format
        const phone = normalizePhone(row['*Customer Phone']);
        if (!/^[6-9]\d{9}$/.test(phone)) {
          throw new Error(`Invalid phone number: ${row['*Customer Phone']}`);
        }

        // Validate pincode format
        const pincode = normalizePincode(row['*Shipping Pincode']);
        if (!/^\d{6}$/.test(pincode)) {
          throw new Error(`Invalid pincode: ${row['*Shipping Pincode']}`);
        }

        // Create order
        await createManualMappedOrder(row, client, req.admin || req.staff);

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 2, // +2 for Excel row number (1-indexed + header)
          awb: row['*awb']?.toString() || 'N/A',
          error: error.message
        });
      }
    }

    logger.info('📊 Manual mapping upload completed:', results);

    res.status(200).json({
      success: true,
      message: `Processed ${results.total} rows: ${results.successful} successful, ${results.failed} failed`,
      data: results
    });

  } catch (error) {
    logger.error('❌ Manual mapping upload failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process manual mapping',
      error: error.message
    });
  }
});

module.exports = router;
