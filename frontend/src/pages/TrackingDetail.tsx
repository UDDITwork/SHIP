import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Layout from '../components/Layout';
import { environmentConfig } from '../config/environment';
import { formatDate, formatDateTime, formatTime } from '../utils/dateFormat';
import './TrackingDetail.css';

// Types for Delhivery tracking response
interface ScanDetail {
  ScanDateTime?: string;
  ScanType?: string;
  Scan?: string;
  StatusDateTime?: string;
  ScannedLocation?: string;
  StatusCode?: string;
  Instructions?: string;
  call_duration?: number;
  geo_location?: {
    lat?: number;
    long?: number;
  };
}

interface Shipment {
  PickUpDate?: string;
  Destination?: string;
  DestRecieveDate?: string;
  Scans?: Array<{ ScanDetail: ScanDetail }>;
  Status?: {
    Status?: string;
    StatusLocation?: string;
    StatusDateTime?: string;
    RecievedBy?: string;
    StatusCode?: string;
    StatusType?: string;
    Instructions?: string;
  };
  AWB?: string;
  Origin?: string;
  Consignee?: {
    Name?: string;
    City?: string;
    State?: string;
    PinCode?: number;
    Address1?: string[];
    Address2?: string[];
    Address3?: string;
  };
  ReferenceNo?: string;
  DeliveryDate?: string;
  ExpectedDeliveryDate?: string;
  SenderName?: string;
  OrderType?: string;
  InvoiceAmount?: number;
}

interface ShipmentData {
  Shipment: Shipment;
}

interface TrackingResponse {
  success: boolean;
  data: {
    ShipmentData?: ShipmentData[];
    normalized?: any;
  };
  meta?: {
    waybill?: string;
    attempts?: number;
    hasRefIds?: boolean;
  };
  message?: string;
}

const TrackingDetail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<Shipment | null>(null);
  const [awbNumber, setAwbNumber] = useState('');

  useEffect(() => {
    const awb = searchParams.get('awb') || '';
    const orderId = searchParams.get('orderId') || '';
    
    if (awb) {
      setAwbNumber(awb);
      fetchTrackingData(awb, orderId);
    } else {
      setError('AWB number is required');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchTrackingData = async (awb: string, orderId?: string) => {
    setLoading(true);
    setError(null);
    setTrackingData(null);

    try {
      const baseApiUrl = environmentConfig.apiUrl.replace(/\/$/, '');
      const trimmedAwb = awb.trim();
      const trimmedOrderId = orderId?.trim() || '';

      const response = await axios.get<TrackingResponse>(
        `${baseApiUrl}/shipping/public/track/${encodeURIComponent(trimmedAwb)}`,
        trimmedOrderId
          ? {
              params: {
                ref_ids: trimmedOrderId
              }
            }
          : undefined
      );

      if (response.data?.success && response.data?.data) {
        // Extract ShipmentData array
        const shipmentData = response.data.data.ShipmentData || [];
        
        if (shipmentData.length > 0 && shipmentData[0]?.Shipment) {
          setTrackingData(shipmentData[0].Shipment);
        } else {
          setError('No tracking information found for this AWB number.');
        }
      } else {
        setError(response.data?.message || 'No tracking information found for this AWB number.');
      }
    } catch (err: any) {
      console.error('Tracking error:', err);
      if (err.response?.status === 503) {
        setError('Tracking service is temporarily unavailable. Please try again later.');
      } else if (err.response?.status === 404) {
        setError('AWB number not found. Please verify the number and try again.');
      } else if (err.response?.status === 429) {
        setError('Too many requests. Please try again later.');
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to fetch tracking information. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // formatDate, formatDateTime, formatTime imported from ../utils/dateFormat

  // Extract scans from the Shipment data
  const scans = trackingData && Array.isArray(trackingData.Scans) ? trackingData.Scans : [];
  const sortedScans = scans.length > 0 ? [...scans].sort((a, b) => {
    const dateA = a.ScanDetail?.ScanDateTime || a.ScanDetail?.StatusDateTime || '';
    const dateB = b.ScanDetail?.ScanDateTime || b.ScanDetail?.StatusDateTime || '';
    // Sort in descending order (newest first) - reverse chronological order
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  }) : [];

  return (
    <Layout>
      <div className="tracking-detail-page">
        <div className="tracking-detail-header">
          <h1>Tracking Details</h1>
          <button className="back-btn" onClick={() => navigate('/orders')}>
            ← Back to Orders
          </button>
        </div>

        {loading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading tracking information...</p>
          </div>
        )}

        {error && (
          <div className="error-container">
            <p className="error-message">{error}</p>
            <button className="retry-btn" onClick={() => {
              const orderId = searchParams.get('orderId') || '';
              fetchTrackingData(awbNumber, orderId);
            }}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && trackingData && (
          <div className="tracking-detail-content">
            {/* Shipment Summary */}
            <div className="shipment-summary">
              <h2>Shipment Information</h2>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">AWB Number:</span>
                  <span className="summary-value">{trackingData.AWB || 'N/A'}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Current Status:</span>
                  <span className={`summary-value status ${(trackingData.Status?.Status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                    {trackingData.Status?.Status || 'N/A'}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Origin:</span>
                  <span className="summary-value">{trackingData.Origin || 'N/A'}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Destination:</span>
                  <span className="summary-value">{trackingData.Destination || 'N/A'}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Reference No:</span>
                  <span className="summary-value">{trackingData.ReferenceNo || 'N/A'}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Order Type:</span>
                  <span className="summary-value">{trackingData.OrderType || 'N/A'}</span>
                </div>
                {trackingData.DeliveryDate && (
                  <div className="summary-item">
                    <span className="summary-label">Delivery Date:</span>
                    <span className="summary-value">{formatDateTime(trackingData.DeliveryDate)}</span>
                  </div>
                )}
                {trackingData.ExpectedDeliveryDate && (
                  <div className="summary-item">
                    <span className="summary-label">Expected Delivery:</span>
                    <span className="summary-value">{formatDateTime(trackingData.ExpectedDeliveryDate)}</span>
                  </div>
                )}
              </div>

              {trackingData.Consignee && (
                <div className="consignee-info">
                  <h3>Consignee Details</h3>
                  <div className="consignee-grid">
                    <div className="consignee-item">
                      <span className="consignee-label">Name:</span>
                      <span className="consignee-value">{trackingData.Consignee.Name || 'N/A'}</span>
                    </div>
                    <div className="consignee-item">
                      <span className="consignee-label">City:</span>
                      <span className="consignee-value">{trackingData.Consignee.City || 'N/A'}</span>
                    </div>
                    <div className="consignee-item">
                      <span className="consignee-label">State:</span>
                      <span className="consignee-value">{trackingData.Consignee.State || 'N/A'}</span>
                    </div>
                    <div className="consignee-item">
                      <span className="consignee-label">Pin Code:</span>
                      <span className="consignee-value">{trackingData.Consignee.PinCode || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Complete Tracking History Table */}
            <div className="tracking-history-section">
              <h2>Complete Tracking History</h2>
              {sortedScans.length > 0 ? (
                <div className="tracking-table-container">
                  <table className="tracking-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Instructions</th>

                      </tr>
                    </thead>
                    <tbody>
                      {sortedScans.map((scanItem, index) => {
                        const scan = scanItem?.ScanDetail || {};
                        const scanDateTime = scan.ScanDateTime || scan.StatusDateTime || '';
                        // Highlight the most recent scan (index 0 since sorted newest first)
                        return (
                          <tr key={index} className={index === 0 ? 'latest-scan' : ''}>
                            <td>{formatDate(scanDateTime)}</td>
                            <td>{formatTime(scanDateTime)}</td>
                            <td>{scan.ScannedLocation || 'N/A'}</td>
                            <td>
                              <span className={`status-badge ${(scan.Scan || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                {scan.Scan || 'N/A'}
                              </span>
                            </td>
                            <td>{scan.Instructions || 'N/A'}</td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="no-scans-message">
                  <p>No tracking history available for this shipment.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default TrackingDetail;

