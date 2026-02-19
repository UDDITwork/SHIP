import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order } from '../services/orderService';
import { formatDateTime } from '../utils/dateFormat';
import AWBLink from './AWBLink';
import './OrderDetailPanel.css';

interface OrderDetailPanelProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({ order, isOpen, onClose }) => {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const formatStatus = (status: string | undefined) => {
    if (!status) return 'N/A';
    const statusLabels: Record<string, string> = {
      'rto_in_transit': 'RTO In Transit',
      'rto_delivered': 'RTO Delivered',
      'ndr': 'NDR',
      'rto': 'RTO',
      'out_for_delivery': 'Out for Delivery',
      'pickups_manifests': 'Pickup/Manifest',
      'ready_to_ship': 'Ready to Ship',
      'in_transit': 'In Transit',
      'pickup_pending': 'Pickup Pending',
    };
    if (statusLabels[status]) return statusLabels[status];
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleTrack = () => {
    if (order?.awb) {
      navigate(`/tracking/detail?awb=${encodeURIComponent(order.awb)}&orderId=${encodeURIComponent(order.orderId)}`);
    }
  };

  const handleCopyAWB = () => {
    if (order?.awb) {
      navigator.clipboard.writeText(order.awb);
      const toast = document.createElement('div');
      toast.className = 'odp-copy-toast';
      toast.textContent = 'AWB Copied!';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
  };

  if (!order) return null;

  const volWeight = order.length && order.width && order.height
    ? ((order.length * order.width * order.height) / 5000).toFixed(2)
    : '0';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`odp-backdrop ${isOpen ? 'odp-backdrop-visible' : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`odp-panel ${isOpen ? 'odp-panel-open' : ''}`}
      >
        {/* Panel Header */}
        <div className="odp-header">
          <div className="odp-header-top">
            <h2>Order Details</h2>
            <button className="odp-close-btn" onClick={onClose} title="Close (Esc)">
              &times;
            </button>
          </div>
          <div className="odp-header-actions">
            {order.awb && (
              <button className="odp-action-btn odp-track-btn" onClick={handleTrack}>
                Track Order
              </button>
            )}
            <button
              className="odp-action-btn odp-fullpage-btn"
              onClick={() => navigate(`/orders/${order._id}`)}
            >
              Full Page View
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="odp-body">
          {/* Summary Strip */}
          <div className="odp-summary">
            <div className="odp-summary-row">
              <div className="odp-summary-item">
                <span className="odp-label">Order ID</span>
                <span className="odp-value odp-order-id">{order.orderId || 'N/A'}</span>
              </div>
              <div className="odp-summary-item">
                <span className="odp-label">Status</span>
                <span className={`odp-status-badge odp-status-${order.status}`}>
                  {formatStatus(order.status)}
                </span>
              </div>
            </div>
            <div className="odp-summary-row">
              <div className="odp-summary-item">
                <span className="odp-label">Order Date</span>
                <span className="odp-value">{formatDateTime(order.orderDate)}</span>
              </div>
              <div className="odp-summary-item">
                <span className="odp-label">Reference</span>
                <span className="odp-value">{order.referenceId || 'N/A'}</span>
              </div>
            </div>
            {/* Conditional date row based on status */}
            {order.status === 'delivered' && order.deliveredDate && (
              <div className="odp-summary-row">
                <div className="odp-summary-item">
                  <span className="odp-label">Delivered On</span>
                  <span className="odp-value">{formatDateTime(order.deliveredDate)}</span>
                </div>
              </div>
            )}
            {['rto', 'rto_in_transit', 'rto_delivered'].includes(order.status) && order.rtoDeliveredDate && (
              <div className="odp-summary-row">
                <div className="odp-summary-item">
                  <span className="odp-label">RTO Completed</span>
                  <span className="odp-value">{formatDateTime(order.rtoDeliveredDate)}</span>
                </div>
              </div>
            )}
            {order.status === 'cancelled' && order.cancelledDate && (
              <div className="odp-summary-row">
                <div className="odp-summary-item">
                  <span className="odp-label">Cancelled On</span>
                  <span className="odp-value">{formatDateTime(order.cancelledDate)}</span>
                </div>
              </div>
            )}
          </div>

          {/* AWB Section */}
          {order.awb && (
            <div className="odp-section odp-awb-section">
              <div className="odp-section-header">AWB / Tracking</div>
              <div className="odp-section-body">
                <div className="odp-awb-row">
                  <AWBLink awb={order.awb} orderId={order.orderId} className="odp-awb-link" />
                  <button className="odp-copy-btn" onClick={handleCopyAWB}>Copy</button>
                </div>
                <div className="odp-detail-row">
                  <span className="odp-label">Courier</span>
                  <span className="odp-value">Delhivery</span>
                </div>
                <div className="odp-detail-row">
                  <span className="odp-label">Pickup Status</span>
                  <span className={`odp-status-badge odp-status-${order.pickupRequestStatus || 'pending'}`}>
                    {formatStatus(order.pickupRequestStatus) || 'Pending'}
                  </span>
                </div>
                {order.pickupRequestDate && (
                  <div className="odp-detail-row">
                    <span className="odp-label">Pickup Date</span>
                    <span className="odp-value">{formatDateTime(order.pickupRequestDate)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customer / Shipping Details */}
          <div className="odp-section">
            <div className="odp-section-header">Shipping Details</div>
            <div className="odp-section-body">
              <div className="odp-detail-row">
                <span className="odp-label">Customer</span>
                <span className="odp-value">{order.customerName || 'N/A'}</span>
              </div>
              <div className="odp-detail-row">
                <span className="odp-label">Phone</span>
                <span className="odp-value">{order.customerPhone || 'N/A'}</span>
              </div>
              <div className="odp-detail-col">
                <span className="odp-label">Delivery Address</span>
                <span className="odp-value odp-address">
                  {order.customerAddress || 'N/A'}
                  {(order.city || order.state || order.pin) && (
                    <>
                      <br />
                      {[order.city, order.state].filter(Boolean).join(', ')}{order.pin ? ` - ${order.pin}` : ''}
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Product Details */}
          <div className="odp-section">
            <div className="odp-section-header">Product Details</div>
            <div className="odp-section-body">
              <div className="odp-detail-row">
                <span className="odp-label">Product</span>
                <span className="odp-value">{order.productName || 'N/A'}</span>
              </div>
              <div className="odp-detail-row">
                <span className="odp-label">Quantity</span>
                <span className="odp-value">{order.quantity || 1}</span>
              </div>
            </div>
          </div>

          {/* Package Details */}
          <div className="odp-section">
            <div className="odp-section-header">Package Details</div>
            <div className="odp-section-body">
              <div className="odp-detail-row">
                <span className="odp-label">Dimensions</span>
                <span className="odp-value">
                  {order.length || 0} x {order.width || 0} x {order.height || 0} cm
                </span>
              </div>
              <div className="odp-detail-row">
                <span className="odp-label">Dead Weight</span>
                <span className="odp-value">{order.weight || 0} kg</span>
              </div>
              <div className="odp-detail-row">
                <span className="odp-label">Vol. Weight</span>
                <span className="odp-value">{volWeight} kg</span>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="odp-section">
            <div className="odp-section-header">Payment</div>
            <div className="odp-section-body">
              <div className="odp-detail-row">
                <span className="odp-label">Payment Mode</span>
                <span className={`odp-payment-badge odp-pay-${order.paymentMode?.toLowerCase() || 'unknown'}`}>
                  {order.paymentMode || 'N/A'}
                </span>
              </div>
              <div className="odp-detail-row">
                <span className="odp-label">Invoice Amount</span>
                <span className="odp-value odp-amount">₹ {order.totalAmount || 0}</span>
              </div>
              {order.codAmount && order.codAmount > 0 && (
                <div className="odp-detail-row">
                  <span className="odp-label">COD Amount</span>
                  <span className="odp-value odp-amount">₹ {order.codAmount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pickup Address */}
          <div className="odp-section">
            <div className="odp-section-header">Pickup Address</div>
            <div className="odp-section-body">
              <div className="odp-detail-row">
                <span className="odp-label">Warehouse</span>
                <span className="odp-value">{order.warehouse || 'N/A'}</span>
              </div>
              {order.pickup_address && (
                <>
                  <div className="odp-detail-row">
                    <span className="odp-label">Contact</span>
                    <span className="odp-value">{order.pickup_address.name || 'N/A'}</span>
                  </div>
                  <div className="odp-detail-row">
                    <span className="odp-label">Phone</span>
                    <span className="odp-value">{order.pickup_address.phone || 'N/A'}</span>
                  </div>
                  <div className="odp-detail-col">
                    <span className="odp-label">Address</span>
                    <span className="odp-value odp-address">
                      {order.pickup_address.full_address || 'N/A'}
                      {(order.pickup_address.city || order.pickup_address.state || order.pickup_address.pincode) && (
                        <>
                          <br />
                          {[order.pickup_address.city, order.pickup_address.state].filter(Boolean).join(', ')}{order.pickup_address.pincode ? ` - ${order.pickup_address.pincode}` : ''}
                        </>
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderDetailPanel;
