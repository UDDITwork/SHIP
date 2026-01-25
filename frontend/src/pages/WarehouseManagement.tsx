import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { warehouseService, Warehouse } from '../services/warehouseService';
import { DataCache } from '../utils/dataCache';
import './WarehouseManagement.css';

const WarehouseManagement: React.FC = () => {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [isUsingCache, setIsUsingCache] = useState(false);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async (forceRefresh: boolean = false) => {
    // Step 1: Try to load from cache first (if not forcing refresh)
    if (!forceRefresh) {
      const cachedWarehouses = DataCache.get<Warehouse[]>('warehouses');
      if (cachedWarehouses && cachedWarehouses.length > 0) {
        // Show cached data immediately - no loading spinner
        setWarehouses(cachedWarehouses);
        setLoading(false);
        setIsUsingCache(true);
        
        // Fetch fresh data in background (non-blocking)
        // Don't set loading state - user already sees cached data
      } else {
        // No cache available - show loading
        setLoading(true);
      }
    } else {
      // Force refresh - show loading
      setLoading(true);
    }

    // Step 2: Fetch fresh data from API
    try {
      setError(null);
      const warehousesData = await warehouseService.getWarehouses();
      
      // Update state with fresh data
      setWarehouses(warehousesData);
      setIsUsingCache(false);
      
      // Cache the successful response (30 minutes TTL)
      DataCache.set('warehouses', warehousesData, 30 * 60 * 1000);
    } catch (err: any) {
      // API failed - check if we have cached data
      const cachedWarehouses = DataCache.getStale<Warehouse[]>('warehouses');
      
      if (cachedWarehouses && cachedWarehouses.length > 0) {
        // Use cached data even if expired (stale-while-revalidate pattern)
        setWarehouses(cachedWarehouses);
        setIsUsingCache(true);
        
        // Show warning instead of error if it's a rate limit
        if (err.response?.status === 429) {
          setError('Rate limit reached. Showing cached data. Please try again in a moment.');
        } else {
          setError(`${err.message || 'Failed to fetch warehouses'}. Showing cached data.`);
        }
      } else {
        // No cache available - show actual error
        setError(err.message || 'Failed to fetch warehouses');
        setWarehouses([]);
        setIsUsingCache(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWarehouse = () => {
    navigate('/warehouses/add');
  };

  const handleEditWarehouse = (warehouseId: string) => {
    navigate(`/warehouses/edit/${warehouseId}`);
  };

  const handleDeleteWarehouse = async (warehouseId: string, warehouseName: string) => {
    if (window.confirm(`Are you sure you want to delete "${warehouseName}"? This action cannot be undone.`)) {
      try {
        await warehouseService.deleteWarehouse(warehouseId);
        const updatedWarehouses = warehouses.filter(w => w._id !== warehouseId);
        setWarehouses(updatedWarehouses);
        // Update cache with new data
        DataCache.set('warehouses', updatedWarehouses, 30 * 60 * 1000);
      } catch (err: any) {
        alert(`Failed to delete warehouse: ${err.message}`);
      }
    }
  };

  const handleSetDefault = async (warehouseId: string) => {
    try {
      await warehouseService.setDefaultWarehouse(warehouseId);
      // Refresh warehouses to update default status
      fetchWarehouses(true); // Force refresh
    } catch (err: any) {
      alert(`Failed to set default warehouse: ${err.message}`);
    }
  };

  const filteredWarehouses = warehouses.filter(warehouse => {
    const matchesSearch = warehouse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         warehouse.address.city.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && warehouse.is_active) ||
                         (filterStatus === 'inactive' && !warehouse.is_active);
    
    return matchesSearch && matchesStatus;
  });

  const baseActionButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: 600,
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#111827',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '96px',
    height: 'auto'
  };

  if (loading) {
    return (
      <Layout>
        <div className="warehouse-management">
          <div className="loading-container">
            <div className="loading">Loading warehouses...</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="warehouse-management">
        {/* Create Warehouse Button */}
        <div className="warehouse-actions-bar">
          <button
            className="create-warehouse-btn"
            onClick={handleCreateWarehouse}
          >
            + CREATE WAREHOUSE
          </button>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search warehouses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="filter-controls">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Error/Warning Message */}
        {error && (
          <div className={`error-message ${isUsingCache ? 'warning-message' : ''}`}>
            <span>{error}</span>
            <button onClick={() => fetchWarehouses(true)} className="retry-btn">
              {isUsingCache ? 'Refresh' : 'Retry'}
            </button>
          </div>
        )}
        
        {/* Cache indicator (subtle) */}
        {isUsingCache && !error && (
          <div className="cache-indicator">
            <span>Showing cached data</span>
            <button onClick={() => fetchWarehouses(true)} className="refresh-link">
              Refresh
            </button>
          </div>
        )}

        {/* Warehouses List */}
        <div className="warehouses-section">
          {filteredWarehouses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏢</div>
              <h3>No warehouses found</h3>
              <p>
                {searchTerm || filterStatus !== 'all' 
                  ? 'Try adjusting your search or filters'
                  : 'Create your first warehouse to get started'
                }
              </p>
              {!searchTerm && filterStatus === 'all' && (
                <button 
                  className="create-first-btn"
                  onClick={handleCreateWarehouse}
                >
                  Create Warehouse
                </button>
              )}
            </div>
          ) : (
            <div className="warehouses-grid">
              {filteredWarehouses.map((warehouse) => (
                <div key={warehouse._id} className="warehouse-card">
                  <div className="warehouse-header-card">
                    <div className="warehouse-title">
                      <h3>{warehouse.title}</h3>
                      <span className="warehouse-name">{warehouse.name}</span>
                    </div>
                    <div className="warehouse-badges">
                      {warehouse.is_default && (
                        <span className="badge default-badge">Default</span>
                      )}
                      <span className={`badge status-badge ${warehouse.is_active ? 'active' : 'inactive'}`}>
                        {warehouse.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="warehouse-details">
                    <div className="detail-row">
                      <span className="detail-label">Contact Person:</span>
                      <span className="detail-value">{warehouse.contact_person.name}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Phone:</span>
                      <span className="detail-value">+91 {warehouse.contact_person.phone}</span>
                    </div>
                    {warehouse.contact_person.email && (
                      <div className="detail-row">
                        <span className="detail-label">Email:</span>
                        <span className="detail-value">{warehouse.contact_person.email}</span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="detail-label">Address:</span>
                      <span className="detail-value">
                        {warehouse.address.full_address}, {warehouse.address.city}, {warehouse.address.state} - {warehouse.address.pincode}
                      </span>
                    </div>
                    {warehouse.gstin && (
                      <div className="detail-row">
                        <span className="detail-label">GSTIN:</span>
                        <span className="detail-value">{warehouse.gstin}</span>
                      </div>
                    )}
                  </div>

                  <div className="warehouse-actions">
                    {!warehouse.is_default && (
                      <button
                        className="action-btn set-default-btn"
                        style={{
                          ...baseActionButtonStyle,
                          border: '1px solid #d1d5db',
                          color: '#1f2937',
                          background: '#f9fafb'
                        }}
                        onClick={() => handleSetDefault(warehouse._id)}
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      className="action-btn edit-btn"
                      style={{
                        ...baseActionButtonStyle,
                        border: '1px solid #bfdbfe',
                        color: '#1d4ed8'
                      }}
                      onClick={() => handleEditWarehouse(warehouse._id)}
                    >
                      Edit
                    </button>
                    <button
                      className="action-btn delete-btn"
                      style={{
                        ...baseActionButtonStyle,
                        border: '1px solid #fecaca',
                        color: '#b91c1c'
                      }}
                      onClick={() => handleDeleteWarehouse(warehouse._id, warehouse.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        {filteredWarehouses.length > 0 && (
          <div className="warehouse-summary">
            <p>
              Showing {filteredWarehouses.length} of {warehouses.length} warehouses
              {searchTerm && ` matching "${searchTerm}"`}
              {filterStatus !== 'all' && ` (${filterStatus} only)`}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WarehouseManagement;
