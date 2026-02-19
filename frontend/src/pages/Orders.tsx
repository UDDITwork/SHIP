import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import OrderCreationModal from '../components/OrderCreationModal';
import TrackingModal from '../components/TrackingModal';
import PickupRequestModal from '../components/PickupRequestModal';
import BulkActionBar from '../components/BulkActionBar';
import LabelFormatModal from '../components/LabelFormatModal';
import BulkResultModal, { BulkResult } from '../components/BulkResultModal';
import { orderService, Order } from '../services/orderService';
import { warehouseService } from '../services/warehouseService';
import { DataCache } from '../utils/dataCache';
import { environmentConfig } from '../config/environment';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import OrderDetailPanel from '../components/OrderDetailPanel';
import { Inbox, Calendar, X, Plus, AlertTriangle } from 'lucide-react';
import { User } from '../services/userService';
import './Orders.css';

// Simple warehouse interface for dropdown
interface WarehouseOption {
  _id: string;
  name: string;
  title: string;
}

// Order Status Types
type OrderStatus = 'new' | 'ready_to_ship' | 'pickups_manifests' | 'in_transit' | 
                   'out_for_delivery' | 'delivered' | 'ndr' | 'rto' | 'all' | 'lost';

type OrderType = 'forward' | 'reverse';

// Order interface is now imported from orderService

interface OrderFilters {
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
  searchType: 'reference' | 'awb' | 'order' | 'mobile';
  paymentMode?: string;
  warehouseId?: string;
  state?: string;
  minAmount?: number;
  maxAmount?: number;
}

interface BulkImportSummary {
  total: number;
  created: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  details: Array<{ row: number; order_id: string | null }>;
}

type OrderSearchType = 'reference' | 'awb' | 'order' | 'mobile';

const Orders: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // State Management
  const [activeTab, setActiveTab] = useState<OrderStatus>('new');
  const [orderType, setOrderType] = useState<OrderType>('forward');
  const [orders, setOrders] = useState<Order[]>([]);
  const ordersRef = useRef<Order[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debug orders state changes
  useEffect(() => {
    console.log('📋 ORDERS STATE UPDATED:', {
      count: orders.length,
      orders: orders
    });
  }, [orders]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
  const [loading, setLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // Order detail panel (slide-in drawer)
  const [detailPanelOrder, setDetailPanelOrder] = useState<Order | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Toast notification state
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' | 'info' }>>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'default';
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, options?: { confirmText?: string; cancelText?: string; variant?: 'danger' | 'default' }) => {
    setConfirmModal({
      open: true,
      title,
      message,
      onConfirm,
      confirmText: options?.confirmText || 'OK',
      cancelText: options?.cancelText || 'Cancel',
      variant: options?.variant || 'default',
    });
  }, []);

  const closeConfirmModal = useCallback(() => {
    setConfirmModal(prev => ({ ...prev, open: false }));
  }, []);

  // Filter States
  const [filters, setFilters] = useState<OrderFilters>({
    dateFrom: '',
    dateTo: '',
    searchQuery: '',
    searchType: 'order',
  });

  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Date preset type and handler
  type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'last30days' | 'thisMonth' | 'lastMonth' | 'custom';
  const [selectedDatePreset, setSelectedDatePreset] = useState<DatePreset>('last30days');

  const getDateRangeForPreset = (preset: DatePreset): { from: string; to: string } => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (preset) {
      case 'today': {
        return { from: todayStr, to: todayStr };
      }
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return { from: yesterdayStr, to: yesterdayStr };
      }
      case 'thisWeek': {
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        return { from: last7.toISOString().split('T')[0], to: todayStr };
      }
      case 'lastWeek': {
        // Last 7 days before this week
        const startLastWeek = new Date(today);
        startLastWeek.setDate(startLastWeek.getDate() - 14);
        const endLastWeek = new Date(today);
        endLastWeek.setDate(endLastWeek.getDate() - 7);
        return { from: startLastWeek.toISOString().split('T')[0], to: endLastWeek.toISOString().split('T')[0] };
      }
      case 'last30days': {
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        return { from: last30.toISOString().split('T')[0], to: todayStr };
      }
      case 'thisMonth': {
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: firstDayOfMonth.toISOString().split('T')[0], to: todayStr };
      }
      case 'lastMonth': {
        const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: firstDayLastMonth.toISOString().split('T')[0],
          to: lastDayLastMonth.toISOString().split('T')[0]
        };
      }
      case 'custom':
      default:
        return getDefaultDateRange();
    }
  };

  const handleDatePresetSelect = (preset: DatePreset) => {
    if (preset === 'custom') {
      setSelectedDatePreset('custom');
      // Keep date picker open for custom selection
      return;
    }
    const range = getDateRangeForPreset(preset);
    setFilters(prev => ({
      ...prev,
      dateFrom: range.from,
      dateTo: range.to
    }));
    setSelectedDatePreset(preset);
    setShowDatePicker(false);
  };

  // Modal States
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState<BulkImportSummary | null>(null);
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);
  const [isBulkImportLoading, setIsBulkImportLoading] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [viewOrderModal, setViewOrderModal] = useState<{open: boolean, order: Order | null}>({
    open: false,
    order: null
  });
  const [trackingModal, setTrackingModal] = useState<{
    open: boolean;
    awb: string | null;
    orderId: string | null;
  }>({
    open: false,
    awb: null,
    orderId: null
  });
  const [pickupModal, setPickupModal] = useState<{
    open: boolean;
    orderId: string | null;
    orderNumber: string | null;
    warehouseName: string | null;
  }>({
    open: false,
    orderId: null,
    orderNumber: null,
    warehouseName: null
  });

  // Warehouse options for filter dropdown
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);

  // Bulk action states
  const [showLabelFormatModal, setShowLabelFormatModal] = useState(false);
  const [bulkResultModal, setBulkResultModal] = useState<{
    open: boolean;
    result: BulkResult | null;
    operationType: 'awb' | 'pickup' | 'cancel' | 'label';
  }>({
    open: false,
    result: null,
    operationType: 'awb'
  });
  const [bulkLoading, setBulkLoading] = useState(false);

  // Fetch warehouses for filter dropdown
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const warehouses = await warehouseService.getWarehousesForDropdown();
        setWarehouseOptions(warehouses.map(w => ({
          _id: w._id,
          name: w.name,
          title: w.title
        })));
      } catch (error) {
        console.error('Failed to fetch warehouses for filter:', error);
      }
    };
    fetchWarehouses();
  }, []);

  // Load user data for KYC status check
  useEffect(() => {
    const cachedUser = DataCache.get<User>('userProfile');
    if (cachedUser) {
      setUser(cachedUser);
    } else {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse stored user:', e);
        }
      }
    }
  }, []);

  const applyGlobalSearch = useCallback((query: string, type: OrderSearchType) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    setFilters((prev) => {
      if (prev.searchQuery === trimmedQuery && prev.searchType === type) {
        return prev;
      }
      return {
        ...prev,
        searchQuery: trimmedQuery,
        searchType: type,
      };
    });
    setActiveTab((prev) => (prev === 'all' ? prev : 'all'));
  }, []);

  // Build order filters from current state (shared between fetchOrders and polling)
  const buildOrderFilters = useCallback(() => {
    const orderFilters: any = {};
    if (activeTab !== 'all') orderFilters.status = activeTab;
    if (orderType) orderFilters.order_type = orderType;
    if (filters.dateFrom) orderFilters.date_from = filters.dateFrom;
    if (filters.dateTo) orderFilters.date_to = filters.dateTo;
    if (filters.searchQuery) {
      orderFilters.search = filters.searchQuery;
      orderFilters.search_type = filters.searchType;
    }
    if (filters.paymentMode) orderFilters.payment_mode = filters.paymentMode;
    if (filters.warehouseId) orderFilters.warehouse_id = filters.warehouseId;
    if (filters.state && filters.state.trim()) orderFilters.state = filters.state.trim();
    if (typeof filters.minAmount === 'number') orderFilters.min_amount = filters.minAmount;
    if (typeof filters.maxAmount === 'number') orderFilters.max_amount = filters.maxAmount;
    return orderFilters;
  }, [activeTab, orderType, filters]);

  const fetchOrders = useCallback(async (): Promise<void> => {
    // Cancel any in-flight request from a previous tab/filter switch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const orderFilters = buildOrderFilters();

    try {
      // Step 1: Show cached data instantly (stale-while-revalidate pattern)
      // Uses orderService as SINGLE cache layer — no component-level DataCache
      const cachedOrders = await orderService.getOrders(orderFilters, true);
      if (controller.signal.aborted) return; // Tab switched while we were getting cache

      if (cachedOrders && cachedOrders.length > 0) {
        setOrders(cachedOrders);
        setLoading(false);
      } else {
        setLoading(true);
      }

      // Step 2: Fetch fresh data from API (bypasses cache)
      const freshOrders = await orderService.getOrders(orderFilters, false);
      if (controller.signal.aborted) return; // Tab switched during API call

      // Step 3: Update UI with fresh data
      setOrders(freshOrders);

    } catch (error: any) {
      if (controller.signal.aborted) return; // Aborted — ignore silently
      console.error('❌ Error fetching orders:', error);

      // Keep existing orders on screen if we have any
      if (ordersRef.current.length > 0) {
        console.log(`⚠️ API error but keeping existing ${ordersRef.current.length} orders on screen`);
      } else {
        setOrders([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [buildOrderFilters]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search') || '';
    const typeParam = params.get('search_type') as OrderSearchType | null;
    const stateData = location.state as { searchQuery?: string; searchType?: OrderSearchType } | null;
    const stateQuery = stateData?.searchQuery || '';
    const stateType = stateData?.searchType;

    const effectiveQuery = (searchParam || stateQuery || '').trim();
    const effectiveType: OrderSearchType =
      typeParam && ['order', 'awb', 'reference', 'mobile'].includes(typeParam)
        ? typeParam
        : stateType && ['order', 'awb', 'reference', 'mobile'].includes(stateType)
        ? stateType
        : 'order';

    if (effectiveQuery) {
      applyGlobalSearch(effectiveQuery, effectiveType);
    } else {
      setFilters((prev) => {
        if (!prev.searchQuery) {
          return prev;
        }
        return { ...prev, searchQuery: '', searchType: prev.searchType };
      });
    }
  }, [location.search, location.state, applyGlobalSearch]);

  useEffect(() => {
    const handleHeaderSearch = (event: Event) => {
      const custom = event as CustomEvent<{ searchQuery: string; searchType: OrderSearchType }>;
      if (!custom?.detail) return;
      applyGlobalSearch(custom.detail.searchQuery, custom.detail.searchType);
    };

    window.addEventListener('order-global-search', handleHeaderSearch);
    return () => {
      window.removeEventListener('order-global-search', handleHeaderSearch);
    };
  }, [applyGlobalSearch]);

  // Fetch Orders on component mount and when filters change
  // NO WEBSOCKET DEPENDENCY - Orders fetched directly from MongoDB only
  useEffect(() => {
    fetchOrders();

    // Polling: always fetch fresh (bypasses cache) to get real-time updates
    const refreshInterval = setInterval(async () => {
      console.log('🔄 Polling orders from MongoDB...', { activeTab });
      try {
        const orderFilters = buildOrderFilters();
        const freshOrders = await orderService.getOrders(orderFilters, false);
        // Only update if this component is still mounted and on same tab
        if (!abortControllerRef.current?.signal.aborted) {
          setOrders(freshOrders);
        }
      } catch (err) {
        // Polling errors are silent — don't disturb the UI
        console.warn('Polling refresh failed:', err);
      }
    }, 60000);

    return () => {
      clearInterval(refreshInterval);
      // Abort in-flight requests on unmount or dependency change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchOrders, activeTab, buildOrderFilters]);

  const handleSyncOrders = async () => {
    setLoading(true);
    try {
      // First, force refresh all orders (calls Delhivery API to get fresh status)
      const token = localStorage.getItem('token');
      if (!token) {
        showToast('Authentication required. Please log in again.', 'error');
        setLoading(false);
        return;
      }

      try {
        // Force refresh - calls Delhivery API for fresh status
        const refreshResponse = await fetch(`${environmentConfig.apiUrl}/orders/force-refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const refreshData = await refreshResponse.json();
        
        if (refreshData.status === 'success') {
          const refreshed = refreshData.data?.refreshed || 0;
          const total = refreshData.data?.total || 0;
          
          // Then sync the statuses to Order models
          const syncResult = await orderService.syncOrders();
          
          if (syncResult.success) {
            const synced = syncResult.data?.synced || 0;
            showToast(`Orders refreshed and synced! ${refreshed} refreshed, ${synced} updated.`, 'success');
          } else {
            showToast(`Orders refreshed (${refreshed}), but sync failed: ${syncResult.error || 'Unknown error'}`, 'error');
          }
        } else {
          showToast(`Failed to refresh orders: ${refreshData.message || 'Unknown error'}`, 'error');
        }
      } catch (refreshError) {
        console.error('Error refreshing orders:', refreshError);
        // Fallback to just sync if refresh fails
        const syncResult = await orderService.syncOrders();
        if (syncResult.success) {
          const synced = syncResult.data?.synced || 0;
          const total = syncResult.data?.total || 0;
          showToast(`Orders synced: ${synced} out of ${total} orders updated.`, 'success');
        } else {
          showToast(`Failed to sync orders: ${syncResult.error || 'Unknown error'}`, 'error');
        }
      }
      
      // Clear ALL order caches completely (important!)
      orderService.clearCache();

      console.log('🗑️ Order caches cleared, refreshing orders...');
      
      // Force fresh fetch for current tab
      const currentFilters: any = {};
      if (activeTab !== 'all') {
        currentFilters.status = activeTab;
      }
      if (orderType) currentFilters.order_type = orderType;
      if (filters.dateFrom) currentFilters.date_from = filters.dateFrom;
      if (filters.dateTo) currentFilters.date_to = filters.dateTo;
      
      // Force refresh without cache
      await orderService.refreshOrders(currentFilters);
      
      // Also refresh "delivered" tab cache to ensure it shows
      if (activeTab !== 'delivered') {
        const deliveredFilters = { ...currentFilters, status: 'delivered' };
        await orderService.refreshOrders(deliveredFilters);
      }
      
      // Finally, fetch orders for current tab
      await fetchOrders();
    } catch (error) {
      console.error('Error syncing orders:', error);
      showToast('Failed to sync orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkImport = () => {
    setBulkImportSummary(null);
    setBulkImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsBulkImportModalOpen(true);
  };

  const handleBulkImportClose = () => {
    setIsBulkImportModalOpen(false);
    setBulkImportSummary(null);
    setBulkImportError(null);
    setIsBulkImportLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBulkImportSubmit = async (file: File) => {
    if (!file) return;

    try {
      setIsBulkImportLoading(true);
      setBulkImportError(null);
      setBulkImportSummary(null);

      const token = localStorage.getItem('token');
      if (!token) {
        setBulkImportError('Authentication required. Please log in again.');
        setIsBulkImportLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${environmentConfig.apiUrl}/orders/bulk-import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch (err) {
        data = { success: false, message: 'Unable to parse response from server.' };
      }

      if (response.ok || response.status === 207) {
        const summary: BulkImportSummary | undefined = data?.data;
        if (summary) {
          setBulkImportSummary(summary);
        }
        orderService.clearCache();
        await fetchOrders();
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        if (data.success) {
          setTimeout(() => {
            setIsBulkImportModalOpen(false);
            setBulkImportSummary(null);
          }, 1800);
        }
      } else {
        setBulkImportError(data.message || 'Failed to import orders. Please check your file format.');
      }
    } catch (error) {
      console.error('Bulk import error:', error);
      setBulkImportError(error instanceof Error ? error.message : 'Failed to import orders. Please check your file format.');
    } finally {
      setIsBulkImportLoading(false);
    }
  };

  const handleAddOrder = () => {
    // Check if KYC is rejected - block shipment creation
    if (user?.kyc_status?.status === 'rejected') {
      showConfirm(
        'Service Unavailable',
        `Your account is currently restricted due to KYC rejection.\n\n${user.kyc_status.verification_notes ? `Reason: ${user.kyc_status.verification_notes}\n\n` : ''}Please contact support or re-submit KYC documents.`,
        () => navigate('/account-settings'),
        {
          confirmText: 'View KYC Status',
          cancelText: 'Cancel',
          variant: 'danger'
        }
      );
      return;
    }
    setIsAddOrderModalOpen(true);
  };

  const handleRequestPickup = (orderId: string, orderNumber: string, warehouseName?: string) => {
    // Open the pickup modal instead of directly making the request
    setPickupModal({
      open: true,
      orderId,
      orderNumber,
      warehouseName: warehouseName || null
    });
  };

  const handleConfirmPickup = async (pickupDate: string, pickupTime: string, packageCount: number) => {
    if (!pickupModal.orderId) return;

    try {
      setLoading(true);
      
      // Use environmentConfig.apiUrl which already includes /api
      const response = await fetch(`${environmentConfig.apiUrl}/orders/${pickupModal.orderId}/request-pickup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pickup_date: pickupDate,
          pickup_time: pickupTime,
          expected_package_count: packageCount
        })
      });

      if (response.ok) {
        const data = await response.json();
        showToast(`Pickup requested! ID: ${data.data.pickup_request_id || 'N/A'}, Scheduled: ${data.data.pickup_date} at ${data.data.pickup_time}`, 'success');
        
        // Close modal
        setPickupModal({ open: false, orderId: null, orderNumber: null, warehouseName: null });
        
        // Clear cache and refresh from MongoDB
        orderService.clearCache();
        fetchOrders(); // Refresh list
      } else {
        let errorMessage = 'Failed to request pickup from Delhivery';
        try {
          const error = await response.json();
          errorMessage = error.message || error.error || JSON.stringify(error);
        } catch (parseError) {
          // If JSON parsing fails, use response text
          const text = await response.text();
          errorMessage = text || `Request failed with status ${response.status}`;
        }
        
        // Show detailed error message to user
        showToast(`Pickup Request Failed: ${errorMessage}`, 'error');
      }
    } catch (error: any) {
      console.error('Pickup request error:', error);

      let errorMessage = 'Failed to request pickup';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showToast(`Pickup Request Failed: ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderCreated = (order: any) => {
    console.log('🎉 ORDER CREATED CALLBACK:', order);
    
    // Clear cache so fresh data is fetched
    orderService.clearCache();
    
    // Refresh orders from MongoDB to get latest data
    const orderFilters: any = {};
    if (activeTab !== 'all') orderFilters.status = activeTab;
    if (orderType) orderFilters.order_type = orderType;
    if (filters.dateFrom) orderFilters.date_from = filters.dateFrom;
    if (filters.dateTo) orderFilters.date_to = filters.dateTo;
      if (filters.searchQuery) {
        orderFilters.search = filters.searchQuery;
        orderFilters.search_type = filters.searchType;
      }
      if (filters.paymentMode) orderFilters.payment_mode = filters.paymentMode;
      if (filters.state && filters.state.trim()) orderFilters.state = filters.state.trim();
      if (typeof filters.minAmount === 'number') orderFilters.min_amount = filters.minAmount;
      if (typeof filters.maxAmount === 'number') orderFilters.max_amount = filters.maxAmount;
    
    // Refresh orders from MongoDB
    fetchOrders();
  };

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(order => order._id));
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // AWB search: force 'all' tab because AWBs don't exist on 'new' orders
    // Other search types (order, reference, mobile) stay on current tab
    if (filters.searchQuery.trim() && filters.searchType === 'awb' && activeTab !== 'all') {
      setActiveTab('all'); // useEffect will trigger fetchOrders with 'all' tab
      return;
    }
    fetchOrders();
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setLoading(true);
      
      // Prepare export data
      const exportData = orders.map(order => ({
        'Order ID': order.orderId,
        'Reference ID': order.referenceId,
        'Order Date': formatDate(order.orderDate),
        'Customer Name': order.customerName,
        'Customer Phone': order.customerPhone,
        'Customer Address': order.customerAddress,
        'City': order.city,
        'State': order.state,
        'PIN': order.pin,
        'Product Name': order.productName,
        'Quantity': order.quantity,
        'Weight (kg)': order.weight,
        'Payment Mode': order.paymentMode,
        'COD Amount': order.codAmount || 0,
        'Total Amount': order.totalAmount,
        'Warehouse': order.warehouse,
        'Status': order.status,
        'AWB Number': order.awb || 'Not Generated',
        'Created At': formatDateTime(order.createdAt)
      }));

      if (format === 'csv') {
        await exportToCSV(exportData);
      } else if (format === 'excel') {
        await exportToExcel(exportData);
      } else if (format === 'pdf') {
        await exportToPDF(exportData);
      }
      
      showToast(`${format.toUpperCase()} export completed successfully!`, 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast(`Failed to export ${format.toUpperCase()}. Please try again.`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async (data: any[]) => {
    const headers = Object.keys(data[0] || {});
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = async (data: any[]) => {
    // For Excel export, we'll create a CSV that can be opened in Excel
    // In a real implementation, you'd use a library like xlsx
    const headers = Object.keys(data[0] || {});
    const csvContent = [
      headers.join('\t'),
      ...data.map(row => headers.map(header => row[header] || '').join('\t'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_${new Date().toISOString().split('T')[0]}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = async (data: any[]) => {
    // For PDF export, we'll create a simple HTML table and print it
    // In a real implementation, you'd use a library like jsPDF
    const headers = Object.keys(data[0] || {});
    const tableHTML = `
      <html>
        <head>
          <title>Orders Export</title>
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Orders Export - ${formatDate(new Date())}</h1>
          <table>
            <thead>
              <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${data.map(row => 
                `<tr>${headers.map(header => `<td>${row[header] || ''}</td>`).join('')}</tr>`
              ).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(tableHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Date helper functions
  const getDefaultDateRange = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    return {
      from: thirtyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0]
    };
  };

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    return formatDate(dateString);
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setFilters(prev => ({
      ...prev,
      dateFrom: from,
      dateTo: to
    }));
    setShowDatePicker(false);
  };

  const handleClearDateFilter = () => {
    setFilters(prev => ({
      ...prev,
      dateFrom: '',
      dateTo: ''
    }));
  };

  const handleMoreFiltersToggle = () => {
    setShowMoreFilters(!showMoreFilters);
  };

  const handleClearAllFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      searchQuery: '',
      searchType: 'order',
      paymentMode: undefined,
      warehouseId: undefined,
      state: undefined,
      minAmount: undefined,
      maxAmount: undefined,
    });
    setShowMoreFilters(false);
  };

  // Action button handlers
  const handleViewOrder = (orderId: string) => {
    // Open inline detail panel instead of navigating away
    const order = orders.find(o => o._id === orderId);
    if (order) {
      setDetailPanelOrder(order);
      setIsDetailPanelOpen(true);
    } else {
      // Fallback: navigate to full page if order not in local list
      navigate(`/orders/${orderId}`);
    }
  };

  const handleEditOrder = (orderId: string) => {
    // Navigate to order details page with edit parameter
    // For now, this will show the order details - editing can be done from there
    navigate(`/orders/${orderId}?edit=true`);
  };

  const handleTrackOrder = (orderId: string, awb?: string) => {
    const sanitizedAwb = (awb || '').trim();

    if (!sanitizedAwb) {
      showToast('AWB number not available for tracking', 'info');
      return;
    }

    // Navigate to tracking page in the same tab
    const trackingUrl = `/tracking/detail?awb=${encodeURIComponent(sanitizedAwb)}${orderId ? `&orderId=${encodeURIComponent(orderId.trim())}` : ''}`;
    navigate(trackingUrl);
  };

  const handleGenerateAWB = (orderId: string, orderDbId: string) => {
    if (!orderDbId) {
      showToast('Order ID not available', 'error');
      return;
    }
    showConfirm(
      'Generate AWB',
      'Generate AWB number for this order? The order will move to "Ready to Ship" tab.',
      () => executeGenerateAWB(orderId, orderDbId),
      { confirmText: 'Generate', variant: 'default' }
    );
  };

  const executeGenerateAWB = async (orderId: string, orderDbId: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // Quick UI pre-check to avoid unnecessary round-trip
      try {
        const targetOrder = orders.find(o => o._id === orderDbId);
        const pickupPin = targetOrder?.pickup_address?.pincode;
        const deliveryPin = targetOrder?.pin;
        if (pickupPin && deliveryPin) {
          const [pickupInfo, deliveryInfo] = await Promise.all([
            fetch(`${environmentConfig.apiUrl}/tools/pincode-info/${pickupPin}`, {
              headers: { 'Authorization': `Bearer ${token || ''}` }
            }).then(r => r.json()).catch(() => null),
            fetch(`${environmentConfig.apiUrl}/tools/pincode-info/${deliveryPin}`, {
              headers: { 'Authorization': `Bearer ${token || ''}` }
            }).then(r => r.json()).catch(() => null)
          ]);
          const isServiceable = (info: any) => {
            if (!info) return true; // fallback to backend
            const flag = (info.serviceable ?? info.pre_paid ?? info.cod ?? info.pickup);
            const norm = typeof flag === 'string' ? flag.toLowerCase() : flag;
            return norm === true || norm === 'y' || norm === 'yes' || norm === 'true' || norm === 1 || norm === '1';
          };
          if (!isServiceable(pickupInfo) || !isServiceable(deliveryInfo)) {
            showToast('PINCODE IS NOT SERVICEABLE', 'error');
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore pre-check errors; backend remains the source of truth
      }
      
      const response = await fetch(`${environmentConfig.apiUrl}/orders/${orderDbId}/generate-awb`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        showToast(`AWB generated: ${data.data.awb_number}. Order moved to "Ready to Ship".`, 'success');
        // Clear cache and refresh orders
        orderService.clearCache();
        fetchOrders();
      } else {
        const msg = (data?.message || data?.error || '').toString().toLowerCase();
        const friendly = data?.error_code === 'PINCODE_NOT_SERVICEABLE' || msg.includes('not serviceable')
          ? 'PINCODE IS NOT SERVICEABLE'
          : (data.message || data.error || 'Failed to generate AWB');
        throw new Error(friendly);
      }
    } catch (error: any) {
      console.error('Generate AWB error:', error);
      showToast(`Failed to generate AWB: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelShipment = (orderId: string, orderDbId: string, awb?: string | null) => {
    if (!orderDbId) {
      showToast('Order ID not available', 'error');
      return;
    }
    const awbText = awb ? `AWB: ${awb}` : 'AWB: Not generated';
    showConfirm(
      'Cancel Shipment',
      `Cancel this shipment?\n\nOrder ID: ${orderId}\n${awbText}\n\nThis action cannot be undone.`,
      () => executeCancelShipment(orderDbId),
      { confirmText: 'Cancel Shipment', variant: 'danger' }
    );
  };

  const executeCancelShipment = async (orderDbId: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${environmentConfig.apiUrl}/orders/${orderDbId}/cancel-shipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        showToast(`Shipment cancelled successfully! Order: ${data.data.order_id}`, 'success');
        orderService.clearCache();
        setTimeout(() => { fetchOrders(); }, 500);
      } else {
        throw new Error(data.message || data.error || 'Failed to cancel shipment');
      }
    } catch (error: any) {
      console.error('Cancel shipment error:', error);
      showToast(`Failed to cancel shipment: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabel = async (orderId: string, orderDbId?: string, awb?: string) => {
    if (!orderDbId) {
      showToast('Order ID not available', 'error');
      return;
    }

    try {
      setLoading(true);

      const apiUrl = environmentConfig.apiUrl;
      const token = localStorage.getItem('token');

      // Fetch comprehensive order details HTML with authentication token
      const response = await fetch(`${apiUrl}/orders/${orderDbId}/print`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate order print page');
      }

      // Get HTML content
      const htmlContent = await response.text();

      // Create a blob from HTML
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);

      // Open blob URL in new window
      const printWindow = window.open(blobUrl, '_blank');
      
      if (printWindow) {
        printWindow.onload = () => {
          // Clean up blob URL after window loads
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 1000);
        };
        
        // Note: Print dialog will open automatically via script in HTML
      } else {
        URL.revokeObjectURL(blobUrl);
        throw new Error('Popup blocked. Please allow popups for this site to print order details.');
      }

    } catch (error: any) {
      console.error('Print order error:', error);
      showToast(`Failed to generate print page: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // BULK ACTION HANDLERS
  // ==========================================

  const handleBulkAWB = () => {
    if (selectedOrders.length === 0) {
      showToast('Please select orders to generate AWB', 'info');
      return;
    }
    if (activeTab !== 'new') {
      showToast('Bulk AWB generation is only available for orders in the "New" tab', 'info');
      return;
    }
    showConfirm(
      'Bulk Generate AWB',
      `Generate AWB for ${selectedOrders.length} orders? This will process orders one by one.`,
      async () => {
        try {
          setBulkLoading(true);
          const result = await orderService.bulkGenerateAWB(selectedOrders);
          setBulkResultModal({ open: true, result, operationType: 'awb' });
          setSelectedOrders([]);
          fetchOrders();
        } catch (error: any) {
          showToast(`Bulk AWB generation failed: ${error.message}`, 'error');
        } finally {
          setBulkLoading(false);
        }
      },
      { confirmText: 'Generate' }
    );
  };

  const handleBulkPickup = async () => {
    if (selectedOrders.length === 0) {
      showToast('Please select orders to create pickup request', 'info');
      return;
    }

    const pickupDate = prompt('Enter pickup date (YYYY-MM-DD):', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    if (!pickupDate) return;

    const pickupTime = prompt('Enter pickup time (HH:MM:SS):', '14:00:00');
    if (!pickupTime) return;

    showConfirm(
      'Bulk Pickup Request',
      `Request pickup for ${selectedOrders.length} orders?\n\nDate: ${pickupDate}\nTime: ${pickupTime}`,
      async () => {
        try {
          setBulkLoading(true);
          const result = await orderService.bulkRequestPickup(selectedOrders, pickupDate, pickupTime);
          setBulkResultModal({ open: true, result, operationType: 'pickup' });
          setSelectedOrders([]);
          fetchOrders();
        } catch (error: any) {
          showToast(`Bulk pickup request failed: ${error.message}`, 'error');
        } finally {
          setBulkLoading(false);
        }
      },
      { confirmText: 'Request Pickup' }
    );
  };

  const handleBulkCancel = () => {
    if (selectedOrders.length === 0) {
      showToast('Please select orders to cancel', 'info');
      return;
    }
    showConfirm(
      'Bulk Cancel Orders',
      `Cancel ${selectedOrders.length} orders?\n\nThis action cannot be undone. Shipping charges will be refunded to your wallet.`,
      async () => {
        try {
          setBulkLoading(true);
          const result = await orderService.bulkCancel(selectedOrders);
          setBulkResultModal({ open: true, result, operationType: 'cancel' });
          setSelectedOrders([]);
          fetchOrders();
        } catch (error: any) {
          showToast(`Bulk cancellation failed: ${error.message}`, 'error');
        } finally {
          setBulkLoading(false);
        }
      },
      { confirmText: 'Cancel Orders', variant: 'danger' }
    );
  };

  const handleBulkLabel = (format: string) => {
    // Open label format modal
    setShowLabelFormatModal(true);
  };

  const handleBulkNeedHelp = () => {
    // Navigate to support page with selected order IDs
    const orderIds = selectedOrders.join(',');
    navigate(`/support?orderIds=${encodeURIComponent(orderIds)}&bulk=true`);
  };

  const handleBulkLabelConfirm = async (format: string) => {
    setShowLabelFormatModal(false);

    if (selectedOrders.length === 0) {
      showToast('Please select orders to print labels', 'info');
      return;
    }

    try {
      setBulkLoading(true);
      await orderService.bulkPrintLabels(selectedOrders, format);
    } catch (error: any) {
      showToast(`Bulk label print failed: ${error.message}`, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedOrders([]);
  };

  // Active filter count
  const activeFilterCount = [
    filters.paymentMode,
    filters.warehouseId,
    filters.state && filters.state.trim(),
    typeof filters.minAmount === 'number',
    typeof filters.maxAmount === 'number',
  ].filter(Boolean).length;

  // Order Details Modal Component
  const OrderDetailsModal = ({ open, order, onClose }: { open: boolean, order: Order | null, onClose: () => void }) => {
    if (!open || !order) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="order-details-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Order Details - {order.orderId}</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="modal-body">
            {/* Order Information */}
            <section className="details-section">
              <h3>Order Information</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Order ID:</strong> {order.orderId}</div>
                <div className="detail-item"><strong>Reference ID:</strong> {order.referenceId || 'N/A'}</div>
                <div className="detail-item"><strong>Order Date:</strong> {formatDate(order.orderDate)}</div>
                <div className="detail-item"><strong>Status:</strong> <span className={`status-badge ${order.status}`}>{order.status}</span></div>
                <div className="detail-item"><strong>AWB Number:</strong> {order.awb || 'Not Generated'}</div>
              </div>
            </section>

            {/* Customer Information */}
            <section className="details-section">
              <h3>Customer Information</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Name:</strong> {order.customerName}</div>
                <div className="detail-item"><strong>Phone:</strong> {order.customerPhone}</div>
                <div className="detail-item"><strong>Address:</strong> {order.customerAddress}</div>
                <div className="detail-item"><strong>City:</strong> {order.city}, {order.state}</div>
                <div className="detail-item"><strong>Pincode:</strong> {order.pin}</div>
              </div>
            </section>

            {/* Product Information */}
            <section className="details-section">
              <h3>Product Information</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Product:</strong> {order.productName}</div>
                <div className="detail-item"><strong>Quantity:</strong> {order.quantity}</div>
                <div className="detail-item"><strong>Weight:</strong> {order.weight} kg</div>
                {order.length && (
                  <div className="detail-item"><strong>Dimensions:</strong> {order.length} × {order.width} × {order.height} cm</div>
                )}
              </div>
            </section>

            {/* Payment Information */}
            <section className="details-section">
              <h3>Payment Information</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Payment Mode:</strong> <span className={`payment-mode ${order.paymentMode?.toLowerCase()}`}>{order.paymentMode}</span></div>
                <div className="detail-item"><strong>Total Amount:</strong> ₹{order.totalAmount}</div>
                {order.codAmount && <div className="detail-item"><strong>COD Amount:</strong> ₹{order.codAmount}</div>}
              </div>
            </section>

            {/* Pickup Information */}
            <section className="details-section">
              <h3>Warehouse/Pickup Information</h3>
              <div className="details-grid">
                <div className="detail-item"><strong>Warehouse:</strong> {order.warehouse}</div>
                <div className="detail-item"><strong>Pickup Location:</strong> {order.pickupLocation}</div>
                {order.pickupRequestStatus && (
                  <>
                    <div className="detail-item"><strong>Pickup Status:</strong> <span className={`status-badge ${order.pickupRequestStatus}`}>{order.pickupRequestStatus}</span></div>
                    {order.pickupRequestDate && (
                      <div className="detail-item"><strong>Pickup Date:</strong> {formatDate(order.pickupRequestDate)}</div>
                    )}
                    {order.pickupRequestTime && (
                      <div className="detail-item"><strong>Pickup Time:</strong> {order.pickupRequestTime}</div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>

          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      {/* Order Creation Form - Full Page */}
      {isAddOrderModalOpen ? (
        <OrderCreationModal
          onOrderCreated={handleOrderCreated}
          orderType={orderType}
          onBack={() => setIsAddOrderModalOpen(false)}
        />
      ) : (
        <>
      <div className="orders-container">
        {/* Top Action Bar */}
        <div className="orders-top-bar">
          <div className="order-type-toggle">
            <button
              className={`toggle-btn ${orderType === 'forward' ? 'active' : ''}`}
              onClick={() => setOrderType('forward')}
            >
              Forward
            </button>
            <button
              className={`toggle-btn ${orderType === 'reverse' ? 'active' : ''}`}
              onClick={() => setOrderType('reverse')}
            >
              Reverse
            </button>
          </div>

          <div className="top-actions">
            <button className="action-btn sync-btn" onClick={handleSyncOrders}>
              Sync Order
            </button>
            <button className="action-btn import-btn" onClick={handleBulkImport}>
              Bulk Import
            </button>
            <button className="action-btn add-btn" onClick={handleAddOrder}>
              Add Order
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="status-tabs">
          <button
            className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            New
          </button>
          <button
            className={`tab-btn ${activeTab === 'ready_to_ship' ? 'active' : ''}`}
            onClick={() => setActiveTab('ready_to_ship')}
          >
            Ready to Ship
          </button>
          <button
            className={`tab-btn ${activeTab === 'pickups_manifests' ? 'active' : ''}`}
            onClick={() => setActiveTab('pickups_manifests')}
          >
            Pickups & Manifests
          </button>
          <button
            className={`tab-btn ${activeTab === 'in_transit' ? 'active' : ''}`}
            onClick={() => setActiveTab('in_transit')}
          >
            In Transit
          </button>
          <button
            className={`tab-btn ${activeTab === 'out_for_delivery' ? 'active' : ''}`}
            onClick={() => setActiveTab('out_for_delivery')}
          >
            Out for Delivery
          </button>
          <button
            className={`tab-btn ${activeTab === 'delivered' ? 'active' : ''}`}
            onClick={() => setActiveTab('delivered')}
          >
            Delivered
          </button>
          <button
            className={`tab-btn ${activeTab === 'ndr' ? 'active' : ''}`}
            onClick={() => setActiveTab('ndr')}
          >
            NDR
          </button>
          <button
            className={`tab-btn ${activeTab === 'rto' ? 'active' : ''}`}
            onClick={() => setActiveTab('rto')}
          >
            RTO
          </button>
          <button
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            className={`tab-btn ${activeTab === 'lost' ? 'active' : ''}`}
            onClick={() => setActiveTab('lost')}
          >
            Lost
          </button>
        </div>

        {/* Filters Section */}
        <div className="filters-section">
          <div className="date-filter">
            <button
              className="calendar-btn"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              <Calendar size={14} /> {filters.dateFrom ? formatDateForDisplay(filters.dateFrom) : 'Select Date Range'}
              {filters.dateTo && ` to ${formatDateForDisplay(filters.dateTo)}`}
              {!filters.dateFrom && !filters.dateTo && ' (Last 30 days)'}
            </button>
            {showDatePicker && (
              <div className="date-picker-dropdown">
                <div className="date-picker-header">
                  <h4>Select Date Range</h4>
                  <button
                    className="close-btn"
                    onClick={() => setShowDatePicker(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="date-presets">
                  <button
                    className={`preset-btn ${selectedDatePreset === 'today' ? 'active' : ''}`}
                    onClick={() => handleDatePresetSelect('today')}
                  >
                    Today
                  </button>
                  <button
                    className={`preset-btn ${selectedDatePreset === 'yesterday' ? 'active' : ''}`}
                    onClick={() => handleDatePresetSelect('yesterday')}
                  >
                    Yesterday
                  </button>
                  <button
                    className={`preset-btn ${selectedDatePreset === 'thisWeek' ? 'active' : ''}`}
                    onClick={() => handleDatePresetSelect('thisWeek')}
                  >
                    This Week
                  </button>
                  <button
                    className={`preset-btn ${selectedDatePreset === 'lastWeek' ? 'active' : ''}`}
                    onClick={() => handleDatePresetSelect('lastWeek')}
                  >
                    Last Week
                  </button>
                  <button
                    className={`preset-btn ${selectedDatePreset === 'thisMonth' ? 'active' : ''}`}
                    onClick={() => handleDatePresetSelect('thisMonth')}
                  >
                    This Month
                  </button>
                  <button
                    className={`preset-btn ${selectedDatePreset === 'lastMonth' ? 'active' : ''}`}
                    onClick={() => handleDatePresetSelect('lastMonth')}
                  >
                    Last Month
                  </button>
                </div>
                <div className="date-inputs">
                  <div className="date-input-group">
                    <label>From Date</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => {
                        setFilters(prev => ({...prev, dateFrom: e.target.value}));
                        setSelectedDatePreset('custom');
                      }}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="date-input-group">
                    <label>To Date</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => {
                        setFilters(prev => ({...prev, dateTo: e.target.value}));
                        setSelectedDatePreset('custom');
                      }}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                <div className="date-picker-actions">
                  <button
                    className="clear-btn"
                    onClick={handleClearDateFilter}
                  >
                    Reset
                  </button>
                  <button
                    className="cancel-btn"
                    onClick={() => setShowDatePicker(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="apply-btn"
                    onClick={() => {
                      if (filters.dateFrom && filters.dateTo) {
                        fetchOrders();
                        setShowDatePicker(false);
                      }
                    }}
                    disabled={!filters.dateFrom || !filters.dateTo}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSearch} className="search-filter">
            <select
              className="search-type-select"
              value={filters.searchType}
              onChange={(e) => setFilters({...filters, searchType: e.target.value as any})}
            >
              <option value="reference">Search by Reference ID</option>
              <option value="awb">Search by AWB</option>
              <option value="order">Search by Order ID</option>
              <option value="mobile">Search by Mobile Number</option>
            </select>
            <input
              type="text"
              className="search-input"
              placeholder="Search..."
              value={filters.searchQuery}
              onChange={(e) => setFilters({...filters, searchQuery: e.target.value})}
            />
            <button type="submit" className="search-btn"></button>
          </form>

          <div className="more-filters-container">
            <button
              className={`more-filters-btn ${showMoreFilters ? 'active' : ''}`}
              onClick={handleMoreFiltersToggle}
            >
            More Filter{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
            
            {showMoreFilters && (
              <div className="more-filters-dropdown">
                <div className="filters-header">
                  <h4>Advanced Filters</h4>
                  <button 
                    className="close-filters-btn"
                    onClick={() => setShowMoreFilters(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <div className="filters-content">
                  <div className="filter-group">
                    <label>Payment Mode</label>
                    <select
                      value={filters.paymentMode || ''}
                      onChange={(e) => setFilters({...filters, paymentMode: e.target.value})}
                    >
                      <option value="">All Payment</option>
                      <option value="Prepaid">Prepaid</option>
                      <option value="COD">COD</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Warehouse</label>
                    <select
                      value={filters.warehouseId || ''}
                      onChange={(e) => setFilters({...filters, warehouseId: e.target.value})}
                    >
                      <option value="">All Warehouses</option>
                      {warehouseOptions.map(warehouse => (
                        <option key={warehouse._id} value={warehouse._id}>
                          {warehouse.title || warehouse.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>State</label>
                    <input
                      type="text"
                      placeholder="Filter by state"
                      value={filters.state || ''}
                      onChange={(e) => setFilters({...filters, state: e.target.value})}
                    />
                  </div>
                  
                  <div className="filter-group">
                    <label>Min Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="Minimum amount"
                      value={filters.minAmount || ''}
                      onChange={(e) => setFilters({...filters, minAmount: e.target.value ? Number(e.target.value) : undefined})}
                    />
                  </div>
                  
                  <div className="filter-group">
                    <label>Max Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="Maximum amount"
                      value={filters.maxAmount || ''}
                      onChange={(e) => setFilters({...filters, maxAmount: e.target.value ? Number(e.target.value) : undefined})}
                    />
                  </div>
                </div>
                
                <div className="filters-actions">
                  <button 
                    className="apply-filters-btn"
                    onClick={() => {
                      fetchOrders();
                      setShowMoreFilters(false);
                    }}
                  >
                    Apply Filters
                  </button>
                  <button 
                    className="clear-filters-btn"
                    onClick={handleClearAllFilters}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="export-btns">
            <button className="export-btn" onClick={() => handleExport('csv')}>
              CSV
            </button>
            <button className="export-btn" onClick={() => handleExport('excel')}>
              Excel
            </button>
            <button className="export-btn" onClick={() => handleExport('pdf')}>
              PDF
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === orders.length && orders.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Order Date</th>
                <th>Order Details</th>
                <th>Product Details</th>
                <th>Package Details</th>
                <th>Payment</th>
                <th>Shipping Details</th>
                {activeTab !== 'new' && <th>AWB Number</th>}
                {['ready_to_ship', 'pickups_manifests'].includes(activeTab) && (
                  <th>Pickup Status</th>
                )}
                {activeTab === 'delivered' && <th>Delivery Date</th>}
                {activeTab === 'rto' && <th>RTO Date</th>}
                {activeTab === 'all' && <th>Status</th>}
                <th>Warehouse</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={99} className="loading-cell">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={99} className="no-data-cell">
                    <div className="no-orders">
                      <div className="no-orders-icon"><Inbox size={48} strokeWidth={1.5} /></div>
                      <h3>No orders found</h3>
                      <p>Create your first order to get started</p>
                      <button className="create-order-btn" onClick={handleAddOrder}>
                        <Plus size={16} /> Create Order
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order._id)}
                        onChange={() => handleSelectOrder(order._id)}
                      />
                    </td>
                    <td>{order.orderDate ? formatDate(order.orderDate) : 'N/A'}</td>
                    <td>
                      <div className="order-details-cell">
                        <div
                          className="order-id-link"
                          onClick={() => handleViewOrder(order._id)}
                          title="Click to view order details"
                        >
                          Order ID: {order.orderId || 'N/A'}
                        </div>
                        <div>Ref: {order.referenceId || 'N/A'}</div>
                        <div>{order.customerName || 'N/A'}</div>
                      </div>
                    </td>
                    <td>
                      <div className="product-details-cell">
                        <div>{order.productName || 'N/A'}</div>
                        <div>Qty: {order.quantity || 0}</div>
                      </div>
                    </td>
                    <td>
                      <div className="package-details-cell">
                        <div>Weight: {order.weight || 0} kg</div>
                        {order.length && (
                          <div>
                            {order.length} x {order.width} x {order.height} cm
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="payment-cell">
                        <div className={`payment-mode ${order.paymentMode?.toLowerCase() || 'unknown'}`}>
                          {order.paymentMode || 'N/A'}
                        </div>
                        {order.codAmount && <div>₹{order.codAmount}</div>}
                      </div>
                    </td>
                    <td>
                      <div className="shipping-details-cell">
                        <div className="shipping-name">{order.customerName || 'N/A'}</div>
                        <div className="shipping-phone">{order.customerPhone || 'N/A'}</div>
                        <div className="shipping-address">{order.customerAddress || 'N/A'}</div>
                        <div className="shipping-location">
                          {[order.city, order.state, order.pin].filter(Boolean).join(', ') || 'N/A'}
                        </div>
                      </div>
                    </td>
                    {activeTab !== 'new' && (
                    <td>
                      <div className="awb-cell">
                        {order.awb ? (
                          <div className="awb-number">
                            <AWBLink awb={order.awb} orderId={order.orderId} showPrefix={true} />
                            {(order.delhivery_data?.cancellation_status === 'cancelled' ||
                              order.delhivery_data?.cancellation_response?.status === true ||
                              (order.delhivery_data?.cancellation_response?.remark &&
                               order.delhivery_data.cancellation_response.remark.toLowerCase().includes('cancelled'))) && (
                              <span className="cancelled-badge" title="Shipment Cancelled">
                                Cancelled
                              </span>
                            )}
                            <button
                              className="copy-awb-btn"
                              title="Copy AWB"
                              onClick={() => {
                                if (order.awb) {
                                  navigator.clipboard.writeText(order.awb);
                                  const toast = document.createElement('div');
                                  toast.className = 'copy-toast';
                                  toast.textContent = 'Copied successfully';
                                  document.body.appendChild(toast);
                                  setTimeout(() => toast.remove(), 2000);
                                }
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        ) : (
                          <div className="no-awb">
                            <span className="no-awb-text">Not Generated</span>
                          </div>
                        )}
                      </div>
                    </td>
                    )}
                    {['ready_to_ship', 'pickups_manifests'].includes(activeTab) && (
                      <td>
                        <div className="pickup-status-cell">
                          {order.pickupRequestStatus ? (
                            <div className={`pickup-status ${order.pickupRequestStatus}`}>
                              <span className="pickup-status-badge">
                                {order.pickupRequestStatus.charAt(0).toUpperCase() + order.pickupRequestStatus.slice(1)}
                              </span>
                              {order.pickupRequestDate && (
                                <div className="pickup-date">
                                  {formatDate(order.pickupRequestDate)}
                                </div>
                              )}
                              {order.pickupRequestTime && (
                                <div className="pickup-time">
                                  {order.pickupRequestTime}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="pickup-status pending">
                              <span className="pickup-status-badge">
                                Pending
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {activeTab === 'delivered' && (
                      <td>{order.deliveredDate ? formatDate(order.deliveredDate) : 'N/A'}</td>
                    )}
                    {activeTab === 'rto' && (
                      <td>{order.rtoDeliveredDate ? formatDate(order.rtoDeliveredDate) : 'N/A'}</td>
                    )}
                    {activeTab === 'all' && (
                      <td>
                        <span className={`status-badge ${order.status}`}>
                          {order.status === 'new' ? 'New' :
                           order.status === 'ready_to_ship' ? 'Ready to Ship' :
                           order.status === 'pickups_manifests' ? 'Pickup' :
                           order.status === 'in_transit' ? 'In Transit' :
                           order.status === 'out_for_delivery' ? 'OFD' :
                           order.status === 'delivered' ? 'Delivered' :
                           order.status === 'ndr' ? 'NDR' :
                           order.status === 'rto' ? 'RTO' :
                           order.status === 'rto_in_transit' ? 'RTO In Transit' :
                           order.status === 'rto_delivered' ? 'RTO Delivered' :
                           order.status === 'lost' ? 'Lost' :
                           order.status || 'N/A'}
                        </span>
                      </td>
                    )}
                    <td>{order.warehouse}</td>
                    <td>
                      <div className="action-buttons">
                        {/* Generate AWB button - only for NEW status orders without AWB */}
                        {order.status === 'new' && !order.awb && (
                          <button 
                            className="action-btn generate-awb-btn"
                            title="Generate AWB Number"
                            onClick={() => handleGenerateAWB(order.orderId, order._id)}
                          >
                            Generate AWB Number
                          </button>
                        )}
                        
                        {/* Create Pickup Request button - only for ready_to_ship status */}
                        {order.awb && 
                         activeTab !== 'pickups_manifests' &&
                         order.status === 'ready_to_ship' && 
                         !order.pickupRequestId &&
                         (!order.pickupRequestStatus || order.pickupRequestStatus === 'pending') && (
                          <button 
                            className="action-btn request-pickup-btn"
                            title="Create Pickup Request"
                            onClick={() => handleRequestPickup(order._id, order.orderId, order.pickup_address?.name)}
                          >
                            Create Pickup Request
                          </button>
                        )}
                        
                        {/* Cancel Shipment button */}
                        {['new', 'ready_to_ship', 'pickups_manifests'].includes(order.status) &&
                         !order.delhivery_data?.cancellation_status && (
                          <button 
                            className="action-btn cancel-shipment-btn"
                            title="Cancel Shipment"
                            onClick={() => handleCancelShipment(order.orderId, order._id, order.awb)}
                          >
                            Cancel Shipment
                          </button>
                        )}
                        
                        {/* View button - always visible */}
                        <button 
                          className="action-icon-btn view-btn" 
                          onClick={() => handleViewOrder(order._id)}
                        ></button>
                        
                        {/* Edit button - only visible for NEW status orders (without AWB) */}
                        {order.status === 'new' && !order.awb && (
                          <button
                            className="action-icon-btn edit-btn"
                            onClick={() => handleEditOrder(order._id)}
                            title="Edit Order"
                          ></button>
                        )}
                        
                        {/* Track button - only visible if AWB exists */}
                        {order.awb && (
                          <button 
                            className="action-icon-btn track-btn" 
                            onClick={() => handleTrackOrder(order.orderId, order.awb)}
                          ></button>
                        )}
                        
                        {/* Print button - always visible to print all order details */}
                        <button
                          className="action-icon-btn print-btn"
                          onClick={() => handlePrintLabel(order.orderId, order._id, order.awb)}
                          title="Print Order Details"
                        ></button>

                        {/* Additional Action Buttons for Delivered Tab */}
                        {(activeTab === 'delivered' || order.status === 'delivered') && (
                          <>
                            <button
                              className="action-btn label-btn"
                              onClick={() => handlePrintLabel(order.orderId, order._id, order.awb)}
                              title="Print Label"
                            >
                              Label
                            </button>
                            <button
                              className="action-btn invoice-btn"
                              onClick={() => handlePrintLabel(order.orderId, order._id, order.awb)}
                              title="Print Invoice"
                            >
                              Invoice
                            </button>
                            <button
                              className="action-btn need-help-btn"
                              onClick={() => navigate(`/support?orderId=${order.orderId}`)}
                              title="Need Help"
                            >
                              Need Help
                            </button>
                            <button
                              className="action-btn return-order-btn"
                              onClick={() => {
                                showConfirm('Return Order', 'Initiate a return for this order?', () => {
                                  showToast('Return request initiated for order: ' + order.orderId, 'success');
                                }, { confirmText: 'Return', variant: 'danger' });
                              }}
                              title="Return Order"
                            >
                              Return Order
                            </button>
                          </>
                        )}

                        {/* Need Help and Return Order buttons for In Transit and Out for Delivery */}
                        {['in_transit', 'out_for_delivery'].includes(activeTab) && (
                          <>
                            <button
                              className="action-btn need-help-btn"
                              onClick={() => navigate(`/support?orderId=${order.orderId}`)}
                              title="Need Help"
                            >
                              Need Help
                            </button>
                            {activeTab === 'in_transit' && (
                              <button
                                className="action-btn return-order-btn"
                                onClick={() => {
                                  showConfirm('Return Order', 'Initiate a return for this order?', () => {
                                    showToast('Return request initiated for order: ' + order.orderId, 'success');
                                  }, { confirmText: 'Return', variant: 'danger' });
                                }}
                                title="Return Order"
                              >
                                Return Order
                              </button>
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

        {/* Bulk Import Modal */}
        {isBulkImportModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Bulk Import Orders</h3>
                <button 
                  className="close-btn"
                  onClick={handleBulkImportClose}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body">
                <div className="bulk-import-instructions">
                  <p>Download the template below to ensure your column headers match Shipsarthi order variables.</p>
                  <a
                    href="/bulk-order-template.csv"
                    download
                    className="download-template-btn"
                  >
                    Download Sample CSV
                  </a>
                  <p className="bulk-template-note">Supported file types: .csv, .xlsx, .xls • File size ≤ 5MB</p>
                  <div className="bulk-columns-grid">
                    <span>order_id (optional)</span>
                    <span>order_date</span>
                    <span>reference_id</span>
                    <span>invoice_number</span>
                    <span>customer_name</span>
                    <span>customer_phone</span>
                    <span>customer_email</span>
                    <span>customer_gstin</span>
                    <span>delivery_address_line1</span>
                    <span>delivery_address_line2</span>
                    <span>delivery_city</span>
                    <span>delivery_state</span>
                    <span>delivery_pincode</span>
                    <span>delivery_country</span>
                    <span>pickup_name</span>
                    <span>pickup_phone</span>
                    <span>pickup_address</span>
                    <span>pickup_city</span>
                    <span>pickup_state</span>
                    <span>pickup_pincode</span>
                    <span>pickup_country</span>
                    <span>product_name</span>
                    <span>product_sku</span>
                    <span>product_hsn</span>
                    <span>product_quantity</span>
                    <span>product_unit_price</span>
                    <span>product_discount</span>
                    <span>product_tax</span>
                    <span>package_weight_kg</span>
                    <span>package_length_cm</span>
                    <span>package_width_cm</span>
                    <span>package_height_cm</span>
                    <span>payment_mode</span>
                    <span>cod_amount</span>
                    <span>shipping_mode</span>
                    <span>seller_name</span>
                    <span>seller_gst</span>
                    <span>seller_reseller</span>
                  </div>
                  <ul className="bulk-guidelines">
                    <li>Use one order per row. Duplicate the row if you need multiple products per order.</li>
                    <li>Phone numbers must be 10 digits (starts with 6-9). Pincodes must be 6 digits.</li>
                    <li>Dimensions are in CM and weight in KG. Payment mode accepts <code>Prepaid</code> or <code>COD</code>.</li>
                    <li>Leave <code>order_id</code> blank if you want Shipsarthi to auto-generate it.</li>
                  </ul>
                </div>

                <div className="file-upload-area">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleBulkImportSubmit(file);
                      }
                    }}
                    className="file-input"
                    disabled={isBulkImportLoading}
                  />
                  <div className="upload-text">
                    {isBulkImportLoading ? 'Uploading and validating…' : 'Click to select file or drag and drop'}
                  </div>
                </div>

                {bulkImportError && (
                  <div className="bulk-import-error">
                    {bulkImportError}
                  </div>
                )}

                {isBulkImportLoading && (
                  <div className="bulk-import-loading">
                    Creating orders… Please keep this window open.
                  </div>
                )}

                {bulkImportSummary && (
                  <div className="bulk-import-summary">
                    <h4>Import Summary</h4>
                    <div className="summary-stats">
                      <div>
                        <span>Total rows</span>
                        <strong>{bulkImportSummary.total}</strong>
                      </div>
                      <div>
                        <span>Orders created</span>
                        <strong className="summary-success">{bulkImportSummary.created}</strong>
                      </div>
                      <div>
                        <span>Failed rows</span>
                        <strong className={bulkImportSummary.failed > 0 ? 'summary-failed' : ''}>{bulkImportSummary.failed}</strong>
                      </div>
                    </div>

                    {bulkImportSummary.details.length > 0 && (
                      <div className="bulk-import-success-list">
                        <h5>Created Orders</h5>
                        <ul>
                          {bulkImportSummary.details.slice(0, 8).map((detail, idx) => (
                            <li key={`${detail.order_id || detail.row}-${idx}`}>
                              Row {detail.row}: {detail.order_id || 'Created successfully'}
                            </li>
                          ))}
                          {bulkImportSummary.details.length > 8 && (
                            <li>…and {bulkImportSummary.details.length - 8} more</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {bulkImportSummary.errors.length > 0 && (
                      <div className="bulk-import-errors">
                        <h5>Rows with issues</h5>
                        <ul>
                          {bulkImportSummary.errors.map((err, idx) => (
                            <li key={`${err.row}-${idx}`}>
                              Row {err.row}: {err.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Order Details Modal */}
        <OrderDetailsModal 
          open={viewOrderModal.open} 
          order={viewOrderModal.order} 
          onClose={() => setViewOrderModal({ open: false, order: null })}
        />

        {/* Notifications Dropdown */}
        {isNotificationsOpen && (
          <div className="notifications-dropdown">
            <div className="notifications-header">
              <h4>Notifications</h4>
              <button 
                className="close-btn"
                onClick={() => setIsNotificationsOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="notifications-list">
              <div className="notification-item">
                <div className="notification-icon" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#009EAF' }}></div>
                <div className="notification-content">
                  <div className="notification-title">Order #ORD123456 shipped</div>
                  <div className="notification-time">2 hours ago</div>
                </div>
              </div>
              <div className="notification-item">
                <div className="notification-icon" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#009EAF' }}></div>
                <div className="notification-content">
                  <div className="notification-title">Payment received for Order #ORD123457</div>
                  <div className="notification-time">4 hours ago</div>
                </div>
              </div>
              <div className="notification-item">
                <div className="notification-icon" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F68723' }}></div>
                <div className="notification-content">
                  <div className="notification-title">Low balance alert</div>
                  <div className="notification-time">1 day ago</div>
                </div>
              </div>
            </div>
            <div className="notifications-footer">
              <button className="view-all-btn">View All Notifications</button>
            </div>
          </div>
        )}
      </div>

      {/* Tracking Modal */}
      <TrackingModal
        isOpen={trackingModal.open}
        onClose={() => setTrackingModal({ open: false, awb: null, orderId: null })}
        awb={trackingModal.awb || ''}
        orderId={trackingModal.orderId || undefined}
      />

      {/* Pickup Request Modal */}
      <PickupRequestModal
        isOpen={pickupModal.open}
        onClose={() => setPickupModal({ open: false, orderId: null, orderNumber: null, warehouseName: null })}
        onConfirm={handleConfirmPickup}
        orderId={pickupModal.orderId || ''}
        orderNumber={pickupModal.orderNumber || ''}
        warehouseName={pickupModal.warehouseName || undefined}
        loading={loading}
      />

      {/* Bulk Action Bar */}
      {selectedOrders.length > 0 && !isAddOrderModalOpen && (
        <BulkActionBar
          selectedCount={selectedOrders.length}
          selectedOrders={selectedOrders}
          currentTab={activeTab}
          onBulkAWB={handleBulkAWB}
          onBulkPickup={handleBulkPickup}
          onBulkCancel={handleBulkCancel}
          onBulkLabel={handleBulkLabel}
          onBulkNeedHelp={handleBulkNeedHelp}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Label Format Modal */}
      <LabelFormatModal
        isOpen={showLabelFormatModal}
        onClose={() => setShowLabelFormatModal(false)}
        onConfirm={handleBulkLabelConfirm}
        selectedCount={selectedOrders.length}
      />

      {/* Bulk Result Modal */}
      <BulkResultModal
        isOpen={bulkResultModal.open}
        onClose={() => setBulkResultModal({ open: false, result: null, operationType: 'awb' })}
        result={bulkResultModal.result}
        operationType={bulkResultModal.operationType}
      />

      {/* Bulk Loading Overlay */}
      {bulkLoading && (
        <div className="bulk-loading-overlay">
          <div className="bulk-loading-content">
            <div className="bulk-loading-spinner"></div>
            <p>Processing bulk operation...</p>
            <p className="bulk-loading-note">Please wait, do not close this window.</p>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast-item toast-${toast.type}`}>
              <span className="toast-message">{toast.message}</span>
              <button className="toast-close" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="confirm-overlay" onClick={closeConfirmModal}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-header">
              <h3>{confirmModal.title}</h3>
            </div>
            <div className="confirm-body">
              <p>{confirmModal.message}</p>
            </div>
            <div className="confirm-footer">
              <button className="confirm-btn-cancel" onClick={closeConfirmModal}>
                {confirmModal.cancelText || 'Cancel'}
              </button>
              <button
                className={`confirm-btn-ok ${confirmModal.variant === 'danger' ? 'confirm-btn-danger' : ''}`}
                onClick={() => { confirmModal.onConfirm(); closeConfirmModal(); }}
              >
                {confirmModal.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Order Detail Slide-in Panel */}
      <OrderDetailPanel
        order={detailPanelOrder}
        isOpen={isDetailPanelOpen}
        onClose={() => {
          setIsDetailPanelOpen(false);
          setDetailPanelOrder(null);
        }}
      />
    </Layout>
  );
};

export default Orders;