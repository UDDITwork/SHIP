import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const response = await notificationService.getNotifications(1, 20);
      const sorted = notificationService.sortNotifications(response.notifications || []);
      setNotifications(sorted);
      setUnreadCount(response.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);

    // Real-time: listen for WebSocket notifications
    const unsubscribe = notificationService.subscribe((wsMessage: any) => {
      if (wsMessage.type === 'notification' && wsMessage.notification) {
        setNotifications(prev => {
          const newList = [wsMessage.notification, ...prev].slice(0, 20);
          return notificationService.sortNotifications(newList);
        });
        setUnreadCount(prev => prev + 1);
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchNotifications]);

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

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
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

  // "View" button — mark as read + navigate to related entity
  const handleViewClick = (notification: Notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification._id);
      setNotifications(prev =>
        prev.map(n => n._id === notification._id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setIsOpen(false);

    // Navigate based on related entity type
    const entity = notification.related_entity;
    if (entity) {
      switch (entity.entity_type) {
        case 'kyc':
          navigate('/settings');
          break;
        case 'ticket':
          navigate(entity.entity_id ? `/support/tickets/${entity.entity_id}` : '/support');
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

  // "X" (dismiss) button — mark as read + remove from list (no navigation)
  const handleDismissClick = (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation();
    if (!notification.is_read) {
      handleMarkAsRead(notification._id);
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    // Remove from visible list
    setNotifications(prev => prev.filter(n => n._id !== notification._id));
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
            {loading && notifications.length === 0 ? (
              <div className="cnb-loading">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="cnb-empty">No notifications</div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification._id}
                  className={`cnb-item ${!notification.is_read ? 'unread' : ''}`}
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
                  <div className="cnb-item-actions">
                    <button
                      className="cnb-view-btn"
                      onClick={() => handleViewClick(notification)}
                      title="View"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </button>
                    <button
                      className="cnb-dismiss-btn"
                      onClick={(e) => handleDismissClick(e, notification)}
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
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
