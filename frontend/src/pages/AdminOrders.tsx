import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  adminService,
  AdminClient,
  AdminOrderAddress,
  AdminOrderDetails,
  AdminOrderPickupAddress
} from '../services/adminService';
import './AdminOrders.css';

interface OrdersClientSummary {
  _id: string;
  client_id: string;
  company_name: string;
  email: string;
  your_name: string;
  total_orders: number;
  orders_by_status: {
    new: number;
    ready_to_ship: number;
    pickups_manifests: number;
    in_transit: number;
    out_for_delivery: number;
    delivered: number;
    ndr: number;
    rto: number;
    cancelled: number;
  };
}

interface OrdersClientsResponse {
  success: boolean;
  data: {
    clients: OrdersClientSummary[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

interface AdminOrder {
  _id: string;
  order_id: string;
  reference_id?: string;
  status: string;
  order_date?: string;
  createdAt?: string;
  payment_info?: {
    payment_mode?: string;
  };
  customer_info?: {
    buyer_name?: string;
    phone?: string;
  };
  delhivery_data?: {
    waybill?: string;
    cancellation_status?: string;
  };
}

type GroupedOrders = Record<string, AdminOrder[]>;

type OrderStatusKey = 'all' | 'new' | 'ready_to_ship' | 'pickups_manifests' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'ndr' | 'rto_in_transit' | 'rto_delivered' | 'lost' | 'cancelled';

const STATUS_CARDS: Array<{
  key: OrderStatusKey;
  title: string;
  description: string;
}> = [
  {
    key: 'all',
    title: 'All Orders',
    description: 'View all orders regardless of status.'
  },
  {
    key: 'new',
    title: 'New',
    description: 'Orders created and awaiting processing.'
  },
  {
    key: 'ready_to_ship',
    title: 'Ready to Ship',
    description: 'Orders verified and ready for pickup.'
  },
  {
    key: 'pickups_manifests',
    title: 'Pickup & Manifest',
    description: 'Orders with generated manifests.'
  },
  {
    key: 'in_transit',
    title: 'In Transit',
    description: 'Orders currently being shipped.'
  },
  {
    key: 'out_for_delivery',
    title: 'Out for Delivery',
    description: 'Orders out for final delivery.'
  },
  {
    key: 'delivered',
    title: 'Delivered',
    description: 'Successfully delivered orders.'
  },
  {
    key: 'ndr',
    title: 'NDR',
    description: 'Non-delivery report orders.'
  },
  {
    key: 'rto_in_transit',
    title: 'RTO in Transit',
    description: 'Return to origin in transit.'
  },
  {
    key: 'rto_delivered',
    title: 'RTO Delivered',
    description: 'Return to origin completed.'
  },
  {
    key: 'lost',
    title: 'Lost',
    description: 'Orders marked as lost.'
  },
  {
    key: 'cancelled',
    title: 'Cancelled',
    description: 'Cancelled orders.'
  }
];

const PAGE_LIMIT = 10;

const AdminOrders: React.FC = () => {
  const { clientId } = useParams();

  if (clientId) {
    return <ClientOrdersView clientId={clientId} />;
  }

  return <OrdersClientsList />;
};

const OrdersClientsList: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<OrdersClientSummary[]>([]);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 400);

    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('admin_authenticated');
    if (!isAuthenticated) {
      setLoading(false);
      setError('Admin authentication required. Please log in as admin.');
      return;
    }

    const fetchClients = async () => {
      try {
        setLoading(true);
        setError(null);

        const response: OrdersClientsResponse = await adminService.getOrdersClients({
          page,
          limit: PAGE_LIMIT,
          search: debouncedSearch || undefined
        });

        setClients(response.data.clients);
        setPagination({
          page: response.data.pagination.page,
          pages: response.data.pagination.pages,
          total: response.data.pagination.total
        });
      } catch (err: any) {
        console.error('Error fetching orders clients:', err);
        const message =
          err.response?.data?.message ||
          err.message ||
          'Failed to fetch clients';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, [page, debouncedSearch]);

  const handlePageChange = (direction: 'next' | 'prev') => {
    setPage((prev) => {
      if (direction === 'prev') {
        return Math.max(prev - 1, 1);
      }
      return Math.min(prev + 1, pagination.pages);
    });
  };

  if (loading && clients.length === 0) {
    return (
      <div className="admin-orders">
        <Loader message="Loading clients..." />
      </div>
    );
  }

  return (
    <div className="admin-orders">
      <div className="admin-orders__header">
        <div>
          <h1>Admin Orders</h1>
          <p>Review client order activity and drill into individual accounts.</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div className="admin-orders__filters">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by company name, email, or client ID"
          className="admin-orders__search-input"
        />
      </div>

      <div className="admin-orders__card">
        <div className="admin-orders__card-header">
          <h2>Clients ({pagination.total})</h2>
          {loading && <span className="admin-orders__loading-inline">Loading…</span>}
        </div>

        <div className="admin-orders__table-wrapper">
          <table className="admin-orders__table">
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Total Orders</th>
                <th>New</th>
                <th>Ready to Ship</th>
                <th>Pickup & Manifests</th>
                <th>Delivered</th>
                <th>Cancelled</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="admin-orders__empty-state">
                    No clients match your filters yet.
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client._id}
                    className="admin-orders__table-row"
                    onClick={() => navigate(`/admin/orders/${client._id || client.client_id}`)}
                  >
                    <td>
                      <span className="admin-orders__client-id">{client.client_id}</span>
                    </td>
                    <td>
                      <div className="admin-orders__company">
                        <span>{client.company_name || '—'}</span>
                        <small>{client.your_name || 'N/A'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-orders__contact">
                        <span>{client.email || '—'}</span>
                      </div>
                    </td>
                    <td>{client.total_orders}</td>
                    <td>{client.orders_by_status.new}</td>
                    <td>{client.orders_by_status.ready_to_ship}</td>
                    <td>{client.orders_by_status.pickups_manifests}</td>
                    <td>{client.orders_by_status.delivered}</td>
                  <td>{client.orders_by_status.cancelled}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-orders__pagination">
          <button
            className="admin-orders__pagination-btn"
            onClick={() => handlePageChange('prev')}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <span className="admin-orders__pagination-info">
            Page {pagination.page} of {pagination.pages || 1}
          </span>
          <button
            className="admin-orders__pagination-btn"
            onClick={() => handlePageChange('next')}
            disabled={page >= pagination.pages || loading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const ClientOrdersView: React.FC<{ clientId: string }> = ({ clientId }) => {
  const navigate = useNavigate();
  const [client, setClient] = useState<AdminClient | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingClient, setLoadingClient] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<OrderStatusKey>('all');
  const [selectedOrderSummary, setSelectedOrderSummary] = useState<AdminOrder | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<AdminOrderDetails | null>(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = useState(false);
  const [orderDetailsError, setOrderDetailsError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const orderDetailsRequestRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);

    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('admin_authenticated');
    if (!isAuthenticated) {
      setError('Admin authentication required. Please log in as admin.');
      setLoadingOrders(false);
      setLoadingClient(false);
      return;
    }

    const fetchClientInfo = async () => {
      try {
        setLoadingClient(true);
        const response = await adminService.getClientDetails(clientId);
        setClient(response);
      } catch (err: any) {
        console.error('Error fetching client details:', err);
        const message =
          err.response?.data?.message ||
          err.message ||
          'Failed to fetch client details';
        setError(message);
      } finally {
        setLoadingClient(false);
      }
    };

    fetchClientInfo();
  }, [clientId]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoadingOrders(true);
        setError(null);

        const response = await adminService.getClientOrders(clientId, {
          limit: 1000,
          search: debouncedSearch || undefined
        });

        if (Array.isArray(response.data?.orders)) {
          setOrders(response.data.orders);
        } else {
          setOrders([]);
        }
      } catch (err: any) {
        console.error('Error fetching client orders:', err);
        const message =
          err.response?.data?.message ||
          err.message ||
          'Failed to fetch client orders';
        setError(message);
      } finally {
        setLoadingOrders(false);
      }
    };

    fetchOrders();
  }, [clientId, debouncedSearch]);

  const loadOrderDetails = useCallback(async (orderId: string) => {
    if (!isMountedRef.current) {
      return;
    }

    const requestId = Date.now();
    orderDetailsRequestRef.current = requestId;

    setOrderDetailsLoading(true);
    setOrderDetailsError(null);

    try {
      const response = await adminService.getOrderDetails(orderId);

      if (!response.success) {
        throw new Error('Failed to fetch order details');
      }

      if (!isMountedRef.current || orderDetailsRequestRef.current !== requestId) {
        return;
      }

      setOrderDetails(response.data);
    } catch (err: any) {
      if (!isMountedRef.current || orderDetailsRequestRef.current !== requestId) {
        return;
      }

      console.error('Error fetching order details:', err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch order details';

      setOrderDetailsError(message);
      setOrderDetails(null);
    } finally {
      if (!isMountedRef.current || orderDetailsRequestRef.current !== requestId) {
        return;
      }

      setOrderDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedOrderId) {
      setOrderDetails(null);
      setOrderDetailsError(null);
      return;
    }

    loadOrderDetails(selectedOrderId);
  }, [selectedOrderId, loadOrderDetails]);

  const groupedOrders: GroupedOrders = useMemo(() => {
    const groups: GroupedOrders = {
      all: [],
      new: [],
      ready_to_ship: [],
      pickups_manifests: [],
      in_transit: [],
      out_for_delivery: [],
      delivered: [],
      ndr: [],
      rto_in_transit: [],
      rto_delivered: [],
      lost: [],
      cancelled: []
    };

    orders.forEach((order) => {
      // Add to 'all' group
      groups.all.push(order);

      const isCancelled =
        order.status === 'cancelled' ||
        order.delhivery_data?.cancellation_status === 'cancelled';

      if (isCancelled) {
        groups.cancelled.push(order);
        return;
      }

      // Normalize status for grouping
      const status = (order.status || '').toLowerCase().replace(/ /g, '_');

      switch (status) {
        case 'new':
          groups.new.push(order);
          break;
        case 'ready_to_ship':
          groups.ready_to_ship.push(order);
          break;
        case 'pickups_manifests':
        case 'pickup_manifests':
        case 'manifested':
          groups.pickups_manifests.push(order);
          break;
        case 'in_transit':
        case 'in-transit':
        case 'intransit':
          groups.in_transit.push(order);
          break;
        case 'out_for_delivery':
        case 'out-for-delivery':
        case 'outfordelivery':
          groups.out_for_delivery.push(order);
          break;
        case 'delivered':
          groups.delivered.push(order);
          break;
        case 'ndr':
        case 'non_delivery':
        case 'pending':
          groups.ndr.push(order);
          break;
        case 'rto_in_transit':
        case 'rto-in-transit':
        case 'rto_intransit':
          groups.rto_in_transit.push(order);
          break;
        case 'rto_delivered':
        case 'rto-delivered':
        case 'rto':
          groups.rto_delivered.push(order);
          break;
        case 'lost':
          groups.lost.push(order);
          break;
        default:
          break;
      }
    });

    return groups;
  }, [orders]);

  const summaryCounts = useMemo(() => {
    return {
      all: groupedOrders.all.length,
      new: groupedOrders.new.length,
      ready_to_ship: groupedOrders.ready_to_ship.length,
      pickups_manifests: groupedOrders.pickups_manifests.length,
      in_transit: groupedOrders.in_transit.length,
      out_for_delivery: groupedOrders.out_for_delivery.length,
      delivered: groupedOrders.delivered.length,
      ndr: groupedOrders.ndr.length,
      rto_in_transit: groupedOrders.rto_in_transit.length,
      rto_delivered: groupedOrders.rto_delivered.length,
      lost: groupedOrders.lost.length,
      cancelled: groupedOrders.cancelled.length,
      total: orders.length
    };
  }, [groupedOrders, orders.length]);

  const activeOrders = groupedOrders[activeStatus] || [];

  const handleOrderRowClick = useCallback(
    (order: AdminOrder) => {
      const id = order._id || order.order_id;
      if (!id) {
        return;
      }

      setSelectedOrderSummary(order);
      setOrderDetails(null);
      setOrderDetailsError(null);

      if (selectedOrderId === id) {
        loadOrderDetails(id);
      } else {
        setSelectedOrderId(id);
      }
    },
    [loadOrderDetails, selectedOrderId]
  );

  const handleCloseOrderDetails = useCallback(() => {
    setSelectedOrderId(null);
    setSelectedOrderSummary(null);
    setOrderDetails(null);
    setOrderDetailsError(null);
    orderDetailsRequestRef.current = 0;
  }, []);

  const handleRetryOrderDetails = useCallback(() => {
    if (selectedOrderId) {
      loadOrderDetails(selectedOrderId);
    }
  }, [loadOrderDetails, selectedOrderId]);

  const renderOrdersTable = () => {
    if (loadingOrders) {
      return <Loader message="Loading orders..." compact />;
    }

    if (activeOrders.length === 0) {
      return (
        <div className="admin-orders__empty-state-box">
          <p>No orders found in this category yet.</p>
        </div>
      );
    }

    return (
      <div className="admin-orders__table-wrapper">
        <table className="admin-orders__table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>AWB Number</th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Payment Mode</th>
              <th>Order Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeOrders.map((order) => (
              <tr
                key={order._id || order.order_id}
                className="admin-orders__table-row"
                onClick={() => handleOrderRowClick(order)}
              >
                <td>
                  <span className="admin-orders__order-id">{order.order_id || '—'}</span>
                </td>
                <td>
                  <span className="admin-orders__awb">
                    {order.delhivery_data?.waybill || '—'}
                  </span>
                </td>
                <td>
                  <span className="admin-orders__customer-name">
                    {order.customer_info?.buyer_name || 'N/A'}
                  </span>
                </td>
                <td>
                  <span className="admin-orders__customer-phone">
                    {order.customer_info?.phone || '—'}
                  </span>
                </td>
                <td>{formatPaymentMode(order.payment_info?.payment_mode)}</td>
                <td>{formatDate(order.order_date || order.createdAt)}</td>
                <td>
                  <span className={`admin-orders__status-badge admin-orders__status-badge--${(order.status || '').toLowerCase().replace(/_/g, '-')}`}>
                    {formatStatus(order.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="admin-orders">
      <button className="admin-orders__back-btn" onClick={() => navigate('/admin/orders')}>
        ← Back to all clients
      </button>

      <div className="admin-orders__header">
        <div>
          <h1>{client?.company_name || 'Client Orders'}</h1>
          <p>
            {client
              ? `Monitoring ${summaryCounts.total} orders for ${client.company_name}.`
              : 'Monitoring client order activity.'}
          </p>
        </div>
        {loadingClient && <span className="admin-orders__loading-inline">Fetching client...</span>}
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {client && (
        <div className="admin-orders__client-card">
          <div>
            <div className="admin-orders__client-card-title">{client.company_name}</div>
            <div className="admin-orders__client-card-subtitle">Client ID: {client.client_id}</div>
            <div className="admin-orders__client-card-meta">
              Joined {formatDate(String(client.created_at)) || '—'}
            </div>
          </div>
          <div className="admin-orders__client-card-grid">
            <div>
              <span className="admin-orders__client-card-label">Contact</span>
              <span className="admin-orders__client-card-value">{client.your_name || '—'}</span>
            </div>
            <div>
              <span className="admin-orders__client-card-label">Email</span>
              <span className="admin-orders__client-card-value">{client.email || '—'}</span>
            </div>
            <div>
              <span className="admin-orders__client-card-label">Phone</span>
              <span className="admin-orders__client-card-value">{client.phone_number || '—'}</span>
            </div>
            <div>
              <span className="admin-orders__client-card-label">Total Orders</span>
              <span className="admin-orders__client-card-value">{summaryCounts.total}</span>
            </div>
          </div>
        </div>
      )}

      <div className="admin-orders__summary admin-orders__summary--scrollable">
        {STATUS_CARDS.map((card) => (
          <button
            key={card.key}
            className={`admin-orders__summary-card ${activeStatus === card.key ? 'is-active' : ''}`}
            onClick={() => setActiveStatus(card.key)}
          >
            <div className="admin-orders__summary-count">{summaryCounts[card.key]}</div>
            <div className="admin-orders__summary-title">{card.title}</div>
          </button>
        ))}
      </div>

      <div className="admin-orders__filters">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search orders by Order ID, reference ID, buyer, or AWB"
          className="admin-orders__search-input"
        />
      </div>

      <div className="admin-orders__card">
        <div className="admin-orders__card-header">
          <h2>{STATUS_CARDS.find((card) => card.key === activeStatus)?.title || 'Orders'}</h2>
          {!loadingOrders && (
            <span className="admin-orders__loading-inline">
              Showing {activeOrders.length} of {summaryCounts.total} orders
            </span>
          )}
        </div>
        {renderOrdersTable()}
      </div>

      <OrderDetailsDrawer
        isOpen={Boolean(selectedOrderId)}
        summary={selectedOrderSummary}
        details={orderDetails}
        loading={orderDetailsLoading}
        error={orderDetailsError}
        onClose={handleCloseOrderDetails}
        onRetry={handleRetryOrderDetails}
      />
    </div>
  );
};

const OrderDetailsDrawer: React.FC<{
  isOpen: boolean;
  summary: AdminOrder | null;
  details: AdminOrderDetails | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}> = ({ isOpen, summary, details, loading, error, onClose, onRetry }) => {
  if (!isOpen) {
    return null;
  }

  const orderId = details?.order_id || summary?.order_id || '';
  const status = details?.status || summary?.status;
  const orderDate = details?.order_date || summary?.order_date || summary?.createdAt;
  const waybill = details?.delhivery_data?.waybill || summary?.delhivery_data?.waybill;

  return (
    <div className={`admin-order-details ${isOpen ? 'is-open' : ''}`}>
      <div className="admin-order-details__backdrop" onClick={onClose} />
      <aside
        className="admin-order-details__panel"
        role="dialog"
        aria-modal="true"
        aria-label={orderId ? `Order ${orderId} details` : 'Order details'}
      >
        <div className="admin-order-details__header">
          <div>
            <h3>{orderId ? `Order ${orderId}` : 'Order Details'}</h3>
            <p>
              {status ? formatStatus(status) : '—'}
              {orderDate ? ` • ${formatDate(orderDate)}` : ''}
              {waybill ? ` • AWB ${waybill}` : ''}
            </p>
          </div>
          <button className="admin-order-details__close" onClick={onClose} aria-label="Close order details">
            ×
          </button>
        </div>
        <div className="admin-order-details__body">
          {loading && (
            <div className="admin-order-details__loading">
              <Loader message="Loading order details..." compact />
            </div>
          )}
          {!loading && error && (
            <div className="admin-order-details__error">
              <p>{error}</p>
              <button className="admin-order-details__retry-btn" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
          {!loading && !error && details && <OrderDetailsContent details={details} />}
        </div>
      </aside>
    </div>
  );
};

const OrderDetailsContent: React.FC<{ details: AdminOrderDetails }> = ({ details }) => {
  const {
    client,
    delivery_address,
    pickup_address,
    return_address,
    products = [],
    package_info,
    payment_info,
    metrics,
    delhivery_data,
    status_history = [],
    tracking_history = [],
    special_instructions,
    internal_notes,
    cancellation_reason,
    pickup_scheduled_date,
    delivered_date,
    cancelled_date
  } = details;

  const hasNotes = Boolean(special_instructions || internal_notes || cancellation_reason);
  const hasStatusHistory = status_history.length > 0;
  const hasTracking = tracking_history.length > 0;

  return (
    <div className="admin-order-details__content">
      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Order Overview</h4>
        </div>
        <div className="admin-order-details__grid admin-order-details__grid--two">
          <div>
            <span className="admin-order-details__label">Order ID</span>
            <span className="admin-order-details__value">{details.order_id || '—'}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Status</span>
            <span className="admin-order-details__tag">{formatStatus(details.status)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Payment Mode</span>
            <span className="admin-order-details__value">{formatPaymentMode(payment_info?.payment_mode)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Order Type</span>
            <span className="admin-order-details__value">{formatStatus(details.order_type)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Order Date</span>
            <span className="admin-order-details__value">{formatDate(details.order_date || details.createdAt)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Shipping Mode</span>
            <span className="admin-order-details__value">{formatStatus(details.shipping_mode)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Reference ID</span>
            <span className="admin-order-details__value">{details.reference_id || '—'}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Invoice Number</span>
            <span className="admin-order-details__value">{details.invoice_number || '—'}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Pickup Scheduled</span>
            <span className="admin-order-details__value">{formatDate(pickup_scheduled_date)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Delivered Date</span>
            <span className="admin-order-details__value">{formatDate(delivered_date)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Cancelled Date</span>
            <span className="admin-order-details__value">{formatDate(cancelled_date)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">AWB Number</span>
            <span className="admin-order-details__value">{delhivery_data?.waybill || '—'}</span>
          </div>
        </div>
      </section>

      {client && (
        <section className="admin-order-details__section">
          <div className="admin-order-details__section-header">
            <h4>Client</h4>
          </div>
          <div className="admin-order-details__grid admin-order-details__grid--two">
            <div>
              <span className="admin-order-details__label">Company</span>
              <span className="admin-order-details__value">{client.company_name || '—'}</span>
            </div>
            <div>
              <span className="admin-order-details__label">Client ID</span>
              <span className="admin-order-details__value">{client.client_id || '—'}</span>
            </div>
            <div>
              <span className="admin-order-details__label">Contact Name</span>
              <span className="admin-order-details__value">{client.your_name || '—'}</span>
            </div>
            <div>
              <span className="admin-order-details__label">Email</span>
              <span className="admin-order-details__value">{client.email || '—'}</span>
            </div>
            <div>
              <span className="admin-order-details__label">Phone</span>
              <span className="admin-order-details__value">{client.phone_number || '—'}</span>
            </div>
            <div>
              <span className="admin-order-details__label">Category</span>
              <span className="admin-order-details__value">{client.user_category || '—'}</span>
            </div>
          </div>
        </section>
      )}

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Addresses</h4>
        </div>
        <div className="admin-order-details__addresses">
          <AddressCard title="Pickup Address" address={pickup_address} />
          <AddressCard title="Delivery Address" address={delivery_address} />
          <AddressCard title="Return Address" address={return_address} />
        </div>
      </section>

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Products</h4>
        </div>
        {products.length > 0 ? (
          <div className="admin-order-details__table-wrapper">
            <table className="admin-order-details__products-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                  <th>HSN / SKU</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => (
                  <tr key={`${product.product_name || 'product'}-${index}`}>
                    <td>{product.line_item ?? index + 1}</td>
                    <td>
                      <div className="admin-order-details__value">{product.product_name || '—'}</div>
                      {product.product_description && (
                        <div className="admin-order-details__muted">{product.product_description}</div>
                      )}
                    </td>
                    <td>{product.category || '—'}</td>
                    <td>{product.quantity ?? '—'}</td>
                    <td>{formatCurrency(product.unit_price)}</td>
                    <td>{formatCurrency(product.total_price)}</td>
                    <td>
                      {product.hsn_code || product.sku ? (
                        <>
                          {product.hsn_code && <div>HSN: {product.hsn_code}</div>}
                          {product.sku && <div>SKU: {product.sku}</div>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-order-details__muted">No products recorded for this order.</p>
        )}
      </section>

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Package & Weight</h4>
        </div>
        <div className="admin-order-details__grid admin-order-details__grid--two">
          <div>
            <span className="admin-order-details__label">Actual Weight</span>
            <span className="admin-order-details__value">
              {package_info?.weight ? `${package_info.weight} kg` : '—'}
            </span>
          </div>
          <div>
            <span className="admin-order-details__label">Volumetric Weight</span>
            <span className="admin-order-details__value">
              {package_info?.volumetric_weight ? `${package_info.volumetric_weight.toFixed(2)} kg` : '—'}
            </span>
          </div>
          <div>
            <span className="admin-order-details__label">Dimensions</span>
            <span className="admin-order-details__value">
              {package_info?.dimensions
                ? `${package_info.dimensions.length || 0} × ${package_info.dimensions.width || 0} × ${package_info.dimensions.height || 0} cm`
                : '—'}
            </span>
          </div>
          <div>
            <span className="admin-order-details__label">Package Type</span>
            <span className="admin-order-details__value">{package_info?.package_type || '—'}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Number of Boxes</span>
            <span className="admin-order-details__value">
              {package_info?.number_of_boxes ?? '—'}
            </span>
          </div>
          <div>
            <span className="admin-order-details__label">Weight per Box</span>
            <span className="admin-order-details__value">
              {package_info?.weight_per_box ? `${package_info.weight_per_box} kg` : '—'}
            </span>
          </div>
        </div>
      </section>

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Charges & Payment</h4>
        </div>
        <div className="admin-order-details__metrics-grid">
          <div className="admin-order-details__metrics-card">
            <span className="admin-order-details__label">Order Value</span>
            <span className="admin-order-details__value">{formatCurrency(payment_info?.order_value)}</span>
          </div>
          <div className="admin-order-details__metrics-card">
            <span className="admin-order-details__label">Total Amount</span>
            <span className="admin-order-details__value">{formatCurrency(payment_info?.total_amount)}</span>
          </div>
          <div className="admin-order-details__metrics-card">
            <span className="admin-order-details__label">COD Amount</span>
            <span className="admin-order-details__value">{formatCurrency(payment_info?.cod_amount)}</span>
          </div>
          <div className="admin-order-details__metrics-card">
            <span className="admin-order-details__label">Shipping Charges</span>
            <span className="admin-order-details__value">{formatCurrency(payment_info?.shipping_charges)}</span>
          </div>
          <div className="admin-order-details__metrics-card">
            <span className="admin-order-details__label">Grand Total</span>
            <span className="admin-order-details__value">{formatCurrency(payment_info?.grand_total)}</span>
          </div>
          <div className="admin-order-details__metrics-card">
            <span className="admin-order-details__label">Total Units</span>
            <span className="admin-order-details__value">{metrics?.total_units ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Shipping & Courier</h4>
        </div>
        <div className="admin-order-details__grid admin-order-details__grid--two">
          <div>
            <span className="admin-order-details__label">Waybill</span>
            <span className="admin-order-details__value">{delhivery_data?.waybill || '—'}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Manifest ID</span>
            <span className="admin-order-details__value">{delhivery_data?.manifest_id || '—'}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Pickup Status</span>
            <span className="admin-order-details__value">{formatStatus(delhivery_data?.pickup_request_status)}</span>
          </div>
          <div>
            <span className="admin-order-details__label">Expected Delivery</span>
            <span className="admin-order-details__value">
              {formatDate(delhivery_data?.expected_delivery_date)}
            </span>
          </div>
          <div>
            <span className="admin-order-details__label">Cancellation Status</span>
            <span className="admin-order-details__value">
              {formatStatus(delhivery_data?.cancellation_status)}
            </span>
          </div>
          <div>
            <span className="admin-order-details__label">Pickup Date</span>
            <span className="admin-order-details__value">{formatDate(delhivery_data?.pickup_date)}</span>
          </div>
        </div>
      </section>

      {hasNotes && (
        <section className="admin-order-details__section">
          <div className="admin-order-details__section-header">
            <h4>Notes</h4>
          </div>
          <div className="admin-order-details__notes">
            {special_instructions && (
              <p>
                <strong>Special Instructions:</strong> {special_instructions}
              </p>
            )}
            {internal_notes && (
              <p>
                <strong>Internal Notes:</strong> {internal_notes}
              </p>
            )}
            {cancellation_reason && (
              <p>
                <strong>Cancellation Reason:</strong> {cancellation_reason}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Status History</h4>
        </div>
        {hasStatusHistory ? (
          <ul className="admin-order-details__timeline">
            {status_history.map((entry, index) => (
              <li
                key={`${entry.status}-${entry.timestamp || entry.createdAt || index}`}
                className="admin-order-details__timeline-item"
              >
                <div className="admin-order-details__timeline-time">
                  {formatDateTime(entry.timestamp || entry.createdAt)}
                </div>
                <div className="admin-order-details__timeline-content">
                  <div className="admin-order-details__timeline-status">{formatStatus(entry.status)}</div>
                  {entry.remarks && <p>{entry.remarks}</p>}
                  {entry.location && <p className="admin-order-details__muted">{entry.location}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-order-details__muted">No status updates recorded.</p>
        )}
      </section>

      <section className="admin-order-details__section">
        <div className="admin-order-details__section-header">
          <h4>Tracking Events</h4>
        </div>
        {hasTracking ? (
          <ul className="admin-order-details__timeline admin-order-details__timeline--tracking">
            {tracking_history.map((event, index) => (
              <li
                key={`${event.status}-${event.status_date_time}-${index}`}
                className="admin-order-details__timeline-item"
              >
                <div className="admin-order-details__timeline-time">
                  {formatDateTime(event.status_date_time)}
                </div>
                <div className="admin-order-details__timeline-content">
                  <div className="admin-order-details__timeline-status">{event.status}</div>
                  {event.status_location && (
                    <p className="admin-order-details__muted">{event.status_location}</p>
                  )}
                  {event.instructions && <p>{event.instructions}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-order-details__muted">No tracking events available.</p>
        )}
      </section>
    </div>
  );
};

const AddressCard: React.FC<{
  title: string;
  address?: AdminOrderAddress | AdminOrderPickupAddress | null;
}> = ({ title, address }) => {
  const pickup = isPickupAddress(address) ? address : undefined;
  const addressLines = getAddressLines(address);

  return (
    <div className="admin-order-details__address-card">
      <h5>{title}</h5>
      {pickup?.name && <p className="admin-order-details__value">{pickup.name}</p>}
      {addressLines.length > 0 ? (
        addressLines.map((line, index) => (
          <p key={`${title}-line-${index}`} className={index === 0 ? undefined : 'admin-order-details__muted'}>
            {line}
          </p>
        ))
      ) : (
        <p className="admin-order-details__muted">Not provided.</p>
      )}
      {pickup?.phone && (
        <p className="admin-order-details__muted">Phone: {pickup.phone}</p>
      )}
    </div>
  );
};

const Loader: React.FC<{ message: string; compact?: boolean }> = ({ message, compact = false }) => {
  return (
    <div className={`admin-orders__loader ${compact ? 'admin-orders__loader--compact' : ''}`}>
      <div className="admin-orders__spinner" />
      <p>{message}</p>
    </div>
  );
};

const ErrorBanner: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="admin-orders__error-banner">
    <span>{message}</span>
    <button onClick={onClose} aria-label="Dismiss error">
      ×
    </button>
  </div>
);

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatPaymentMode(mode?: string) {
  if (!mode) return '—';
  return mode.replace(/_/g, ' ');
}

function formatStatus(status?: string) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(value);
  } catch (error) {
    return `₹${Number(value).toFixed(2)}`;
  }
}

function isPickupAddress(address?: AdminOrderAddress | AdminOrderPickupAddress | null): address is AdminOrderPickupAddress {
  return Boolean(address && ('name' in address || 'phone' in address));
}

function getAddressLines(address?: AdminOrderAddress | AdminOrderPickupAddress | null) {
  if (!address) {
    return [];
  }

  const lines: string[] = [];

  if ('full_address' in address && address.full_address) {
    lines.push(address.full_address);
  } else {
    if ('address_line_1' in address && address.address_line_1) {
      lines.push(address.address_line_1);
    }
    if ('address_line_2' in address && address.address_line_2) {
      lines.push(address.address_line_2);
    }
  }

  const locality = [address.city, address.state, address.pincode].filter(Boolean).join(', ');
  if (locality) {
    lines.push(locality);
  }

  if ('landmark' in address && address.landmark) {
    lines.push(`Landmark: ${address.landmark}`);
  }

  if ('country' in address && address.country) {
    lines.push(address.country);
  }

  return lines;
}

export default AdminOrders;
