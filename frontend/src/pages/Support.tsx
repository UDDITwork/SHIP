import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { ticketService, Ticket, TicketStatusCounts, TicketFilters } from '../services/ticketService';
import './Support.css';

type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'escalated' | 'resolved' | 'closed' | 'all';
type TicketTab = 'tickets' | 'training';

// Remove duplicate Ticket interface - using from ticketService

interface Category {
  value: string;
  label: string;
  description: string;
}

type ClientStatusCounts = TicketStatusCounts & {
  all: number;
};

const DEFAULT_STATUS_COUNTS: ClientStatusCounts = {
  open: 0,
  in_progress: 0,
  waiting_customer: 0,
  resolved: 0,
  closed: 0,
  escalated: 0,
  all: 0
};

const STATUS_TABS: Array<{ key: TicketStatus; label: string; icon: string }> = [
  { key: 'open', label: 'Open', icon: '📧' },
  { key: 'in_progress', label: 'In Progress', icon: '⏳' },
  { key: 'waiting_customer', label: 'Waiting Customer', icon: '🕒' },
  { key: 'escalated', label: 'Escalated', icon: '⚠️' },
  { key: 'resolved', label: 'Resolved', icon: '✅' },
  { key: 'closed', label: 'Closed', icon: '🔒' },
  { key: 'all', label: 'All', icon: '📋' }
];

const formatStatusLabel = (status: string) => {
  return status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

// Format date in DD/MM/YYYY format
const formatDate = (dateString: string | undefined) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const getStatusCount = (counts: ClientStatusCounts, status: TicketStatus) => {
  if (status === 'all') {
    return counts.all;
  }
  return counts[status] ?? 0;
};

const Support: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TicketTab>('tickets');
  const [activeStatus, setActiveStatus] = useState<TicketStatus>('open');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

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

  // Form state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [awbNumbers, setAwbNumbers] = useState('');
  const [comment, setComment] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Statistics
  const [stats, setStats] = useState<ClientStatusCounts>(DEFAULT_STATUS_COUNTS);

  const categories: Category[] = [
    {
      value: 'pickup_delivery',
      label: 'Pickup & Delivery',
      description: 'Pickup/delivery delay / RTO escalation, mismatch in tracking status, etc'
    },
    {
      value: 'shipment_ndr_rto',
      label: 'Shipment NDR & RTO',
      description: 'NDR reattempts, courier fake attempts, RTO requests'
    },
    {
      value: 'edit_shipment_info',
      label: 'Edit Shipment Info',
      description: 'Update in Address, pincode, phone, change payment type'
    },
    {
      value: 'shipment_dispute',
      label: 'Shipment Dispute',
      description: 'Issues related to delivered shipments, status mismatch, incorrect weight charged'
    },
    {
      value: 'finance',
      label: 'Finance',
      description: 'Remittance status, wallet management, recharge issues, plan upgrade/downgrade'
    },
    {
      value: 'billing_taxation',
      label: 'Billing & Taxation',
      description: 'Billing issue or request an account ledger statement, GST or TDS form'
    },
    {
      value: 'claims',
      label: 'Claims',
      description: 'Lost or damaged shipment, request a refund via bank transfer, or inquire about credit note'
    },
    {
      value: 'kyc_bank_verification',
      label: 'KYC & Bank Verification',
      description: 'Issues related to KYC and Bank Account verification'
    },
    {
      value: 'technical_support',
      label: 'Technical Support',
      description: 'Channel connection errors, order management, API auth errors, serviceability issues'
    },
    {
      value: 'others',
      label: 'Others',
      description: 'Enter your query'
    }
  ];

  // Categories that require AWB numbers
  const categoriesRequiringAWB = [
    'pickup_delivery',
    'shipment_ndr_rto',
    'edit_shipment_info',
    'shipment_dispute',
    'claims'
  ];

  // Check if current category requires AWB
  const requiresAWB = selectedCategory && categoriesRequiringAWB.includes(selectedCategory);

  // Ref for dropdown click-outside detection
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset AWB numbers and adjust form when category changes
  useEffect(() => {
    // Clear AWB numbers if switching to a category that doesn't require it
    if (!requiresAWB && awbNumbers.trim()) {
      setAwbNumbers('');
    }
  }, [requiresAWB, awbNumbers]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };

    if (showCategoryDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCategoryDropdown]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const filters: TicketFilters = {};
      if (activeStatus !== 'all') {
        filters.status = activeStatus;
      }
      const response = await ticketService.getTickets(filters);
      setTickets(response.tickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      // Use setToast directly to avoid stale closure
      setToast({ show: true, message: 'Failed to fetch tickets', type: 'error' });
      setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    } finally {
      setLoading(false);
    }
  }, [activeStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const statsResponse = await ticketService.getStats();
      const statusCounts = statsResponse?.status_counts ?? ({} as TicketStatusCounts);

      const mergedCounts: ClientStatusCounts = {
        ...DEFAULT_STATUS_COUNTS,
        ...statusCounts,
        all: Object.values(statusCounts).reduce((total, value) => {
          if (typeof value === 'number' && !Number.isNaN(value)) {
            return total + value;
          }
          return total;
        }, 0)
      };

      setStats(mergedCounts);
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats(DEFAULT_STATUS_COUNTS);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchStats();
  }, [fetchTickets, fetchStats]);

  useEffect(() => {
    const POLL_INTERVAL_MS = 30000;

    const intervalId = window.setInterval(() => {
      fetchTickets();
      fetchStats();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchTickets, fetchStats]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      // Validate file sizes
      const invalidFiles = files.filter(file => {
        if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) return true;
        if (file.type.startsWith('audio/') && file.size > 5 * 1024 * 1024) return true;
        if (file.type.startsWith('video/') && file.size > 5 * 1024 * 1024) return true;
        if (file.type.startsWith('application/') && file.size > 5 * 1024 * 1024) return true;
        return false;
      });

      if (invalidFiles.length > 0) {
        showToast('Some files exceed the size limit: Image: 2MB, Audio/Video/Document: 5MB', 'error');
        return;
      }

      setSelectedFiles(prev => [...prev, ...files].slice(0, 5)); // Max 5 files
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategory) {
      showToast('Please select a category', 'error');
      return;
    }

    if (!comment.trim()) {
      showToast('Please enter a detailed description of your query', 'error');
      return;
    }

    // Only validate AWB if category requires it
    if (requiresAWB) {
      if (!awbNumbers.trim()) {
        showToast('Please enter at least one AWB number for this category', 'error');
        return;
      }

      const awbArray = awbNumbers.split(',').map(s => s.trim()).filter(Boolean);
      if (awbArray.length === 0) {
        showToast('Please enter at least one valid AWB number', 'error');
        return;
      }
      if (awbArray.length > 10) {
        showToast('Maximum 10 AWB numbers allowed', 'error');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Only include AWB numbers if category requires it and they're provided
      const ticketData: any = {
        category: selectedCategory,
        comment: comment.trim(),
        files: selectedFiles
      };
      
      // Only add AWB numbers if category requires them
      if (requiresAWB && awbNumbers.trim()) {
        const awbArray = awbNumbers.split(',').map(s => s.trim()).filter(Boolean);
        if (awbArray.length > 0) {
          ticketData.awb_numbers = awbArray; // Send as array
        }
      }
      
      await ticketService.createTicket(ticketData);

      showToast('Ticket created successfully!', 'success');
      setShowCreateModal(false);
      resetForm();
      fetchTickets();
      fetchStats();

    } catch (error: any) {
      console.error('Error creating ticket:', error);
      // Show specific error message if available
      let errorMessage = error.response?.data?.message ||
                         (Array.isArray(error.response?.data?.errors) && error.response?.data?.errors?.[0]?.msg) ||
                         error.message ||
                         'Failed to create ticket. Please try again.';

      if (error.code === 'ECONNABORTED') {
        errorMessage = 'The request timed out. Please check your network or try uploading smaller attachments.';
      } else if (!error.response) {
        errorMessage = 'Unable to reach the server. Check your internet connection and try again.';
      }

      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory('');
    setAwbNumbers('');
    setComment('');
    setSelectedFiles([]);
    setShowCategoryDropdown(false);
  };

  return (
    <Layout>
      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✓' : '✕'}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast({ ...toast, show: false })}>×</button>
        </div>
      )}

      <div className="support-container">
        {/* Support Header */}
        <div className="support-header">
          <div className="support-contact-banner">
            <h3>Have a query ?</h3>
            <p>Connect us at +91 9636369672 | Email - support@shipsarthi.com</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="support-tabs">
          <button
            className={`support-tab ${activeTab === 'tickets' ? 'active' : ''}`}
            onClick={() => setActiveTab('tickets')}
          >
            📧 Tickets
          </button>
          <button
            className={`support-tab ${activeTab === 'training' ? 'active' : ''}`}
            onClick={() => setActiveTab('training')}
          >
            📚 Training
          </button>
        </div>

        {activeTab === 'tickets' && (
          <>
            {/* Status Tabs */}
            <div className="ticket-status-tabs">
              {STATUS_TABS.map((tab) => {
                const count = getStatusCount(stats, tab.key);
                return (
                  <button
                    key={tab.key}
                    className={`status-tab ${activeStatus === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveStatus(tab.key)}
                  >
                    {tab.icon} {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Filters and Actions */}
            <div className="ticket-filters">
              <div className="date-filter">
                <input type="date" /> to <input type="date" />
              </div>
              <div className="search-filters">
                <input type="text" placeholder="Search by AWB" className="search-input" />
                <input type="text" placeholder="Search by order id" className="search-input" />
              </div>
              <button className="raise-ticket-btn" onClick={() => setShowCreateModal(true)}>
                🎫 Raise Ticket
              </button>
              <button className="help-btn">🔄</button>
            </div>

            {/* Tickets Table */}
            <div className="tickets-table-container">
              <table className="tickets-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Category</th>
                    <th>Order Details</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Updated At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="loading-cell">Loading tickets...</td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="no-data-cell">
                        <div className="no-tickets">
                          <div className="no-tickets-icon">🎫</div>
                          <h3>No tickets found</h3>
                          <p>Create your first support ticket</p>
                          <button onClick={() => setShowCreateModal(true)}>Raise Ticket</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    tickets.map(ticket => (
                      <tr key={ticket._id}>
                        <td>{ticket.ticket_id}</td>
                        <td>{ticket.category}</td>
                        <td>{ticket.awb_numbers && ticket.awb_numbers.length > 0 ? ticket.awb_numbers.join(', ') : 'N/A'}</td>
                        <td>
                          <span className={`status-badge ${ticket.status}`}>
                            {formatStatusLabel(ticket.status)}
                          </span>
                        </td>
                        <td>{formatDate(ticket.createdAt || ticket.created_at)}</td>
                        <td>{formatDate(ticket.updatedAt || ticket.updated_at)}</td>
                        <td>
                          <button 
                            className="action-btn" 
                            onClick={() => window.location.href = `/support/tickets/${ticket._id}`}
                          >
                            View & Reply
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'training' && (
          <div className="training-content">
            <h2>Training Resources</h2>
            <p>Training materials coming soon...</p>
          </div>
        )}

        {/* Create Ticket Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setShowCategoryDropdown(false); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Raise Ticket</h2>
                <button className="close-btn" onClick={() => { setShowCreateModal(false); setShowCategoryDropdown(false); }}>×</button>
              </div>

              <form className="ticket-form" onSubmit={handleSubmit}>
                {/* Category Selection - Custom Dropdown with Descriptions */}
                <div className="form-group">
                  <label>
                    Select Category <span style={{ color: '#FF0000' }}>*</span>
                  </label>
                  <div className="custom-category-dropdown" ref={dropdownRef}>
                    <div
                      className={`category-dropdown-trigger ${showCategoryDropdown ? 'open' : ''}`}
                      onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    >
                      {selectedCategory ? (
                        <div className="selected-category-display">
                          <span className="selected-label">{categories.find(c => c.value === selectedCategory)?.label}</span>
                          <span className="selected-desc">{categories.find(c => c.value === selectedCategory)?.description}</span>
                        </div>
                      ) : (
                        <span className="placeholder-text">Select Category</span>
                      )}
                      <span className="dropdown-arrow">{showCategoryDropdown ? '▲' : '▼'}</span>
                    </div>
                    {showCategoryDropdown && (
                      <div className="category-dropdown-menu">
                        {categories.map(cat => (
                          <div
                            key={cat.value}
                            className={`category-dropdown-item ${selectedCategory === cat.value ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedCategory(cat.value);
                              setShowCategoryDropdown(false);
                              // Reset AWB numbers when category changes to one that doesn't require it
                              const newRequiresAWB = cat.value && categoriesRequiringAWB.includes(cat.value);
                              if (!newRequiresAWB) {
                                setAwbNumbers('');
                              }
                            }}
                          >
                            <span className="item-label">{cat.label}</span>
                            <span className="item-description">{cat.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* AWB Numbers - Only show for categories that require it */}
                {requiresAWB && (
                  <div className="form-group">
                    <label>
                      AWB Numbers (Separated with Comma) <span style={{ color: '#FF0000' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter AWB numbers (e.g., AWB123456, AWB789012)"
                      value={awbNumbers}
                      onChange={(e) => setAwbNumbers(e.target.value)}
                      required={requiresAWB}
                    />
                    <small>Only 10 AWB numbers can be entered at a time. Separate multiple AWB numbers with commas.</small>
                  </div>
                )}

                {/* Comment/Description */}
                <div className="form-group">
                  <label>
                    Description <span style={{ color: '#FF0000' }}>*</span>
                  </label>
                  <textarea
                    placeholder={
                      requiresAWB 
                        ? "Enter detailed description of your query regarding the shipment(s). Include any specific issues, dates, or relevant details..."
                        : "Please provide a detailed description of your query, issue, or request. Include all relevant information such as dates, amounts, reference numbers, or any other details that will help us assist you better..."
                    }
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={5000}
                    rows={6}
                    required
                    style={{ minHeight: '120px' }}
                  />
                  <small>
                    {comment.length}/5000 characters. 
                    {!requiresAWB && ' For queries without AWB numbers, please include all relevant details, dates, amounts, or reference numbers.'}
                    {requiresAWB && ' Please describe the issue with the shipment(s) in detail.'}
                  </small>
                </div>

                {/* File Attachment */}
                <div className="form-group">
                  <label>Attach File</label>
                  <div className="file-upload-container">
                    <input
                      type="file"
                      id="file-upload"
                      multiple
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="file-upload" className="file-upload-btn">
                      <span>Select file</span>
                      <span className="upload-icon">☁️</span>
                    </label>
                  </div>
                  <small>Max file size: Image - 2MB, Audio - 5MB, Video - 5MB, Document - 5MB</small>

                  {/* Selected Files */}
                  {selectedFiles.length > 0 && (
                    <div className="selected-files">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="file-item">
                          <span>{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                          <button type="button" onClick={() => removeFile(index)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>

            {/* Category Sidebar */}
            {!selectedCategory && (
              <div className="category-sidebar">
                {categories.map(cat => (
                  <div
                    key={cat.value}
                    className="category-card"
                    onClick={() => setSelectedCategory(cat.value)}
                  >
                    <h4>{cat.label}</h4>
                    <p>{cat.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Support;