import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { remittanceService, RemittanceDetail as RemittanceDetailType } from '../services/remittanceService';
import { formatDate as formatDateUtil } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './RemittanceDetail.css';

const RemittanceDetail: React.FC = () => {
  const { remittanceNumber } = useParams<{ remittanceNumber: string }>();
  const navigate = useNavigate();
  const [remittance, setRemittance] = useState<RemittanceDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchAWB, setSearchAWB] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchRemittanceDetail = useCallback(async () => {
    if (!remittanceNumber) return;
    
    try {
      setLoading(true);
      const response = await remittanceService.getRemittanceDetail(remittanceNumber);
      if (response.success && response.data) {
        setRemittance(response.data);
      }
    } catch (error: any) {
      console.error('Error fetching remittance detail:', error);
      alert(error.response?.data?.message || 'Failed to load remittance details');
      navigate('/remittances');
    } finally {
      setLoading(false);
    }
  }, [remittanceNumber, navigate]);

  useEffect(() => {
    if (remittanceNumber) {
      fetchRemittanceDetail();
    }
  }, [remittanceNumber, fetchRemittanceDetail]);

  const handleDownloadAWB = async () => {
    if (!remittanceNumber) return;
    
    try {
      setDownloading(true);
      const blob = await remittanceService.downloadAWBData(remittanceNumber);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Remittance_${remittanceNumber}_AWB_Data.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading AWB data:', error);
      alert(error.message || 'Failed to download AWB data');
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (dateString: string) => formatDateUtil(dateString);

  if (loading) {
    return (
      <Layout>
        <div className="remittance-detail-container">
          <div className="loading-state">Loading remittance details...</div>
        </div>
      </Layout>
    );
  }

  if (!remittance) {
    return (
      <Layout>
        <div className="remittance-detail-container">
          <div className="empty-state">Remittance not found</div>
        </div>
      </Layout>
    );
  }

  const filteredOrders = searchAWB
    ? remittance.remittance_orders.filter(order => 
        order.awb_number.toLowerCase().includes(searchAWB.toLowerCase())
      )
    : remittance.remittance_orders;

  return (
    <Layout>
      <div className="remittance-detail-container">
        {/* Header */}
        <div className="detail-header">
          <button className="back-button" onClick={() => navigate('/remittances')}>
            ← Back
          </button>
          <h1>Transaction Details</h1>
          <button className="help-button">
            🎧 Need Help?
          </button>
        </div>

        {/* Transaction ID Section */}
        <div className="transaction-id-section">
          <div className="transaction-icon">&#8377;</div>
          <div className="transaction-info">
            <div className="transaction-number">{remittance.remittance_number}</div>
            <div className="transaction-meta">
              <span className={`status-badge ${remittance.state}`}>
                {remittance.state.charAt(0).toUpperCase() + remittance.state.slice(1)}
              </span>
              <span className="processed-date">
                Remittance Date: {formatDate(remittance.remittance_date || remittance.date)}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content Cards */}
        <div className="detail-cards">
          {/* Remittance Details Card */}
          <div className="detail-card remittance-details-card">
            <div className="card-header">
              <span className="card-icon">📄</span>
              <h3>Remittance Details</h3>
              <button className="download-link" onClick={handleDownloadAWB} disabled={downloading}>
                {downloading ? 'Downloading...' : 'Download AWB data'}
              </button>
            </div>
            <div className="card-content">
              <div className="remittance-amount-section">
                <div className="amount-icon">⚠️</div>
                <div className="amount-info">
                  <div className="amount-label">Remittance Amount</div>
                  <div className="amount-value">₹ {remittance.total_remittance.toFixed(2)}</div>
                </div>
              </div>
              <div className="remittance-summary">
                <div className="summary-item">
                  <span className="summary-label">Total Orders:</span>
                  <span className="summary-value">{remittance.total_orders}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Remittance Date:</span>
                  <span className="summary-value">{formatDate(remittance.remittance_date || remittance.date)}</span>
                </div>
                {remittance.bank_transaction_id && (
                  <div className="summary-item">
                    <span className="summary-label">UTR / Bank Txn ID:</span>
                    <span className="summary-value" style={{ fontWeight: 700, color: '#2e7d32' }}>{remittance.bank_transaction_id}</span>
                  </div>
                )}
                {remittance.settlement_date && (
                  <div className="summary-item">
                    <span className="summary-label">Settlement Date:</span>
                    <span className="summary-value">{formatDate(remittance.settlement_date)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Account Details Card */}
          <div className="detail-card account-details-card">
            <div className="card-header">
              <span className="card-icon">🏢</span>
              <h3>Account Details</h3>
            </div>
            <div className="card-content">
              <div className="account-info">
                <div className="info-row">
                  <span className="info-label">Bank:</span>
                  <span className="info-value">{remittance.account_details.bank || '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Beneficiary Name:</span>
                  <span className="info-value">{remittance.account_details.beneficiary_name || '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">A/C Number:</span>
                  <span className="info-value">{remittance.account_details.account_number || '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">IFSC Code:</span>
                  <span className="info-value">{remittance.account_details.ifsc_code || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Orders Card */}
        <div className="detail-card orders-card">
          <div className="card-header">
            <span className="card-icon">📦</span>
            <h3>Orders</h3>
          </div>
          <div className="card-content">
            <div className="orders-search">
              <input
                type="text"
                placeholder="Search By AWB"
                value={searchAWB}
                onChange={(e) => setSearchAWB(e.target.value)}
              />
            </div>
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>AWB NUMBER</th>
                    <th>AMOUNT COLLECTED</th>
                    <th>DELIVERED DATE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="no-orders">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order, index) => (
                      <tr key={index}>
                        <td>
                          <AWBLink awb={order.awb_number} />
                        </td>
                        <td>₹ {order.amount_collected.toFixed(2)}</td>
                        <td>{order.delivered_date ? formatDate(order.delivered_date) : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default RemittanceDetail;

