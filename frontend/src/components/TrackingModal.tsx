import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { formatDateTime } from '../utils/dateFormat';
import AWBLink from './AWBLink';
import './TrackingModal.css';

interface TrackingScan {
  ScanType: string;
  ScanDateTime: string;
  ScanLocation: string;
  Remarks?: string;
}

interface ShipmentData {
  AWB?: string;
  Status?: string;
  StatusDateTime?: string;
  Origin?: string;
  Destination?: string;
  Scans?: TrackingScan[];
}

export interface TrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  awb: string;
  orderId?: string | null;
}

const TrackingModal: React.FC<TrackingModalProps> = ({ isOpen, onClose, awb, orderId }) => {
  const [loading, setLoading] = useState(false);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTrackingData = useCallback(async () => {
    const sanitizedAwb = (awb || '').trim();

    if (!sanitizedAwb) {
      setError('AWB number not available');
      return;
    }

    setLoading(true);
    setError(null);
    setTrackingData(null);

    try {
      // Call tracking API with AWB number
      const encodedAwb = encodeURIComponent(sanitizedAwb);
      const orderIdParam = orderId && orderId.trim() ? `?order_id=${encodeURIComponent(orderId.trim())}` : '';

      const response = await apiService.get<{
        status: string;
        message: string;
        data: {
          waybill: string;
          tracking_data: any;
        };
      }>(`/orders/track/${encodedAwb}${orderIdParam}`);

      if (response.status === 'success' && response.data && response.data.tracking_data) {
        const tracking = response.data.tracking_data;
        
        // Handle ShipmentData array from Delhivery API
        // Delhivery API returns: { ShipmentData: [{ AWB, Status, StatusDateTime, Origin, Destination, Scans: [...] }] }
        if (tracking.ShipmentData && Array.isArray(tracking.ShipmentData) && tracking.ShipmentData.length > 0) {
          // Use the first shipment data
          setTrackingData(tracking.ShipmentData[0]);
        } else if (tracking.data && tracking.data.ShipmentData && Array.isArray(tracking.data.ShipmentData) && tracking.data.ShipmentData.length > 0) {
          // Handle nested structure
          setTrackingData(tracking.data.ShipmentData[0]);
        } else {
          // Fallback to tracking object itself if it has the right structure
          setTrackingData(tracking);
        }
      } else {
        setError(response.message || 'No tracking information available');
      }
    } catch (err: any) {
      console.error('Tracking error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch tracking information');
    } finally {
      setLoading(false);
    }
  }, [awb, orderId]);

  useEffect(() => {
    if (isOpen && awb) {
      fetchTrackingData();
    } else {
      // Reset state when modal closes
      setTrackingData(null);
      setError(null);
    }
  }, [isOpen, awb, orderId, fetchTrackingData]);

  if (!isOpen) return null;

  const shipment = trackingData as ShipmentData;

  return (
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="tracking-modal-header">
          <h2>Shipment Tracking</h2>
          <button className="tracking-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tracking-modal-body">
          {loading && (
            <div className="tracking-loading">
              <div className="spinner"></div>
              <p>Fetching tracking information...</p>
            </div>
          )}

          {error && (
            <div className="tracking-error">
              <p>⚠️ {error}</p>
            </div>
          )}

          {!loading && !error && shipment && (
            <>
              <div className="tracking-info-section">
                <div className="tracking-info-row">
                  <span className="tracking-label">AWB Number:</span>
                  <AWBLink awb={awb || shipment.AWB || ''} />
                </div>
              </div>

              {shipment.Status && (
                <div className="tracking-status-section">
                  <h3>Current Status</h3>
                  <div className={`status-badge status-${shipment.Status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {shipment.Status}
                  </div>
                  {shipment.StatusDateTime && (
                    <p className="status-date">
                      {formatDateTime(shipment.StatusDateTime)}
                    </p>
                  )}
                </div>
              )}

              {(shipment.Origin || shipment.Destination) && (
                <div className="tracking-location-section">
                  {shipment.Origin && (
                    <div className="location-info">
                      <span className="location-label">Origin:</span>
                      <span className="location-value">{shipment.Origin}</span>
                    </div>
                  )}
                  {shipment.Destination && (
                    <div className="location-info">
                      <span className="location-label">Destination:</span>
                      <span className="location-value">{shipment.Destination}</span>
                    </div>
                  )}
                </div>
              )}

              {shipment.Scans && shipment.Scans.length > 0 && (
                <div className="tracking-scans-section">
                  <h3>Tracking History</h3>
                  <div className="scans-timeline">
                    {shipment.Scans.map((scan, index) => (
                      <div key={index} className="scan-item">
                        <div className="scan-marker"></div>
                        <div className="scan-content">
                          <div className="scan-header">
                            <span className="scan-type">{scan.ScanType || 'Update'}</span>
                            <span className="scan-date">
                              {scan.ScanDateTime ? formatDateTime(scan.ScanDateTime) : 'N/A'}
                            </span>
                          </div>
                          {scan.ScanLocation && (
                            <div className="scan-location">
                              📍 {scan.ScanLocation}
                            </div>
                          )}
                          {scan.Remarks && (
                            <div className="scan-remarks">
                              {scan.Remarks}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!shipment.Scans || shipment.Scans.length === 0 ? (
                <div className="tracking-no-scans">
                  <p>No detailed tracking history available yet.</p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="tracking-modal-footer">
          <button className="tracking-modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TrackingModal;
