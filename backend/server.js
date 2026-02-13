// CRITICAL: Load environment variables FIRST before any other imports
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { connectDB, checkDBHealth } = require('./config/db');
const logger = require('./utils/logger');
const trackingService = require('./services/trackingService');
const websocketService = require('./services/websocketService');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for Render deployment - MUST be set before any middleware
// In production (Render), trust the first proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  console.log('🔒 Trust proxy enabled for production deployment');
} else {
  app.set('trust proxy', false);
  console.log('🔒 Trust proxy disabled for development');
}

// CORS Configuration - MUST come BEFORE helmet() to ensure CORS headers are set
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://shipsarthi.vercel.app',
  'https://shipsarthi-git-main-udditworks-projects.vercel.app',
  'https://www.shipsarthi.com',
      'https://shipsarthi.com'
    ];

// CORS middleware - MUST be before helmet
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list (optimized - no logging in production)
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Only log blocked requests in development
      if (process.env.NODE_ENV === 'development') {
        logger.warn('CORS blocked', { origin });
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Admin-Email', 'X-Admin-Password'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'Content-Disposition', 'Cache-Control', 'X-Foo', 'X-Bar'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Security Middleware - Configure helmet to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false // Disable CSP to avoid conflicts with CORS in development
}));

// Rate Limiting with proper configuration for proxy
// Higher limits for development, more restrictive for production
const isDevelopment = process.env.NODE_ENV !== 'production';
const isLocalhost = process.env.NODE_ENV !== 'production' && 
                    (process.env.ALLOWED_ORIGINS?.includes('localhost') || 
                     !process.env.ALLOWED_ORIGINS); // Default to localhost in dev

// For localhost development, use very high limits to prevent blocking during development
// For production, use higher limits to avoid blocking normal usage
// Previous limit of 100 requests/15min was too restrictive for dashboard with multiple API calls
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (isLocalhost ? '2000' : isDevelopment ? '1000' : '500')),
  message: {
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy configuration - this handles IPv4 and IPv6 correctly
  trustProxy: true,
  // Skip successful requests from rate limit counting (only count errors/blocked)
  skipSuccessfulRequests: false,
  // Skip failed requests from rate limit counting (only count successful)
  skipFailedRequests: false
  // Removed custom keyGenerator - express-rate-limit handles IP extraction automatically
  // when trustProxy is set, properly handling both IPv4 and IPv6 addresses
});

if (isLocalhost) {
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000');
  logger.info('🔓 Rate limiting set to HIGH limits for localhost development', {
    maxRequests: maxRequests,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15') * 60 * 1000
  });
}

// Health check should not be rate limited
const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // Very high limit for health checks
  skipSuccessfulRequests: true
});

// Separate rate limiter for document uploads - more lenient since uploads are critical operations
const documentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isLocalhost ? 50 : isDevelopment ? 30 : 20, // Higher limits for document uploads
  message: {
    error: 'Too many document upload requests. Please wait a few minutes before uploading again.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  skip: (req) => {
    // Skip rate limiting for health checks even if they hit document endpoints
    return req.path === '/health';
  }
});

app.use('/api/health', healthCheckLimiter);
// Apply document upload limiter to upload-document endpoint BEFORE general limiter
app.use('/api/users/upload-document', documentUploadLimiter);
// DISABLED: Rate limiting was causing 429 errors - removed per user request
// app.use('/api/', limiter);

// Optimized Request Logging Middleware - Only log essential info for performance
app.use((req, res, next) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;
  
  // Skip detailed logging for health checks and static files to improve performance
  if (req.url !== '/api/health' && !req.url.startsWith('/uploads') && !req.url.startsWith('/public')) {
    // Only log minimal info - reduce overhead
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Request', {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
    }
  }
  
  next();
});

// Enhanced Order Creation Logging Middleware
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'POST') {
    logger.info('🚀 ORDER CREATION REQUEST STARTED', {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      body: req.body,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
  next();
});

// Add response logging middleware for orders
app.use('/api/orders', (req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    if (req.method === 'POST') {
      logger.info('📦 ORDER CREATION RESPONSE', {
        requestId: req.requestId,
        statusCode: res.statusCode,
        response: JSON.parse(data),
        timestamp: new Date().toISOString()
      });
    }
    originalSend.call(this, data);
  };
  next();
});

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static Files
app.use('/uploads', express.static('uploads'));
app.use('/public', express.static('public'));

// Health Check Route - Must be accessible for CORS debugging
app.get('/api/health', async (req, res) => {
  const dbHealth = await checkDBHealth();
  res.status(200).json({
    status: 'success',
    message: 'Shipsarthi API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbHealth,
    cors: {
      allowedOrigins: allowedOrigins,
      currentOrigin: req.get('Origin') || 'none'
    }
  });
});

// Test CORS Route
app.post('/api/test-cors', (req, res) => {
  logger.info('🧪 CORS TEST ENDPOINT HIT', {
    requestId: req.requestId,
    body: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
  
  res.status(200).json({
    status: 'success',
    message: 'CORS test successful',
    data: req.body,
    timestamp: new Date().toISOString()
  });
});

// Test Email Service Route
app.get('/api/test-email', async (req, res) => {
  try {
    const emailService = require('./services/emailService');
    
    logger.info('🧪 EMAIL TEST ENDPOINT HIT', {
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    });
    
    const testResult = await emailService.sendEnquiryConfirmation({
      name: 'Test User',
      email: 'test@example.com',
      mobile: '1234567890',
      describe: 'Test Business',
      monthlyLoad: 'Test Load'
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Email test completed',
      emailResult: testResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ EMAIL TEST ERROR', {
      requestId: req.requestId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Email test failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Sitemap Route (before API routes to avoid conflicts)
app.use('/', require('./routes/sitemap'));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/users', require('./routes/users'));
app.use('/api/user', require('./routes/user')); // Mount user.js routes at /api/user (singular)
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/warehouses', require('./routes/warehouses'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/products', require('./routes/products'));
app.use('/api/ndr', require('./routes/ndr'));
app.use('/api/support', require('./routes/support'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/remittances', require('./routes/remittances'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/shipping', require('./routes/shipping'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/enquiry', require('./routes/enquiry'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/weight-discrepancies', require('./routes/weightDiscrepancies'));
app.use('/api/notifications', require('./routes/notifications'));

// Error Handling Middleware
app.use((err, req, res, next) => {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.error('💥 UNHANDLED ERROR OCCURRED', {
    errorId,
    timestamp: new Date().toISOString(),
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack,
    errorCode: err.code,
    requestDetails: {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      referer: req.get('Referer'),
      contentType: req.get('Content-Type')
    },
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  console.error('💥 Error:', err.stack);
  
  if (err.name === 'ValidationError') {
    logger.warn('Validation error', { errors: Object.values(err.errors).map(e => e.message) });
    return res.status(400).json({
      status: 'error',
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  if (err.name === 'CastError') {
    logger.warn('Cast error', { value: err.value, kind: err.kind });
    return res.status(400).json({
      status: 'error',
      message: 'Invalid ID format'
    });
  }
  
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    logger.warn('Duplicate key error', { field, keyPattern: err.keyPattern });
    return res.status(400).json({
      status: 'error',
      message: `${field} already exists`
    });
  }

  res.status(err.status || 500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message
  });
});

// 404 Handler - Fixed wildcard route pattern
app.use((req, res) => {
  logger.warn('404 - Route not found', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket service
websocketService.initialize(server);

// MongoDB Connection - Must complete before starting server
async function startServer() {
  try {
    // Wait for database connection before proceeding
    await connectDB();
    logger.info('✅ Connected to MongoDB');
    console.log('✅ Connected to MongoDB');

    // Start Server only after DB is connected
    server.listen(PORT, () => {
      logger.info('🚀 Server started', {
        port: PORT,
        environment: process.env.NODE_ENV,
        healthCheck: `http://localhost:${PORT}/api/health`,
        websocket: `ws://localhost:${PORT}`,
        databaseStatus: 'connected'
      });
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
      console.log(`📊 Database: Connected`);
    });
  } catch (error) {
    logger.error('❌ MongoDB connection error', { error: error.message, stack: error.stack });
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Start the server after DB connection
startServer();

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully');
  console.log('🛑 SIGTERM received, shutting down gracefully');
  
  // Cleanup WebSocket service
  websocketService.cleanup();
  
  mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 SIGINT received, shutting down gracefully');
  console.log('🛑 SIGINT received, shutting down gracefully');
  
  // Cleanup WebSocket service
  websocketService.cleanup();
  
  mongoose.connection.close();
  process.exit(0);
});

module.exports = app;