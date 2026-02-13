import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService, ClientDashboardData } from '../services/adminService';
import AWBLink from '../components/AWBLink';
import './AdminClientDashboard.css';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${day}/${month}/${year}, ${hour12}:${minutes} ${ampm}`;
};

const AdminClientDashboard: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<ClientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!clientId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await adminService.getClientDashboard(clientId);
      setDashboard(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load client dashboard');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="admin-client-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading client dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="admin-client-dashboard">
        <div className="error-container">
          <p className="error-message">{error || 'Failed to load dashboard'}</p>
          <button onClick={fetchDashboard} className="btn-primary">
            Retry
          </button>
          <button onClick={() => navigate('/admin/clients')} className="btn-secondary">
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  const { client, tickets, orders, ndr, cod, remittance, recentTransactions, recentOrders } = dashboard;

  return (
    <div className="admin-client-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <button className="back-button" onClick={() => navigate('/admin/clients')}>
            Back to Clients
          </button>
          <div className="client-info-header">
            <h1>{client.company_name}</h1>
            <div className="client-badges">
              <span className={`status-badge ${client.account_status}`}>
                {client.account_status.replace('_', ' ')}
              </span>
              <span className={`kyc-badge ${client.kyc_status.status}`}>
                KYC: {client.kyc_status.status}
              </span>
              {client.user_category && (
                <span className="category-badge">{client.user_category}</span>
              )}
            </div>
          </div>
        </div>
        <div className="header-right">
          <button className="btn-primary" onClick={() => navigate(`/admin/clients/${clientId}/kyc`)}>
            View KYC Documents
          </button>
          <button className="btn-primary" onClick={() => navigate(`/admin/clients/${clientId}/tickets`)}>
            View Tickets
          </button>
          <button className="btn-secondary" onClick={() => navigate(`/admin/billing/${clientId}`)}>
            View Billing
          </button>
        </div>
      </div>

      {/* Client Info Cards */}
      <div className="client-info-section">
        <div className="info-card">
          <div className="info-icon">CP</div>
          <div className="info-content">
            <span className="info-label">Contact Person</span>
            <span className="info-value">{client.your_name}</span>
          </div>
        </div>
        <div className="info-card">
          <div className="info-icon">EM</div>
          <div className="info-content">
            <span className="info-label">Email</span>
            <span className="info-value">{client.email}</span>
          </div>
        </div>
        <div className="info-card">
          <div className="info-icon">PH</div>
          <div className="info-content">
            <span className="info-label">Phone</span>
            <span className="info-value">{client.phone_number}</span>
          </div>
        </div>
        <div className="info-card">
          <div className="info-icon">ID</div>
          <div className="info-content">
            <span className="info-label">Client ID</span>
            <span className="info-value">{client.client_id}</span>
          </div>
        </div>
        <div className="info-card wallet">
          <div className="info-icon">WB</div>
          <div className="info-content">
            <span className="info-label">Wallet Balance</span>
            <span className="info-value">{formatCurrency(client.wallet_balance)}</span>
          </div>
        </div>
        <div className="info-card">
          <div className="info-icon">DT</div>
          <div className="info-content">
            <span className="info-label">Member Since</span>
            <span className="info-value">{formatDate(client.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="stats-grid">
        {/* Ticket Lifecycle Section */}
        <div className="stats-section tickets-section">
          <div className="section-header">
            <h2>Ticket Lifecycle</h2>
            <span className="section-total">{tickets.total} Total</span>
          </div>
          <div className="stats-cards">
            <div className="stat-card open" onClick={() => navigate(`/admin/clients/${clientId}/tickets?status=open`)}>
              <span className="stat-value">{tickets.open}</span>
              <span className="stat-label">Open</span>
            </div>
            <div className="stat-card in-progress" onClick={() => navigate(`/admin/clients/${clientId}/tickets?status=in_progress`)}>
              <span className="stat-value">{tickets.in_progress}</span>
              <span className="stat-label">In Progress</span>
            </div>
            <div className="stat-card escalated" onClick={() => navigate(`/admin/clients/${clientId}/tickets?status=escalated`)}>
              <span className="stat-value">{tickets.escalated}</span>
              <span className="stat-label">Escalated</span>
            </div>
            <div className="stat-card resolved" onClick={() => navigate(`/admin/clients/${clientId}/tickets?status=resolved`)}>
              <span className="stat-value">{tickets.resolved}</span>
              <span className="stat-label">Resolved</span>
            </div>
            <div className="stat-card closed" onClick={() => navigate(`/admin/clients/${clientId}/tickets?status=closed`)}>
              <span className="stat-value">{tickets.closed}</span>
              <span className="stat-label">Closed</span>
            </div>
          </div>
        </div>

        {/* Shipment Status Section */}
        <div className="stats-section orders-section">
          <div className="section-header">
            <h2>Shipment Status</h2>
            <span className="section-total">{orders.total} Total</span>
          </div>
          <div className="stats-cards">
            <div className="stat-card new">
              <span className="stat-value">{orders.new}</span>
              <span className="stat-label">New</span>
            </div>
            <div className="stat-card ready">
              <span className="stat-value">{orders.ready_to_ship}</span>
              <span className="stat-label">Ready to Ship</span>
            </div>
            <div className="stat-card in-transit">
              <span className="stat-value">{orders.in_transit}</span>
              <span className="stat-label">In Transit</span>
            </div>
            <div className="stat-card out-for-delivery">
              <span className="stat-value">{orders.out_for_delivery}</span>
              <span className="stat-label">Out for Delivery</span>
            </div>
            <div className="stat-card delivered">
              <span className="stat-value">{orders.delivered}</span>
              <span className="stat-label">Delivered</span>
            </div>
            <div className="stat-card ndr">
              <span className="stat-value">{orders.ndr}</span>
              <span className="stat-label">NDR</span>
            </div>
            <div className="stat-card rto">
              <span className="stat-value">{orders.rto_in_transit + orders.rto_delivered}</span>
              <span className="stat-label">RTO</span>
            </div>
            <div className="stat-card lost">
              <span className="stat-value">{orders.lost}</span>
              <span className="stat-label">Lost</span>
            </div>
          </div>
        </div>

        {/* NDR Section */}
        <div className="stats-section ndr-section">
          <div className="section-header">
            <h2>NDR Status</h2>
            <span className="section-total">{ndr.total} Total</span>
          </div>
          <div className="stats-cards">
            <div className="stat-card pending">
              <span className="stat-value">{ndr.pending}</span>
              <span className="stat-label">Pending</span>
            </div>
            <div className="stat-card reattempt">
              <span className="stat-value">{ndr.reattempt_requested}</span>
              <span className="stat-label">Reattempt</span>
            </div>
            <div className="stat-card rto-requested">
              <span className="stat-value">{ndr.rto_requested}</span>
              <span className="stat-label">RTO Requested</span>
            </div>
            <div className="stat-card resolved">
              <span className="stat-value">{ndr.resolved}</span>
              <span className="stat-label">Resolved</span>
            </div>
          </div>
        </div>

        {/* COD Section */}
        <div className="stats-section cod-section">
          <div className="section-header">
            <h2>COD Summary</h2>
            <span className="section-total">{cod.total_cod_orders} Orders</span>
          </div>
          <div className="cod-stats">
            <div className="cod-stat-card total">
              <span className="cod-label">Total COD Amount</span>
              <span className="cod-value">{formatCurrency(cod.total_cod_amount)}</span>
            </div>
            <div className="cod-stat-card delivered">
              <span className="cod-label">Delivered COD</span>
              <span className="cod-value">{formatCurrency(cod.delivered_cod)}</span>
            </div>
            <div className="cod-stat-card pending">
              <span className="cod-label">Pending COD</span>
              <span className="cod-value">{formatCurrency(cod.pending_cod)}</span>
            </div>
            <div className="cod-stat-card rto">
              <span className="cod-label">RTO COD</span>
              <span className="cod-value">{formatCurrency(cod.rto_cod)}</span>
            </div>
          </div>
        </div>

        {/* Remittance Section */}
        <div className="stats-section remittance-section">
          <div className="section-header">
            <h2>Remittance Summary</h2>
            <span className="section-total">{remittance.total_records} Records</span>
          </div>
          <div className="remittance-stats">
            <div className="remittance-stat-card remitted">
              <span className="remittance-label">Total Remitted</span>
              <span className="remittance-value">{formatCurrency(remittance.total_remitted)}</span>
            </div>
            <div className="remittance-stat-card pending">
              <span className="remittance-label">Pending Remittance</span>
              <span className="remittance-value">{formatCurrency(remittance.pending_remittance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity">
        {/* Recent Orders */}
        <div className="activity-section">
          <div className="section-header">
            <h2>Recent Orders</h2>
            <button className="btn-link" onClick={() => navigate(`/admin/orders/clients/${clientId}/orders`)}>
              View All
            </button>
          </div>
          <div className="activity-list">
            {recentOrders.length === 0 ? (
              <p className="no-data">No recent orders</p>
            ) : (
              recentOrders.map((order) => (
                <div key={order._id} className="activity-item" onClick={() => navigate(`/admin/orders/${order._id}/details`)}>
                  <div className="activity-main">
                    <span className="activity-id">{order.order_id}</span>
                    {order.awb_number && (
                      <AWBLink awb={order.awb_number} showPrefix className="activity-awb" />
                    )}
                  </div>
                  <div className="activity-meta">
                    <span className={`activity-status status-${order.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                      {order.status}
                    </span>
                    <span className="activity-date">{formatDateTime(order.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="activity-section">
          <div className="section-header">
            <h2>Recent Transactions</h2>
            <button className="btn-link" onClick={() => navigate(`/admin/billing/${clientId}`)}>
              View All
            </button>
          </div>
          <div className="activity-list">
            {recentTransactions.length === 0 ? (
              <p className="no-data">No recent transactions</p>
            ) : (
              recentTransactions.map((txn) => (
                <div key={txn._id} className="activity-item">
                  <div className="activity-main">
                    <span className={`txn-type ${txn.type}`}>{txn.type}</span>
                    <span className="txn-description">{txn.description}</span>
                  </div>
                  <div className="activity-meta">
                    <span className={`txn-amount ${txn.type === 'credit' ? 'positive' : 'negative'}`}>
                      {txn.type === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(txn.amount))}
                    </span>
                    <span className="activity-date">{formatDateTime(txn.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminClientDashboard;
