import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { ndrService, NDROrder, NDRFilters, NDRStats, NDRActionData, BulkNDRActionData } from '../services/ndrService';
import { formatDate } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './NDR.css';

type NDRStatus = 'action_required' | 'action_taken' | 'delivered' | 'rto' | 'all';

const NDR: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NDRStatus>('action_required');
  const [ndrOrders, setNdrOrders] = useState<NDROrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const dateRange = {
    from: '28-05-2025',
    to: '28-06-2025'
  };

  // Tab counts
  const [tabCounts, setTabCounts] = useState<NDRStats>({
    action_required: 0,
    action_taken: 0,
    delivered: 0,
    rto: 0,
    all: 0
  });

  // Filters state
  const [filters, setFilters] = useState<NDRFilters>({
    page: 1,
    limit: 20,
    status: 'action_required'
  });

  // Pagination state
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_orders: 0,
    per_page: 20
  });

  // Time recommendation
  const [timeRecommendation, setTimeRecommendation] = useState('');

  const fetchNDROrders = useCallback(async () => {
    setLoading(true);
    try {
      const updatedFilters = { ...filters, status: activeTab };
      const response = await ndrService.getNDROrders(updatedFilters);
      setNdrOrders(response.orders);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error fetching NDR orders:', error);
      alert('Failed to fetch NDR orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, activeTab]);

  const fetchNDRStats = useCallback(async () => {
    try {
      const stats = await ndrService.getNDRStats();
      setTabCounts(stats);
    } catch (error) {
      console.error('Error fetching NDR stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchNDROrders();
    fetchNDRStats();
    setTimeRecommendation(ndrService.getTimeRecommendation());
  }, [fetchNDROrders, fetchNDRStats, activeTab]);

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === ndrOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(ndrOrders.map(order => order._id));
    }
  };

  const handleReAttempt = async (order: NDROrder) => {
    if (!ndrService.validateNSLCode(order.ndr_info.nsl_code, 'RE-ATTEMPT')) {
      const allowedCodes = ndrService.getAllowedNSLCodes('RE-ATTEMPT');
      alert(`Re-attempt not allowed for NSL code: ${order.ndr_info.nsl_code}\nAllowed codes: ${allowedCodes.join(', ')}`);
      return;
    }

    if (order.ndr_info.ndr_attempts > 2) {
      alert('Maximum 3 attempts allowed. Please initiate RTO.');
      return;
    }

    if (!ndrService.isRecommendedTime()) {
      const confirmed = window.confirm(`${timeRecommendation}\n\nDo you want to proceed anyway?`);
      if (!confirmed) return;
    }

    try {
      setLoading(true);
      const actionData: NDRActionData = {
        waybill: order.delhivery_data.waybill,
        action: 'RE-ATTEMPT'
      };
      
      const result = await ndrService.takeNDRAction(actionData);
      alert(`Re-attempt scheduled for AWB: ${order.delhivery_data.waybill}\nUPL ID: ${result.upl_id}`);
      fetchNDROrders();
      fetchNDRStats();
    } catch (error: any) {
      console.error('Error scheduling re-attempt:', error);
      alert(`Failed to schedule re-attempt: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePickupReschedule = async (order: NDROrder) => {
    if (!ndrService.validateNSLCode(order.ndr_info.nsl_code, 'PICKUP_RESCHEDULE')) {
      const allowedCodes = ndrService.getAllowedNSLCodes('PICKUP_RESCHEDULE');
      alert(`Pickup reschedule not allowed for NSL code: ${order.ndr_info.nsl_code}\nAllowed codes: ${allowedCodes.join(', ')}`);
      return;
    }

    if (order.ndr_info.ndr_attempts > 2) {
      alert('Maximum 3 attempts allowed. Please initiate RTO.');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to reschedule pickup? This will initiate RTO and mark the shipment as cancelled.'
    );
    
    if (!confirmed) return;

    try {
      setLoading(true);
      const actionData: NDRActionData = {
        waybill: order.delhivery_data.waybill,
        action: 'PICKUP_RESCHEDULE'
      };
      
      const result = await ndrService.takeNDRAction(actionData);
      alert(`Pickup rescheduled for AWB: ${order.delhivery_data.waybill}\nUPL ID: ${result.upl_id}`);
      fetchNDROrders();
      fetchNDRStats();
    } catch (error: any) {
      console.error('Error rescheduling pickup:', error);
      alert(`Failed to reschedule pickup: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkReAttempt = async () => {
    if (selectedOrders.length === 0) {
      alert('Please select at least one order');
      return;
    }

    // Validate selected orders
    const selectedOrderObjects = ndrOrders.filter(order => selectedOrders.includes(order._id));
    const invalidOrders = selectedOrderObjects.filter(order => 
      !ndrService.validateNSLCode(order.ndr_info.nsl_code, 'RE-ATTEMPT') || 
      order.ndr_info.ndr_attempts > 2
    );

    if (invalidOrders.length > 0) {
      const invalidAWBs = invalidOrders.map(order => order.delhivery_data.waybill).join(', ');
      alert(`Some selected orders cannot be re-attempted:\n${invalidAWBs}\n\nPlease check NSL codes and attempt counts.`);
      return;
    }

    if (!ndrService.isRecommendedTime()) {
      const confirmed = window.confirm(`${timeRecommendation}\n\nDo you want to proceed with bulk re-attempt anyway?`);
      if (!confirmed) return;
    }

    const confirmed = window.confirm(
      `Schedule re-attempt for ${selectedOrders.length} orders?`
    );
    
    if (!confirmed) return;

    try {
      setLoading(true);
      const bulkData: BulkNDRActionData = {
        order_ids: selectedOrders,
        action: 'RE-ATTEMPT'
      };
      
      const result = await ndrService.bulkNDRAction(bulkData);
      alert(`Bulk re-attempt scheduled for ${result.processed_count} orders\nUPL ID: ${result.upl_id}`);
      setSelectedOrders([]);
      fetchNDROrders();
      fetchNDRStats();
    } catch (error: any) {
      console.error('Error in bulk re-attempt:', error);
      alert(`Failed to schedule bulk re-attempt: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const canReAttempt = (order: NDROrder): boolean => {
    return ndrService.validateNSLCode(order.ndr_info.nsl_code, 'RE-ATTEMPT') && order.ndr_info.ndr_attempts <= 2;
  };

  const canReschedulePickup = (order: NDROrder): boolean => {
    return ndrService.validateNSLCode(order.ndr_info.nsl_code, 'PICKUP_RESCHEDULE') && order.ndr_info.ndr_attempts <= 2;
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  return (
    <Layout>
      <div className="ndr-container">
        {/* Status Tabs */}
        <div className="ndr-tabs">
          <button
            className={`ndr-tab ${activeTab === 'action_required' ? 'active' : ''}`}
            onClick={() => setActiveTab('action_required')}
          >
            Action Required ({tabCounts.action_required})
          </button>
          <button
            className={`ndr-tab ${activeTab === 'action_taken' ? 'active' : ''}`}
            onClick={() => setActiveTab('action_taken')}
          >
            Action Taken ({tabCounts.action_taken})
          </button>
          <button
            className={`ndr-tab ${activeTab === 'delivered' ? 'active' : ''}`}
            onClick={() => setActiveTab('delivered')}
          >
            Delivered ({tabCounts.delivered})
          </button>
          <button
            className={`ndr-tab ${activeTab === 'rto' ? 'active' : ''}`}
            onClick={() => setActiveTab('rto')}
          >
            RTO ({tabCounts.rto})
          </button>
          <button
            className={`ndr-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All ({tabCounts.all})
          </button>
        </div>

        {/* Time Recommendation */}
        {timeRecommendation && (
          <div className={`time-recommendation ${ndrService.isRecommendedTime() ? 'recommended' : 'warning'}`}>
            <span className="time-icon">{ndrService.isRecommendedTime() ? '✅' : '⚠️'}</span>
            <span className="time-text">{timeRecommendation}</span>
          </div>
        )}

        {/* Filters Section */}
        <div className="ndr-filters">
          <div className="date-filter">
            <button className="calendar-btn">
              📅 {dateRange.from} to {dateRange.to}
            </button>
          </div>

          <button className="more-filters-btn">
            🎚️ More Filter
          </button>

          {selectedOrders.length > 0 && (
            <button className="bulk-action-btn" onClick={handleBulkReAttempt}>
              🔄 Bulk Re-Attempt ({selectedOrders.length})
            </button>
          )}

          <div className="export-btns">
            <button className="export-btn">Download</button>
            <button className="export-btn">Help</button>
          </div>
        </div>

        {/* NDR Table */}
        <div className="ndr-table-container">
          <table className="ndr-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === ndrOrders.length && ndrOrders.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Order Date</th>
                <th>Order Details</th>
                <th>Product Details</th>
                <th>Payment</th>
                <th>Tracking</th>
                <th>Shipping Details</th>
                <th>NDR Details</th>
                <th>Attempts</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="loading-cell">
                    Loading NDR orders...
                  </td>
                </tr>
              ) : ndrOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="no-data-cell">
                    <div className="no-ndr">
                      <div className="no-ndr-icon">📦</div>
                      <h3>No NDR orders found</h3>
                      <p>
                        {activeTab === 'action_required'
                          ? 'No orders require action at the moment'
                          : `No ${activeTab.replace('_', ' ')} orders`}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                ndrOrders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order._id)}
                        onChange={() => handleSelectOrder(order._id)}
                      />
                    </td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>
                      <div className="order-details-cell">
                        <div className="order-id">{order.order_id}</div>
                        <div className="customer-name">{order.customer_info.buyer_name}</div>
                        <div className="customer-phone">{order.customer_info.phone}</div>
                      </div>
                    </td>
                    <td>
                      <div className="product-details-cell">
                        Product Details
                      </div>
                    </td>
                    <td>
                      <span className={`payment-mode cod`}>
                        COD
                      </span>
                    </td>
                    <td>
                      <div className="tracking-cell">
                        <div className="awb"><AWBLink awb={order.delhivery_data.waybill} orderId={order.order_id} showPrefix={true} /></div>
                        <div className="nsl-code">NSL: {order.ndr_info.nsl_code}</div>
                      </div>
                    </td>
                    <td>
                      <div className="shipping-details-cell">
                        <div className="address">{order.delivery_address.full_address}</div>
                        <div className="city-state">{order.delivery_address.city}, {order.delivery_address.state}</div>
                        <div className="pincode">{order.delivery_address.pincode}</div>
                      </div>
                    </td>
                    <td>
                      <div className="ndr-details-cell">
                        <div className="ndr-reason">{order.ndr_info.ndr_reason}</div>
                        <div className="ndr-date">
                          {formatDate(order.ndr_info.last_ndr_date)}
                        </div>
                        {order.ndr_info.next_attempt_date && (
                          <div className="next-attempt">
                            Next: {formatDate(order.ndr_info.next_attempt_date)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="attempts-cell">
                        <span className="attempt-count">{order.ndr_info.ndr_attempts}/3</span>
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {activeTab === 'action_required' && (
                          <>
                            {canReAttempt(order) && (
                              <button
                                className="action-btn reattempt-btn"
                                onClick={() => handleReAttempt(order)}
                                title="Re-Attempt Delivery"
                              >
                                🔄 Re-Attempt
                              </button>
                            )}
                            {canReschedulePickup(order) && (
                              <button
                                className="action-btn rto-btn"
                                onClick={() => handlePickupReschedule(order)}
                                title="Reschedule Pickup (RTO)"
                              >
                                📦 RTO
                              </button>
                            )}
                          </>
                        )}
                        <button className="action-btn view-btn" title="View Details">
                          👁️ View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="pagination">
            <button 
              className="pagination-btn"
              onClick={() => handlePageChange(pagination.current_page - 1)}
              disabled={pagination.current_page === 1}
            >
              ← Previous
            </button>
            
            <div className="pagination-info">
              Page {pagination.current_page} of {pagination.total_pages} 
              ({pagination.total_orders} total orders)
            </div>
            
            <button 
              className="pagination-btn"
              onClick={() => handlePageChange(pagination.current_page + 1)}
              disabled={pagination.current_page === pagination.total_pages}
            >
              Next →
            </button>
          </div>
        )}

        {/* NDR Guidelines */}
        <div className="ndr-guidelines">
          <h3>⚠️ NDR Action Guidelines:</h3>
          <ul>
            <li>
              <strong>Re-Attempt:</strong> Should be applied after 9 PM to ensure all NDR AWBs are back in facility
            </li>
            <li>
              <strong>Allowed NSL Codes for Re-Attempt:</strong> EOD-74, EOD-15, EOD-104, EOD-43, EOD-86, EOD-11, EOD-69, EOD-6
            </li>
            <li>
              <strong>Pickup Reschedule (RTO):</strong> Allowed for NSL codes EOD-777, EOD-21
            </li>
            <li>
              <strong>Attempt Limit:</strong> Maximum 3 attempts allowed per shipment
            </li>
            <li>
              <strong>UPL ID:</strong> Each NDR action returns a UPL ID for tracking the status
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
};

export default NDR;