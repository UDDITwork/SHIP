import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { ndrService, NDROrder, NDRFilters, NDRStats, NDRActionData, BulkNDRActionData } from '../services/ndrService';
import { formatDate } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import DateRangeFilter from '../components/DateRangeFilter';
import './NDR.css';

type NDRStatus = 'action_required' | 'action_taken' | 'delivered' | 'rto' | 'all';

const NDR: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<NDRStatus>('action_required');
  const [ndrOrders, setNdrOrders] = useState<NDROrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

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

  // View dropdown state (which row's dropdown is open)
  const [openViewDropdown, setOpenViewDropdown] = useState<string | null>(null);
  const viewDropdownRef = useRef<HTMLDivElement | null>(null);

  // More filter state
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [paymentModeFilter, setPaymentModeFilter] = useState<'COD' | 'Prepaid' | ''>('');
  const moreFilterRef = useRef<HTMLDivElement | null>(null);

  // Action History popup state
  const [actionHistoryPopup, setActionHistoryPopup] = useState<{
    show: boolean;
    order: NDROrder | null;
  }>({ show: false, order: null });

  // Clear selections on tab change
  useEffect(() => {
    setSelectedOrders([]);
  }, [activeTab]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
        setOpenViewDropdown(null);
      }
      if (moreFilterRef.current && !moreFilterRef.current.contains(e.target as Node)) {
        setShowMoreFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Date filter handlers
  const handleDateFilterApply = (startDate: string, endDate: string) => {
    setFilters(prev => ({ ...prev, date_from: startDate, date_to: endDate, page: 1 }));
  };

  const handleDateFilterReset = () => {
    setFilters(prev => ({ ...prev, date_from: undefined, date_to: undefined, page: 1 }));
  };

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

  // === Selection handlers ===
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

  // === Action handlers ===
  const handleReAttempt = async (order: NDROrder) => {
    setOpenViewDropdown(null);

    if (!ndrService.validateNSLCode(order.ndr_info.nsl_code, 'RE-ATTEMPT')) {
      alert('Re-attempt is not available for this NDR. The shipment\'s current status does not allow re-attempt.');
      return;
    }

    if (order.ndr_info.ndr_attempts > 2) {
      alert('Maximum 3 attempts allowed. Please request RTO instead.');
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
      alert(`Re-attempt scheduled for AWB: ${order.delhivery_data.waybill}\nTracking ID: ${result.upl_id}`);
      fetchNDROrders();
      fetchNDRStats();
    } catch (error: any) {
      console.error('Error scheduling re-attempt:', error);
      alert(`Failed to schedule re-attempt: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRTORequest = (order: NDROrder) => {
    setOpenViewDropdown(null);
    // Navigate to Support page with auto-fill params for RTO ticket
    navigate(`/support?category=shipment_ndr_rto&awb=${order.delhivery_data.waybill}&ndr_order_id=${order._id}`);
  };

  const handleEditBuyerInfo = (order: NDROrder) => {
    setOpenViewDropdown(null);
    // Navigate to Support page with auto-fill params for Edit Shipment Info ticket
    navigate(`/support?category=edit_shipment_info&awb=${order.delhivery_data.waybill}&ndr_order_id=${order._id}`);
  };

  const handleBulkReAttempt = async () => {
    if (selectedOrders.length === 0) {
      alert('Please select at least one order');
      return;
    }

    const selectedOrderObjects = ndrOrders.filter(order => selectedOrders.includes(order._id));
    const invalidOrders = selectedOrderObjects.filter(order =>
      !ndrService.validateNSLCode(order.ndr_info.nsl_code, 'RE-ATTEMPT') ||
      order.ndr_info.ndr_attempts > 2
    );

    if (invalidOrders.length > 0) {
      const invalidAWBs = invalidOrders.map(order => order.delhivery_data.waybill).join(', ');
      alert(`Some selected orders cannot be re-attempted:\n${invalidAWBs}\n\nPlease deselect them and try again.`);
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
      alert(`Bulk re-attempt scheduled for ${result.processed_count} orders\nTracking ID: ${result.upl_id}`);
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

  // === Download handler ===
  const handleDownload = async () => {
    try {
      setLoading(true);
      await ndrService.exportNDRCSV({ ...filters, status: activeTab });
    } catch (error: any) {
      console.error('Error downloading CSV:', error);
      alert('Failed to download NDR data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // === More Filter handler ===
  const applyPaymentFilter = (mode: 'COD' | 'Prepaid' | '') => {
    setPaymentModeFilter(mode);
    setFilters(prev => ({ ...prev, payment_mode: mode || undefined, page: 1 } as NDRFilters));
    setShowMoreFilters(false);
  };

  // === Page change ===
  const handlePageChange = (page: number) => {
    setSelectedOrders([]);
    setFilters(prev => ({ ...prev, page }));
  };

  // === Helper: Get action label for display ===
  const getActionLabel = (action: string): string => {
    switch (action) {
      case 'RE-ATTEMPT': return 'Reattempt';
      case 'PICKUP_RESCHEDULE': return 'Pickup Reschedule';
      case 'RTO_TICKET': return 'RTO Requested';
      case 'EDIT_BUYER_TICKET': return 'Edit Buyer Info';
      default: return action;
    }
  };

  // === Helper: format datetime for popup ===
  const formatDateTime = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
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
            NDR Delivered ({tabCounts.delivered})
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
            All NDR ({tabCounts.all})
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
          <DateRangeFilter
            onApply={handleDateFilterApply}
            onReset={handleDateFilterReset}
          />

          {/* More Filter dropdown */}
          <div className="more-filter-wrapper" ref={moreFilterRef}>
            <button
              className={`more-filters-btn ${paymentModeFilter ? 'active-filter' : ''}`}
              onClick={() => setShowMoreFilters(!showMoreFilters)}
            >
              More Filter {paymentModeFilter ? `(${paymentModeFilter})` : ''}
            </button>
            {showMoreFilters && (
              <div className="more-filter-dropdown">
                <div className="filter-dropdown-header">Payment Mode</div>
                <button
                  className={`filter-option ${paymentModeFilter === '' ? 'selected' : ''}`}
                  onClick={() => applyPaymentFilter('')}
                >
                  All Orders
                </button>
                <button
                  className={`filter-option ${paymentModeFilter === 'Prepaid' ? 'selected' : ''}`}
                  onClick={() => applyPaymentFilter('Prepaid')}
                >
                  Prepaid Orders
                </button>
                <button
                  className={`filter-option ${paymentModeFilter === 'COD' ? 'selected' : ''}`}
                  onClick={() => applyPaymentFilter('COD')}
                >
                  COD Orders
                </button>
              </div>
            )}
          </div>

          {activeTab === 'action_required' && selectedOrders.length > 0 && (
            <button className="bulk-action-btn" onClick={handleBulkReAttempt}>
              Bulk Re-Attempt ({selectedOrders.length})
            </button>
          )}

          <div className="export-btns">
            <button className="export-btn" onClick={handleDownload} disabled={loading}>
              Download
            </button>
            <button className="export-btn" onClick={() => navigate('/support')}>
              Help
            </button>
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
                        <div
                          className="order-id order-id-link"
                          onClick={() => navigate(`/orders/${order._id}`)}
                        >
                          {order.order_id}
                        </div>
                        <div className="customer-name">{order.customer_info.buyer_name}</div>
                        <div className="customer-phone">{order.customer_info.phone}</div>
                      </div>
                    </td>
                    <td>
                      <div className="product-details-cell">
                        {order.products && order.products.length > 0 ? (
                          order.products.map((product, idx) => (
                            <div key={idx}>
                              <span className="product-name">{product.product_name}</span>
                              {product.quantity > 1 && <span className="product-qty"> x{product.quantity}</span>}
                            </div>
                          ))
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`payment-mode ${(order.payment_info?.payment_mode || 'COD').toLowerCase()}`}>
                        {order.payment_info?.payment_mode || 'COD'}
                      </span>
                    </td>
                    <td>
                      <div className="tracking-cell">
                        <div className="awb"><AWBLink awb={order.delhivery_data.waybill} orderId={order.order_id} showPrefix={true} /></div>
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
                        <div className="ndr-reason">
                          {ndrService.getNDRDisplayReason(order.ndr_info.nsl_code, order.ndr_info.ndr_reason)}
                        </div>
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
                        {/* Action Required tab: View button with dropdown */}
                        {activeTab === 'action_required' && (
                          <div
                            className="view-dropdown-wrapper"
                            ref={openViewDropdown === order._id ? viewDropdownRef : null}
                          >
                            <button
                              className="action-btn view-btn"
                              onClick={() => setOpenViewDropdown(openViewDropdown === order._id ? null : order._id)}
                            >
                              View ▾
                            </button>
                            {openViewDropdown === order._id && (
                              <div className="view-dropdown-menu">
                                <button
                                  className={`view-dropdown-item reattempt-item ${!canReAttempt(order) ? 'disabled' : ''}`}
                                  onClick={() => canReAttempt(order) && handleReAttempt(order)}
                                  disabled={!canReAttempt(order)}
                                >
                                  Reattempt
                                  {!canReAttempt(order) && <span className="item-note">Not available</span>}
                                </button>
                                <button
                                  className="view-dropdown-item rto-item"
                                  onClick={() => handleRTORequest(order)}
                                >
                                  RTO
                                </button>
                                <button
                                  className="view-dropdown-item edit-item"
                                  onClick={() => handleEditBuyerInfo(order)}
                                >
                                  Edit Buyer Info
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Taken tab: Show action badge with history popup */}
                        {activeTab === 'action_taken' && (
                          <button
                            className="action-btn action-taken-badge"
                            onClick={() => setActionHistoryPopup({ show: true, order })}
                          >
                            Action Taken
                          </button>
                        )}

                        {/* Other tabs: Show View History if action exists */}
                        {(activeTab === 'delivered' || activeTab === 'rto' || activeTab === 'all') && (
                          <>
                            {order.ndr_info.action_history && order.ndr_info.action_history.length > 0 ? (
                              <button
                                className="action-btn action-taken-badge"
                                onClick={() => setActionHistoryPopup({ show: true, order })}
                              >
                                View History
                              </button>
                            ) : (
                              <span className="no-action-text">-</span>
                            )}
                          </>
                        )}
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
          <h3>NDR Action Guidelines:</h3>
          <ul>
            <li>
              <strong>Re-Attempt:</strong> Should be applied after 9 PM to ensure all NDR AWBs are back in facility
            </li>
            <li>
              <strong>RTO:</strong> If you want the shipment returned, select RTO from the View dropdown to raise a ticket
            </li>
            <li>
              <strong>Edit Buyer Info:</strong> To update delivery address or phone number, select Edit Buyer Info
            </li>
            <li>
              <strong>Attempt Limit:</strong> Maximum 3 delivery attempts allowed per shipment
            </li>
          </ul>
        </div>

        {/* Action History Popup */}
        {actionHistoryPopup.show && actionHistoryPopup.order && (
          <div className="action-history-overlay" onClick={() => setActionHistoryPopup({ show: false, order: null })}>
            <div className="action-history-popup" onClick={(e) => e.stopPropagation()}>
              <div className="popup-header">
                <h3>Action History — AWB {actionHistoryPopup.order.delhivery_data.waybill}</h3>
                <button className="popup-close" onClick={() => setActionHistoryPopup({ show: false, order: null })}>×</button>
              </div>
              <div className="popup-body">
                {actionHistoryPopup.order.ndr_info.action_history &&
                actionHistoryPopup.order.ndr_info.action_history.length > 0 ? (
                  actionHistoryPopup.order.ndr_info.action_history.map((entry, idx) => (
                    <div key={idx} className="history-entry">
                      <div className="history-action-label">
                        {entry.ticket_id ? '📋' : '✓'} {getActionLabel(entry.action)}
                      </div>
                      <div className="history-detail">
                        <span className="history-label">Date:</span> {formatDateTime(entry.timestamp)}
                      </div>
                      {entry.upl_id && (
                        <div className="history-detail">
                          <span className="history-label">UPL ID:</span> {entry.upl_id}
                        </div>
                      )}
                      <div className="history-detail">
                        <span className="history-label">Status:</span>{' '}
                        <span className={`history-status ${entry.status?.toLowerCase()}`}>{entry.status}</span>
                      </div>
                      {entry.remarks && (
                        <div className="history-detail">
                          <span className="history-label">Remarks:</span> {entry.remarks}
                        </div>
                      )}
                      {entry.ticket_id && (
                        <div className="history-detail">
                          <span className="history-label">Ticket:</span>{' '}
                          <span
                            className="ticket-link"
                            onClick={() => {
                              setActionHistoryPopup({ show: false, order: null });
                              if (entry.ticket_object_id) {
                                navigate(`/support/tickets/${entry.ticket_object_id}`);
                              } else {
                                navigate('/support');
                              }
                            }}
                          >
                            {entry.ticket_id} →
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-history">No action history available</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NDR;
