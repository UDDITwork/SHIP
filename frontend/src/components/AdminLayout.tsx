import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminService, GlobalSearchResult } from '../services/adminService';
import './AdminLayout.css';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Handle search with debounce
  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults(null);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await adminService.globalSearch(query);
      setSearchResults(results);
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults(null);
      setShowResults(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, handleSearch]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Navigate to result and close dropdown
  const handleResultClick = (type: string, id: string, clientId?: string) => {
    setShowResults(false);
    setSearchQuery('');
    setSearchResults(null);

    switch (type) {
      case 'order':
        navigate(`/admin/orders/${id}/details`);
        break;
      case 'client':
        navigate(`/admin/clients/${id}/dashboard`);
        break;
      case 'customer':
        if (clientId) {
          navigate(`/admin/clients/${clientId}/dashboard`);
        }
        break;
      default:
        break;
    }
  };

  // Calculate total results count
  const getTotalResultsCount = () => {
    if (!searchResults) return 0;
    return (
      searchResults.orders.length +
      searchResults.packages.length +
      searchResults.customers.length +
      searchResults.clients.length
    );
  };

  useEffect(() => {
    // Check if admin or staff is authenticated
    const isAuthenticated = localStorage.getItem('admin_authenticated');
    const isStaff = localStorage.getItem('is_staff') === 'true';
    if (!isAuthenticated && !isStaff) {
      navigate('/admin/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('admin_authenticated');
    localStorage.removeItem('admin_email');
    localStorage.removeItem('admin_password');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('is_staff');
    localStorage.removeItem('staff_name');
    localStorage.removeItem('staff_email');
    navigate('/admin/login');
  };

  // Check if current user is staff (not admin)
  const isStaff = localStorage.getItem('is_staff') === 'true';

  const menuItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: 'D' },
    { path: '/admin/clients', label: 'Clients', icon: 'C' },
    { path: '/admin/tickets', label: 'Tickets', icon: 'T' },
    { path: '/admin/billing', label: 'Billing', icon: 'B' },
    { path: '/admin/remittances', label: 'Remittances', icon: 'R' },
    { path: '/admin/orders', label: 'Orders', icon: 'O' },
    { path: '/admin/ndr', label: 'NDR', icon: 'N' },
    { path: '/admin/wallet-recharge', label: 'Wallet Recharge', icon: 'W' },
    { path: '/admin/weight-discrepancies', label: 'Weight Discrepancies', icon: 'WD' },
    // Carriers - only visible to admins
    ...(isStaff ? [] : [{ path: '/admin/carriers', label: 'Carriers', icon: 'CR' }]),
    // Staff Management - only visible to admins
    ...(isStaff ? [] : [{ path: '/admin/staff-management', label: 'Staff Management', icon: 'S' }]),
    // Rate Card Management - only visible to admins
    ...(isStaff ? [] : [{ path: '/admin/ratecard', label: 'Rate Card Management', icon: 'RC' }]),
  ];

  // Debug: Log menu items to verify they're being added
  useEffect(() => {
    console.log('Admin Layout - isStaff:', isStaff);
    console.log('Admin Layout - menuItems count:', menuItems.length);
    console.log('Admin Layout - menuItems:', menuItems.map(m => m.label));
    const rateCardItem = menuItems.find(m => m.path === '/admin/ratecard');
    console.log('Admin Layout - Rate Card item:', rateCardItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, menuItems.length]);

  const isActivePath = (path: string) => {
    if (path === '/admin/ratecard') {
      return location.pathname.startsWith('/admin/ratecard');
    }
    // For billing and wallet-recharge, also check if we're on a sub-route
    if (path === '/admin/billing') {
      return location.pathname.startsWith('/admin/billing');
    }
    if (path === '/admin/wallet-recharge') {
      return location.pathname.startsWith('/admin/wallet-recharge');
    }
    return location.pathname === path;
  };

  // Handle menu item click - if clicking on currently active page, dispatch reset event
  const handleMenuClick = (path: string) => {
    const isCurrentlyActive = isActivePath(path);

    if (isCurrentlyActive) {
      // Dispatch custom event to reset the page state
      window.dispatchEvent(new CustomEvent('admin-page-reset', { detail: { path } }));
    }

    // Always navigate (React Router handles same-route navigation)
    navigate(path);
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Admin Panel</h2>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? '✕' : '☰'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleMenuClick(item.path)}
              className={`nav-item ${isActivePath(item.path) ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="admin-header">
          <div className="header-left">
            <button
              className="mobile-menu-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <h1>Admin Portal</h1>
          </div>
          <div className="header-center" ref={searchRef}>
            <div className="global-search-container">
              <div className="global-search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="global-search-input"
                  placeholder="Search AWB, Order ID, Contact..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults && setShowResults(true)}
                />
                {isSearching && <span className="search-spinner">⏳</span>}
                {searchQuery && !isSearching && (
                  <button
                    className="search-clear"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults(null);
                      setShowResults(false);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {showResults && searchResults && (
                <div className="global-search-results">
                  {getTotalResultsCount() === 0 ? (
                    <div className="search-no-results">
                      No results found for "{searchQuery}"
                    </div>
                  ) : (
                    <>
                      {/* Orders Section */}
                      {searchResults.orders.length > 0 && (
                        <div className="search-section">
                          <div className="search-section-header">
                            <span className="section-icon">📦</span>
                            Orders ({searchResults.orders.length})
                          </div>
                          {searchResults.orders.map((order) => (
                            <div
                              key={order._id}
                              className="search-result-item"
                              onClick={() => handleResultClick('order', order._id)}
                            >
                              <div className="result-main">
                                <span className="result-label">Order:</span>
                                <span className="result-value">{order.order_id}</span>
                                {order.awb_number && (
                                  <>
                                    <span className="result-separator">|</span>
                                    <span className="result-label">AWB:</span>
                                    <span className="result-value">{order.awb_number}</span>
                                  </>
                                )}
                              </div>
                              <div className="result-meta">
                                <span className="result-client">{order.client_name}</span>
                                <span className={`result-status status-${order.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                                  {order.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Packages Section */}
                      {searchResults.packages.length > 0 && (
                        <div className="search-section">
                          <div className="search-section-header">
                            <span className="section-icon">📋</span>
                            Packages ({searchResults.packages.length})
                          </div>
                          {searchResults.packages.map((pkg) => (
                            <div
                              key={pkg._id}
                              className="search-result-item"
                              onClick={() => handleResultClick('order', pkg._id)}
                            >
                              <div className="result-main">
                                <span className="result-label">AWB:</span>
                                <span className="result-value">{pkg.awb_number}</span>
                              </div>
                              <div className="result-meta">
                                <span className="result-client">{pkg.client_name}</span>
                                <span className="result-product">{pkg.product_name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Clients Section */}
                      {searchResults.clients.length > 0 && (
                        <div className="search-section">
                          <div className="search-section-header">
                            <span className="section-icon">👥</span>
                            Clients ({searchResults.clients.length})
                          </div>
                          {searchResults.clients.map((client) => (
                            <div
                              key={client._id}
                              className="search-result-item"
                              onClick={() => handleResultClick('client', client._id)}
                            >
                              <div className="result-main">
                                <span className="result-value">{client.company_name}</span>
                                <span className="result-separator">|</span>
                                <span className="result-label">ID:</span>
                                <span className="result-value">{client.client_id}</span>
                              </div>
                              <div className="result-meta">
                                <span className="result-phone">{client.phone_number}</span>
                                <span className={`result-status status-${client.account_status}`}>
                                  {client.account_status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Customers Section */}
                      {searchResults.customers.length > 0 && (
                        <div className="search-section">
                          <div className="search-section-header">
                            <span className="section-icon">👤</span>
                            Customers ({searchResults.customers.length})
                          </div>
                          {searchResults.customers.map((customer) => (
                            <div
                              key={customer._id}
                              className="search-result-item"
                              onClick={() => handleResultClick('customer', customer._id, customer.user_id)}
                            >
                              <div className="result-main">
                                <span className="result-value">{customer.name}</span>
                                <span className="result-separator">|</span>
                                <span className="result-phone">{customer.phone}</span>
                              </div>
                              <div className="result-meta">
                                <span className="result-client">Client: {customer.client_name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="header-right">
            <span className="admin-email">
              {isStaff
                ? localStorage.getItem('staff_name') || localStorage.getItem('staff_email') || 'Staff'
                : localStorage.getItem('admin_email') || 'Admin'}
            </span>
          </div>
        </header>

        <main className="admin-main">
          {children}
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminLayout;
