import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminService, AdminNDROrder, AdminNDRStats } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import './AdminNDR.css';

type StatusTab = 'all' | 'action_required' | 'action_taken' | 'delivered' | 'rto';

const NDR_REASON_MAP: Record<string, string> = {
  'EOD-3':  'Delivery Rescheduled by Customer',
  'EOD-6':  'Consignee Unavailable',
  'EOD-11': 'Address Incomplete / Incorrect',
  'EOD-15': 'Customer Not Available',
  'EOD-16': 'Refused by Customer — COD Not Ready',
  'EOD-43': 'Cash Not Ready',
  'EOD-69': 'Customer Wants Open Delivery',
  'EOD-74': 'Consignee Refused',
  'EOD-86': 'Door Locked / Premises Closed',
  'EOD-104': 'Customer Wants to Reschedule',
  'ST-108': 'Shipment Seized by Customer',
};

const AdminNDR: React.FC = () => {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId?: string }>();

  // State
  const [orders, setOrders] = useState<AdminNDROrder[]>([]);
  const [stats, setStats] = useState<AdminNDRStats>({
    action_required: 0, action_taken: 0, delivered: 0, rto: 0, all: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_orders: 0,
    per_page: 20
  });

  const fetchStats = useCallback(async () => {
    try {
      const response = await adminService.getAdminNDRStats(clientId);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching NDR stats:', err);
    }
  }, [clientId]);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminService.getAdminNDROrders({
        page,
        limit,
        status: activeTab === 'all' ? '' : activeTab,
        client_id: clientId || '',
        payment_mode: paymentMode,
        date_from: dateFrom,
        date_to: dateTo,
        search: searchTerm.trim()
      });

      setOrders(response.data.orders);
      setPagination(response.data.pagination);
    } catch (err: any) {
      console.error('Error fetching NDR orders:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch NDR orders');
    } finally {
      setLoading(false);
    }
  }, [page, limit, activeTab, clientId, paymentMode, dateFrom, dateTo, searchTerm]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm, paymentMode, dateFrom, dateTo]);

  const handleClearFilters = () => {
    setActiveTab('all');
    setSearchTerm('');
    setPaymentMode('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleClientClick = (clientMongoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/admin/clients/${clientMongoId}/dashboard`);
  };

  const handleTicketClick = (userId: string, ticketObjectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/admin/clients/${userId}/tickets/${ticketObjectId}`);
  };

  const getResolutionLabel = (action: string | null | undefined): string => {
    if (!action) return 'No Action';
    switch (action) {
      case 'reattempt': return 'Reattempt';
      case 'rto': return 'RTO Requested';
      case 'edit_requested': return 'Edit Requested';
      case 'hold': return 'On Hold';
      case 'delivered': return 'Delivered';
      default: return action;
    }
  };

  const getResolutionClass = (action: string | null | undefined): string => {
    if (!action) return 'none';
    switch (action) {
      case 'reattempt': return 'reattempt';
      case 'rto': return 'rto';
      case 'edit_requested': return 'edit';
      case 'delivered': return 'delivered';
      case 'hold': return 'hold';
      default: return 'none';
    }
  };

  const getNDRDisplayReason = (nslCode: string, rawReason?: string): string => {
    const mapped = NDR_REASON_MAP[nslCode?.toUpperCase()];
    if (mapped) return mapped;
    if (rawReason) return rawReason;
    return nslCode || 'Unknown';
  };

  const getLatestTicket = (order: AdminNDROrder): { ticket_id: string; ticket_object_id: string } | null => {
    if (!order.ndr_info?.action_history?.length) return null;
    for (let i = order.ndr_info.action_history.length - 1; i >= 0; i--) {
      const entry = order.ndr_info.action_history[i];
      if (entry.ticket_id && entry.ticket_object_id) {
        return { ticket_id: entry.ticket_id, ticket_object_id: entry.ticket_object_id };
      }
    }
    return null;
  };

  const tabConfig: { key: StatusTab; label: string; countKey: keyof AdminNDRStats; className: string }[] = [
    { key: 'all', label: 'All NDRs', countKey: 'all', className: '' },
    { key: 'action_required', label: 'Action Required', countKey: 'action_required', className: 'action-required' },
    { key: 'action_taken', label: 'Action Taken', countKey: 'action_taken', className: 'action-taken' },
    { key: 'delivered', label: 'NDR Delivered', countKey: 'delivered', className: 'ndr-delivered' },
    { key: 'rto', label: 'RTO', countKey: 'rto', className: 'ndr-rto' },
  ];

  return (
    <div className="admin-ndr-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>NDR Management{clientId ? ' (Client View)' : ''}</h1>
          <p className="page-subtitle">
            {clientId ? 'NDR orders for this client' : 'All NDR orders across all clients'}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleClearFilters} disabled={loading}>
            Clear Filters
          </button>
          <button className="btn-primary" onClick={() => { fetchStats(); fetchOrders(); }} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="ndr-stats-row">
        {tabConfig.map(tab => (
          <div
            key={tab.key}
            className={`ndr-stat-card ${tab.className} ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <div className="stat-count">{stats[tab.countKey]}</div>
            <div className="stat-label">{tab.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          <label htmlFor="payment-mode">Payment Mode</label>
          <select
            id="payment-mode"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
          >
            <option value="">All</option>
            <option value="COD">COD</option>
            <option value="Prepaid">Prepaid</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="ndr-date-from">Date From</label>
          <input
            id="ndr-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="ndr-date-to">Date To</label>
          <input
            id="ndr-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="filter-group search-group">
          <label htmlFor="ndr-search">Search</label>
          <input
            id="ndr-search"
            type="text"
            placeholder="AWB / Order ID / Customer Name / Phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Results Info */}
      <div className="results-info">
        Showing {orders.length} of {pagination.total_orders} NDR orders
      </div>

      {/* Error */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="btn-link" onClick={fetchOrders}>Retry</button>
        </div>
      )}

      {/* Table */}
      {loading && orders.length === 0 ? (
        <div className="loading-state">Loading NDR orders...</div>
      ) : (
        <div className="table-wrapper">
          <table className="ndr-table">
            <thead>
              <tr>
                <th>AWB</th>
                {!clientId && <th>Client</th>}
                <th>Customer</th>
                <th>NDR Reason</th>
                <th>Attempts</th>
                <th>Last NDR Date</th>
                <th>Payment</th>
                <th>Resolution</th>
                <th>Status</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={clientId ? 9 : 10} className="empty-state">
                    No NDR orders found matching your filters.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const ticket = getLatestTicket(order);
                  return (
                    <tr key={order._id} className="clickable-row">
                      <td>
                        <span className="awb-number">
                          {order.delhivery_data?.waybill || '-'}
                        </span>
                      </td>
                      {!clientId && (
                        <td>
                          <div className="client-info">
                            <button
                              className="client-name-link"
                              onClick={(e) => handleClientClick(order.user_id?._id, e)}
                            >
                              {order.user_id?.company_name || 'Unknown'}
                            </button>
                            <span className="client-id-text">
                              {order.user_id?.client_id || ''}
                            </span>
                          </div>
                        </td>
                      )}
                      <td>
                        <div className="client-info">
                          <span style={{ fontWeight: 500 }}>
                            {order.customer_info?.buyer_name || '-'}
                          </span>
                          <span className="client-id-text">
                            {order.customer_info?.phone || ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span title={order.ndr_info?.nsl_code || ''}>
                          {getNDRDisplayReason(order.ndr_info?.nsl_code, order.ndr_info?.ndr_reason)}
                        </span>
                      </td>
                      <td>
                        <span className={`attempts-badge ${
                          (order.ndr_info?.ndr_attempts || 0) >= 3 ? 'high' :
                          (order.ndr_info?.ndr_attempts || 0) >= 2 ? 'medium' : 'low'
                        }`}>
                          {order.ndr_info?.ndr_attempts || 0}
                        </span>
                      </td>
                      <td>
                        {order.ndr_info?.last_ndr_date
                          ? formatDate(order.ndr_info.last_ndr_date)
                          : '-'}
                      </td>
                      <td>
                        {order.payment_info?.payment_mode ? (
                          <span className={`payment-badge ${
                            order.payment_info.payment_mode.toLowerCase() === 'cod' ? 'cod' : 'prepaid'
                          }`}>
                            {order.payment_info.payment_mode}
                          </span>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                      <td>
                        <span className={`resolution-badge ${getResolutionClass(order.ndr_info?.resolution_action)}`}>
                          {getResolutionLabel(order.ndr_info?.resolution_action)}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${order.status}`}>
                          {order.status === 'rto_in_transit' ? 'RTO In Transit' :
                           order.status === 'rto_delivered' ? 'RTO Delivered' :
                           order.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {ticket ? (
                          <button
                            className="ticket-link"
                            onClick={(e) => handleTicketClick(order.user_id?._id, ticket.ticket_object_id, e)}
                          >
                            {ticket.ticket_id}
                          </button>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Page {pagination.current_page} of {pagination.total_pages}
          </div>
          <div className="pagination-controls">
            <button
              className="btn-secondary"
              disabled={pagination.current_page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn-secondary"
              disabled={pagination.current_page >= pagination.total_pages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNDR;
