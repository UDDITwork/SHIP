import React, { useState, useEffect } from 'react';
import { adminService, AdminClient } from '../services/adminService';
import './AdminNotifications.css';

interface SentNotification {
  bulk_send_id: string;
  heading: string;
  message: string;
  sent_count: number;
  created_at: string;
}

const AdminNotifications: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

  // Compose form state
  const [heading, setHeading] = useState('');
  const [message, setMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'bulk_announcement' | 'kyc_update'>('bulk_announcement');
  const [recipientMode, setRecipientMode] = useState<'all' | 'kyc_pending' | 'manual'>('all');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loadingClients, setLoadingClients] = useState(false);

  // History state
  const [history, setHistory] = useState<SentNotification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (recipientMode === 'manual' || recipientMode === 'kyc_pending') {
      fetchClients();
    }
  }, [recipientMode]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const params: any = { limit: 200 };
      if (recipientMode === 'kyc_pending') {
        params.status = 'pending_verification';
      }
      const response = await adminService.getClients(params);
      setClients(response.data.clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoadingClients(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await adminService.getNotifications();
      setHistory((response.data.notifications || []).slice(0, 50));
    } catch (error) {
      console.error('Error fetching notification history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    if (!heading.trim() || !message.trim()) {
      setSendResult({ success: false, message: 'Heading and message are required' });
      return;
    }

    let clientIds: string[] = [];

    if (recipientMode === 'all') {
      // Fetch all client IDs
      try {
        const response = await adminService.getClients({ limit: 1000 });
        clientIds = (response.data.clients || []).map((c: AdminClient) => c._id);
      } catch {
        setSendResult({ success: false, message: 'Failed to fetch client list' });
        return;
      }
    } else if (recipientMode === 'kyc_pending') {
      clientIds = clients.filter(c => c.kyc_status?.status === 'pending').map(c => c._id);
    } else {
      clientIds = selectedClients;
    }

    if (clientIds.length === 0) {
      setSendResult({ success: false, message: 'No recipients selected' });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const response = await adminService.sendBulkNotification({
        heading,
        message,
        notification_type: notificationType,
        recipients: {
          selection_type: 'manual',
          client_ids: clientIds
        }
      });

      setSendResult({
        success: true,
        message: `Notification sent to ${response.data?.sent || clientIds.length} clients`
      });
      setHeading('');
      setMessage('');
      setSelectedClients([]);
    } catch (error: any) {
      setSendResult({
        success: false,
        message: error.message || 'Failed to send notification'
      });
    } finally {
      setSending(false);
    }
  };

  const toggleClient = (clientId: string) => {
    setSelectedClients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = filteredClients.map(c => c._id);
    setSelectedClients(prev => {
      const combined = new Set([...prev, ...visibleIds]);
      return Array.from(combined);
    });
  };

  const deselectAll = () => {
    setSelectedClients([]);
  };

  const filteredClients = clients.filter(c => {
    if (!clientSearch) return true;
    const search = clientSearch.toLowerCase();
    return (
      c.company_name?.toLowerCase().includes(search) ||
      c.client_id?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    );
  });

  const kycTemplates = [
    {
      heading: 'Complete Your KYC Verification',
      message: 'Please upload your pending KYC documents to continue using Shipsarthi services. Go to Settings > KYC to upload your documents.'
    },
    {
      heading: 'KYC Documents Required',
      message: 'Your account requires KYC verification. Please submit your GST certificate, PAN card, and Aadhaar for verification.'
    }
  ];

  return (
    <div className="admin-notifications-page">
      <div className="page-header">
        <h1>Notifications</h1>
        <p>Send notifications to clients</p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'compose' ? 'active' : ''}`}
          onClick={() => setActiveTab('compose')}
        >
          Compose
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Sent History
        </button>
      </div>

      {activeTab === 'compose' && (
        <div className="compose-section">
          {/* Notification Type */}
          <div className="form-group">
            <label>Notification Type</label>
            <select
              value={notificationType}
              onChange={(e) => setNotificationType(e.target.value as any)}
            >
              <option value="bulk_announcement">General Announcement</option>
              <option value="kyc_update">KYC Reminder</option>
            </select>
          </div>

          {/* Quick Templates for KYC */}
          {notificationType === 'kyc_update' && (
            <div className="templates-section">
              <label>Quick Templates</label>
              <div className="template-list">
                {kycTemplates.map((template, idx) => (
                  <button
                    key={idx}
                    className="template-btn"
                    onClick={() => {
                      setHeading(template.heading);
                      setMessage(template.message);
                    }}
                  >
                    {template.heading}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Heading */}
          <div className="form-group">
            <label>Heading *</label>
            <input
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="Notification heading"
              maxLength={200}
            />
          </div>

          {/* Message */}
          <div className="form-group">
            <label>Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notification message"
              rows={4}
              maxLength={1000}
            />
            <span className="char-count">{message.length}/1000</span>
          </div>

          {/* Recipients */}
          <div className="form-group">
            <label>Recipients</label>
            <div className="recipient-modes">
              <label className="radio-label">
                <input
                  type="radio"
                  name="recipientMode"
                  checked={recipientMode === 'all'}
                  onChange={() => setRecipientMode('all')}
                />
                All Clients
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="recipientMode"
                  checked={recipientMode === 'kyc_pending'}
                  onChange={() => setRecipientMode('kyc_pending')}
                />
                KYC Pending Clients
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="recipientMode"
                  checked={recipientMode === 'manual'}
                  onChange={() => setRecipientMode('manual')}
                />
                Select Manually
              </label>
            </div>
          </div>

          {/* Client Selection */}
          {(recipientMode === 'manual' || recipientMode === 'kyc_pending') && (
            <div className="client-selection">
              <div className="client-selection-header">
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="client-search"
                />
                <div className="selection-actions">
                  <button onClick={selectAllVisible} className="action-btn">Select All</button>
                  <button onClick={deselectAll} className="action-btn">Clear</button>
                  <span className="selected-count">{selectedClients.length} selected</span>
                </div>
              </div>

              {loadingClients ? (
                <div className="loading">Loading clients...</div>
              ) : (
                <div className="client-list">
                  {filteredClients.map(client => (
                    <label key={client._id} className="client-item">
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client._id)}
                        onChange={() => toggleClient(client._id)}
                      />
                      <div className="client-info">
                        <span className="client-name">{client.company_name}</span>
                        <span className="client-detail">{client.client_id} | {client.email}</span>
                        {client.kyc_status && (
                          <span className={`kyc-badge ${client.kyc_status.status}`}>
                            KYC: {client.kyc_status.status}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                  {filteredClients.length === 0 && (
                    <div className="no-clients">No clients found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Send Result */}
          {sendResult && (
            <div className={`send-result ${sendResult.success ? 'success' : 'error'}`}>
              {sendResult.message}
            </div>
          )}

          {/* Send Button */}
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={sending || !heading.trim() || !message.trim()}
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-section">
          {loadingHistory ? (
            <div className="loading">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="no-history">No notifications sent yet</div>
          ) : (
            <div className="history-list">
              {history.map((item, idx) => (
                <div key={idx} className="history-item">
                  <div className="history-item-header">
                    <h4>{item.heading || 'Notification'}</h4>
                    <span className="history-date">
                      {new Date(item.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="history-message">{item.message || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
