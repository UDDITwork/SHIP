import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService, AdminTicket, PrioritySummary } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import PriorityOverview from '../components/PriorityOverview';
import './AdminTickets.css';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';
type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low';

const AdminTickets: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prioritySummary, setPrioritySummary] = useState<PrioritySummary>({
    urgent: { count: 0, sla_breached: 0 },
    high: { count: 0, sla_breached: 0 },
    medium: { count: 0, sla_breached: 0 },
    low: { count: 0, sla_breached: 0 }
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalTickets: 0,
    hasNext: false,
    hasPrev: false
  });

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminService.getTicketsMaster({
        page,
        limit,
        status: statusFilter === 'all' ? '' : statusFilter,
        priority: priorityFilter === 'all' ? '' : priorityFilter,
        date_from: dateFrom,
        date_to: dateTo,
        search: searchTerm.trim()
      });

      setTickets(response.data.tickets);
      setPagination(response.data.pagination);
      setPrioritySummary(response.data.priority_summary);
    } catch (err: any) {
      console.error('Error fetching tickets:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, priorityFilter, dateFrom, dateTo, searchTerm]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, searchTerm, dateFrom, dateTo]);

  const handleTicketClick = (ticket: AdminTicket) => {
    navigate(`/admin/clients/${ticket.user_id._id}/tickets/${ticket._id}`);
  };

  const handleClientClick = (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/admin/clients/${clientId}/dashboard`);
  };

  const handlePriorityChange = async (ticketId: string, newPriority: 'urgent' | 'high' | 'medium' | 'low') => {
    try {
      await adminService.updateTicketPriority(ticketId, newPriority);
      fetchTickets();
    } catch (err: any) {
      console.error('Error updating priority:', err);
      alert('Failed to update priority: ' + (err.response?.data?.message || err.message));
    }
  };

  const handlePriorityFilterClick = (priority: 'urgent' | 'high' | 'medium' | 'low') => {
    if (priorityFilter === priority) {
      setPriorityFilter('all');
    } else {
      setPriorityFilter(priority);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const getStatusBadgeClass = (status: string) => {
    const baseClass = 'status-badge';
    return `${baseClass} ${baseClass}-${status.replace('_', '-')}`;
  };

  const getPriorityBadgeClass = (priority: string) => {
    const baseClass = 'priority-badge';
    return `${baseClass} ${baseClass}-${priority}`;
  };

  return (
    <div className="admin-tickets-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Tickets Master Table</h1>
          <p className="page-subtitle">Centralized view of all support tickets across all clients</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={handleClearFilters}
            disabled={loading}
          >
            Clear Filters
          </button>
          <button
            className="btn-primary"
            onClick={fetchTickets}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Priority Overview */}
      <PriorityOverview
        prioritySummary={prioritySummary}
        onPriorityClick={handlePriorityFilterClick}
        activePriority={priorityFilter === 'all' ? undefined : priorityFilter}
      />

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="priority-filter">Priority</label>
          <select
            id="priority-filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="date-from">Date From</label>
          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="date-to">Date To</label>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="filter-group search-group">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            type="text"
            placeholder="AWB/Client ID/Ticket ID/Email"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="limit">Items per page</label>
          <select
            id="limit"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {/* Results Info */}
      <div className="results-info">
        Showing {tickets.length} of {pagination.totalTickets} tickets
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn-link" onClick={fetchTickets}>
            Retry
          </button>
        </div>
      )}

      {/* Master Table */}
      {loading && tickets.length === 0 ? (
        <div className="loading-state">Loading tickets...</div>
      ) : (
        <div className="table-wrapper">
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Client Name/Email/ID</th>
                <th>Category</th>
                <th>AWB</th>
                <th>Created Date</th>
                <th>Last Update</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    No tickets found matching your filters.
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => (
                  <tr
                    key={ticket._id}
                    className="clickable-row"
                    onClick={() => handleTicketClick(ticket)}
                  >
                    <td>
                      <span className="ticket-id-badge">{ticket.ticket_id}</span>
                    </td>
                    <td>
                      <div className="client-info">
                        <button
                          className="client-name-link"
                          onClick={(e) => handleClientClick(ticket.user_id._id, e)}
                        >
                          {ticket.user_id.company_name}
                        </button>
                        <span className="client-email">{ticket.user_id.email}</span>
                        <span className="client-id">{ticket.user_id.client_id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="category-badge">{ticket.category}</span>
                    </td>
                    <td>
                      {ticket.awb_numbers && ticket.awb_numbers.length > 0 ? (
                        <span className="awb-number">{ticket.awb_numbers[0]}</span>
                      ) : (
                        <span className="no-data">-</span>
                      )}
                    </td>
                    <td>{formatDate(ticket.created_at)}</td>
                    <td>{formatDate(ticket.updated_at)}</td>
                    <td>
                      <select
                        className={getPriorityBadgeClass(ticket.priority)}
                        value={ticket.priority}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handlePriorityChange(ticket._id, e.target.value as any)}
                      >
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(ticket.status)}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTicketClick(ticket);
                          }}
                          title="View conversation"
                        >
                          💬
                        </button>
                        {ticket.conversation && ticket.conversation.some(msg => msg.attachments && msg.attachments.length > 0) && (
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTicketClick(ticket);
                            }}
                            title="Has attachments"
                          >
                            📎
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Page {pagination.currentPage} of {pagination.totalPages}
          </div>
          <div className="pagination-controls">
            <button
              className="btn-secondary"
              disabled={!pagination.hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn-secondary"
              disabled={!pagination.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTickets;
