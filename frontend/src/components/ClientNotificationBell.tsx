import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService, Notification } from '../services/notificationService';
import './ClientNotificationBell.css';

const ClientNotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await notificationService.getNotifications(1, 20);
      const sorted = notificationService.sortNotifications(response.notifications || []);
      setNotifications(sorted);
      setUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification._id);
    }
    setIsOpen(false);

    // Navigate based on notification type
    const entity = notification.related_entity;
    if (entity) {
      switch (entity.entity_type) {
        case 'kyc':
          navigate('/settings');
          break;
        case 'ticket':
          navigate(`/support${entity.entity_id ? `/${entity.entity_id}` : ''}`);
          break;
        case 'invoice':
          navigate('/invoices');
          break;
        case 'wallet':
          navigate('/billing');
          break;
        case 'order':
          navigate(`/orders${entity.entity_id ? `/${entity.entity_id}` : ''}`);
          break;
        default:
          navigate('/notifications');
      }
    } else {
      navigate('/notifications');
    }
  };

  const getCategoryLabel = (type: Notification['notification_type']): string => {
    switch (type) {
      case 'kyc_update': return 'KYC';
      case 'ticket_update':
      case 'client_comment': return 'Tickets';
      case 'billing_generated': return 'Billing';
      case 'wallet_recharge': return 'Wallet';
      case 'order_update': return 'Orders';
      case 'category_change': return 'Account';
      case 'bulk_announcement': return 'Announcement';
      default: return 'Update';
    }
  };

  const getCategoryColor = (type: Notification['notification_type']): string => {
    return notificationService.getNotificationColor(type);
  };

  return (
    <div className="cnb-container" ref={dropdownRef}>
      <button
        className="cnb-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && (
          <span className="cnb-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="cnb-dropdown">
          <div className="cnb-header">
            <h3>Notifications</h3>
            <div className="cnb-header-actions">
              {unreadCount > 0 && (
                <button className="cnb-mark-all" onClick={handleMarkAllAsRead}>
                  Mark all read
                </button>
              )}
              <button className="cnb-close" onClick={() => setIsOpen(false)}>×</button>
            </div>
          </div>

          <div className="cnb-list">
            {loading ? (
              <div className="cnb-loading">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="cnb-empty">No notifications</div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification._id}
                  className={`cnb-item ${!notification.is_read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="cnb-item-icon" style={{ backgroundColor: getCategoryColor(notification.notification_type) }}>
                    {notificationService.getNotificationIcon(notification.notification_type)}
                  </div>
                  <div className="cnb-item-content">
                    <div className="cnb-item-top">
                      <span className="cnb-item-category" style={{ color: getCategoryColor(notification.notification_type) }}>
                        {getCategoryLabel(notification.notification_type)}
                      </span>
                      <span className="cnb-item-time">
                        {notificationService.formatRelativeTime(notification.created_at)}
                      </span>
                    </div>
                    <p className="cnb-item-heading">{notification.heading}</p>
                    <p className="cnb-item-message">{notification.message}</p>
                  </div>
                  {!notification.is_read && <div className="cnb-unread-dot"></div>}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="cnb-footer">
              <button className="cnb-view-all" onClick={() => { setIsOpen(false); navigate('/notifications'); }}>
                View All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientNotificationBell;
