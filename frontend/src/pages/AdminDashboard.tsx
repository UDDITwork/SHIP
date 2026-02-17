import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { adminService, AdminDashboard as AdminDashboardType } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import './AdminDashboard.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const AdminDashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<AdminDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    // Only fetch data if admin is authenticated
    const isAuthenticated = localStorage.getItem('admin_authenticated');
    if (isAuthenticated) {
      fetchDashboardData();
      fetchAnalytics();
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

  const fetchAnalytics = async () => {
    try {
      const res = await adminService.getDashboardAnalytics();
      if (res.success) {
        setAnalytics(res.data);
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
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

      {/* Analytics Charts */}
      {analytics && (
        <div className="analytics-section">
          <h2>Order Analytics</h2>
          <div className="charts-grid">
            {/* COD vs Prepaid Pie Chart */}
            {analytics.cod_vs_prepaid && (
              <div className="chart-card">
                <h3>COD vs Prepaid</h3>
                <div className="chart-container pie-chart-container">
                  <Pie
                    data={{
                      labels: ['COD', 'Prepaid'],
                      datasets: [{
                        data: [analytics.cod_vs_prepaid.cod_count, analytics.cod_vs_prepaid.prepaid_count],
                        backgroundColor: ['#F68723', '#002B59'],
                        borderWidth: 2,
                        borderColor: '#fff',
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => {
                              const total = analytics.cod_vs_prepaid.cod_count + analytics.cod_vs_prepaid.prepaid_count;
                              const pct = total > 0 ? ((ctx.raw as number) / total * 100).toFixed(1) : '0';
                              return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Weight Distribution Bar Chart */}
            {analytics.weight_distribution && analytics.weight_distribution.length > 0 && (
              <div className="chart-card">
                <h3>Weight Distribution</h3>
                <div className="chart-container">
                  <Bar
                    data={{
                      labels: analytics.weight_distribution.map((b: any) => b.bucket),
                      datasets: [{
                        label: 'Orders',
                        data: analytics.weight_distribution.map((b: any) => b.count),
                        backgroundColor: '#21B5B5',
                        borderRadius: 4,
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                        x: { grid: { display: false } }
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Zone Distribution Bar Chart */}
            {analytics.zone_distribution && analytics.zone_distribution.length > 0 && (
              <div className="chart-card">
                <h3>Zone Distribution</h3>
                <div className="chart-container">
                  <Bar
                    data={{
                      labels: analytics.zone_distribution.map((z: any) => `Zone ${z.zone}`),
                      datasets: [{
                        label: 'Orders',
                        data: analytics.zone_distribution.map((z: any) => z.count),
                        backgroundColor: '#002B59',
                        borderRadius: 4,
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                        x: { grid: { display: false } }
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Courier Performance Bar Chart */}
            {analytics.courier_distribution && analytics.courier_distribution.length > 0 && (
              <div className="chart-card">
                <h3>Courier Performance</h3>
                <div className="chart-container">
                  <Bar
                    data={{
                      labels: analytics.courier_distribution.map((c: any) => c.carrier_name),
                      datasets: [
                        {
                          label: 'Total',
                          data: analytics.courier_distribution.map((c: any) => c.count),
                          backgroundColor: '#002B59',
                          borderRadius: 4,
                        },
                        {
                          label: 'Delivered',
                          data: analytics.courier_distribution.map((c: any) => c.delivered),
                          backgroundColor: '#21B5B5',
                          borderRadius: 4,
                        },
                        {
                          label: 'RTO',
                          data: analytics.courier_distribution.map((c: any) => c.rto),
                          backgroundColor: '#F68723',
                          borderRadius: 4,
                        }
                      ]
                    }}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      scales: {
                        x: { beginAtZero: true, ticks: { precision: 0 } },
                        y: { grid: { display: false } }
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
