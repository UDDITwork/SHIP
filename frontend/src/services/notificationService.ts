import { environmentConfig } from '../config/environment';
import apiService from './api';

// Notification Interface
export interface Notification {
  _id: string;
  recipient_id: string;
  sender_type: 'admin' | 'staff' | 'system';
  sender_id?: string;
  sender_name: string;
  notification_type:
    | 'bulk_announcement'
    | 'client_comment'
    | 'kyc_update'
    | 'wallet_recharge'
    | 'ticket_update'
    | 'billing_generated'
    | 'order_update'
    | 'category_change'
    | 'general';
  heading: string;
  message: string;
  is_read: boolean;
  read_at?: string;
  related_entity?: {
    entity_type: 'ticket' | 'kyc' | 'invoice' | 'wallet' | 'order' | 'none';
    entity_id?: string;
  };
  bulk_send_id?: string;
  delivery_status: 'pending' | 'sent' | 'failed';
  websocket_sent: boolean;
  created_at: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationResponse {
  notifications: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  unread_count: number;
}

class NotificationService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000;
  private listeners: Array<(notification: any) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private userId: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;
  private isConnecting = false; // Prevent concurrent connection attempts
  private lastConnectionAttempt = 0;
  private connectionThrottleMs = 1000; // Throttle connection attempts
  private isConnected = false; // Track connection state

  connect(userId?: string) {
    // Throttle connection attempts to prevent rapid-fire reconnects
    const now = Date.now();
    if (now - this.lastConnectionAttempt < this.connectionThrottleMs) {
      console.log('🔌 Connection attempt throttled');
      return;
    }
    this.lastConnectionAttempt = now;

    // Prevent multiple connections - check all states
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        console.log('🔌 WebSocket already connected or connecting, state:', state);
        // Update userId if connection is open but userId changed
        if (state === WebSocket.OPEN && userId && this.userId !== userId) {
          this.userId = userId;
          this.ws.send(JSON.stringify({
            type: 'authenticate',
            user_id: userId
          }));
        }
        return;
      }
      
      // Connection is closed or closing, clean it up
      if (state === WebSocket.CLOSING || state === WebSocket.CLOSED) {
        this.ws = null;
      } else {
        // Clean up existing connection
        try {
          this.ws.close();
        } catch (e) {
          // Ignore errors during cleanup
        }
        this.ws = null;
      }
    }

    // Prevent concurrent connection attempts
    if (this.isConnecting) {
      console.log('🔌 Connection attempt already in progress');
      return;
    }
    
    // Clear any pending reconnect attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.isManualDisconnect = false;
    this.isConnecting = true;
    
    // Store user ID for reconnection
    if (userId) {
      this.userId = userId;
    }
    
    const wsUrl = environmentConfig.wsUrl;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('🔌 WebSocket connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.isConnected = true;
        
        // Notify connection listeners
        this.connectionListeners.forEach(listener => listener(true));
        
        // Authenticate with user ID if available
        if (this.userId) {
          this.ws?.send(JSON.stringify({
            type: 'authenticate',
            user_id: this.userId
          }));
          console.log('🔌 WebSocket authentication sent', { user_id: this.userId });
        }
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle authentication response
          if (data.type === 'authenticated') {
            console.log('🔌 WebSocket authenticated successfully', { user_id: data.user_id });
            return;
          }
          
          // Handle other notifications
          this.listeners.forEach(listener => listener(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onclose = (event) => {
        // Enhanced disconnect reason logging
        const disconnectReasons: { [key: number]: string } = {
          1000: 'Normal Closure',
          1001: 'Going Away (tab close/navigation/network switch)',
          1005: 'No Status Received (abnormal closure)',
          1006: 'Abnormal Closure (no close frame)',
          1009: 'Message Too Big',
          1011: 'Server Error'
        };
        
        const reasonText = disconnectReasons[event.code] || event.reason || 'Unknown';
        
        console.log('🔌 WebSocket disconnected', {
          code: event.code,
          reason: reasonText,
          wasClean: event.wasClean,
          userId: this.userId ? 'present' : 'missing',
          isManual: this.isManualDisconnect,
          timestamp: new Date().toISOString()
        });
        
        // Clear the connection reference and connecting flag
        this.ws = null;
        this.isConnecting = false;
        this.isConnected = false;
        
        // Notify connection listeners
        this.connectionListeners.forEach(listener => listener(false));
        
        // Don't reconnect if manually disconnected
        if (this.isManualDisconnect) {
          console.log('🔌 Manual disconnect - not reconnecting');
          return;
        }
        
        // For code 1000 (normal closure) - don't reconnect, it's intentional
        if (event.code === 1000) {
          console.log('🔌 Normal closure - not auto-reconnecting');
          this.reconnectAttempts = 0;
          return;
        }
        
        // REMOVED: Skip reconnection for code 1001
        // Code 1001 can happen due to tab suspension, network switches, etc.
        // We should ALWAYS attempt reconnect if userId exists and it's not manual
        
        // For ALL disconnect codes (except 1000 which is intentional), attempt reconnect
        // This handles code 1001 (tab suspension, network changes) and abnormal closures
        if (this.userId && !this.isManualDisconnect) {
          console.log(`🔄 Will attempt reconnect in 3s (code: ${event.code}, reason: ${reasonText})`);
          
          // Clear any existing timeout
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
          }
          
          // Reconnect after delay - gives network time to stabilize
          this.reconnectTimeout = setTimeout(() => {
            if (!this.ws && !this.isConnecting && this.userId && !this.isManualDisconnect) {
              console.log(`🔄 Attempting reconnect after disconnect (code: ${event.code})...`);
              this.reconnect();
            }
          }, 3000); // 3 second delay
        } else {
          console.log('🔌 Not reconnecting - no userId or manual disconnect');
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('🔌 WebSocket error:', error);
        this.isConnecting = false;
        // Connection will be handled by onclose event
      };
      
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.isConnecting = false;
    }
  }

  disconnect() {
    this.isManualDisconnect = true;
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close connection
    if (this.ws) {
      try {
        this.ws.close(1000, 'Manual disconnect');
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    
    // Reset reconnect attempts
    this.reconnectAttempts = 0;
  }

  private reconnect() {
    // Don't reconnect if manually disconnected
    if (this.isManualDisconnect) {
      console.log('🔌 Reconnect cancelled - manual disconnect');
      return;
    }
    
    // Don't reconnect if already connected or connecting
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('🔌 Already connected/connecting - skipping reconnect');
      return;
    }

    // Prevent concurrent reconnect attempts
    if (this.isConnecting) {
      console.log('🔌 Already attempting to connect - skipping reconnect');
      return;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔌 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      // Clear any existing timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      
      this.reconnectTimeout = setTimeout(() => {
        // Double-check before connecting
        if (!this.isManualDisconnect && this.userId) {
          this.connect(this.userId);
        }
      }, this.reconnectInterval);
    } else {
      console.error('🔌 Max reconnection attempts reached');
      // Reset after a longer delay before trying again
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts = 0;
        if (this.userId && !this.isManualDisconnect) {
          this.connect(this.userId);
        }
      }, 60000); // Wait 1 minute before resetting attempts
    }
  }

  subscribe(listener: (notification: any) => void) {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Subscribe to connection state changes
  onConnectionChange(listener: (connected: boolean) => void) {
    this.connectionListeners.push(listener);
    
    // Immediately notify of current state
    listener(this.isConnected);
    
    // Return unsubscribe function
    return () => {
      const index = this.connectionListeners.indexOf(listener);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  // Get current connection state
  getConnectionState(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    }
  }

  // ========================================
  // API METHODS (for fetching/managing notifications)
  // ========================================

  /**
   * Get notifications for current user
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 20)
   * @param unreadOnly - Show only unread notifications (default: false)
   */
  async getNotifications(
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ): Promise<NotificationResponse> {
    const response = await apiService.get('/notifications', {
      params: {
        page,
        limit,
        unread_only: unreadOnly
      }
    });
    return response.data.data;
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const response = await apiService.get('/notifications/unread-count');
    return response.data.data.unread_count;
  }

  /**
   * Mark a notification as read
   * @param notificationId - Notification ID
   */
  async markAsRead(notificationId: string): Promise<Notification> {
    const response = await apiService.patch(`/notifications/${notificationId}/read`);
    return response.data.data;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ modified_count: number }> {
    const response = await apiService.patch('/notifications/mark-all-read');
    return response.data.data;
  }

  /**
   * Delete a notification
   * @param notificationId - Notification ID
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await apiService.delete(`/notifications/${notificationId}`);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get notification icon based on type
   * @param type - Notification type
   */
  getNotificationIcon(type: Notification['notification_type']): string {
    const iconMap: Record<Notification['notification_type'], string> = {
      bulk_announcement: '📢',
      client_comment: '💬',
      kyc_update: '📋',
      wallet_recharge: '💰',
      ticket_update: '🎫',
      billing_generated: '🧾',
      order_update: '📦',
      category_change: '🏷️',
      general: '🔔'
    };
    return iconMap[type] || '🔔';
  }

  /**
   * Get notification color based on type
   * @param type - Notification type
   */
  getNotificationColor(type: Notification['notification_type']): string {
    const colorMap: Record<Notification['notification_type'], string> = {
      bulk_announcement: '#002B59', // Navy
      client_comment: '#21B5B5', // Teal
      kyc_update: '#F68723', // Orange
      wallet_recharge: '#10b981', // Green
      ticket_update: '#3b82f6', // Blue
      billing_generated: '#8b5cf6', // Purple
      order_update: '#06b6d4', // Cyan
      category_change: '#f59e0b', // Amber
      general: '#6b7280' // Gray
    };
    return colorMap[type] || '#6b7280';
  }

  /**
   * Format relative time (e.g., "2 hours ago")
   * @param dateString - ISO date string
   */
  formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
  }

  /**
   * Get notification priority (for sorting/filtering)
   * @param notification - Notification object
   */
  getNotificationPriority(notification: Notification): number {
    const priorityMap: Record<Notification['notification_type'], number> = {
      kyc_update: 1, // Highest priority
      wallet_recharge: 2,
      billing_generated: 3,
      ticket_update: 4,
      order_update: 5,
      category_change: 6,
      client_comment: 7,
      bulk_announcement: 8,
      general: 9 // Lowest priority
    };
    return priorityMap[notification.notification_type] || 9;
  }

  /**
   * Sort notifications by priority and date
   * @param notifications - Array of notifications
   */
  sortNotifications(notifications: Notification[]): Notification[] {
    return notifications.sort((a, b) => {
      // Unread first
      if (a.is_read !== b.is_read) {
        return a.is_read ? 1 : -1;
      }
      // Then by priority
      const priorityDiff = this.getNotificationPriority(a) - this.getNotificationPriority(b);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      // Finally by date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
}

export const notificationService = new NotificationService();
