import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Tracking.css';
import { environmentConfig } from '../config/environment';
import { formatDate, formatTime, formatDateTime } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';

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
  };
  ReferenceNo?: string;
  DeliveryDate?: string;
  ExpectedDeliveryDate?: string;
  SenderName?: string;
  OrderType?: string;
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

const Tracking: React.FC = () => {
  const navigate = useNavigate();
  const [awbNumber, setAwbNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [trackingData, setTrackingData] = useState<Shipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [trackingMeta, setTrackingMeta] = useState<{
    waybill?: string;
    attempts?: number;
    hasRefIds?: boolean;
  } | null>(null);

  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awbNumber.trim()) {
      setError('Please enter a valid AWB number.');
      return;
    }

    setLoading(true);
    setError(null);
    setTrackingData(null);
    setTrackingMeta(null);

    try {
      // Call our backend API instead of Delhivery directly
      const trimmedAwb = awbNumber.trim();
      const trimmedOrderId = orderId.trim();
      const baseApiUrl = environmentConfig.apiUrl.replace(/\/$/, '');

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
          setTrackingMeta(response.data.meta || null);
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

  return (
    <div className="tracking-page">
      {/* Header */}
      <header className="tracking-header">
        <div className="header-container">
          <div className="logo">
            <img src="/NEW LOGO.png" alt="Shipsarthi" className="logo-img" />
          </div>
          
          <nav className="nav-links">
            <a href="#services" className="nav-link">Services</a>
            <a
              href="/rate-calculator"
              className="nav-link"
              onClick={(event) => {
                event.preventDefault();
                navigate('/rate-calculator');
              }}
            >
              Rate Calculator
            </a>
            <a href="#features" className="nav-link">Features</a>
            <a
              href="/contact"
              className="nav-link"
              onClick={(event) => {
                event.preventDefault();
                navigate('/contact');
              }}
            >
              Contact Us
            </a>
          </nav>
          
          <div className="header-buttons">
            <button className="btn-track active">Track</button>
            <button 
              className="btn-login"
              onClick={() => navigate('/login')}
            >
              Login
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="tracking-main">
        <div className="tracking-container">
          {/* Left Section - Promotional */}
          <div className="tracking-left">
            <div className="promotional-content">
              <div className="illustration">
                <img src="/partner 1.svg" alt="Trusted Partners" className="partner-illustration" />
              </div>
              <div className="tagline">
                <h1 className="tagline-text">
                  Your Trusted <span className="highlight-orange">Sarthi,</span>
                </h1>
                <h1 className="tagline-text">
                  Bringing Every Shipment <span className="highlight-teal">Closer</span>
                </h1>
              </div>
              <button className="try-free-btn" onClick={() => navigate('/')}>
                Try For Free
              </button>
            </div>
          </div>

          {/* Right Section - Tracking Form */}
          <div className="tracking-right">
            <div className="tracking-card">
              <div className="tracking-card-header">
                <h2 className="tracking-title">
                  Track Your <span className="highlight-orange">Order</span>
                </h2>
                <p className="tracking-subtitle">Check current status of your shipment</p>
              </div>

              <form className="tracking-form" onSubmit={handleTrackOrder}>
                <div className="form-group">
                  <label htmlFor="awb" className="form-label">AWB Number</label>
                  <input
                    type="text"
                    id="awb"
                    className="form-input"
                    placeholder="Enter AWB number"
                    value={awbNumber}
                    onChange={(e) => setAwbNumber(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="orderId" className="form-label">
                    Order ID <span className="optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="orderId"
                    className="form-input"
                    placeholder="Enter Order ID (if available)"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <button 
                  type="submit" 
                  className="track-order-btn"
                  disabled={loading}
                >
                  {loading ? 'Tracking...' : 'Track Order'}
                </button>
              </form>

              {/* Error Display */}
              {error && (
                <div className="error-message">
                  <p>{error}</p>
                </div>
              )}

              {/* Tracking Results */}
              {trackingData && (
                <div className="tracking-results">
                  <div className="results-header">
                    <h3>Tracking Information</h3>
                    <div className="awb-display"><AWBLink awb={trackingData.AWB || ''} showPrefix={true} /></div>
                  </div>

                  {trackingMeta && (
                    <div className="tracking-meta">
                      <span>
                        Lookups attempted: {trackingMeta.attempts ?? 1}
                      </span>
                      {trackingMeta.hasRefIds && orderId.trim() && (
                        <span>Reference search used</span>
                      )}
                    </div>
                  )}
                  
                  <div className="shipment-info">
                    <div className="info-row">
                      <span className="label">Status:</span>
                      <span
                        className={`status ${
                          trackingData?.Status?.Status
                            ? trackingData.Status.Status.toLowerCase().replace(/\s+/g, '-')
                            : 'unknown'
                        }`}
                      >
                        {trackingData?.Status?.Status || 'Not Available'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="label">Origin:</span>
                      <span className="value">{trackingData?.Origin || 'Not Available'}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Destination:</span>
                      <span className="value">{trackingData?.Destination || 'Not Available'}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Last Updated:</span>
                      <span className="value">
                        {trackingData?.Status?.StatusDateTime
                          ? formatDateTime(trackingData.Status.StatusDateTime)
                          : 'Not Available'}
                      </span>
                    </div>
                  </div>

                  {/* Complete Tracking History Table */}
                  {Array.isArray(trackingData.Scans) && trackingData.Scans.length > 0 && (
                    <div className="tracking-scans">
                      <h4>Complete Tracking History</h4>
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
                            {[...trackingData.Scans]
                              .sort((a, b) => {
                                const dateA = a?.ScanDetail?.ScanDateTime || a?.ScanDetail?.StatusDateTime || '';
                                const dateB = b?.ScanDetail?.ScanDateTime || b?.ScanDetail?.StatusDateTime || '';
                                // Sort in descending order (newest first) - reverse chronological order
                                return new Date(dateB).getTime() - new Date(dateA).getTime();
                              })
                              .map((scanItem, index) => {
                                const scan = scanItem?.ScanDetail || {};
                                const scanDateTime = scan.ScanDateTime || scan.StatusDateTime || '';
                                // formatDate and formatTime imported from ../utils/dateFormat
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
                    </div>
                  )}
                </div>
              )}

              <div className="helper-text">
                <p className="helper-question">Can't Find Your AWB number?</p>
                <p className="helper-instruction">
                  Kindly check the SMS and Email of order confirmation for AWB numbers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Tracking;
