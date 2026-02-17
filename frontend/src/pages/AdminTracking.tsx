import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { adminService } from '../services/adminService';
import './AdminRemittances.css';

interface TrackingData {
  waybill: string;
  current_status: string;
  origin: string;
  destination: string;
  scans: Array<{
    status: string;
    date: string;
    location: string;
    instructions?: string;
  }>;
  [key: string]: any;
}

const AdminTracking: React.FC = () => {
  const { awb: urlAwb } = useParams<{ awb?: string }>();
  const [awbInput, setAwbInput] = useState(urlAwb || '');
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const trackShipment = async (awb: string) => {
    if (!awb.trim()) return;
    setLoading(true);
    setError(null);
    setTracking(null);
    setOrderDetails(null);

    try {
      // Fetch tracking from public API
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/shipping/public/track/${encodeURIComponent(awb.trim())}`);
      const data = await response.json();

      if (data.success) {
        setTracking(data.data || data);
      } else {
        setError(data.message || 'Failed to fetch tracking data');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tracking data');
    }

    // Also try to fetch order details from admin
    try {
      const adminHeaders = {
        'x-admin-email': localStorage.getItem('admin_email') || localStorage.getItem('staff_email') || '',
        'x-admin-password': localStorage.getItem('admin_password') || 'jpmcA123'
      };
      const orderRes = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin/global-search?query=${encodeURIComponent(awb.trim())}`, {
        headers: { ...adminHeaders, 'Content-Type': 'application/json' }
      });
      const orderData = await orderRes.json();
      if (orderData.success && orderData.data?.orders?.length > 0) {
        setOrderDetails(orderData.data.orders[0]);
      }
    } catch {
      // Silently ignore — order details are optional
    }

    setLoading(false);
  };

  useEffect(() => {
    if (urlAwb) {
      setAwbInput(urlAwb);
      trackShipment(urlAwb);
    }
  }, [urlAwb]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trackShipment(awbInput);
  };

  return (
    <div className="admin-remittances">
      <div className="page-header">
        <h1>Shipment Tracking</h1>
        <p>Track shipments by AWB number</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Enter AWB / Tracking Number"
          value={awbInput}
          onChange={e => setAwbInput(e.target.value)}
          className="search-input"
          style={{ flex: 1, maxWidth: '400px' }}
        />
        <button type="submit" className="btn-action btn-process" disabled={loading || !awbInput.trim()}>
          {loading ? 'Tracking...' : 'Track'}
        </button>
      </form>

      {error && <div className="error-box"><p>{error}</p></div>}

      {/* Order Info */}
      {orderDetails && (
        <div className="detail-cards" style={{ marginBottom: '16px' }}>
          <div className="detail-card">
            <h3>Order Info</h3>
            <div className="card-row"><span>Order ID:</span><strong>{orderDetails.order_id}</strong></div>
            <div className="card-row"><span>Status:</span><strong>{orderDetails.status}</strong></div>
            <div className="card-row"><span>Payment:</span><strong>{orderDetails.payment_info?.payment_mode} {orderDetails.payment_info?.payment_mode === 'COD' ? `(₹${orderDetails.payment_info?.cod_amount})` : ''}</strong></div>
            <div className="card-row"><span>Customer:</span><strong>{orderDetails.customer_info?.name || '-'}</strong></div>
          </div>
        </div>
      )}

      {/* Tracking Timeline */}
      {tracking && (
        <div className="detail-card" style={{ marginTop: '16px' }}>
          <h3>Tracking Details — {tracking.waybill || awbInput}</h3>
          {tracking.current_status && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#e3f2fd', borderRadius: '8px' }}>
              <strong>Current Status:</strong> {tracking.current_status}
            </div>
          )}

          {tracking.scans && tracking.scans.length > 0 ? (
            <div className="tracking-timeline">
              {tracking.scans.map((scan, idx) => (
                <div key={idx} className="timeline-item" style={{ padding: '12px 0', borderBottom: idx < tracking.scans.length - 1 ? '1px solid #eee' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong>{scan.status}</strong>
                    <span style={{ color: '#666', fontSize: '13px' }}>{formatDate(scan.date)}</span>
                  </div>
                  {scan.location && <div style={{ color: '#666', fontSize: '13px' }}>{scan.location}</div>}
                  {scan.instructions && <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{scan.instructions}</div>}
                </div>
              ))}
            </div>
          ) : (
            <p>No scan events available</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminTracking;
