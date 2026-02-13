const express = require('express');
const { body, validationResult, query } = require('express-validator');
const moment = require('moment');
const multer = require('multer');
const https = require('https');
const http = require('http');
const { auth } = require('../middleware/auth');
const SupportTicket = require('../models/Support');
const websocketService = require('../services/websocketService');
const cloudinaryService = require('../services/cloudinaryService');

const router = express.Router();
const isDev = process.env.NODE_ENV !== 'production';

const STATUS_KEYS = ['open', 'in_progress', 'resolved', 'closed', 'escalated'];

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

const sanitizeTicketForClient = (ticketDoc) => {
  if (!ticketDoc) return null;

  const ticket = typeof ticketDoc.toObject === 'function' ? ticketDoc.toObject() : ticketDoc;

  if (ticket.conversation && Array.isArray(ticket.conversation)) {
    ticket.conversation = ticket.conversation.filter(msg => !msg.is_internal);
  }

  return ticket;
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

const streamAttachmentFromUrl = (res, fileUrl, filename, mimeType = 'application/octet-stream') => {
  if (!fileUrl) {
    return res.status(400).json({
      status: 'error',
      message: 'Attachment URL missing'
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch (error) {
    console.error('Attachment download URL parse error:', error);
    return res.status(400).json({
      status: 'error',
      message: 'Invalid attachment URL'
    });
  }

  const client = parsedUrl.protocol === 'https:' ? https : http;
  const request = client.get(fileUrl, (fileResponse) => {
    if (!fileResponse || fileResponse.statusCode >= 400) {
      console.error('Attachment download upstream error', {
        statusCode: fileResponse?.statusCode,
        statusMessage: fileResponse?.statusMessage
      });
      if (!res.headersSent) {
        res.status(502).json({
          status: 'error',
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
    console.error('Attachment download request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: 'Error downloading attachment'
      });
    }
  });

  request.setTimeout(30000, () => {
    request.destroy();
    if (!res.headersSent) {
      res.status(504).json({
        status: 'error',
        message: 'Attachment download timed out'
      });
    }
  });
};

// Configure multer (in-memory) for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB per file
  },
  fileFilter: (req, file, cb) => {
    // Allow images, documents, audio, and video files
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/mpeg', 'video/quicktime'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// @desc    Get all tickets with filters and pagination
// @route   GET /api/support
// @access  Private
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed', 'escalated', 'all']),
  query('category').optional(),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601()
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
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    const filterQuery = { user_id: userId };

    if (req.query.status && req.query.status !== 'all') {
      filterQuery.status = req.query.status;
    }

    if (req.query.category) {
      filterQuery.category = req.query.category;
    }

    if (req.query.priority) {
      filterQuery.priority = req.query.priority;
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterQuery.$or = [
        { ticket_id: searchRegex },
        { subject: searchRegex },
        { description: searchRegex },
        { awb_numbers: { $in: [searchRegex] } }
      ];
    }

    if (req.query.date_from || req.query.date_to) {
      filterQuery.created_at = {};
      if (req.query.date_from) {
        filterQuery.created_at.$gte = new Date(req.query.date_from);
      }
      if (req.query.date_to) {
        filterQuery.created_at.$lte = new Date(req.query.date_to);
      }
    }

    // Get tickets with pagination
    const tickets = await SupportTicket.find(filterQuery)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Filter out internal messages from conversation for each ticket
    const filteredTickets = tickets.map(ticket => {
      if (ticket.conversation && Array.isArray(ticket.conversation)) {
        ticket.conversation = ticket.conversation.filter(
          msg => !msg.is_internal
        );
      }
      return ticket;
    });

    const totalTickets = await SupportTicket.countDocuments(filterQuery);

    res.json({
      status: 'success',
      data: {
        tickets: filteredTickets,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalTickets / limit),
          total_tickets: totalTickets,
          per_page: limit
        }
      }
    });

  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching tickets'
    });
  }
});

// @desc    Download ticket attachment with original filename
// @route   GET /api/support/:ticketId/attachments/:attachmentId/download
// @access  Private
router.get('/:ticketId/attachments/:attachmentId/download', auth, async (req, res) => {
  try {
    const { ticketId, attachmentId } = req.params;

    const ticket = await SupportTicket.findOne({
      _id: ticketId,
      user_id: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found'
      });
    }

    const attachment = findAttachmentById(ticket, attachmentId);

    if (!attachment) {
      return res.status(404).json({
        status: 'error',
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
    console.error('Download attachment error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error downloading attachment'
    });
  }
});

// @desc    Get single ticket by ID
// @route   GET /api/support/:id
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      user_id: req.user._id
    }).populate('related_orders', 'order_id customer_info.buyer_name');

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found'
      });
    }

    // Filter out internal messages for clients
    const ticketObj = ticket.toObject();
    if (ticketObj.conversation) {
      ticketObj.conversation = ticketObj.conversation.filter(
        msg => !msg.is_internal
      );
    }

    res.json({
      status: 'success',
      data: ticketObj
    });

  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching ticket'
    });
  }
});

// @desc    Create new ticket
// @route   POST /api/support
// @access  Private
router.post('/', auth, upload.array('attachments', 5), [
  body('category').isIn([
    'pickup_delivery', 'shipment_ndr_rto', 'edit_shipment_info', 'shipment_dispute',
    'finance', 'billing_taxation', 'claims', 'kyc_bank_verification',
    'technical_support', 'others'
  ]).withMessage('Valid category is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('subject').trim().notEmpty().isLength({ max: 200 }).withMessage('Subject is required and must be less than 200 characters'),
  body('description').trim().notEmpty().isLength({ max: 5000 }).withMessage('Description is required and must be less than 5000 characters'),
  body('awb_numbers')
    .optional({ checkFalsy: true })
    .customSanitizer(value => {
      if (Array.isArray(value)) {
        return value.map(item => (typeof item === 'string' ? item.trim() : item)).filter(Boolean);
      }
      if (typeof value === 'string') {
        return [value.trim()].filter(Boolean);
      }
      return [];
    })
    .custom(value => {
      if (!Array.isArray(value)) {
        throw new Error('AWB numbers must be an array');
      }
      if (value.length > 10) {
        throw new Error('Maximum 10 AWB numbers allowed');
      }
      return true;
    }),
  body('contact_preference').optional().isIn(['email', 'phone', 'whatsapp', 'portal'])
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
    const user = req.user;
    const awbNumbers = Array.isArray(req.body.awb_numbers)
      ? req.body.awb_numbers
      : [];

    // Process file attachments (upload to Cloudinary)
    let attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const validation = cloudinaryService.validateFile(file);
        if (!validation.valid) {
          return res.status(400).json({
            status: 'error',
            message: validation.error
          });
        }

        console.log('[Support Upload] Processing file', {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        });

        let uploadResult;
        try {
          uploadResult = await cloudinaryService.uploadFile(file.buffer, {
            folder: 'shipsarthi/support',
            mimetype: file.mimetype
          });
        } catch (uploadError) {
          console.error('[Support Upload] Failed to upload file', {
            name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            error: uploadError
          });

          const debugPayload = isDev
            ? {
                debug: {
                  file_name: file.originalname,
                  mimetype: file.mimetype,
                  size: file.size,
                  error_message: uploadError?.message,
                  error_stack: uploadError?.stack
                }
              }
            : {};

          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload attachment to cloud storage',
            ...debugPayload
          });
        }

        if (!uploadResult || !uploadResult.success) {
          console.error('[Support Upload] Unexpected upload response', {
            name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            uploadResult
          });

          const debugPayload = isDev
            ? {
                debug: {
                  file_name: file.originalname,
                  mimetype: file.mimetype,
                  size: file.size,
                  upload_result: uploadResult
                }
              }
            : {};

          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload attachment to cloud storage',
            ...debugPayload
          });
        }

        console.log('[Support Upload] Upload successful', {
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

    // Create ticket
    const ticketData = {
      ...req.body,
      user_id: userId,
      customer_info: {
        name: user.your_name,
        email: user.email,
        phone: user.phone_number,
        company_name: user.company_name
      },
      attachments,
      awb_numbers: awbNumbers
    };

    const ticket = new SupportTicket(ticketData);
    await ticket.save();

    // Add initial message to conversation
    const senderName = user.your_name || user.company_name || user.email || 'Client';
    await ticket.addMessage('user', senderName, req.body.description, attachments);

    // Log ticket creation for admin notifications
    console.log(`🔔 NEW TICKET CREATED: ${ticket.ticket_id} by ${user.your_name} (${user.email})`);
    console.log(`📋 Ticket Details:`, {
      ticket_id: ticket.ticket_id,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      client: {
        name: user.your_name,
        email: user.email,
        company: user.company_name
      }
    });

    // Send WebSocket notification to admins
    websocketService.notifyNewTicket({
      ticket_id: ticket.ticket_id,
      _id: ticket._id,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      client_name: user.your_name,
      client_email: user.email,
      client_company: user.company_name,
      subject: ticket.subject,
      description: ticket.description
    });

    res.status(201).json({
      status: 'success',
      message: 'Ticket created successfully',
      data: {
        ticket_id: ticket.ticket_id,
        _id: ticket._id,
        status: ticket.status,
        priority: ticket.priority
      }
    });

  } catch (error) {
    console.error('Create ticket error:', {
      message: error?.message,
      stack: error?.stack,
      userId: req?.user?._id,
      payloadKeys: Object.keys(req.body || {}),
      hasFiles: Array.isArray(req.files) ? req.files.length : 0,
      error
    });

    const debugPayload = isDev
      ? {
          debug: {
            error_message: error?.message,
            error_stack: error?.stack,
            payload_keys: Object.keys(req.body || {}),
            has_files: Array.isArray(req.files) ? req.files.length : 0
          }
        }
      : {};

    res.status(500).json({
      status: 'error',
      message: 'Server error creating ticket',
      ...debugPayload
    });
  }
});

// @desc    Add message to ticket conversation
// @route   POST /api/support/:id/messages
// @access  Private
router.post('/:id/messages', auth, upload.fields([
  { name: 'attachments', maxCount: 5 },
  { name: 'files', maxCount: 5 }
]), [
  body('message')
    .optional({ checkFalsy: true })
    .trim(),
  body('comment')
    .optional({ checkFalsy: true })
    .trim(),
  body().custom((value, { req }) => {
    const message = req.body.message;
    const comment = req.body.comment;
    if ((typeof message === 'string' && message.trim().length > 0) ||
        (typeof comment === 'string' && comment.trim().length > 0)) {
      return true;
    }
    throw new Error('Message is required');
  })
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

    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found'
      });
    }

    // Normalize Multer files (support both attachments and files fields)
    const uploadedFileGroups = req.files || {};
    const normalizedFiles = Array.isArray(uploadedFileGroups)
      ? uploadedFileGroups
      : Object.values(uploadedFileGroups).flat();

    // Process file attachments (upload to Cloudinary)
    const attachments = [];
    if (normalizedFiles.length > 0) {
      for (const file of normalizedFiles) {
        const validation = cloudinaryService.validateFile(file);
        if (!validation.valid) {
          return res.status(400).json({
            status: 'error',
            message: validation.error
          });
        }

        console.log('[Support Message Upload] Processing file', {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        });

        let uploadResult;
        try {
          uploadResult = await cloudinaryService.uploadFile(file.buffer, {
            folder: 'shipsarthi/support/messages',
            mimetype: file.mimetype
          });
        } catch (uploadError) {
          console.error('[Support Message Upload] Failed to upload file', {
            name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            error: uploadError
          });

          const debugPayload = isDev
            ? {
                debug: {
                  file_name: file.originalname,
                  mimetype: file.mimetype,
                  size: file.size,
                  error_message: uploadError?.message,
                  error_stack: uploadError?.stack
                }
              }
            : {};

          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload attachment to cloud storage',
            ...debugPayload
          });
        }

        if (!uploadResult || !uploadResult.success) {
          console.error('[Support Message Upload] Unexpected upload response', {
            name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            uploadResult
          });

          const debugPayload = isDev
            ? {
                debug: {
                  file_name: file.originalname,
                  mimetype: file.mimetype,
                  size: file.size,
                  upload_result: uploadResult
                }
              }
            : {};

          return res.status(500).json({
            status: 'error',
            message: 'Failed to upload attachment to cloud storage',
            ...debugPayload
          });
        }

        console.log('[Support Message Upload] Upload successful', {
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

    const messageContent = (req.body.message || req.body.comment || '').trim();

    await ticket.addMessage('user', req.user.your_name, messageContent, attachments);

    // Update ticket status if it was resolved/closed
    if (['resolved', 'closed'].includes(ticket.status)) {
      ticket.status = 'open';
      ticket.metrics.reopened_count += 1;
      await ticket.save();
    }

    res.json({
      status: 'success',
      message: 'Message added successfully',
      data: {
        ticket_id: ticket.ticket_id,
        status: ticket.status,
        last_message: ticket.conversation[ticket.conversation.length - 1]
      }
    });

  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error adding message'
    });
  }
});

// @desc    Update ticket status
// @route   PATCH /api/support/:id/status
// @access  Private
router.patch('/:id/status', auth, [
  body('status').isIn(['open', 'in_progress', 'resolved', 'closed']).withMessage('Valid status is required'),
  body('reason').optional().trim()
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

    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found'
      });
    }

    const { status, reason = '' } = req.body;
    const previousStatus = ticket.status;

    if (status === 'closed' && !['resolved'].includes(previousStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Ticket must be resolved before closing'
      });
    }

    ticket.status = status;

    // Add system message about status change
    const statusMessage = `Ticket status changed from "${previousStatus}" to "${status}"${reason ? `. Reason: ${reason}` : ''}`;
    await ticket.addMessage('system', 'System', statusMessage, [], true);

    // Fetch fresh ticket data for response (exclude internal messages)
    const updatedTicket = await SupportTicket.findOne({
      _id: ticket._id,
      user_id: req.user._id
    }).lean();

    if (!updatedTicket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found after update'
      });
    }

    // Get latest status counts for the client
    const stats = await SupportTicket.getTicketStats(req.user._id, null, null);
    const statusCounts = formatStatusCounts(stats);

    res.json({
      status: 'success',
      message: 'Ticket status updated successfully',
      data: {
        ticket: sanitizeTicketForClient(updatedTicket),
        status_counts: statusCounts,
        previous_status: previousStatus,
        current_status: status
      }
    });

  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error updating ticket status'
    });
  }
});

// @desc    Rate ticket resolution
// @route   POST /api/support/:id/rating
// @access  Private
router.post('/:id/rating', auth, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('feedback').optional().trim().isLength({ max: 1000 })
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

    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found'
      });
    }

    if (!['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Can only rate resolved or closed tickets'
      });
    }

    // Update resolution rating
    ticket.resolution.customer_satisfaction = {
      rating: req.body.rating,
      feedback: req.body.feedback || '',
      survey_date: new Date()
    };

    await ticket.save();

    res.json({
      status: 'success',
      message: 'Rating submitted successfully',
      data: {
        ticket_id: ticket.ticket_id,
        rating: req.body.rating
      }
    });

  } catch (error) {
    console.error('Rate ticket error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error submitting rating'
    });
  }
});

// @desc    Get ticket statistics
// @route   GET /api/support/statistics/overview
// @access  Private
router.get('/statistics/overview', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = '30' } = req.query;
    const startDate = moment().subtract(parseInt(period), 'days').startOf('day');

    const stats = await SupportTicket.getTicketStats(userId, startDate.toDate(), new Date());
    const categoryStats = await SupportTicket.getCategoryStats(startDate.toDate(), new Date());

    const summary = {
      total_tickets: 0,
      avg_resolution_time: 0,
      status_breakdown: {},
      category_breakdown: categoryStats.filter(cat => cat._id) // Filter out null categories
    };

    stats.forEach(stat => {
      summary.total_tickets += stat.count;
      summary.status_breakdown[stat._id] = {
        count: stat.count,
        avg_resolution_time: stat.avg_resolution_time || 0
      };
    });

    if (stats.length > 0) {
      summary.avg_resolution_time = stats.reduce((acc, stat) => acc + (stat.avg_resolution_time || 0), 0) / stats.length;
    }

    const statusCounts = formatStatusCounts(stats);

    res.json({
      status: 'success',
      data: {
        period_days: parseInt(period),
        summary,
        status_counts: statusCounts,
        detailed_stats: stats
      }
    });

  } catch (error) {
    console.error('Ticket statistics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching ticket statistics'
    });
  }
});

// @desc    Get SLA report
// @route   GET /api/support/sla-report
// @access  Private
router.get('/sla-report', auth, async (req, res) => {
  try {
    const slaReport = await SupportTicket.getSLAReport();

    // Filter by user
    const userSLAData = slaReport.filter(ticket => ticket.user_id && ticket.user_id.toString() === req.user._id.toString());

    const slaMetrics = {
      total_tickets: userSLAData.length,
      sla_breached: userSLAData.filter(t => t.breached_sla).length,
      avg_response_time: 0,
      on_time_percentage: 0
    };

    if (userSLAData.length > 0) {
      const totalResponseTime = userSLAData.reduce((acc, ticket) => acc + (ticket.response_time_minutes || 0), 0);
      slaMetrics.avg_response_time = totalResponseTime / userSLAData.length;
      slaMetrics.on_time_percentage = ((userSLAData.length - slaMetrics.sla_breached) / userSLAData.length * 100).toFixed(2);
    }

    res.json({
      status: 'success',
      data: {
        metrics: slaMetrics,
        detailed_tickets: userSLAData
      }
    });

  } catch (error) {
    console.error('SLA report error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error fetching SLA report'
    });
  }
});

// @desc    Reopen ticket
// @route   POST /api/support/:id/reopen
// @access  Private
router.post('/:id/reopen', auth, [
  body('reason').trim().notEmpty().withMessage('Reason for reopening is required')
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

    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      user_id: req.user._id
    });

    if (!ticket) {
      return res.status(404).json({
        status: 'error',
        message: 'Ticket not found'
      });
    }

    if (!['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Can only reopen resolved or closed tickets'
      });
    }

    await ticket.reopen(req.body.reason, req.user.your_name);

    res.json({
      status: 'success',
      message: 'Ticket reopened successfully',
      data: {
        ticket_id: ticket.ticket_id,
        status: ticket.status,
        reopened_count: ticket.metrics.reopened_count
      }
    });

  } catch (error) {
    console.error('Reopen ticket error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error reopening ticket'
    });
  }
});

module.exports = router;