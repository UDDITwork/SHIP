import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminService, AdminNDROrder, AdminNDRStats } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import './AdminNDR.css';

type StatusTab = 'all' | 'action_required' | 'action_taken' | 'delivered' | 'rto';
type ViewMode = 'ndr' | 'client';

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

interface NDRClient {
  _id: string;
  client_id: string;
  company_name: string;
  email: string;
  your_name: string;
  total_ndrs: number;
  ndrs_by_status: {
    action_required: number;
    action_taken: number;
    delivered: number;
    rto: number;
  };
}

const AdminNDR: React.FC = () => {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId?: string }>();
  const [searchParams] = useSearchParams();

  // View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('ndr');

  // Detail Modal
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminRemark, setAdminRemark] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // NDR Table state
  const [orders, setOrders] = useState<AdminNDROrder[]>([]);
  const [stats, setStats] = useState<AdminNDRStats>({
    action_required: 0, action_taken: 0, delivered: 0, rto: 0, all: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client Summary state
  const [clientSummary, setClientSummary] = useState<NDRClient[]>([]);
  const [clientLoading, setClientLoading] = useState(false);

  // Filters — read initial status from URL query param (set by client summary nav)
  const [activeTab, setActiveTab] = useState<StatusTab>((searchParams.get('status') as StatusTab) || 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ndrReasonFilter, setNdrReasonFilter] = useState('');
  const [agingFilter, setAgingFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
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
        search: searchTerm.trim(),
        ndr_reason: ndrReasonFilter,
        aging_filter: agingFilter,
        action_type: actionTypeFilter,
      });

      setOrders(response.data.orders);
      setPagination(response.data.pagination);
    } catch (err: any) {
      console.error('Error fetching NDR orders:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch NDR orders');
    } finally {
      setLoading(false);
    }
  }, [page, limit, activeTab, clientId, paymentMode, dateFrom, dateTo, searchTerm, ndrReasonFilter, agingFilter, actionTypeFilter]);

  const fetchClientSummary = useCallback(async () => {
    if (viewMode !== 'client') return;
    try {
      setClientLoading(true);
      const response = await adminService.getNDRClients({ limit: 200 });
      setClientSummary(response.data.clients);
    } catch (err) {
      console.error('Error fetching NDR client summary:', err);
    } finally {
      setClientLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (viewMode === 'ndr') fetchOrders();
  }, [fetchOrders, viewMode]);

  useEffect(() => {
    fetchClientSummary();
  }, [fetchClientSummary]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm, paymentMode, dateFrom, dateTo, ndrReasonFilter, agingFilter, actionTypeFilter]);

  const handleClearFilters = () => {
    setActiveTab('all');
    setSearchTerm('');
    setPaymentMode('');
    setDateFrom('');
    setDateTo('');
    setNdrReasonFilter('');
    setAgingFilter('');
    setActionTypeFilter('');
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

  const handleClientNDRClick = (mongoId: string, status?: string) => {
    // Navigate with status as query param so new component instance reads it on mount
    navigate(`/admin/ndr/${mongoId}${status ? `?status=${status}` : ''}`);
  };

  const handleActionTypeClick = (actionType: string) => {
    setActionTypeFilter(prev => prev === actionType ? '' : actionType);
    setViewMode('ndr');
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

  const calcAging = (dateStr: string): number => {
    if (!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  const handleOpenDetail = async (order: AdminNDROrder) => {
    setDetailLoading(true);
    setDetailOrder(null);
    setAdminRemark('');
    try {
      const res = await adminService.getAdminNDRDetail(order._id);
      setDetailOrder(res.data);
    } catch {
      setDetailOrder(order); // Fallback to existing data
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdminAction = async (action: string) => {
    if (!detailOrder) return;
    setActionLoading(true);
    try {
      await adminService.postAdminNDRAction(detailOrder._id, action, adminRemark);
      setAdminRemark('');
      // Refresh detail
      const res = await adminService.getAdminNDRDetail(detailOrder._id);
      setDetailOrder(res.data);
      fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const tabConfig: { key: StatusTab; label: string; countKey: keyof AdminNDRStats; className: string }[] = [
    { key: 'all', label: 'All NDRs', countKey: 'all', className: '' },
    { key: 'action_required', label: 'Action Required', countKey: 'action_required', className: 'action-required' },
    { key: 'action_taken', label: 'Action Taken', countKey: 'action_taken', className: 'action-taken' },
    { key: 'delivered', label: 'NDR Delivered', countKey: 'delivered', className: 'ndr-delivered' },
    { key: 'rto', label: 'RTO', countKey: 'rto', className: 'ndr-rto' },
  ];

  const actionBreakdown = stats.action_breakdown || { reattempt: 0, edit_requested: 0, rto: 0, hold: 0 };

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
          {!clientId && (
            <div className="view-toggle-group">
              <button
                className={`view-toggle-btn ${viewMode === 'ndr' ? 'active' : ''}`}
                onClick={() => setViewMode('ndr')}
              >
                NDR Table
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'client' ? 'active' : ''}`}
                onClick={() => setViewMode('client')}
              >
                Client Summary
              </button>
            </div>
          )}
          <button className="btn-secondary" onClick={handleClearFilters} disabled={loading}>
            Clear Filters
          </button>
          <button className="btn-primary" onClick={() => { fetchStats(); if (viewMode === 'ndr') fetchOrders(); else fetchClientSummary(); }} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Status Stats Tabs */}
      <div className="ndr-stats-row">
        {tabConfig.map(tab => (
          <div
            key={tab.key}
            className={`ndr-stat-card ${tab.className} ${activeTab === tab.key && viewMode === 'ndr' ? 'active' : ''}`}
            onClick={() => { setViewMode('ndr'); setActiveTab(tab.key); }}
          >
            <div className="stat-count">{stats[tab.countKey] as number}</div>
            <div className="stat-label">{tab.label}</div>
          </div>
        ))}
      </div>

      {/* Action-Type Dashboard */}
      {!clientId && (
        <div className="action-breakdown-row">
          <div
            className={`action-box reattempt ${actionTypeFilter === 'reattempt' ? 'active' : ''}`}
            onClick={() => handleActionTypeClick('reattempt')}
          >
            <div className="action-box-count">{actionBreakdown.reattempt}</div>
            <div className="action-box-label">Reattempt Requests</div>
          </div>
          <div
            className={`action-box edit ${actionTypeFilter === 'edit_requested' ? 'active' : ''}`}
            onClick={() => handleActionTypeClick('edit_requested')}
          >
            <div className="action-box-count">{actionBreakdown.edit_requested}</div>
            <div className="action-box-label">Change Details</div>
          </div>
          <div
            className={`action-box rto ${actionTypeFilter === 'rto' ? 'active' : ''}`}
            onClick={() => handleActionTypeClick('rto')}
          >
            <div className="action-box-count">{actionBreakdown.rto}</div>
            <div className="action-box-label">Return / RTO</div>
          </div>
          <div
            className={`action-box hold ${actionTypeFilter === 'hold' ? 'active' : ''}`}
            onClick={() => handleActionTypeClick('hold')}
          >
            <div className="action-box-count">{actionBreakdown.hold}</div>
            <div className="action-box-label">Fake Remark</div>
          </div>
        </div>
      )}

      {/* ===== CLIENT SUMMARY VIEW ===== */}
      {viewMode === 'client' && !clientId && (
        <div className="client-summary-section">
          {clientLoading ? (
            <div className="loading-state">Loading client NDR summary...</div>
          ) : (
            <div className="table-wrapper">
              <table className="ndr-table">
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Client Details</th>
                    <th className="numeric">All NDR</th>
                    <th className="numeric">Action Required</th>
                    <th className="numeric">Action Taken</th>
                    <th className="numeric">NDR Delivered</th>
                    <th className="numeric">RTO</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-state">No clients with NDR orders found.</td>
                    </tr>
                  ) : (
                    clientSummary.map(client => (
                      <tr key={client._id}>
                        <td>
                          <span className="client-id-badge">{client.client_id}</span>
                        </td>
                        <td>
                          <div className="client-info">
                            <button
                              className="client-name-link"
                              onClick={() => navigate(`/admin/clients/${client._id}/dashboard`)}
                            >
                              {client.company_name}
                            </button>
                            <span className="client-id-text">{client.email}</span>
                          </div>
                        </td>
                        <td className="numeric">
                          <button className="count-btn" onClick={() => handleClientNDRClick(client._id)}>
                            {client.total_ndrs}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn action-required" onClick={() => handleClientNDRClick(client._id, 'action_required')}>
                            {client.ndrs_by_status.action_required}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn action-taken" onClick={() => handleClientNDRClick(client._id, 'action_taken')}>
                            {client.ndrs_by_status.action_taken}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn delivered" onClick={() => handleClientNDRClick(client._id, 'delivered')}>
                            {client.ndrs_by_status.delivered}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn rto" onClick={() => handleClientNDRClick(client._id, 'rto')}>
                            {client.ndrs_by_status.rto}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== NDR TABLE VIEW ===== */}
      {viewMode === 'ndr' && (
        <>
          {/* Filter Bar */}
          <div className="filter-bar">
            <div className="filter-group">
              <label>Payment Mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="">All</option>
                <option value="COD">COD</option>
                <option value="Prepaid">Prepaid</option>
              </select>
            </div>

            <div className="filter-group">
              <label>NDR Reason</label>
              <select value={ndrReasonFilter} onChange={(e) => setNdrReasonFilter(e.target.value)}>
                <option value="">All Reasons</option>
                {Object.entries(NDR_REASON_MAP).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Aging</label>
              <select value={agingFilter} onChange={(e) => setAgingFilter(e.target.value)}>
                <option value="">All</option>
                <option value="1-2">1–2 Days</option>
                <option value="3-5">3–5 Days</option>
                <option value="7+">7+ Days</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="filter-group">
              <label>Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="filter-group search-group">
              <label>Search</label>
              <input
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
            {actionTypeFilter && <span className="filter-tag"> • Filtered by: {getResolutionLabel(actionTypeFilter)}</span>}
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
                    <th>Order ID</th>
                    {!clientId && <th>Client ID</th>}
                    {!clientId && <th>Client</th>}
                    <th>Customer</th>
                    <th>NDR Reason</th>
                    <th>Attempts</th>
                    <th>Last NDR Date</th>
                    <th>Next Attempt</th>
                    <th>Aging</th>
                    <th>Payment</th>
                    <th>Resolution</th>
                    <th>Status</th>
                    <th>Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={clientId ? 11 : 13} className="empty-state">
                        No NDR orders found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => {
                      const ticket = getLatestTicket(order);
                      const aging = calcAging(order.ndr_info?.last_ndr_date || order.created_at);
                      return (
                        <tr key={order._id} className="clickable-row" onClick={() => handleOpenDetail(order)}>
                          <td>
                            <span className="awb-number">
                              {order.delhivery_data?.waybill || '-'}
                            </span>
                          </td>
                          <td>
                            <span className="order-id-text">{order.order_id || '-'}</span>
                          </td>
                          {!clientId && (
                            <td>
                              <span className="client-id-badge">
                                {order.user_id?.client_id || '-'}
                              </span>
                            </td>
                          )}
                          {!clientId && (
                            <td>
                              <div className="client-info">
                                <button
                                  className="client-name-link"
                                  onClick={(e) => handleClientClick(order.user_id?._id, e)}
                                >
                                  {order.user_id?.company_name || 'Unknown'}
                                </button>
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
                            {order.ndr_info?.next_attempt_date
                              ? formatDate(order.ndr_info.next_attempt_date)
                              : <span className="no-data">-</span>}
                          </td>
                          <td>
                            <span className={`aging-badge ${aging >= 7 ? 'aging-critical' : aging >= 3 ? 'aging-warn' : ''}`}>
                              {aging}d
                            </span>
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
          <div className="pagination">
            <div className="per-page-selector">
              <span>Show</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>per page</span>
            </div>
            {pagination.total_pages > 1 && (
              <>
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
              </>
            )}
          </div>
        </>
      )}

      {/* ===== NDR DETAIL SLIDE-OVER ===== */}
      {(detailOrder || detailLoading) && (
        <div className="ndr-detail-overlay" onClick={() => setDetailOrder(null)}>
          <div className="ndr-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ndr-detail-header">
              <h2>NDR Detail</h2>
              <button className="ndr-detail-close" onClick={() => setDetailOrder(null)}>✕</button>
            </div>

            {detailLoading ? (
              <div className="loading-state">Loading order detail...</div>
            ) : detailOrder && (
              <div className="ndr-detail-body">
                {/* Order Info */}
                <section className="detail-section">
                  <h3>Order Information</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">AWB</span><span className="awb-number">{detailOrder.delhivery_data?.waybill || '-'}</span></div>
                    <div><span className="detail-label">Order ID</span><span>{detailOrder.order_id || '-'}</span></div>
                    <div><span className="detail-label">Status</span><span className={`status-badge ${detailOrder.status}`}>{detailOrder.status?.toUpperCase()}</span></div>
                    <div><span className="detail-label">Payment</span><span>{detailOrder.payment_info?.payment_mode || '-'}</span></div>
                  </div>
                </section>

                {/* Customer Info */}
                <section className="detail-section">
                  <h3>Customer Details</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Name</span><span>{detailOrder.customer_info?.buyer_name || '-'}</span></div>
                    <div><span className="detail-label">Phone</span><span>{detailOrder.customer_info?.phone || '-'}</span></div>
                    <div><span className="detail-label">Address</span><span>{detailOrder.delivery_address?.full_address || '-'}</span></div>
                    <div><span className="detail-label">City / PIN</span><span>{detailOrder.delivery_address?.city} {detailOrder.delivery_address?.pincode}</span></div>
                  </div>
                </section>

                {/* NDR Info */}
                <section className="detail-section">
                  <h3>NDR Information</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Reason</span><span>{getNDRDisplayReason(detailOrder.ndr_info?.nsl_code, detailOrder.ndr_info?.ndr_reason)}</span></div>
                    <div><span className="detail-label">NSL Code</span><span>{detailOrder.ndr_info?.nsl_code || '-'}</span></div>
                    <div><span className="detail-label">Attempts</span><span>{detailOrder.ndr_info?.ndr_attempts || 0}</span></div>
                    <div><span className="detail-label">Last NDR Date</span><span>{detailOrder.ndr_info?.last_ndr_date ? formatDate(detailOrder.ndr_info.last_ndr_date) : '-'}</span></div>
                    <div><span className="detail-label">Resolution</span><span>{getResolutionLabel(detailOrder.ndr_info?.resolution_action)}</span></div>
                    <div><span className="detail-label">Next Attempt</span><span>{detailOrder.ndr_info?.next_attempt_date ? formatDate(detailOrder.ndr_info.next_attempt_date) : '-'}</span></div>
                  </div>
                </section>

                {/* Action History */}
                {detailOrder.ndr_info?.action_history?.length > 0 && (
                  <section className="detail-section">
                    <h3>Action History</h3>
                    <div className="action-history-list">
                      {detailOrder.ndr_info.action_history.map((entry: any, i: number) => (
                        <div key={i} className={`action-history-entry ${entry.action?.startsWith('admin:') ? 'admin-action' : 'client-action'}`}>
                          <div className="ah-header">
                            <span className="ah-action">{entry.action?.startsWith('admin:') ? `Admin: ${entry.action.replace('admin:', '')}` : entry.action}</span>
                            <span className="ah-time">{entry.timestamp ? formatDate(entry.timestamp) : ''}</span>
                          </div>
                          {entry.remarks && <div className="ah-remarks">{entry.remarks}</div>}
                          {entry.ticket_id && (
                            <button
                              className="ticket-link"
                              onClick={() => navigate(`/admin/clients/${detailOrder.user_id?._id}/tickets/${entry.ticket_object_id}`)}
                            >
                              Ticket: {entry.ticket_id}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Admin Action Panel */}
                <section className="detail-section admin-action-panel">
                  <h3>Admin Actions</h3>
                  <div className="admin-remark-row">
                    <input
                      type="text"
                      className="admin-remark-input"
                      placeholder="Add remark (optional)"
                      value={adminRemark}
                      onChange={(e) => setAdminRemark(e.target.value)}
                    />
                  </div>
                  <div className="admin-action-btns">
                    <button
                      className="btn-action reattempt"
                      onClick={() => handleAdminAction('reattempt')}
                      disabled={actionLoading}
                    >
                      Reattempt
                    </button>
                    <button
                      className="btn-action rto"
                      onClick={() => handleAdminAction('rto')}
                      disabled={actionLoading}
                    >
                      Mark RTO
                    </button>
                    <button
                      className="btn-action close"
                      onClick={() => handleAdminAction('close')}
                      disabled={actionLoading}
                    >
                      Close NDR
                    </button>
                    <button
                      className="btn-action remark"
                      onClick={() => handleAdminAction('add_remark')}
                      disabled={actionLoading || !adminRemark.trim()}
                    >
                      Add Remark
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNDR;
