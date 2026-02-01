import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { userService, UserProfile } from '../services/userService';
import { walletService, WalletBalance } from '../services/walletService';
import { notificationService } from '../services/notificationService';
import { DataCache } from '../utils/dataCache';
import { useAuth } from '../contexts/AuthContext';
import ProfileDropdown from './ProfileDropdown';
import './Layout.css';

// Import sidebar vector icons
import group1Icon from '../SIDEBARVECTORS/Group 1.svg';
import vector14Icon from '../SIDEBARVECTORS/Vector 14.svg';
import group10Icon from '../SIDEBARVECTORS/Group 10.svg';
import vectorIcon from '../SIDEBARVECTORS/Vector.svg';
import group1BillingIcon from '../SIDEBARVECTORS/Group (1).svg';
import group19Icon from '../SIDEBARVECTORS/Group 19.svg';
import vector1Icon from '../SIDEBARVECTORS/Vector (1).svg';
import vector2Icon from '../SIDEBARVECTORS/Vector (2).svg';
import group3Icon from '../SIDEBARVECTORS/Group (3).svg';
import searchIcon from '../SIDEBARVECTORS/search.svg';
// Submenu icons
import calculatorIcon from '../SIDEBARVECTORS/calculator.svg';
import packageIcon from '../SIDEBARVECTORS/package.svg';
import scaleIcon from '../SIDEBARVECTORS/scale.svg';
import invoiceIcon from '../SIDEBARVECTORS/invoice.svg';
import profileIcon from '../SIDEBARVECTORS/profile.svg';
import labelIcon from '../SIDEBARVECTORS/label.svg';
import billingWalletIcon from '../SIDEBARVECTORS/billing-wallet.svg';

interface LayoutProps {
  children: React.ReactNode;
}

const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const WALLET_REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const PROFILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const userIdRef = useRef<string | null>(null);
  const lastWalletFetchRef = useRef<number>(0);
  const lastProfileFetchRef = useRef<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'order' | 'awb' | 'reference'>('order');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  // Keep parent menu expanded when on a child route
  useEffect(() => {
    const path = location.pathname;

    // Check which parent menu should be expanded based on current path
    const shouldExpandTools = path === '/tools' || path === '/packages' || path === '/weight-discrepancies';
    const shouldExpandBilling = path === '/billing' || path === '/invoices' || path === '/remittances' || path.startsWith('/remittances/');
    const shouldExpandSettings = path === '/settings' || path.startsWith('/settings/');

    // Only update if a menu should be expanded (don't collapse on unrelated routes)
    if (shouldExpandTools || shouldExpandBilling || shouldExpandSettings) {
      setExpandedMenus({
        tools: shouldExpandTools,
        billing: shouldExpandBilling,
        settings: shouldExpandSettings,
      });
    }
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return;
    }

    const params = new URLSearchParams();
    params.set('search', trimmedQuery);
    params.set('search_type', searchType);

    const targetUrl = `/orders?${params.toString()}`;
    const searchPayload = {
      searchQuery: trimmedQuery,
      searchType,
    } as const;

    navigate(targetUrl, { state: searchPayload });

    // Emit global event so Orders page can react immediately (also handles same-route searches)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('order-global-search', {
          detail: searchPayload,
        })
      );
    }, 0);
  };

  const handleRecharge = () => {
    navigate('/billing');
  };

  const handleRefreshWallet = async () => {
    try {
      console.log('🔄 Manually refreshing wallet balance...');
      const balance = await walletService.refreshBalance();
      setWalletBalance(balance);
      console.log('✅ Wallet balance refreshed:', balance);
    } catch (error) {
      console.error('❌ Failed to refresh wallet balance:', error);
    }
  };

  const handleDebugWallet = async () => {
    try {
      console.log('🔍 DEBUG: Testing wallet balance API...');
      
      // Test direct API call
      const response = await fetch('/api/user/wallet-balance', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('🔍 DEBUG: Direct API response:', data);
      
      if (data.success) {
        const balance = {
          balance: data.data.balance,
          currency: data.data.currency || 'INR'
        };
        setWalletBalance(balance);
        console.log('✅ DEBUG: Wallet balance updated from direct API:', balance);
      }
    } catch (error) {
      console.error('❌ DEBUG: Direct API call failed:', error);
    }
  };

  const handleTickets = () => {
    navigate('/support');
  };

  const handleProfileClick = () => {
    setIsProfileOpen(!isProfileOpen);
  };

  const handleProfileClose = () => {
    setIsProfileOpen(false);
  };

  const handleLogout = () => {
    // Disconnect WebSocket BEFORE clearing auth and redirecting
    notificationService.disconnect();
    
    // Clear auth and redirect to login
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // DO NOT clear remembered_email and remembered_password on logout
    // These should persist based on user's Remember Me checkbox choice
    setIsProfileOpen(false);
    navigate('/login');
  };


  const fetchUserProfile = useCallback(async (force = false): Promise<boolean> => {
    const now = Date.now();
    if (!force && lastProfileFetchRef.current && now - lastProfileFetchRef.current < RATE_LIMIT_WINDOW_MS) {
      return false;
    }
    lastProfileFetchRef.current = now;

    let fetched = false;
    try {
      // Try to load from cache first for instant display
      const cachedProfile = DataCache.get<UserProfile>('userProfile');
      if (cachedProfile) {
        setUserProfile(cachedProfile);
        userIdRef.current = cachedProfile._id ?? null;
        console.log('👤 USER PROFILE LOADED FROM CACHE:', cachedProfile);
      }

      if (!userProfile) {
        setLoading(true);
      }
      console.log('👤 LOADING USER PROFILE FROM MONGODB...');

      // Always fetch fresh from MongoDB (independent of WebSocket)
      const response = await userService.getUserProfile();
      console.log('👤 USER PROFILE LOADED FROM MONGODB:', response.data);

      // Cache the profile for persistence
      DataCache.set('userProfile', response.data);
      setUserProfile(response.data);
      userIdRef.current = response.data._id ?? null;

      // Connect to WebSocket with user ID after profile is loaded
      // WebSocket connection is SEPARATE from profile fetching
      if (response.data._id) {
        notificationService.connect(response.data._id);
      }
      fetched = true;
    } catch (error: any) {
      console.error('❌ ERROR LOADING USER PROFILE:', error);

      // Try to use cached profile if API fails
      const cachedProfile = DataCache.getStale<UserProfile>('userProfile');
      if (cachedProfile) {
        console.log('⚠️ Using cached profile due to API error');
        setUserProfile(cachedProfile);
        userIdRef.current = cachedProfile._id ?? null;
      }

      // If user is not authenticated, redirect to login
      if (error.response?.status === 401) {
        console.log('🔐 UNAUTHORIZED - Redirecting to login');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
    return fetched;
  }, [navigate, userProfile]);

  const fetchWalletBalance = useCallback(async (force = false): Promise<boolean> => {
    const now = Date.now();
    if (!force && lastWalletFetchRef.current && now - lastWalletFetchRef.current < RATE_LIMIT_WINDOW_MS) {
      return false;
    }
    lastWalletFetchRef.current = now;

    let fetched = false;
    // Load from cache first - instant display, no freezing
    const cached = DataCache.get<WalletBalance>('walletBalance');
    if (cached) {
      setWalletBalance(cached);
      console.log('💰 Wallet balance loaded from cache:', cached);
    }

    // Fetch fresh data in background - doesn't block UI
    try {
      const balance = await walletService.getWalletBalance(false); // Force fresh fetch
      setWalletBalance(balance);
      console.log('💰 Fresh wallet balance loaded:', balance);
      fetched = true;
    } catch (error) {
      console.error('❌ ERROR LOADING WALLET BALANCE:', error);
      // Use stale cache if fresh fetch fails
      const stale = DataCache.getStale<WalletBalance>('walletBalance');
      if (stale) {
        setWalletBalance((prev) => prev ?? stale);
      }
    }
    return fetched;
  }, []);

  // Load user profile and wallet balance on component mount
  // Profile is ALWAYS fetched from MongoDB independently of WebSocket
  useEffect(() => {
    // Listen for WebSocket connection state changes and refresh data when reconnected
    // CRITICAL: Auto-reconnect WebSocket when disconnected (even for code 1001)
    const unsubscribeConnection = notificationService.onConnectionChange((connected) => {
      console.log('🔌 WebSocket connection state changed:', connected);
      setWsConnected(connected);
      if (connected) {
        // When WebSocket reconnects (e.g., after page refresh), refresh critical data
        console.log('🔄 WebSocket reconnected - refreshing data...');
        fetchWalletBalance(true);
        // Trigger a custom event that pages can listen to
        window.dispatchEvent(new CustomEvent('websocket-reconnected'));
      } else {
        // WebSocket disconnected - AUTO-RECONNECT if we have userId
        // This fixes the issue where code 1001 disconnects but Layout doesn't reconnect
        const userId = userIdRef.current;
        if (userId) {
          console.log('🔌 WebSocket disconnected - auto-reconnecting...');
          // Wait a bit then reconnect (gives time for network to stabilize)
          setTimeout(() => {
            const currentState = notificationService.getConnectionState();
            if (!currentState) {
              console.log('🔄 Auto-reconnecting WebSocket after disconnect...');
              notificationService.connect(userId);
            }
          }, 2000); // 2 second delay to avoid rapid reconnect loops
        }
      }
    });

    fetchUserProfile();
    fetchWalletBalance();
    
    return () => {
      unsubscribeConnection();
    };
  }, [fetchUserProfile, fetchWalletBalance]);

  // Periodic WebSocket health check and auto-reconnect (runs every 5 seconds)
  useEffect(() => {
    const healthCheckInterval = setInterval(() => {
      const isConnected = notificationService.getConnectionState();
      const userId = userIdRef.current;

      if (!isConnected && userId) {
        console.log('🔌 Periodic check: WebSocket disconnected, attempting reconnect...');
        // Check if it's a manual disconnect before reconnecting
        notificationService.connect(userId);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(healthCheckInterval);
  }, []);

  // Auto-refresh wallet balance every 2 minutes as fallback (reduced frequency to prevent rate limits)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWalletBalance();
    }, WALLET_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchWalletBalance]);

  // Auto-refresh user profile from MongoDB every 60 seconds (no WebSocket dependency)
  // This ensures profile picture and data stay fresh without rate limiting
  useEffect(() => {
    const profileInterval = setInterval(async () => {
      try {
        const fetched = await fetchUserProfile();
        if (fetched) {
          await refreshUser();
        }
      } catch (error) {
        console.error('❌ Auto-refresh user profile failed:', error);
        const cachedProfile = DataCache.getStale<UserProfile>('userProfile');
        if (cachedProfile) {
          setUserProfile((prev) => prev ?? cachedProfile);
          if (!userIdRef.current) {
            userIdRef.current = cachedProfile._id ?? null;
          }
        }
      }
    }, PROFILE_REFRESH_INTERVAL_MS);

    return () => clearInterval(profileInterval);
  }, [fetchUserProfile, refreshUser]);

  // Refresh wallet balance when page becomes visible (user switches back to tab)
  // No WebSocket dependency - fetch directly from MongoDB
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('👁️ Tab became visible - refreshing data from MongoDB...');
        
        // Show cached first, then refresh
        const cached = DataCache.get<WalletBalance>('walletBalance');
        if (cached) {
          setWalletBalance(cached);
        }
        
        try {
          const balance = await walletService.getWalletBalance(false);
          setWalletBalance(balance);
          DataCache.set('walletBalance', balance);
        } catch (error) {
          console.error('❌ Failed to refresh wallet balance on visibility change:', error);
          // Keep using cached value - don't clear
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Subscribe to wallet balance updates - this syncs across all components
  useEffect(() => {
    const unsubscribe = walletService.subscribe((balance) => {
      console.log('💰 Layout: Wallet balance updated via subscription:', balance);
      setWalletBalance(balance);
      // Ensure it's cached
      DataCache.set('walletBalance', balance);
    });

    return unsubscribe;
  }, []);

  // Poll wallet balance and user profile from MongoDB (no WebSocket dependency)
  // Refresh every 60 seconds to avoid rate limiting while keeping data fresh
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const walletFetched = await fetchWalletBalance();
        const profileFetched = await fetchUserProfile();

        if (walletFetched) {
          const latest = DataCache.get<WalletBalance>('walletBalance');
          if (latest) {
            setWalletBalance(latest);
          }
        }

        if (profileFetched) {
          const latestProfile = DataCache.get<UserProfile>('userProfile');
          if (latestProfile) {
            setUserProfile(latestProfile);
          }
          await refreshUser();
        }
      } catch (error) {
        console.error('❌ Error polling data from MongoDB:', error);
        const cachedBalance = DataCache.getStale<WalletBalance>('walletBalance');
        const cachedProfile = DataCache.getStale<UserProfile>('userProfile');
        if (cachedBalance) setWalletBalance(cachedBalance);
        if (cachedProfile) setUserProfile(cachedProfile);
      }
    }, PROFILE_REFRESH_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [fetchWalletBalance, fetchUserProfile, refreshUser]);

  // Menu items with collapsible sub-menus
  interface MenuItem {
    path?: string;
    icon: string;
    label: string;
    svgIcon: string | null;
    id?: string;
    children?: MenuItem[];
  }

  const menuItems: MenuItem[] = [
    { path: '/dashboard', icon: '🏠', label: 'Dashboard', svgIcon: group1Icon },
    { path: '/orders', icon: '🛒', label: 'Orders', svgIcon: vector14Icon },
    { path: '/ndr', icon: '📦', label: 'NDR', svgIcon: group10Icon },
    {
      id: 'tools',
      icon: '🔧',
      label: 'Tools',
      svgIcon: vectorIcon,
      children: [
        { path: '/tools', icon: '🧮', label: 'Rate Calculator', svgIcon: calculatorIcon },
        { path: '/packages', icon: '📦', label: 'Packages', svgIcon: packageIcon },
        { path: '/weight-discrepancies', icon: '⚖️', label: 'Weight Discrepancies', svgIcon: scaleIcon },
      ]
    },
    {
      id: 'billing',
      icon: '💳',
      label: 'Billing',
      svgIcon: group1BillingIcon,
      children: [
        { path: '/billing', icon: '💳', label: 'Billing', svgIcon: billingWalletIcon },
        { path: '/invoices', icon: '📄', label: 'Invoices', svgIcon: invoiceIcon },
        { path: '/remittances', icon: '', label: 'Remittance', svgIcon: '/money.svg' },
      ]
    },
    { path: '/warehouse', icon: '🏢', label: 'Warehouse', svgIcon: group19Icon },
    { path: '/channel', icon: '🔗', label: 'Channel', svgIcon: vector1Icon },
    { path: '/support', icon: '🎧', label: 'Support', svgIcon: vector2Icon },
    {
      id: 'settings',
      icon: '⚙️',
      label: 'Setting',
      svgIcon: group3Icon,
      children: [
        { path: '/settings', icon: '👤', label: 'Profile', svgIcon: profileIcon },
        { path: '/settings/manage-label', icon: '🏷️', label: 'Manage Label', svgIcon: labelIcon },
      ]
    },
  ];

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  const isMenuActive = (item: MenuItem): boolean => {
    if (item.path) {
      return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    }
    if (item.children) {
      return item.children.some(child =>
        child.path && (location.pathname === child.path || location.pathname.startsWith(child.path + '/'))
      );
    }
    return false;
  };

  return (
    <div className="layout-container">
      {/* Top Header */}
      <header className="layout-header">
        <div className="header-left">
          <Link to="/dashboard" className="logo" aria-label="Shipsarthi home">
            <img src="/NEW LOGO.png" alt="Shipsarthi" className="logo-image" />
          </Link>
        </div>

        <div className="header-center">
          <form onSubmit={handleSearch} className="search-form">
            <select
              className="search-select"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'order' | 'awb' | 'reference')}
            >
              <option value="order">Order ID</option>
              <option value="awb">AWB</option>
              <option value="reference">Reference ID</option>
            </select>
            <input
              type="text"
              className="search-input"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="search-button">
              <img src={searchIcon} alt="Search" style={{ width: '22px', height: '22px' }} />
            </button>
          </form>
        </div>

        <div className="header-right">
           {/* WebSocket Connection Status */}
           <div style={{
             display: 'flex',
             alignItems: 'center',
             marginRight: '6px',
             fontSize: '11px',
             fontWeight: '500',
             color: '#333'
           }}>
             <span style={{
               display: 'inline-block',
               width: '8px',
               height: '8px',
               borderRadius: '50%',
               backgroundColor: wsConnected ? '#28a745' : '#dc3545',
               marginRight: '6px'
             }}></span>
             {wsConnected ? 'Connected' : 'Disconnected'}
           </div>
           
           <div className="wallet-section">
             <div className="wallet-display">
               <span className="wallet-icon">₹</span>
               <span className="wallet-balance">
                 {walletBalance?.balance?.toFixed(2) || (userProfile as any)?.wallet_balance?.toFixed(2) || '0.00'}
               </span>
              <button className="refresh-wallet-button" onClick={handleRefreshWallet} title="Refresh Wallet Balance">
              </button>
              <button className="debug-wallet-button" onClick={handleDebugWallet} title="Debug Wallet API">
              </button>
             </div>
             <button className="recharge-button" onClick={handleRecharge}>
               Recharge
             </button>
           </div>
          <button className="tickets-button" onClick={handleTickets}>
            Tickets
          </button>
          <button className="notification-button">
            🔔
          </button>
          
          {/* Profile Circle - Always visible and always clickable */}
          {/* Profile is ALWAYS fetched from MongoDB, independent of WebSocket */}
          <div className="user-avatar-container" style={{ display: 'flex', visibility: 'visible', opacity: 1 }}>
            <button 
              className="user-avatar" 
              onClick={handleProfileClick}
              title={userProfile ? `${userProfile.company_name || 'Profile'}` : 'Loading...'}
              style={{ display: 'flex', visibility: 'visible', opacity: 1, cursor: 'pointer' }}
              disabled={false}
            >
              {loading && !userProfile ? (
                <div className="user-avatar-loading">...</div>
              ) : userProfile?.avatar_url ? (
                <img 
                  src={userProfile.avatar_url} 
                  alt="Profile Avatar" 
                  className="avatar-image"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.avatar-initials')) {
                      const span = document.createElement('span');
                      span.className = 'avatar-initials';
                      span.textContent = userProfile?.initials || 
                                        (userProfile?.your_name?.charAt(0).toUpperCase() || 
                                         userProfile?.company_name?.charAt(0).toUpperCase() || 
                                         'U');
                      parent.appendChild(span);
                    }
                  }}
                />
              ) : (
                <span className="avatar-initials">
                  {userProfile?.initials || 
                   (userProfile?.your_name?.charAt(0).toUpperCase() || 
                    userProfile?.company_name?.charAt(0).toUpperCase() || 
                    'U')}
                </span>
              )}
            </button>
            
            {/* Profile Dropdown - Always show if clicked, will fetch profile if needed */}
            {isProfileOpen && (
              <div className="profile-dropdown-wrapper" style={{ display: 'block', visibility: 'visible' }}>
                {userProfile ? (
                  <ProfileDropdown 
                    user={{
                      ...userProfile,
                      initials: userProfile.initials || 
                               (userProfile.your_name?.charAt(0).toUpperCase() || 
                                userProfile.company_name?.charAt(0).toUpperCase() || 
                                'U')
                    }} 
                    onClose={handleProfileClose}
                    onLogout={handleLogout}
                  />
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <div>Loading profile...</div>
                    <button onClick={() => {
                      // Force refresh profile from MongoDB
                      userService.getUserProfile().then(response => {
                        DataCache.set('userProfile', response.data);
                        setUserProfile(response.data);
                      });
                    }}>Refresh Profile</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="layout-body">
        {/* Floating Hamburger - appears on page when sidebar is closed */}
        {!isSidebarOpen && (
          <button
            className="floating-hamburger"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <span>&#9776;</span>
          </button>
        )}

        {/* Sidebar */}
        <aside className={`layout-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          {/* Hamburger Menu Toggle */}
          <div className="sidebar-hamburger">
            <button
              className="sidebar-menu-toggle"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <span style={{ fontSize: '24px' }}>&#9776;</span>
            </button>
          </div>

          <nav className="sidebar-nav">
            {menuItems.map((item) => (
              <div key={item.path || item.id} className="sidebar-menu-item">
                {item.children ? (
                  <>
                    {/* Parent menu item with children - clicking just toggles submenu */}
                    <div
                      className={`sidebar-item sidebar-parent ${isMenuActive(item) ? 'active-parent' : ''} ${expandedMenus[item.id!] ? 'expanded' : ''}`}
                      onClick={() => {
                        // Toggle this menu, collapse others
                        setExpandedMenus(prev => ({
                          tools: item.id === 'tools' ? !prev.tools : false,
                          billing: item.id === 'billing' ? !prev.billing : false,
                          settings: item.id === 'settings' ? !prev.settings : false,
                        }));
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="sidebar-icon">
                        {item.svgIcon ? (
                          <img src={item.svgIcon} alt={item.label} style={{ width: '22px', height: '22px' }} />
                        ) : (
                          item.icon
                        )}
                      </span>
                      <span className="sidebar-label">{item.label}</span>
                      <span
                        className={`sidebar-arrow ${expandedMenus[item.id!] ? 'expanded' : ''}`}
                      >
                        &#9660;
                      </span>
                    </div>
                    {/* Child menu items */}
                    <div className={`sidebar-children ${expandedMenus[item.id!] ? 'expanded' : ''}`}>
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          to={child.path!}
                          className={`sidebar-item sidebar-child ${location.pathname === child.path || location.pathname.startsWith(child.path + '/') ? 'active' : ''}`}
                        >
                          <span className="sidebar-icon">
                            {child.svgIcon ? (
                              <img src={child.svgIcon} alt={child.label} style={{ width: '22px', height: '22px' }} />
                            ) : (
                              child.icon
                            )}
                          </span>
                          <span className="sidebar-label">{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Regular menu item - direct link */
                  <Link
                    to={item.path!}
                    className={`sidebar-item ${isMenuActive(item) ? 'active' : ''}`}
                  >
                    <span className="sidebar-icon">
                      {item.svgIcon ? (
                        <img src={item.svgIcon} alt={item.label} style={{ width: '22px', height: '22px' }} />
                      ) : (
                        item.icon
                      )}
                    </span>
                    <span className="sidebar-label">{item.label}</span>
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className={`layout-main ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
          <div className="content-wrapper">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;