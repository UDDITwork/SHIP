const WebSocket = require('ws');
const logger = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // Maps WebSocket clientId -> WebSocket connection
    this.userClients = new Map(); // Maps MongoDB user_id -> Set of WebSocket clientIds
    this.pingInterval = null; // Store ping interval for cleanup
  }

  initialize(server) {
    try {
      this.wss = new WebSocket.Server({ 
        server,
        clientTracking: true,
        perMessageDeflate: false // Disable compression for better compatibility
      });
      
      // Set up ping interval to keep connections alive
      // Reduced to 15 seconds for more aggressive keep-alive (prevents proxy timeouts)
      this.pingInterval = setInterval(() => {
        this.wss.clients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.ping();
            } catch (error) {
              logger.error('Error sending ping:', error);
            }
          }
        });
      }, 15000); // Send ping every 15 seconds (reduced from 30s for better keep-alive)
      
      this.wss.on('connection', (ws, req) => {
        const clientId = this.generateClientId();
        this.clients.set(clientId, ws);
        
        logger.info('🔌 WebSocket client connected', { clientId, totalClients: this.clients.size });
        
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message);
            this.handleMessage(clientId, data, ws);
          } catch (error) {
            logger.error('Error parsing WebSocket message:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
        });
        
        ws.on('pong', () => {
          // Client responded to ping
          logger.debug('🔌 WebSocket client pong received', { clientId });
        });
        
        ws.on('close', (code, reason) => {
          this.handleDisconnect(clientId);
          logger.info('🔌 WebSocket client disconnected', { 
            clientId, 
            code, 
            reason: reason.toString(), 
            totalClients: this.clients.size 
          });
        });
        
        ws.on('error', (error) => {
          logger.error('WebSocket error:', error);
          this.handleDisconnect(clientId);
        });
      });
      
      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
      });
      
      logger.info('🔌 WebSocket server initialized');
    } catch (error) {
      logger.error('Failed to initialize WebSocket server:', error);
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleMessage(clientId, data, ws) {
    logger.info('🔌 WebSocket message received', { clientId, data });
    
    // Handle different message types
    switch (data.type) {
      case 'authenticate':
        // Client is authenticating with their user_id
        if (data.user_id) {
          const userIdStr = String(data.user_id);
          this.registerUser(clientId, userIdStr);
          this.sendToClient(clientId, { type: 'authenticated', user_id: userIdStr });
          logger.info('🔌 WebSocket client authenticated', { clientId, user_id: userIdStr });
        } else {
          this.sendToClient(clientId, { type: 'error', message: 'user_id required for authentication' });
        }
        break;
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
        break;
      case 'subscribe':
        // Handle subscription to specific channels
        this.sendToClient(clientId, { type: 'subscribed', channel: data.channel });
        break;
      case 'unsubscribe':
        // Handle unsubscription
        this.sendToClient(clientId, { type: 'unsubscribed', channel: data.channel });
        break;
      default:
        logger.info('Unknown message type:', data.type);
        this.sendToClient(clientId, { type: 'error', message: 'Unknown message type' });
    }
  }

  registerUser(clientId, userId) {
    // Convert userId to string for consistent storage
    const userIdStr = String(userId);
    // Add clientId to user's set of connections
    if (!this.userClients.has(userIdStr)) {
      this.userClients.set(userIdStr, new Set());
    }
    this.userClients.get(userIdStr).add(clientId);
  }

  handleDisconnect(clientId) {
    // Remove client from clients map
    this.clients.delete(clientId);
    
    // Remove clientId from all user mappings
    this.userClients.forEach((clientIds, userId) => {
      clientIds.delete(clientId);
      if (clientIds.size === 0) {
        this.userClients.delete(userId);
      }
    });
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    let successCount = 0;
    let errorCount = 0;
    
    this.clients.forEach((client, clientId) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error('Error sending message to client:', { clientId, error });
          this.clients.delete(clientId);
        }
      } else {
        // Remove closed connections
        this.clients.delete(clientId);
      }
    });
    
    logger.info('🔌 Message broadcasted to clients', { 
      message, 
      successCount,
      errorCount,
      totalClients: this.clients.size 
    });
  }

  broadcastToAdmins(message) {
    // For now, broadcast to all clients
    // In a real app, you'd filter by admin role
    this.broadcast(message);
  }

  // Cleanup method for graceful shutdown
  cleanup() {
    logger.info('🔌 Cleaning up WebSocket service...');
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.close(1000, 'Server shutting down');
        }
      } catch (error) {
        logger.error('Error closing client connection:', { clientId, error });
      }
    });
    
    // Clear clients map
    this.clients.clear();
    
    // Clear user clients map
    this.userClients.clear();
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close(() => {
        logger.info('🔌 WebSocket server closed');
      });
    }
  }

  // Get connection statistics
  getStats() {
    return {
      totalClients: this.clients.size,
      activeConnections: Array.from(this.clients.values()).filter(
        client => client.readyState === WebSocket.OPEN
      ).length
    };
  }

  notifyNewTicket(ticketData) {
    const notification = {
      _id: ticketData._id || ticketData.ticket_id,
      type: 'new_ticket',
      title: 'New Ticket Created',
      message: `Ticket ${ticketData.ticket_id} created by ${ticketData.client_name}`,
      ticket_id: ticketData.ticket_id,
      client_name: ticketData.client_name,
      created_at: new Date().toISOString(),
      is_read: false,
      data: ticketData
    };
    
    this.broadcastToAdmins(notification);
    logger.info('🔔 New ticket notification sent', { ticketData });
  }

  notifyTicketUpdate(ticketData) {
    const notification = {
      type: 'ticket_update',
      title: 'Ticket Updated',
      message: `Ticket ${ticketData.ticket_id} has been updated`,
      ticket_id: ticketData.ticket_id,
      client_name: ticketData.client_name,
      created_at: new Date().toISOString(),
      data: ticketData
    };
    
    this.broadcastToAdmins(notification);
    logger.info('🔔 Ticket update notification sent', { ticketData });
  }

  notifyNewMessage(ticketData, messageData) {
    const notification = {
      type: 'message_received',
      title: 'New Message Received',
      message: `New message in ticket ${ticketData.ticket_id}`,
      ticket_id: ticketData.ticket_id,
      client_name: ticketData.client_name,
      created_at: new Date().toISOString(),
      data: { ticket: ticketData, message: messageData }
    };
    
    this.broadcastToAdmins(notification);
    logger.info('🔔 New message notification sent', { ticketData, messageData });
  }

  // Send notification to a specific client by their MongoDB user_id
  sendNotificationToClient(userId, notification) {
    // Convert userId to string for consistent lookup
    const userIdStr = String(userId);
    const userClientIds = this.userClients.get(userIdStr);
    
    if (!userClientIds || userClientIds.size === 0) {
      logger.info('🔔 No active WebSocket connections for user', { userId: userIdStr });
      return false;
    }

    let successCount = 0;
    let errorCount = 0;
    const messageStr = JSON.stringify(notification);

    userClientIds.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
          successCount++;
        } catch (error) {
          errorCount++;
          logger.error('Error sending notification to client:', { clientId, userId, error });
          // Remove failed connection
          this.handleDisconnect(clientId);
        }
      } else {
        // Remove stale connection
        this.handleDisconnect(clientId);
      }
    });

    logger.info('🔔 Notification sent to client', { 
      userId, 
      successCount, 
      errorCount,
      notification_type: notification.type 
    });

    return successCount > 0;
  }

  // Alias for sendNotificationToClient — called by admin.js
  // Wraps notification in { type: 'notification', notification } so frontend bell picks it up
  notifyClient(userId, notification) {
    return this.sendNotificationToClient(String(userId), {
      type: 'notification',
      notification: notification
    });
  }

  // Send notification to multiple clients by their MongoDB user_ids
  notifyMultipleClients(userIds, notification) {
    let sentCount = 0;
    const wrapped = { type: 'notification', notification: notification };
    userIds.forEach(userId => {
      if (this.sendNotificationToClient(String(userId), wrapped)) {
        sentCount++;
      }
    });
    logger.info('🔔 Bulk notification sent', { targetCount: userIds.length, sentCount });
    return sentCount;
  }

  // Create persistent Notification document in DB AND send real-time via WebSocket
  async createAndNotify(userId, notificationData, senderInfo = {}) {
    try {
      const Notification = require('../models/Notification');
      const notification = await Notification.createNotification(userId, notificationData, senderInfo);
      this.sendNotificationToClient(String(userId), {
        type: 'notification',
        notification: notification
      });
      return notification;
    } catch (error) {
      logger.error('Error in createAndNotify:', { userId, error: error.message });
      return null;
    }
  }
}

module.exports = new WebSocketService();
