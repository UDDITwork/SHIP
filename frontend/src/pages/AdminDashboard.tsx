import React, { useState, useEffect } from 'react';
import { adminService, AdminDashboard as AdminDashboardType } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import './AdminDashboard.css';

const AdminDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<AdminDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch data if admin is authenticated
    const isAuthenticated = localStorage.getItem('admin_authenticated');
    if (isAuthenticated) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching admin dashboard data...');
      const data = await adminService.getDashboard();
      console.log('📊 Admin dashboard data received:', data);
      setDashboardData(data);
    } catch (err: any) {
      console.error('❌ Error fetching admin dashboard:', err);
      setError(err.message || 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10B981';
      case 'pending_verification': return '#F59E0B';
      case 'suspended': return '#EF4444';
      case 'inactive': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getKYCStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return '#10B981';
      case 'pending': return '#F59E0B';
      case 'rejected': return '#EF4444';
      default: return '#6B7280';
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={fetchDashboardData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p>Manage all clients and monitor system performance</p>
      </div>

      {dashboardData && dashboardData.overview && (
        <>
          {/* Overview Cards */}
          <div className="overview-cards">
            <div className="card">
              <div className="card-icon">👥</div>
              <div className="card-content">
                <h3>Total Clients</h3>
                <p className="card-number">{dashboardData.overview.totalClients}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-icon">✅</div>
              <div className="card-content">
                <h3>Active Clients</h3>
                <p className="card-number">{dashboardData.overview.activeClients}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-icon">⏳</div>
              <div className="card-content">
                <h3>Pending Verification</h3>
                <p className="card-number">{dashboardData.overview.pendingVerification}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-icon">🚫</div>
              <div className="card-content">
                <h3>Suspended</h3>
                <p className="card-number">{dashboardData.overview.suspendedClients}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-icon">📦</div>
              <div className="card-content">
                <h3>Total Orders</h3>
                <p className="card-number">{dashboardData.overview.totalOrders}</p>
              </div>
            </div>
            <div className="card">
              <div className="card-icon">📋</div>
              <div className="card-content">
                <h3>Total Packages</h3>
                <p className="card-number">{dashboardData.overview.totalPackages}</p>
              </div>
            </div>
          </div>

          {/* Recent Clients */}
          <div className="recent-clients">
            <h2>Recent Clients</h2>
            <div className="clients-table">
              <table>
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>KYC</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.recentClients && dashboardData.recentClients.map((client) => {
                    console.log('👤 Client data:', client);
                    return (
                    <tr key={client._id}>
                      <td>
                        <span className="client-id">{client.client_id || 'N/A'}</span>
                      </td>
                      <td>
                        <div className="company-info">
                          <strong>{client.company_name || 'N/A'}</strong>
                          <small>{client.your_name || 'N/A'}</small>
                        </div>
                      </td>
                      <td>
                        <div className="contact-info">
                          <div>{client.email || 'N/A'}</div>
                          <small>{client.phone_number || 'N/A'}</small>
                        </div>
                      </td>
                      <td>
                        <span className="user-type">
                          {client.user_type ? client.user_type.replace(/-/g, ' ') : 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span 
                          className="status-badge"
                          style={{ backgroundColor: getStatusColor(client.account_status) }}
                        >
                          {client.account_status ? client.account_status.replace('_', ' ') : 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span 
                          className="kyc-badge"
                          style={{ backgroundColor: getKYCStatusColor(client.kyc_status?.status || 'pending') }}
                        >
                          {client.kyc_status?.status || 'pending'}
                        </span>
                      </td>
                      <td>
                        {client.created_at ? formatDate(client.created_at) : 'N/A'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Client Types Distribution */}
          <div className="client-types">
            <h2>Clients by Type</h2>
            <div className="types-grid">
              {dashboardData.clientsByType && dashboardData.clientsByType.map((type) => (
                <div key={type._id} className="type-card">
                  <h4>{type._id ? type._id.replace(/-/g, ' ') : 'Unknown'}</h4>
                  <p className="type-count">{type.count || 0}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
