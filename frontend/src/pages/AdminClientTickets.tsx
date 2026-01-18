import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Phone, Mail, Building, Filter, Search, Send, Paperclip } from 'lucide-react';
import { adminService, AdminTicket, AdminClient } from '../services/adminService';
import './AdminClientTickets.css';

// Format date in DD/MM/YYYY format
const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Format date with time in DD/MM/YYYY, HH:MM AM/PM format
const formatDateTime = (dateString: string | undefined | null): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${day}/${month}/${year}, ${hour12}:${minutes} ${ampm}`;
};

const AdminClientTickets: React.FC = () => {
  const { clientId, ticketId } = useParams<{ clientId: string; ticketId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [client, setClient] = useState<AdminClient | null>(null);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<AdminTicket | null>(null);
  const [stats, setStats] = useState<{
    total_tickets: number;
    status_breakdown: { [key: string]: number };
    status_counts?: { [key: string]: number };
  } | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters and pagination
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    category: searchParams.get('category') || '',
    search: searchParams.get('search') || '',
    priority: searchParams.get('priority') || '',
    page: parseInt(searchParams.get('page') || '1'),
    limit: 10
  });
  
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalTickets: 0,
    hasNext: false,
    hasPrev: false
  });
  
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statusDraft, setStatusDraft] = useState<AdminTicket['status'] | ''>('');
  const [priorityDraft, setPriorityDraft] = useState<AdminTicket['priority']>('medium');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Fetch selected ticket details when ticketId changes
  useEffect(() => {
    if (ticketId && clientId) {
      fetchTicketDetails(ticketId);
    } else {
      setSelectedTicket(null);
    }
  }, [ticketId, clientId]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.search) params.set('search', filters.search);
    if (filters.page > 1) params.set('page', filters.page.toString());
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  const fetchClientDetails = useCallback(async () => {
    try {
      const clientData = await adminService.getClientDetails(clientId!);
      setClient(clientData);
    } catch (err: any) {
      console.error('Error fetching client details:', err);
      setError(err.message || 'Failed to fetch client details');
    }
  }, [clientId]);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await adminService.getClientTickets(clientId!, {
        page: filters.page,
        limit: filters.limit,
        status: filters.status || undefined,
        category: filters.category || undefined,
        priority: filters.priority || undefined
      });
      
      // Filter by search query on client side if provided
      let filteredTickets = response.data.tickets;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredTickets = filteredTickets.filter(ticket =>
          ticket.subject?.toLowerCase().includes(searchLower) ||
          ticket.ticket_id?.toLowerCase().includes(searchLower) ||
          ticket.description?.toLowerCase().includes(searchLower)
        );
      }

      if (filters.priority) {
        filteredTickets = filteredTickets.filter(ticket => ticket.priority === filters.priority);
      }
      
      setTickets(filteredTickets);
      setStats(response.data.stats);
      setPagination(response.data.pagination);
      
      // If ticketId is in URL but ticket not found, clear it
      if (ticketId && !filteredTickets.find(t => t._id === ticketId)) {
        navigate(`/admin/clients/${clientId}/tickets`, { replace: true });
      }
    } catch (err: any) {
      console.error('Error fetching tickets:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  }, [clientId, filters, navigate, ticketId]);

  const fetchTicketDetails = async (ticketIdParam: string) => {
    try {
      const response = await adminService.getTicketDetails(ticketIdParam);
      setSelectedTicket(response.data);
      setStatusDraft(response.data.status);
      setPriorityDraft(response.data.priority);
    } catch (err: any) {
      console.error('Error fetching ticket details:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch ticket details');
    }
  };

  const handleTicketSelect = (ticket: AdminTicket) => {
    navigate(`/admin/clients/${clientId}/tickets/${ticket._id}`);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleSearch = (searchTerm: string) => {
    setFilters(prev => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sendMessage = async (ticketIdParam: string) => {
    if (!newMessage.trim() && selectedFiles.length === 0) return;

    try {
      setSendingMessage(true);

      await adminService.sendTicketMessage(ticketIdParam, newMessage, false, selectedFiles.length > 0 ? selectedFiles : undefined);
      setNewMessage('');
      setSelectedFiles([]);
      // Refresh ticket details
      await fetchTicketDetails(ticketIdParam);
      // Refresh tickets list
      await fetchTickets();
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.response?.data?.message || err.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const invalidFiles = files.filter(file => {
        if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) return true;
        if (file.type.startsWith('audio/') && file.size > 5 * 1024 * 1024) return true;
        if (file.type.startsWith('video/') && file.size > 5 * 1024 * 1024) return true;
        if (file.type.startsWith('application/') && file.size > 5 * 1024 * 1024) return true;
        return false;
      });

      if (invalidFiles.length > 0) {
        setError('Some files exceed the size limit:\nImage: 2MB, Audio/Video/Document: 5MB');
        setTimeout(() => setError(null), 5000);
        return;
      }

      setSelectedFiles(prev => [...prev, ...files].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Fetch client details
  useEffect(() => {
    if (clientId) {
      fetchClientDetails();
    }
  }, [clientId, fetchClientDetails]);

  // Fetch tickets when filters change or component mounts
  useEffect(() => {
    if (clientId) {
      fetchTickets();
    }
  }, [clientId, filters.status, filters.category, filters.priority, filters.search, filters.page, fetchTickets]);

  useEffect(() => {
    if (selectedTicket) {
      setStatusDraft(selectedTicket.status);
      setPriorityDraft(selectedTicket.priority);
    } else {
      setStatusDraft('');
      setPriorityDraft('medium');
    }
  }, [selectedTicket]);

  const updateTicketStatus = async (
    ticketIdParam: string,
    status: AdminTicket['status'] | ''
  ) => {
    if (!status) return;
    try {
      setUpdatingStatus(true);
      await adminService.updateTicketStatus(ticketIdParam, status);
      await fetchTicketDetails(ticketIdParam);
      await fetchTickets();
      setStatusDraft(status);
    } catch (err: any) {
      console.error('Error updating ticket status:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update ticket status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const updateTicketPriority = async (ticketIdParam: string, priority: AdminTicket['priority']) => {
    if (!priority) return;
    try {
      setUpdatingPriority(true);
      await adminService.updateTicketPriority(ticketIdParam, priority);
      await fetchTicketDetails(ticketIdParam);
      await fetchTickets();
      setPriorityDraft(priority);
    } catch (err: any) {
      console.error('Error updating ticket priority:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update ticket priority');
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleAttachmentDownload = async (attachment: any, attachmentKey: string) => {
    if (!selectedTicket || !attachment) {
      return;
    }

    if (!attachment._id) {
      if (attachment.file_url) {
        window.open(attachment.file_url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      setDownloadingAttachmentId(attachmentKey);

      const { blob, contentType, filename } = await adminService.downloadAttachment(
        selectedTicket._id,
        attachment._id,
        attachment.file_name
      );

      const blobUrl = URL.createObjectURL(blob);
      const isViewable = contentType.startsWith('application/pdf') || contentType.startsWith('image/');

      if (isViewable) {
        const newWindow = window.open(blobUrl, '_blank');
        if (!newWindow) {
          alert('Please allow popups to view the attachment.');
        }
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (error) {
            console.warn('Error revoking blob URL:', error);
          }
        }, 60_000);
      } else {
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => {
          try {
            URL.revokeObjectURL(blobUrl);
          } catch (error) {
            console.warn('Error revoking blob URL:', error);
          }
        }, 10_000);
      }
    } catch (err: any) {
      console.error('Error downloading attachment:', err);
      const message = err?.message || 'Failed to download attachment';
      setError(message);
      alert(message);
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="w-3 h-3 bg-blue-500 rounded-full"></span>;
      case 'in_progress':
        return <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>;
      case 'waiting_customer':
        return <span className="w-3 h-3 bg-orange-500 rounded-full"></span>;
      case 'resolved':
        return <span className="w-3 h-3 bg-green-500 rounded-full"></span>;
      case 'closed':
        return <span className="w-3 h-3 bg-gray-500 rounded-full"></span>;
      case 'escalated':
        return <span className="w-3 h-3 bg-red-500 rounded-full"></span>;
      default:
        return <span className="w-3 h-3 bg-gray-500 rounded-full"></span>;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'waiting_customer':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'resolved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'closed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'escalated':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="admin-client-tickets">
      {/* Header */}
      <div className="tickets-header">
        <div className="header-top">
          <button
            onClick={() => navigate('/admin/clients')}
            className="back-button"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Clients
          </button>
          <div className="header-title">
            <h1>Client Support Tickets</h1>
            {client && (
              <div className="client-info-header">
                <div className="client-info-item">
                  <Building className="w-4 h-4" />
                  <span>{client.company_name}</span>
                </div>
                <div className="client-info-item">
                  <Mail className="w-4 h-4" />
                  <span>{client.email}</span>
                </div>
                <div className="client-info-item">
                  <Phone className="w-4 h-4" />
                  <span>{client.phone_number}</span>
                </div>
                {client.client_id && (
                  <div className="client-info-item">
                    <span className="text-xs text-gray-500">ID: {client.client_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Filters and Search */}
      <div className="tickets-filters">
        <div className="search-box">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets by subject, ID, or description..."
            value={filters.search}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>
        
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`filter-toggle ${showFilters ? 'active' : ''}`}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_customer">Waiting Customer</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
            <option value="escalated">Escalated</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            className="filter-select"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            <option value="pickup_delivery">Pickup & Delivery</option>
            <option value="shipment_ndr_rto">Shipment NDR/RTO</option>
            <option value="edit_shipment_info">Edit Shipment Info</option>
            <option value="shipment_dispute">Shipment Dispute</option>
            <option value="finance">Finance</option>
            <option value="billing_taxation">Billing & Taxation</option>
            <option value="claims">Claims</option>
            <option value="kyc_bank_verification">KYC & Bank Verification</option>
            <option value="technical_support">Technical Support</option>
            <option value="others">Others</option>
          </select>

          <button
            onClick={() => setFilters({ ...filters, status: '', category: '', priority: '', search: '', page: 1 })}
            className="clear-filters-btn"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">Total Tickets:</span>
            <span className="stat-value">{stats.total_tickets}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Open:</span>
            <span className="stat-value text-blue-600">
              {stats.status_counts?.open ?? stats.status_breakdown.open ?? 0}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">In Progress:</span>
            <span className="stat-value text-yellow-600">
              {stats.status_counts?.in_progress ?? stats.status_breakdown.in_progress ?? 0}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Resolved:</span>
            <span className="stat-value text-green-600">
              {stats.status_counts?.resolved ?? stats.status_breakdown.resolved ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Main Content - Split View */}
      <div className="tickets-content">
        {/* Left Panel - Tickets List */}
        <div className="tickets-list-panel">
          <div className="panel-header">
            <h2>Tickets ({pagination.totalTickets})</h2>
            {loading && <div className="loading-indicator">Loading...</div>}
          </div>

          <div className="tickets-list">
            {loading && tickets.length === 0 ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading tickets...</p>
              </div>
            ) : error && tickets.length === 0 ? (
              <div className="error-state">
                <p>{error}</p>
                <button onClick={fetchTickets} className="retry-button">
                  Retry
                </button>
              </div>
            ) : tickets.length === 0 ? (
              <div className="empty-state">
                <MessageSquare className="w-12 h-12 text-gray-300" />
                <p>No tickets found</p>
                {filters.search || filters.status || filters.category ? (
                  <button
                    onClick={() => setFilters({ ...filters, status: '', category: '', search: '', page: 1 })}
                    className="clear-filters-link"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {tickets.map((ticket) => (
                  <div
                    key={ticket._id}
                    onClick={() => handleTicketSelect(ticket)}
                    className={`ticket-card ${selectedTicket?._id === ticket._id ? 'selected' : ''}`}
                  >
                    <div className="ticket-card-header">
                      <div className="ticket-id-section">
                        {getStatusIcon(ticket.status)}
                        <span className="ticket-id">{ticket.ticket_id || ticket._id.slice(-8)}</span>
                      </div>
                      <div className="ticket-badges">
                        <span className={`status-badge ${getStatusColor(ticket.status)}`}>
                          {ticket.status}
                        </span>
                        <span className={`priority-badge ${getPriorityColor(ticket.priority || 'medium')}`}>
                          {ticket.priority || 'medium'}
                        </span>
                      </div>
                    </div>
                    <div className="ticket-subject">{ticket.subject || 'No subject'}</div>
                    <div className="ticket-meta">
                      <span className="ticket-date">
                        {formatDate(ticket.created_at)}
                      </span>
                      {ticket.category && (
                        <span className="ticket-category">{ticket.category}</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="pagination">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.hasPrev}
                      className="pagination-btn"
                    >
                      Previous
                    </button>
                    
                    <span className="pagination-info">
                      Page {pagination.currentPage} of {pagination.totalPages}
                    </span>
                    
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.hasNext}
                      className="pagination-btn"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Ticket Details */}
        <div className="ticket-detail-panel">
          {selectedTicket ? (
            <>
              <div className="ticket-detail-header">
                <div>
                  <h2>{selectedTicket.ticket_id || selectedTicket._id.slice(-8)}</h2>
                  <div className="ticket-detail-meta">
                    <div className="ticket-detail-badges">
                      <span className={`status-badge ${getStatusColor(selectedTicket.status)}`}>
                        {selectedTicket.status}
                      </span>
                      <span className={`priority-badge ${getPriorityColor(selectedTicket.priority || 'medium')}`}>
                        {selectedTicket.priority || 'medium'}
                      </span>
                      {selectedTicket.category && (
                        <span className="category-badge">{selectedTicket.category}</span>
                      )}
                    </div>
                    <div className="ticket-detail-dates">
                      <span>Created: {formatDateTime(selectedTicket.created_at)}</span>
                      {selectedTicket.updated_at && (
                        <span>Updated: {formatDateTime(selectedTicket.updated_at)}</span>
                      )}
                      {selectedTicket.assignment_info?.assigned_by_staff && (
                        <span className="staff-label">Assigned by: <span className="staff-badge">{selectedTicket.assignment_info.assigned_by_staff}</span></span>
                      )}
                      {selectedTicket.resolution?.resolved_by_staff && (
                        <span className="staff-label">Resolved by: <span className="staff-badge">{selectedTicket.resolution.resolved_by_staff}</span></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="ticket-detail-content">
                <div className="ticket-detail-section">
                  <h3>Subject</h3>
                  <p>{selectedTicket.subject || 'No subject'}</p>
                </div>

                {/* AWB Numbers - Only show if provided */}
                {selectedTicket.awb_numbers && selectedTicket.awb_numbers.length > 0 && (
                  <div className="ticket-detail-section">
                    <h3>AWB Numbers</h3>
                    <div className="awb-numbers-box">
                      {selectedTicket.awb_numbers.map((awb: string, index: number) => (
                        <span key={index} className="awb-badge">{awb}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ticket-detail-section">
                  <h3>Description</h3>
                  <div className="description-box">
                    {selectedTicket.description || 'No description provided'}
                  </div>
                </div>

                <div className="ticket-detail-section">
                  <h3>Conversation</h3>
                  <div className="conversation-list">
                    {selectedTicket.conversation && selectedTicket.conversation.length > 0 ? (
                      selectedTicket.conversation.map((message, index) => (
                        <div
                          key={index}
                          className={`conversation-message ${
                            message.message_type === 'admin' ? 'admin-message' :
                            message.message_type === 'user' ? 'user-message' :
                            'system-message'
                          }`}
                        >
                          <div className="message-header">
                            <span className="message-sender">{message.sender_name || 'Unknown'}</span>
                            {message.staff_name && (
                              <span className="staff-badge" title="Staff member">{message.staff_name}</span>
                            )}
                            <span className="message-time">
                              {formatDateTime(message.timestamp)}
                            </span>
                            {message.is_internal && (
                              <span className="internal-badge">Internal</span>
                            )}
                          </div>
                          <div className="message-content">
                            {message.message_content || message.message || 'No content'}
                          </div>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="message-attachments">
                              <span className="attachments-label">Attachments:</span>
                              <div className="attachments-list">
                                {message.attachments.map((attachment, idx) => {
                                  const attachmentKey = attachment._id || attachment.file_url || `${idx}`;
                                  const isDownloading = downloadingAttachmentId === attachmentKey;
                                  return (
                                  <button
                                    key={attachmentKey}
                                    type="button"
                                    className="attachment-link"
                                    onClick={() => handleAttachmentDownload(attachment, attachmentKey)}
                                    disabled={isDownloading}
                                  >
                                    <Paperclip size={14} />
                                    {isDownloading
                                      ? 'Downloading...'
                                      : attachment.file_name || `Attachment ${idx + 1}`}
                                  </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="no-conversation">
                        <MessageSquare className="w-8 h-8 text-gray-300" />
                        <p>No conversation yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Admin Actions */}
              <div className="ticket-actions">
                <h3>Admin Actions</h3>
                
                <div className="action-group">
                  <label>Update Status</label>
                  <div className="action-row">
                    <select
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value as AdminTicket['status'])}
                      className="status-select"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="escalated">Escalated</option>
                    </select>
                    <button
                      onClick={() => updateTicketStatus(selectedTicket._id, statusDraft)}
                      disabled={!statusDraft || statusDraft === selectedTicket.status || updatingStatus}
                      className="confirm-button"
                    >
                      {updatingStatus ? 'Updating...' : 'Confirm'}
                    </button>
                  </div>
                  {selectedTicket.status === 'waiting_customer' && (
                    <p className="status-hint">
                      Currently waiting on client response. You can move to another status once ready.
                    </p>
                  )}
                </div>

                <div className="action-group">
                  <label>Update Priority</label>
                  <div className="action-row">
                    <select
                      value={priorityDraft}
                      onChange={(e) => setPriorityDraft(e.target.value as AdminTicket['priority'])}
                      className="status-select"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <button
                      onClick={() => updateTicketPriority(selectedTicket._id, priorityDraft)}
                      disabled={!priorityDraft || priorityDraft === selectedTicket.priority || updatingPriority}
                      className="confirm-button"
                    >
                      {updatingPriority ? 'Updating...' : 'Confirm'}
                    </button>
                  </div>
                </div>

                <div className="action-group">
                  <label>Send Message</label>
                  <div className="message-input-group">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your message..."
                      className="message-textarea"
                      rows={3}
                    />
                    <div className="file-upload-section">
                      <input
                        type="file"
                        id="admin-file-upload"
                        multiple
                        accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="admin-file-upload" className="file-upload-btn">
                        <Paperclip className="w-4 h-4" /> Attach Files
                      </label>
                      {selectedFiles.length > 0 && (
                        <div className="selected-files">
                          {selectedFiles.map((file, index) => (
                            <div key={index} className="file-item">
                              <span>{file.name}</span>
                              <button onClick={() => removeFile(index)} type="button">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => sendMessage(selectedTicket._id)}
                      disabled={(!newMessage.trim() && selectedFiles.length === 0) || sendingMessage}
                      className="send-button"
                    >
                      {sendingMessage ? (
                        <>
                          <div className="spinner-small"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Send
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="no-ticket-selected">
              <MessageSquare className="w-16 h-16 text-gray-300" />
              <p>Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminClientTickets;

