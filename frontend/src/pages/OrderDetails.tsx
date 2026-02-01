import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { orderService, Order } from '../services/orderService';
import { formatDateTime } from '../utils/dateFormat';
import './OrderDetails.css';

const OrderDetails: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      if (!orderId) {
        setError('Order ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const orderData = await orderService.getOrderById(orderId);
        if (orderData) {
          setOrder(orderData);
        } else {
          setError('Order not found');
        }
      } catch (err: any) {
        console.error('Error fetching order details:', err);
        setError(err.message || 'Failed to fetch order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetails();
  }, [orderId]);

  const handleBack = () => {
    navigate('/orders');
  };

  const handleTrack = () => {
    if (order?.awb) {
      navigate(`/tracking/detail?awb=${encodeURIComponent(order.awb)}&orderId=${encodeURIComponent(order.orderId)}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string | Date | undefined) => formatDateTime(dateString);

  const formatStatus = (status: string | undefined) => {
    if (!status) return 'N/A';
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <Layout>
        <div className="order-details-page">
          <div className="order-details-loading">
            <div className="loading-spinner"></div>
            <p>Loading order details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <div className="order-details-page">
          <div className="order-details-error">
            <h2>Error</h2>
            <p>{error || 'Order not found'}</p>
            <button onClick={handleBack} className="back-btn">
              Back to Orders
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="order-details-page">
        {/* Header Section */}
        <div className="order-details-header">
          <div className="header-left">
            <button onClick={handleBack} className="back-btn">
              ← Back to Orders
            </button>
            <h1>Order Details</h1>
          </div>
          <div className="header-actions">
            {order.awb && (
              <button onClick={handleTrack} className="action-btn track-btn">
                Track Order
              </button>
            )}
            <button onClick={handlePrint} className="action-btn print-btn">
              Print
            </button>
          </div>
        </div>

        {/* Order Summary Card */}
        <div className="order-summary-card">
          <div className="summary-row">
            <div className="summary-item">
              <span className="label">Order ID</span>
              <span className="value order-id">{order.orderId}</span>
            </div>
            <div className="summary-item">
              <span className="label">Reference ID</span>
              <span className="value">{order.referenceId || 'N/A'}</span>
            </div>
            <div className="summary-item">
              <span className="label">Order Date</span>
              <span className="value">{formatDate(order.orderDate)}</span>
            </div>
            <div className="summary-item">
              <span className="label">Status</span>
              <span className={`value status-badge ${order.status}`}>
                {formatStatus(order.status)}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="order-details-grid">
          {/* Shipping Details Section */}
          <div className="details-section shipping-section">
            <h2>Shipping Details</h2>
            <div className="section-content">
              <div className="detail-row">
                <span className="label">Customer Name</span>
                <span className="value">{order.customerName || 'N/A'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Phone Number</span>
                <span className="value">{order.customerPhone || 'N/A'}</span>
              </div>
              <div className="detail-row full-width">
                <span className="label">Delivery Address</span>
                <span className="value address">
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

          {/* Tracking Info Section */}
          <div className="details-section tracking-section">
            <h2>Tracking Info</h2>
            <div className="section-content">
              <div className="detail-row">
                <span className="label">AWB Number</span>
                <span className="value awb-number">
                  {order.awb || 'Not Generated'}
                  {order.awb && (
                    <button
                      className="copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(order.awb || '');
                        // Show a brief toast notification
                        const toast = document.createElement('div');
                        toast.className = 'copy-toast';
                        toast.textContent = 'Copied!';
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 2000);
                      }}
                    >
                      Copy
                    </button>
                  )}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Courier</span>
                <span className="value">Delhivery</span>
              </div>
              <div className="detail-row">
                <span className="label">Pickup Status</span>
                <span className={`value status-badge ${order.pickupRequestStatus || 'pending'}`}>
                  {formatStatus(order.pickupRequestStatus) || 'Pending'}
                </span>
              </div>
              {order.pickupRequestDate && (
                <div className="detail-row">
                  <span className="label">Pickup Date</span>
                  <span className="value">{formatDate(order.pickupRequestDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Product Details Section */}
          <div className="details-section product-section">
            <h2>Product Details</h2>
            <div className="section-content">
              <div className="detail-row">
                <span className="label">Product Name</span>
                <span className="value">{order.productName || 'N/A'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Quantity</span>
                <span className="value">{order.quantity || 1}</span>
              </div>
            </div>
          </div>

          {/* Package Details Section */}
          <div className="details-section package-section">
            <h2>Package Details</h2>
            <div className="section-content">
              <div className="detail-row">
                <span className="label">Dimensions</span>
                <span className="value">
                  {order.length || 0} x {order.width || 0} x {order.height || 0} (cm)
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Dead Weight</span>
                <span className="value">{order.weight || 0} kg</span>
              </div>
              <div className="detail-row">
                <span className="label">Volumetric Weight</span>
                <span className="value">
                  {order.length && order.width && order.height
                    ? ((order.length * order.width * order.height) / 5000).toFixed(2)
                    : '0'} kg
                </span>
              </div>
            </div>
          </div>

          {/* Payment Details Section */}
          <div className="details-section payment-section">
            <h2>Payment</h2>
            <div className="section-content">
              <div className="detail-row">
                <span className="label">Payment Mode</span>
                <span className={`value payment-badge ${order.paymentMode?.toLowerCase() || 'unknown'}`}>
                  {order.paymentMode || 'N/A'}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Invoice Amount</span>
                <span className="value amount">₹ {order.totalAmount || 0}</span>
              </div>
              {order.codAmount && order.codAmount > 0 && (
                <div className="detail-row">
                  <span className="label">COD Amount</span>
                  <span className="value amount">₹ {order.codAmount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pickup Address Section */}
          <div className="details-section pickup-section">
            <h2>Pickup Address</h2>
            <div className="section-content">
              <div className="detail-row">
                <span className="label">Warehouse</span>
                <span className="value">{order.warehouse || 'N/A'}</span>
              </div>
              {order.pickup_address && (
                <>
                  <div className="detail-row">
                    <span className="label">Contact Name</span>
                    <span className="value">{order.pickup_address.name || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">Phone</span>
                    <span className="value">{order.pickup_address.phone || 'N/A'}</span>
                  </div>
                  <div className="detail-row full-width">
                    <span className="label">Address</span>
                    <span className="value address">
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
    </Layout>
  );
};

export default OrderDetails;
