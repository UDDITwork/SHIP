import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { notificationService, Notification } from '../services/notificationService';
import './Notifications.css';

type NotificationFilter = 'all' | 'unread';

const Notifications: React.FC = () => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Toast notification state
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const unreadOnly = filter === 'unread';
      const response = await notificationService.getNotifications(page, limit, unreadOnly);

      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
      setTotalPages(response.pagination.pages);
      setTotal(response.pagination.total);
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      showToast(error.response?.data?.message || 'Error fetching notifications', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Handle filter change
  const handleFilterChange = (newFilter: NotificationFilter) => {
    setFilter(newFilter);
    setPage(1);
  };

  // Handle mark as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);

      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          notif._id === notificationId
            ? { ...notif, is_read: true, read_at: new Date().toISOString() }
            : notif
        )
      );

      setUnreadCount(prev => Math.max(0, prev - 1));
      showToast('Notification marked as read', 'success');
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
      showToast(error.response?.data?.message || 'Error marking notification as read', 'error');
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      const result = await notificationService.markAllAsRead();

      // Update local state
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, is_read: true, read_at: new Date().toISOString() }))
      );

      setUnreadCount(0);
      showToast(`${result.modified_count} notifications marked as read`, 'success');
    } catch (error: any) {
      console.error('Error marking all as read:', error);
      showToast(error.response?.data?.message || 'Error marking all as read', 'error');
    }
  };

  // Handle delete notification
  const handleDeleteNotification = async (notificationId: string) => {
    if (!window.confirm('Are you sure you want to delete this notification?')) {
      return;
    }

    try {
      await notificationService.deleteNotification(notificationId);

      // Update local state
      const deletedNotif = notifications.find(n => n._id === notificationId);
      setNotifications(prev => prev.filter(notif => notif._id !== notificationId));

      if (deletedNotif && !deletedNotif.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }

      setTotal(prev => prev - 1);
      showToast('Notification deleted', 'success');
    } catch (error: any) {
      console.error('Error deleting notification:', error);
      showToast(error.response?.data?.message || 'Error deleting notification', 'error');
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      handleMarkAsRead(notification._id);
    }
  };

  // Pagination controls
  const handlePreviousPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      setPage(page + 1);
    }
  };

  return (
    <Layout>
      <div className="notifications-container">
        {/* Header */}
        <div className="notifications-header">
          <h1 className="notifications-title">Notifications</h1>
          <button
            className="mark-all-read-btn"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark All as Read
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            All ({total})
          </button>
          <button
            className={`filter-tab ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => handleFilterChange('unread')}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Notifications List */}
        <div className="notifications-list">
          {loading ? (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔔</div>
              <h3>No {filter === 'unread' ? 'unread' : ''} notifications</h3>
              <p>{filter === 'unread' ? "You're all caught up!" : "You haven't received any notifications yet."}</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification._id}
                className={`notification-card ${!notification.is_read ? 'unread' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                {/* Unread Badge */}
                {!notification.is_read && <div className="unread-badge"></div>}

                {/* Notification Icon */}
                <div
                  className="notification-icon"
                  style={{ backgroundColor: notificationService.getNotificationColor(notification.notification_type) }}
                >
                  {notificationService.getNotificationIcon(notification.notification_type)}
                </div>

                {/* Notification Content */}
                <div className="notification-content">
                  <div className="notification-header-row">
                    <h3 className="notification-heading">{notification.heading}</h3>
                    <span className="notification-time">
                      {notificationService.formatRelativeTime(notification.created_at)}
                    </span>
                  </div>

                  <p className="notification-message">{notification.message}</p>

                  <div className="notification-footer">
                    <span className="notification-sender">
                      From: {notification.sender_name}
                    </span>
                    <span className="notification-type-badge">
                      {notification.notification_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="notification-actions">
                  {!notification.is_read && (
                    <button
                      className="action-btn mark-read-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notification._id);
                      }}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    className="action-btn delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNotification(notification._id);
                    }}
                    title="Delete notification"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={handlePreviousPage}
              disabled={page === 1}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {page} of {totalPages}
            </span>
            <button
              className="pagination-btn"
              onClick={handleNextPage}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        )}

        {/* Toast Notification */}
        {toast.show && (
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Notifications;
