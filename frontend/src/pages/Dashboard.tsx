import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { DashboardData } from '../services/userService';
import { walletService, WalletBalance } from '../services/walletService';
import { apiService } from '../services/api';
import { DataCache } from '../utils/dataCache';
import { formatDate } from '../utils/dateFormat';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import CartIcon from '../dashboardvectors/Cart.svg';
import WalletIcon from '../dashboardvectors/Wallet.svg';
import TruckIcon from '../dashboardvectors/Truck.svg';
import CalendarSettingsIcon from '../dashboardvectors/CalendarSettings.svg';
import './Dashboard.css';

/**
 * Dashboard Component
 * 
 * IMPORTANT: This component fetches ALL data directly from REST APIs (MongoDB).
 * Dashboard data is completely independent of WebSocket updates:
 * - Wallet balance: Fetched directly from /api/user/wallet-balance and /api/dashboard/overview
 * - Average shipping charges: Calculated directly from MongoDB via /api/dashboard/overview
 * - All metrics: Fetched directly from respective dashboard API endpoints
 * 
 * WebSockets are NOT used for dashboard data to ensure accuracy and consistency.
 * All data is fetched via direct API calls on mount and periodic polling.
 */

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Date filter state - default to last 30 days
  const getDefaultDateRange = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return {
      startDate: startDate.toISOString().split('T')[0], // YYYY-MM-DD format
      endDate: endDate.toISOString().split('T')[0]
    };
  };

  // Date preset options
  type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'custom';

  const getDateRangeForPreset = (preset: DatePreset): { startDate: string; endDate: string } => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (preset) {
      case 'today': {
        return { startDate: todayStr, endDate: todayStr };
      }
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return { startDate: yesterdayStr, endDate: yesterdayStr };
      }
      case 'last7days': {
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        return { startDate: last7.toISOString().split('T')[0], endDate: todayStr };
      }
      case 'last30days': {
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        return { startDate: last30.toISOString().split('T')[0], endDate: todayStr };
      }
      case 'thisMonth': {
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: firstDayOfMonth.toISOString().split('T')[0], endDate: todayStr };
      }
      case 'lastMonth': {
        const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          startDate: firstDayLastMonth.toISOString().split('T')[0],
          endDate: lastDayLastMonth.toISOString().split('T')[0]
        };
      }
      case 'custom':
      default:
        return getDefaultDateRange();
    }
  };

  const defaultRange = getDefaultDateRange();
  const [dateFilter, setDateFilter] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate
  });
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('last30days');
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [ndrStatus, setNdrStatus] = useState<any>(null);
  const [codStatus, setCodStatus] = useState<any>(null);
  const [shipmentDistribution, setShipmentDistribution] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState<WalletBalance>({ balance: 0, currency: 'INR' });
  const [isBalanceUpdating, setIsBalanceUpdating] = useState(false);
  
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const dashboardDataRef = useRef<DashboardData | null>(null);

  useEffect(() => {
    dashboardDataRef.current = dashboardData;
  }, [dashboardData]);

  // Fetch fresh wallet balance DIRECTLY from MongoDB (no WebSocket dependency)
  // This function is called from multiple places and always fetches fresh data
  const fetchWalletBalanceFromMongoDB = async () => {
    try {
      console.log('💰 Fetching wallet balance directly from MongoDB...');
      // Force fresh fetch from MongoDB (useCache = false)
      const balance = await walletService.getWalletBalance(false);
      console.log('✅ Wallet balance fetched from MongoDB:', balance);
      setWalletBalance(balance);
      DataCache.set('walletBalance', balance);
      // Trigger animation on update
      setIsBalanceUpdating(true);
      setTimeout(() => setIsBalanceUpdating(false), 600);
    } catch (error) {
      console.error('❌ Error fetching wallet balance from MongoDB:', error);
      // Use cached balance if fetch fails (fallback only)
      const staleBalance = DataCache.getStale<WalletBalance>('walletBalance');
      if (staleBalance) {
        console.log('⚠️ Using cached wallet balance due to API error');
        setWalletBalance(staleBalance);
      } else {
        setWalletBalance({ balance: 0, currency: 'INR' });
      }
    }
  };

  // Update current date/time every second
  useEffect(() => {
    dateIntervalRef.current = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => {
      if (dateIntervalRef.current) {
        clearInterval(dateIntervalRef.current);
      }
    };
  }, []);

  // Fetch all dashboard data DIRECTLY from MongoDB via REST APIs (no WebSocket dependency)
  // This ensures dashboard data is always accurate and not affected by WebSocket connections
  const fetchAllDashboardData = useCallback(async (showLoading: boolean = false, overrideRange?: { startDate: string; endDate: string }) => {
    // Try to load from cache first - show data immediately, no freezing
    const cachedDashboard = DataCache.get<DashboardData>('dashboard');
    const cachedNdr = DataCache.get<any>('ndrStatus');
    const cachedCod = DataCache.get<any>('codStatus');
    const cachedDistribution = DataCache.get<any>('shipmentDistribution');
    const cachedTransactions = DataCache.get<any[]>('dashboardTransactions');

    // Show cached data immediately - UI stays responsive
    if (cachedDashboard) {
      setDashboardData(cachedDashboard);
      setNdrStatus(cachedNdr);
      setCodStatus(cachedCod);
      setShipmentDistribution(cachedDistribution);
      setTransactions(cachedTransactions || []);
      setLoading(false); // Don't block UI with loading state
    } else if (showLoading) {
      setLoading(true); // Only show loading on first load if no cache
    }

    try {
      // Fetch fresh data in background - doesn't block UI
      // Stagger requests slightly (100ms apart) to avoid rate limiting when multiple requests fire at once
      const staggerRequest = async (requestFn: () => Promise<any>, delayMs: number): Promise<any> => {
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        return requestFn();
      };

      // Build date filter query parameters
      const startDate = overrideRange?.startDate ?? dateFilter.startDate;
      const endDate = overrideRange?.endDate ?? dateFilter.endDate;
      const dateParams = `date_from=${startDate}&date_to=${endDate}`;
      
      // Start all requests with staggered delays (0ms, 800ms, 1600ms, 2400ms, 3200ms, 4000ms)
      // Increased delays to prevent hitting rate limits - requests spread over 4 seconds
      const [
        dashboardResponse,
        shipmentResponse,
        ndrResponse,
        codResponse,
        distributionResponse,
        transactionsResponse
      ] = await Promise.all([
        staggerRequest(() => apiService.get<{ status: string; data: any }>(`/dashboard/overview?${dateParams}`), 0),
        staggerRequest(() => apiService.get<{ status: string; data: any }>(`/dashboard/shipment-status?${dateParams}`), 800),
        staggerRequest(() => apiService.get<{ status: string; data: any }>(`/dashboard/ndr-status?${dateParams}`), 1600),
        staggerRequest(() => apiService.get<{ status: string; data: any }>(`/dashboard/cod-status?${dateParams}`), 2400),
        staggerRequest(() => apiService.get<{ status: string; data: any }>(`/dashboard/shipment-distribution?${dateParams}`), 3200),
        staggerRequest(() => apiService.get<{ status: string; data: any[] }>(`/dashboard/wallet-transactions?limit=5&${dateParams}`), 4000)
      ]);

      // Map the data
      const mappedDashboardData: DashboardData = {
        metrics: {
          todaysOrders: {
            current: dashboardResponse.data.todays_orders?.count || 0,
            previous: dashboardResponse.data.todays_orders?.previous_count || 0
          },
          todaysRevenue: {
            current: dashboardResponse.data.todays_revenue?.amount || 0,
            previous: dashboardResponse.data.todays_revenue?.previous_amount || 0
          },
          averageShippingCost: {
            amount: dashboardResponse.data.average_shipping_cost || 0,
            totalOrders: dashboardResponse.data.todays_orders?.count || 0
          }
        },
        shipmentStatus: {
          totalOrder: shipmentResponse.data.total_orders || 0,
          newOrder: shipmentResponse.data.new_orders || 0,
          pickupPending: shipmentResponse.data.pickup_pending || 0,
          inTransit: shipmentResponse.data.in_transit || 0,
          delivered: shipmentResponse.data.delivered || 0,
          ndrPending: shipmentResponse.data.ndr_pending || 0,
          rto: shipmentResponse.data.rto || 0
        },
        ndrStatus: {
          totalNDR: 0,
          yourReattempt: 0,
          buyerReattempt: 0,
          ndrDelivered: 0,
          ndrUndelivered: 0,
          rtoTransit: 0,
          rtoDelivered: 0
        },
        codStatus: {
          totalCOD: 0,
          lastCODRemitted: 0,
          nextCODAvailable: 0
        }
      };

      // Update state with fresh data
      setDashboardData(mappedDashboardData);
      setNdrStatus(ndrResponse.data);
      setCodStatus(codResponse.data);
      setShipmentDistribution(distributionResponse.data);
      setTransactions(transactionsResponse.data || []);
      
      // Cache the data for offline/error scenarios
      DataCache.set('dashboard', mappedDashboardData);
      DataCache.set('ndrStatus', ndrResponse.data);
      DataCache.set('codStatus', codResponse.data);
      DataCache.set('shipmentDistribution', distributionResponse.data);
      DataCache.set('dashboardTransactions', transactionsResponse.data || []);
      
      // Update wallet balance directly from API response (no WebSocket dependency)
      // Dashboard data is fetched directly from MongoDB, not affected by WebSockets
      if (dashboardResponse.data.wallet_balance !== undefined) {
        const balanceFromOverview = {
          balance: parseFloat(dashboardResponse.data.wallet_balance) || 0,
          currency: 'INR'
        };
        setWalletBalance(balanceFromOverview);
        // Don't call notifyBalanceUpdate - dashboard should only use direct API data
        // This ensures dashboard is completely independent of WebSocket updates
        DataCache.set('walletBalance', balanceFromOverview);
      }
    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      // On error, use stale cache if available - app still works!
      const staleDashboard = DataCache.getStale<DashboardData>('dashboard');
      if (staleDashboard && !dashboardDataRef.current) {
        setDashboardData(staleDashboard);
        setNdrStatus(DataCache.getStale('ndrStatus'));
        setCodStatus(DataCache.getStale('codStatus'));
        setShipmentDistribution(DataCache.getStale('shipmentDistribution'));
        setTransactions(DataCache.getStale<any[]>('dashboardTransactions') || []);
      }
      // Don't throw - app continues with cached data
    } finally {
      setLoading(false); // Always unblock UI
    }
  }, [dateFilter.startDate, dateFilter.endDate]);

  useEffect(() => {
    // Try to load wallet balance from cache first (instant display)
    const cachedBalance = DataCache.get<WalletBalance>('walletBalance');
    if (cachedBalance) {
      setWalletBalance(cachedBalance);
    }

    // Initial data fetch - show cached data immediately if available
    fetchAllDashboardData(true); // true = show loading only if no cache
    
    // Fetch wallet balance immediately on mount (direct from MongoDB, no WebSocket)
    fetchWalletBalanceFromMongoDB();

    // Poll dashboard data from MongoDB (no WebSocket dependency)
    // Auto-refresh wallet balance directly from MongoDB every 60 seconds
    const walletRefreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing wallet balance from MongoDB...');
      // Always fetch fresh from MongoDB (useCache = false)
      fetchWalletBalanceFromMongoDB();
    }, 60000); // Every 60 seconds (1 minute) to avoid rate limiting

    refreshIntervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refreshing dashboard data...');
      fetchAllDashboardData(false); // false = don't show loading, refresh in background
      // Also refresh wallet balance directly from MongoDB
      fetchWalletBalanceFromMongoDB();
    }, 120000); // Every 120 seconds (2 minutes) for full dashboard refresh to avoid rate limiting

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      clearInterval(walletRefreshInterval);
    };
  }, [fetchAllDashboardData, dateFilter.startDate, dateFilter.endDate]); // Refetch when date filter changes

  const handleRecharge = () => {
    navigate('/billing');
  };

  const handleViewAllTransactions = () => {
    navigate('/billing');
  };

  const handleViewAllShipments = () => {
    navigate('/orders?status=all');
  };

  // Format date range for display (DD-MM-YYYY format)
  const formatDateRange = () => {
    const formatDate = (dateString: string) => {
      const date = new Date(dateString + 'T00:00:00');
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };
    
    return `${formatDate(dateFilter.startDate)} to ${formatDate(dateFilter.endDate)}`;
  };

  // Handle date filter change
  const handleDateFilterChange = (startDate: string, endDate: string, preset?: DatePreset) => {
    setDateFilter({ startDate, endDate });
    if (preset) {
      setSelectedPreset(preset);
    }
    setShowDatePicker(false);
    // Refresh dashboard data with new date range
    fetchAllDashboardData(false, { startDate, endDate });
  };

  // Handle preset selection
  const handlePresetSelect = (preset: DatePreset) => {
    if (preset === 'custom') {
      setSelectedPreset('custom');
      // Keep date picker open for custom selection
      return;
    }
    const range = getDateRangeForPreset(preset);
    handleDateFilterChange(range.startDate, range.endDate, preset);
  };

  // Reset date filter to default (last 30 days)
  const handleResetDateFilter = () => {
    const defaultRange = getDefaultDateRange();
    handleDateFilterChange(defaultRange.startDate, defaultRange.endDate, 'last30days');
  };

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDatePicker]);

  // Format current time
  const formatCurrentTime = () => {
    return currentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Get day of week
  const getDayOfWeek = () => {
    return currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  };

  // formatDate imported from ../utils/dateFormat

  // Prepare chart data
  const getPieChartData = () => {
    if (!shipmentDistribution) {
      return {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: []
        }]
      };
    }

    const data = shipmentDistribution.distribution.map((item: any) => item.count);
    const labels = shipmentDistribution.distribution.map((item: any) => {
      // Format status names for display
      const statusNames: any = {
        'new': 'New Orders',
        'ready_to_ship': 'Ready to Ship',
        'pickup_pending': 'Pickup Pending',
        'manifested': 'Manifested',
        'in_transit': 'In Transit',
        'out_for_delivery': 'Out for Delivery',
        'delivered': 'Delivered',
        'ndr': 'NDR',
        'rto': 'RTO',
        'cancelled': 'Cancelled'
      };
      return statusNames[item.status] || item.status;
    });

    const colors = [
      '#F68723',
      '#FF9F40',
      '#FFB366',
      '#4A90E2',
      '#5C97E5',
      '#6EA5E8',
      '#28A745',
      '#FFC107',
      '#DC3545',
      '#6C757D'
    ];

    return {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, data.length),
        borderColor: '#FFFFFF',
        borderWidth: 2,
        hoverOffset: 4
      }]
    };
  };

  // Don't block UI with loading screen - show cached data if available
  // Only show loading spinner if we have NO data at all
  const hasData = dashboardData !== null || walletBalance.balance > 0;

  return (
    <Layout>
      <div className="dashboard-container">
        {/* Show subtle loading indicator only if no data exists */}
        {loading && !hasData && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            backgroundColor: 'rgba(255,255,255,0.9)',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}>
            <div className="loading-spinner"></div>
            <p>Loading dashboard data...</p>
          </div>
        )}
        
        {/* Combined Info Toolbar */}
        <div className="info-toolbar">
          {/* Wallet Balance Display */}
          <div className="wallet-balance-compact">
            <img src={WalletIcon} alt="Wallet" className="wallet-icon-small" />
            <span className="wallet-label-compact">Wallet Balance</span>
            <span className={`wallet-amount-compact ${isBalanceUpdating ? 'updating' : ''}`}>
              ₹{(walletBalance?.balance ?? 0).toFixed(2)}
            </span>
          </div>

          {/* Separator */}
          <div className="toolbar-separator"></div>

          {/* Date Range Display */}
          <div className="date-range-display" ref={datePickerRef} style={{ position: 'relative' }}>
            <span className="calendar-icon"></span>
            <span
              className="date-text"
              onClick={() => setShowDatePicker(!showDatePicker)}
              style={{ cursor: 'pointer' }}
            >
              {formatDateRange()}
            </span>

            {/* Date Picker Dropdown */}
            {showDatePicker && (
              <div className="date-picker-dropdown">
                <div className="date-picker-header">
                  <h3>Select Date Range</h3>
                  <button
                    className="close-date-picker"
                    onClick={() => setShowDatePicker(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="date-presets">
                  <button
                    className={`preset-btn ${selectedPreset === 'today' ? 'active' : ''}`}
                    onClick={() => handlePresetSelect('today')}
                  >
                    Today
                  </button>
                  <button
                    className={`preset-btn ${selectedPreset === 'yesterday' ? 'active' : ''}`}
                    onClick={() => handlePresetSelect('yesterday')}
                  >
                    Yesterday
                  </button>
                  <button
                    className={`preset-btn ${selectedPreset === 'last7days' ? 'active' : ''}`}
                    onClick={() => handlePresetSelect('last7days')}
                  >
                    This Week
                  </button>
                  <button
                    className={`preset-btn ${selectedPreset === 'last30days' ? 'active' : ''}`}
                    onClick={() => handlePresetSelect('last30days')}
                  >
                    Last Week
                  </button>
                  <button
                    className={`preset-btn ${selectedPreset === 'thisMonth' ? 'active' : ''}`}
                    onClick={() => handlePresetSelect('thisMonth')}
                  >
                    This Month
                  </button>
                  <button
                    className={`preset-btn ${selectedPreset === 'lastMonth' ? 'active' : ''}`}
                    onClick={() => handlePresetSelect('lastMonth')}
                  >
                    Last Month
                  </button>
                </div>
                <div className="date-picker-body">
                  <div className="date-input-group">
                    <label>From Date</label>
                    <input
                      type="date"
                      value={dateFilter.startDate}
                      max={dateFilter.endDate}
                      onChange={(e) => {
                        setDateFilter({ ...dateFilter, startDate: e.target.value });
                        setSelectedPreset('custom');
                      }}
                    />
                  </div>
                  <div className="date-input-group">
                    <label>To Date</label>
                    <input
                      type="date"
                      value={dateFilter.endDate}
                      min={dateFilter.startDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        setDateFilter({ ...dateFilter, endDate: e.target.value });
                        setSelectedPreset('custom');
                      }}
                    />
                  </div>
                </div>
                <div className="date-picker-footer">
                  <button
                    className="reset-date-filter-btn"
                    onClick={handleResetDateFilter}
                  >
                    Reset
                  </button>
                  <button
                    className="cancel-date-filter-btn"
                    onClick={() => setShowDatePicker(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="apply-date-filter-btn"
                    onClick={() => handleDateFilterChange(dateFilter.startDate, dateFilter.endDate, 'custom')}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Time Display */}
          <div className="current-time-compact">
            <span className="time-text">{formatCurrentTime()}</span>
            <span className="day-text">{getDayOfWeek()}</span>
          </div>

        </div>

        <div className="dashboard-grid">
          {/* Left Column - Metric Cards */}
          <div className="metrics-column">
            {/* Today's Orders Card */}
            <div className="metric-card">
              <div className="card-icon">
                <img src={CartIcon} alt="Cart" className="icon" />
              </div>
              <div className="card-content">
                <h3>Today's Orders</h3>
                <div className="card-value">{dashboardData?.metrics?.todaysOrders?.current || 0}</div>
                <div className="card-subtitle">
                  Yesterday's Orders
                  <br />
                  <span className="previous-value">{dashboardData?.metrics?.todaysOrders?.previous || 0}</span>
                </div>
              </div>
              <img src={CalendarSettingsIcon} alt="Calendar" className="card-stats-icon" />
            </div>

            {/* Today's Revenue Card */}
            <div className="metric-card">
              <div className="card-icon">
                <img src={WalletIcon} alt="Wallet" className="icon" />
              </div>
              <div className="card-content">
                <h3>Today's Revenue</h3>
                <div className="card-value">₹ {dashboardData?.metrics?.todaysRevenue?.current || 0}</div>
                <div className="card-subtitle">
                  Yesterday's Revenue
                  <br />
                  <span className="previous-value">₹ {dashboardData?.metrics?.todaysRevenue?.previous || 0}</span>
                </div>
              </div>
              <img src={CalendarSettingsIcon} alt="Calendar" className="card-stats-icon" />
            </div>

            {/* Average Shipping Cost Card */}
            <div className="metric-card">
              <div className="card-icon">
                <img src={TruckIcon} alt="Truck" className="icon" />
              </div>
              <div className="card-content">
                <h3>Average Shipping Cost</h3>
                <div className="card-value">₹ {(dashboardData?.metrics?.averageShippingCost?.amount || 0).toFixed(2)}</div>
                <div className="card-subtitle">
                  Total Orders
                  <br />
                  <span className="previous-value">{dashboardData?.metrics?.averageShippingCost?.totalOrders || 0}</span>
                </div>
              </div>
              <img src={CalendarSettingsIcon} alt="Calendar" className="card-stats-icon" />
            </div>
          </div>

          {/* Right Column - Status Sections */}
          <div className="status-column">
            {/* Shipment Status Section */}
            <div className="status-section">
              <div className="section-header">
                <h2>Shipment Status</h2>
              </div>
              <div className="status-grid">
                <div className="status-box" onClick={() => navigate('/orders?status=all')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.totalOrder || 0}</div>
                  <div className="status-label">Total Order</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=new')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.newOrder || 0}</div>
                  <div className="status-label">New Order</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=pickups_manifests')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.pickupPending || 0}</div>
                  <div className="status-label">Pickup Pending</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=in_transit')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.inTransit || 0}</div>
                  <div className="status-label">In Transit</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=delivered')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.delivered || 0}</div>
                  <div className="status-label">Delivered</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=ndr')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.ndrPending || 0}</div>
                  <div className="status-label">NDR Pending</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=rto')}>
                  <div className="status-value">{dashboardData?.shipmentStatus?.rto || 0}</div>
                  <div className="status-label">RTO</div>
                </div>
              </div>
            </div>

            {/* NDR Status Section */}
            <div className="status-section">
              <div className="section-header">
                <h2>NDR Status</h2>
              </div>
              <div className="status-grid">
                <div className="status-box" onClick={() => navigate('/orders?status=ndr')}>
                  <div className="status-value">{ndrStatus?.total_ndr || 0}</div>
                  <div className="status-label">Total NDR</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=ndr&filter=reattempt')}>
                  <div className="status-value">{ndrStatus?.new_reattempt || 0}</div>
                  <div className="status-label">Your Reattempt</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=ndr&filter=buyer_reattempt')}>
                  <div className="status-value">{ndrStatus?.buyer_reattempt || 0}</div>
                  <div className="status-label">Buyer Reattempt</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=ndr&filter=delivered')}>
                  <div className="status-value">{ndrStatus?.ndr_delivered || 0}</div>
                  <div className="status-label">NDR Delivered</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=ndr&filter=undelivered')}>
                  <div className="status-value">{ndrStatus?.ndr_undelivered || 0}</div>
                  <div className="status-label">NDR Undelivered</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=rto&filter=transit')}>
                  <div className="status-value">{ndrStatus?.rto_transit || 0}</div>
                  <div className="status-label">RTO Transit</div>
                </div>
                <div className="status-box" onClick={() => navigate('/orders?status=rto&filter=delivered')}>
                  <div className="status-value">{ndrStatus?.rto_delivered || 0}</div>
                  <div className="status-label">RTO Delivered</div>
                </div>
              </div>
            </div>

            {/* COD Status Section */}
            <div className="status-section">
              <div className="section-header">
                <h2>COD Status</h2>
              </div>
              <div className="cod-grid">
                <div className="cod-box" onClick={() => navigate('/billing?filter=cod')}>
                  <div className="cod-value">₹{codStatus?.total_cod || 0}</div>
                  <div className="cod-label">Total COD</div>
                </div>
                <div className="cod-box" onClick={() => navigate('/billing?filter=cod_remitted')}>
                  <div className="cod-value">₹{codStatus?.last_cod_remitted || 0}</div>
                  <div className="cod-label">Last COD Remitted</div>
                </div>
                <div className="cod-box" onClick={() => navigate('/billing?filter=cod_available')}>
                  <div className="cod-value">₹{codStatus?.next_cod_available || 0}</div>
                  <div className="cod-label">Next COD Available</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section - Wallet Transactions and Shipments Chart */}
        <div className="bottom-section">
          {/* Wallet Transactions */}
          <div className="wallet-transactions">
            <div className="section-header-with-action">
              <h2>Wallet Transactions</h2>
              <div className="wallet-actions">
                <button className="recharge-btn" onClick={handleRecharge}>
                  Recharge Wallet
                </button>
                <button className="view-all-btn" onClick={handleViewAllTransactions}>
                  View All
                </button>
              </div>
            </div>
            <div className="transactions-table-container">
              <table className="transactions-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction ID</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions && transactions.length > 0 ? (
                    transactions.map((transaction: any, index: number) => (
                      <tr key={index}>
                        <td>{formatDate(transaction.transaction_date)}</td>
                        <td>{transaction.transaction_id}</td>
                        <td className={`transaction-type ${transaction.transaction_type}`}>
                          {transaction.transaction_type}
                        </td>
                        <td>₹{transaction.amount?.toFixed(2)}</td>
                        <td className={`status-badge ${transaction.status}`}>
                          {transaction.status}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="no-data">No transactions yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shipments Chart */}
          <div className="shipments-chart">
            <div className="section-header-with-action">
              <h2>Shipments Distribution</h2>
              <button className="view-all-btn" onClick={handleViewAllShipments}>
                View All
              </button>
            </div>
            <div className="chart-container">
              {shipmentDistribution && shipmentDistribution.distribution && shipmentDistribution.distribution.length > 0 ? (
                <Pie 
                  data={getPieChartData()} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'right',
                        labels: {
                          padding: 15,
                          font: {
                            size: 12,
                            weight: 'bold'
                          }
                        }
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = shipmentDistribution.total_orders || 1;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                          }
                        }
                      }
                    }
                  }}
                />
              ) : (
                <div className="no-chart-data">
                  <p>No shipment data available</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default Dashboard;