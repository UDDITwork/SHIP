import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminService,
  AdminTicket,
  AdminTicketSummaryClient,
  AdminTicketSummaryData,
  AdminTicketsResponse
} from '../services/adminService';
import AWBLink from '../components/AWBLink';
import './AdminTicketSummary.css';

type ViewMode = 'summary' | 'master';
type StatusFilter = AdminTicket['status'] | 'all';
type PriorityFilter = AdminTicket['priority'] | 'all';

const STATUS_ORDER: AdminTicket['status'][] = [
  'open',
  'in_progress',
  'escalated',
  'resolved',
  'closed'
];

const STATUS_CONFIG: Record<AdminTicket['status'], { label: string; icon: string; className: string }> = {
  open: { label: 'Open', icon: 'O', className: 'open' },
  in_progress: { label: 'In Progress', icon: 'IP', className: 'in-progress' },
  waiting_customer: { label: 'Waiting Customer', icon: 'WC', className: 'waiting-customer' },
  escalated: { label: 'Escalated', icon: 'E', className: 'escalated' },
  resolved: { label: 'Resolved', icon: 'R', className: 'resolved' },
  closed: { label: 'Closed', icon: 'C', className: 'closed' }
};

const PRIORITY_ORDER: AdminTicket['priority'][] = [
  'urgent',
  'high',
  'medium',
  'low'
];

const PRIORITY_CONFIG: Record<AdminTicket['priority'], { label: string; icon: string; className: string; description: string }> = {
  urgent: { label: 'Urgent', icon: 'U', className: 'urgent', description: 'Immediate attention required' },
  high: { label: 'High', icon: 'H', className: 'high', description: 'Action needed soon' },
  medium: { label: 'Medium', icon: 'M', className: 'medium', description: 'Normal attention level' },
  low: { label: 'Low', icon: 'L', className: 'low', description: 'Can be scheduled later' }
};

const formatNumber = (value: number | undefined | null) => {
  if (!value) return '0';
  return Number(value).toLocaleString('en-IN');
};

// Format date with time in DD/MM/YYYY, HH:MM AM/PM format (consistent with AdminClientTickets)
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${day}/${month}/${year}, ${hour12}:${minutes} ${ampm}`;
};

const matchesSearch = (client: AdminTicketSummaryClient, search: string) => {
  if (!search) return true;
  const normalized = search.toLowerCase();
  return (
    client.companyName.toLowerCase().includes(normalized) ||
    (client.clientId || '').toLowerCase().includes(normalized) ||
    (client.contactName || '').toLowerCase().includes(normalized) ||
    (client.email || '').toLowerCase().includes(normalized) ||
    (client.phoneNumber || '').toLowerCase().includes(normalized)
  );
};

const CATEGORY_OPTIONS = [
  'Shipment Issues',
  'Billing & Payments',
  'Account & Profile',
  'Returns & Refunds',
  'Technical Support',
  'General Inquiry',
  'Other'
];

const AdminTicketSummary: React.FC = () => {
  // View mode toggle
  const [viewMode, setViewMode] = useState<ViewMode>('master');

  // Summary view state
  const [summary, setSummary] = useState<AdminTicketSummaryData | null>(null);

  // Master table view state
  const [allTickets, setAllTickets] = useState<AdminTicket[]>([]);
  const [ticketStats, setTicketStats] = useState<any>(null);
  const [ticketPagination, setTicketPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalTickets: 0,
    hasNext: false,
    hasPrev: false
  });

  // Common state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('-1');
  const [masterPage, setMasterPage] = useState<number>(1);
  const [masterLimit] = useState<number>(20);
  const navigate = useNavigate();

  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getTicketSummary();
      const sortedClients = [...(data.clients || [])].sort(
        (a, b) => (b.totalTickets || 0) - (a.totalTickets || 0)
      );

      const computedPriorityTotals = PRIORITY_ORDER.reduce((acc, key) => {
        acc[key] = sortedClients.reduce((sum, client) => {
          const clientCount = client.priorityCounts?.[key] ?? 0;
          return sum + clientCount;
        }, 0);
        return acc;
      }, {
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0
      } as Record<AdminTicket['priority'], number>);

      setSummary({
        totals: data.totals,
        priorityTotals: {
          urgent: data.priorityTotals?.urgent ?? computedPriorityTotals.urgent,
          high: data.priorityTotals?.high ?? computedPriorityTotals.high,
          medium: data.priorityTotals?.medium ?? computedPriorityTotals.medium,
          low: data.priorityTotals?.low ?? computedPriorityTotals.low
        },
        clients: sortedClients
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load ticket summary. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Load all tickets for master view
  const loadAllTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getAllTickets({
        page: masterPage,
        limit: masterLimit,
        status: statusFilter === 'all' ? '' : statusFilter,
        priority: priorityFilter === 'all' ? '' : priorityFilter,
        category: categoryFilter === 'all' ? '' : categoryFilter,
        search: searchTerm.trim(),
        sort_by: sortBy,
        sort_order: sortOrder
      });
      setAllTickets(response.data.tickets || []);
      setTicketPagination(response.data.pagination);
      setTicketStats(response.data.stats);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load tickets. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [masterPage, masterLimit, statusFilter, priorityFilter, categoryFilter, searchTerm, sortBy, sortOrder]);

  // Load data based on view mode
  useEffect(() => {
    if (viewMode === 'summary') {
      loadSummary();
    } else {
      loadAllTickets();
    }
  }, [viewMode, loadAllTickets]);

  // Reload master table when filters change
  useEffect(() => {
    if (viewMode === 'master') {
      setMasterPage(1);
    }
  }, [statusFilter, priorityFilter, categoryFilter, searchTerm, viewMode]);

  const filteredClients = useMemo(() => {
    if (!summary) return [];
    return summary.clients.filter((client) => {
      const meetsSearch = matchesSearch(client, searchTerm.trim());
      const meetsStatus =
        statusFilter === 'all' ||
        (client.statusCounts?.[statusFilter] ?? 0) > 0;
      const meetsPriority =
        priorityFilter === 'all' ||
        (client.priorityCounts?.[priorityFilter] ?? 0) > 0;
      return meetsSearch && meetsStatus && meetsPriority;
    });
  }, [summary, searchTerm, statusFilter, priorityFilter]);

  const handleStatusCardFilter = (status: AdminTicket['status']) => {
    setStatusFilter((current) => (current === status ? 'all' : status));
  };

  const handlePriorityCardFilter = (priority: AdminTicket['priority']) => {
    setPriorityFilter((current) => (current === priority ? 'all' : priority));
  };

  const handleViewTickets = (
    client: AdminTicketSummaryClient,
    status?: AdminTicket['status'],
    priority?: AdminTicket['priority']
  ) => {
    const path = `/admin/clients/${client.clientMongoId}/tickets`;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    const query = params.toString();
    navigate(query ? `${path}?${query}` : path);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setMasterPage(1);
  };

  const handleTicketClick = (ticket: AdminTicket) => {
    navigate(`/admin/clients/${ticket.user_id._id}/tickets/${ticket._id}`);
  };

  const handleStatusChange = async (ticketId: string, newStatus: AdminTicket['status']) => {
    try {
      await adminService.updateTicketStatus(ticketId, newStatus);
      if (viewMode === 'master') {
        loadAllTickets();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handlePriorityChange = async (ticketId: string, newPriority: AdminTicket['priority']) => {
    try {
      await adminService.updateTicketPriority(ticketId, newPriority);
      if (viewMode === 'master') {
        loadAllTickets();
      }
    } catch (err) {
      console.error('Failed to update priority:', err);
    }
  };

  const handleRefresh = () => {
    if (viewMode === 'summary') {
      loadSummary();
    } else {
      loadAllTickets();
    }
  };

  return (
    <div className="admin-ticket-summary">
      <div className="summary-header">
        <div>
          <h1>Tickets Overview</h1>
          <p className="summary-subtitle">
            {viewMode === 'master'
              ? 'View and manage all tickets in one place.'
              : 'Track client tickets by status and jump directly into their ticket workspace.'}
          </p>
        </div>
        <div className="summary-header-actions">
          {/* View Mode Toggle */}
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'master' ? 'active' : ''}`}
              onClick={() => setViewMode('master')}
            >
              Master Table
            </button>
            <button
              className={`toggle-btn ${viewMode === 'summary' ? 'active' : ''}`}
              onClick={() => setViewMode('summary')}
            >
              Client Summary
            </button>
          </div>
          <button
            className="btn-secondary"
            onClick={handleResetFilters}
            disabled={loading}
          >
            Clear Filters
          </button>
          <button
            className="btn-primary"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="summary-cards">
        <div
          className={`status-card total ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setStatusFilter('all');
            }
          }}
        >
          <div className="status-card-header">
            <span className="status-icon">T</span>
            <span className="status-label">Total Tickets</span>
          </div>
          <p className="status-count">
            {formatNumber(viewMode === 'master'
              ? ticketStats?.total_tickets ?? ticketPagination.totalTickets
              : summary?.totals?.all ?? 0)}
          </p>
          <span className="status-card-meta">Across all clients</span>
        </div>

        {STATUS_ORDER.map((statusKey) => {
          const config = STATUS_CONFIG[statusKey];
          const totalForStatus = viewMode === 'master'
            ? ticketStats?.status_counts?.[statusKey] ?? 0
            : summary?.totals?.[statusKey] ?? 0;
          return (
            <div
              key={statusKey}
              className={`status-card ${config.className} ${statusFilter === statusKey ? 'active' : ''}`}
              onClick={() => handleStatusCardFilter(statusKey)}
              role="button"
              tabIndex={0}
            >
              <div className="status-card-header">
                <span className="status-icon">{config.icon}</span>
                <button
                  className="status-card-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusCardFilter(statusKey);
                  }}
                >
                  {statusFilter === statusKey ? 'Show All' : 'Filter'}
                </button>
              </div>
              <p className="status-label">{config.label}</p>
              <p className="status-count">{formatNumber(totalForStatus)}</p>
              <span className="status-card-meta">Tickets currently {config.label.toLowerCase()}</span>
            </div>
          );
        })}
      </div>

      {/* Priority Overview - only show in summary view */}
      {viewMode === 'summary' && (
        <div className="priority-cards">
          <div className="priority-header">
            <h2>Priority Overview</h2>
            <span className="priority-subtitle">Understand workload urgency across clients</span>
          </div>
          <div className="priority-grid">
            {PRIORITY_ORDER.map((priorityKey) => {
              const config = PRIORITY_CONFIG[priorityKey];
              const totalForPriority = summary?.priorityTotals?.[priorityKey] ?? 0;
              return (
                <div
                  key={priorityKey}
                  className={`priority-card ${config.className} ${priorityFilter === priorityKey ? 'active' : ''}`}
                  onClick={() => handlePriorityCardFilter(priorityKey)}
                >
                  <div className="priority-card-header">
                    <span className="priority-icon">{config.icon}</span>
                    <button
                      className="priority-card-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePriorityCardFilter(priorityKey);
                      }}
                    >
                      {priorityFilter === priorityKey ? 'Show All' : 'Filter'}
                    </button>
                  </div>
                  <p className="priority-label">{config.label}</p>
                  <p className="priority-count">{formatNumber(totalForPriority)}</p>
                  <span className="priority-meta">{config.description}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="ticket-summary-filters">
        <div className="filters-left">
          <div className="search-field">
            <input
              type="text"
              placeholder={viewMode === 'master'
                ? "Search by ticket ID, AWB, client name, email..."
                : "Search clients by name, client ID, email or phone"}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="select-field">
            <label htmlFor="ticket-status-filter">Status</label>
            <select
              id="ticket-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              {STATUS_ORDER.map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {STATUS_CONFIG[statusKey].label}
                </option>
              ))}
            </select>
          </div>
          <div className="select-field">
            <label htmlFor="ticket-priority-filter">Priority</label>
            <select
              id="ticket-priority-filter"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
            >
              <option value="all">All priorities</option>
              {PRIORITY_ORDER.map((priorityKey) => (
                <option key={priorityKey} value={priorityKey}>
                  {PRIORITY_CONFIG[priorityKey].label}
                </option>
              ))}
            </select>
          </div>
          {viewMode === 'master' && (
            <>
              <div className="select-field">
                <label htmlFor="ticket-category-filter">Category</label>
                <select
                  id="ticket-category-filter"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All categories</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="select-field">
                <label htmlFor="ticket-sort">Sort By</label>
                <select
                  id="ticket-sort"
                  value={`${sortBy}:${sortOrder}`}
                  onChange={(event) => {
                    const [by, order] = event.target.value.split(':');
                    setSortBy(by);
                    setSortOrder(order);
                  }}
                >
                  <option value="created_at:-1">Newest First</option>
                  <option value="created_at:1">Oldest First</option>
                  <option value="updated_at:-1">Recently Updated</option>
                  <option value="priority:-1">Priority (High to Low)</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="filters-right">
          <span className="results-info">
            {viewMode === 'master'
              ? `Showing ${allTickets.length} of ${ticketPagination.totalTickets} tickets`
              : `Showing ${filteredClients.length} of ${summary?.clients.length ?? 0} clients`}
          </span>
        </div>
      </div>

      {error && (
        <div className="summary-error">
          <p>{error}</p>
          <button className="btn-link" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {/* MASTER TABLE VIEW */}
      {viewMode === 'master' && (
        <>
          {loading && allTickets.length === 0 ? (
            <div className="summary-loading">Loading tickets...</div>
          ) : (
            <>
              <div className="ticket-summary-table-wrapper master-table">
                <table className="ticket-summary-table">
                  <thead>
                    <tr>
                      <th>Ticket ID</th>
                      <th>Client</th>
                      <th>Category</th>
                      <th>Subject</th>
                      <th>AWB</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTickets.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="empty-state">
                          No tickets found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      allTickets.map((ticket) => (
                        <tr
                          key={ticket._id}
                          className="clickable-row"
                          onClick={() => handleTicketClick(ticket)}
                        >
                          <td>
                            <span className="ticket-id-badge">{ticket.ticket_id}</span>
                          </td>
                          <td>
                            <div className="client-cell">
                              <span className="client-company">{ticket.user_id?.company_name || 'N/A'}</span>
                              <span className="client-contact">{ticket.user_id?.client_id || ''}</span>
                            </div>
                          </td>
                          <td>
                            <span className="category-badge">{ticket.category}</span>
                          </td>
                          <td>
                            <span className="ticket-subject" title={ticket.subject}>
                              {ticket.subject.length > 40 ? `${ticket.subject.substring(0, 40)}...` : ticket.subject}
                            </span>
                          </td>
                          <td>
                            {ticket.awb_numbers && ticket.awb_numbers.length > 0 ? (
                              <AWBLink awb={ticket.awb_numbers[0]} className="awb-badge" />
                            ) : (
                              <span className="no-awb">-</span>
                            )}
                          </td>
                          <td>
                            <select
                              className={`status-select inline ${ticket.status}`}
                              value={ticket.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleStatusChange(ticket._id, e.target.value as AdminTicket['status'])}
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className={`priority-select inline ${ticket.priority}`}
                              value={ticket.priority}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handlePriorityChange(ticket._id, e.target.value as AdminTicket['priority'])}
                            >
                              {PRIORITY_ORDER.map((p) => (
                                <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                              ))}
                            </select>
                          </td>
                          <td>{formatDateTime(ticket.created_at)}</td>
                          <td>{formatDateTime(ticket.updated_at)}</td>
                          <td>
                            <button
                              className="btn-primary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTicketClick(ticket);
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination for Master Table */}
              {ticketPagination.totalPages > 1 && (
                <div className="pagination-section">
                  <div className="pagination-info">
                    Page {ticketPagination.currentPage} of {ticketPagination.totalPages}
                  </div>
                  <div className="pagination-controls">
                    <button
                      className="btn-secondary"
                      disabled={!ticketPagination.hasPrev}
                      onClick={() => setMasterPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={!ticketPagination.hasNext}
                      onClick={() => setMasterPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* CLIENT SUMMARY VIEW */}
      {viewMode === 'summary' && (
        <>
          {loading && !summary ? (
            <div className="summary-loading">Loading ticket summary...</div>
          ) : (
            <div className="ticket-summary-table-wrapper">
              <table className="ticket-summary-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Client ID</th>
                    <th className="numeric">Open</th>
                    <th className="numeric">In Progress</th>
                    <th className="numeric">Escalated</th>
                    <th className="numeric">Resolved</th>
                    <th className="numeric">Closed</th>
                    <th className="numeric">Total</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty-state">
                        {summary ? 'No matching clients found.' : 'No ticket data available yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <tr
                        key={client.clientMongoId}
                        className="clickable-row"
                        onClick={() => handleViewTickets(client)}
                      >
                        <td>
                          <div className="client-cell">
                            <span className="client-company">{client.companyName}</span>
                            <span className="client-contact">{client.contactName || '-'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="client-id">{client.clientId || '-'}</span>
                        </td>
                        <td className="numeric">{formatNumber(client.statusCounts.open)}</td>
                        <td className="numeric">{formatNumber(client.statusCounts.in_progress)}</td>
                        <td className="numeric">{formatNumber(client.statusCounts.escalated)}</td>
                        <td className="numeric">{formatNumber(client.statusCounts.resolved)}</td>
                        <td className="numeric">{formatNumber(client.statusCounts.closed)}</td>
                        <td className="numeric total-cell">{formatNumber(client.totalTickets)}</td>
                        <td>{formatDateTime(client.latestUpdatedAt)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn-primary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewTickets(client);
                              }}
                            >
                              View Tickets
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminTicketSummary;

