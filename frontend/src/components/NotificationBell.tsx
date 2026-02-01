import React, { useState, useEffect } from 'react';
import { Bell, X, AlertCircle, Clock, MessageSquare } from 'lucide-react';
import { adminService } from '../services/adminService';
import { formatDateTime } from '../utils/dateFormat';

interface Notification {
  _id: string;
  type: 'new_ticket' | 'ticket_update' | 'message_received' | 'wallet_recharge' | 'wallet_deduction';
  title: string;
  message: string;
  ticket_id?: string;
  client_name: string;
  created_at: string;
  is_read: boolean;
}

interface NotificationBellProps {
  onTicketClick?: (ticketId: string) => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ onTicketClick }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
    
    // Poll notifications from MongoDB (no WebSocket dependency)
    // Poll every 60 seconds to avoid rate limiting while keeping notifications fresh
    const interval = setInterval(fetchNotifications, 60000);
    
    return () => {
      clearInterval(interval);
    };
  }, []); // fetchNotifications is stable, no need to include in deps

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await adminService.getNotifications();
      if (response.success && response.data) {
        setNotifications(response.data.notifications || []);
        setUnreadCount(response.data.unread_count || 0);
      } else {
        console.error('Failed to fetch notifications:', response);
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await adminService.markNotificationAsRead(notificationId);
      setNotifications(prev => 
        (prev || []).map(notif => 
          notif._id === notificationId ? { ...notif, is_read: true } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, (prev || 0) - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await adminService.markAllNotificationsAsRead();
      setNotifications(prev => (prev || []).map(notif => ({ ...notif, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification._id);
    }
    if (onTicketClick && notification.ticket_id) {
      onTicketClick(notification.ticket_id);
    }
    setIsOpen(false);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_ticket':
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case 'ticket_update':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'message_received':
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'wallet_recharge':
        return <span className="text-lg">💰</span>;
      case 'wallet_deduction':
        return <span className="text-lg">💸</span>;
      default:
        return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <div className="text-sm text-gray-600 mt-2">Loading notifications...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <div className="text-sm">No notifications</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.map((notification) => (
                  <div
                    key={notification._id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.is_read ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {notification.client_name}
                          </span>
                          <span className="text-xs text-gray-400">
                            {notification.created_at ? formatDateTime(notification.created_at) : 'Unknown time'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={fetchNotifications}
                className="w-full text-sm text-blue-600 hover:text-blue-800 text-center"
              >
                Refresh notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
