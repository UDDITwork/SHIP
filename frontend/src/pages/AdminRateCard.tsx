import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService, Carrier } from '../services/adminService';
import './AdminRateCard.css';

type SortOrder = 'asc' | 'desc';

const AdminRateCard: React.FC = () => {
  const navigate = useNavigate();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState<'carriers' | 'categories'>('carriers');

  const categories = [
    { id: 'new-user', label: 'New User', route: 'new-user' },
    { id: 'basic-user', label: 'Basic User', route: 'basic-user' },
    { id: 'lite-user', label: 'Lite User', route: 'lite-user' },
    { id: 'advanced', label: 'Advanced', route: 'advanced' }
  ];

  useEffect(() => {
    fetchCarriers();
  }, [sortOrder, showInactive]);

  const fetchCarriers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getCarriers({
        sort: sortOrder,
        include_inactive: showInactive
      });
      if (response.success) {
        setCarriers(response.data.carriers);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch carriers');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCarrierStatus = async (carrier: Carrier) => {
    try {
      if (carrier.is_active) {
        await adminService.deactivateCarrier(carrier._id);
      } else {
        await adminService.activateCarrier(carrier._id);
      }
      fetchCarriers();
    } catch (err: any) {
      setError(err.message || 'Failed to update carrier status');
    }
  };

  const handleCategoryClick = (route: string) => {
    navigate(`/admin/ratecard/${route}`);
  };

  const handleCarrierRatesClick = (carrierId: string) => {
    navigate(`/admin/carriers/${carrierId}/rates`);
  };

  const getServiceTypeBadgeClass = (serviceType: string) => {
    switch (serviceType) {
      case 'surface': return 'badge-surface';
      case 'air': return 'badge-air';
      case 'premium': return 'badge-premium';
      case 'express': return 'badge-express';
      default: return 'badge-default';
    }
  };

  return (
    <div className="admin-ratecard">
      <div className="admin-header">
        <div className="header-content">
          <div>
            <h1>Rate Card Management</h1>
            <p>Manage carrier rates and user category pricing</p>
          </div>
          <div className="header-actions">
            <button
              className={`view-mode-btn ${viewMode === 'carriers' ? 'active' : ''}`}
              onClick={() => setViewMode('carriers')}
            >
              By Carrier
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'categories' ? 'active' : ''}`}
              onClick={() => setViewMode('categories')}
            >
              By Category
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      {viewMode === 'carriers' ? (
        <>
          <div className="filters-section">
            <div className="filter-group">
              <label>Sort:</label>
              <button
                className={`filter-btn ${sortOrder === 'asc' ? 'active' : ''}`}
                onClick={() => setSortOrder('asc')}
              >
                A-Z
              </button>
              <button
                className={`filter-btn ${sortOrder === 'desc' ? 'active' : ''}`}
                onClick={() => setSortOrder('desc')}
              >
                Z-A
              </button>
            </div>
            <div className="filter-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Show Inactive
              </label>
            </div>
            <button
              className="manage-carriers-btn"
              onClick={() => navigate('/admin/carriers')}
            >
              Manage Carriers
            </button>
          </div>

          <div className="carriers-grid">
            {loading ? (
              <div className="loading-state">Loading carriers...</div>
            ) : carriers.length === 0 ? (
              <div className="empty-state">
                <p>No carriers found.</p>
                <button onClick={() => navigate('/admin/carriers')}>
                  Add Carrier
                </button>
              </div>
            ) : (
              carriers.map((carrier) => (
                <div
                  key={carrier._id}
                  className={`carrier-card ${!carrier.is_active ? 'inactive' : ''}`}
                >
                  <div className="carrier-header">
                    <div className="carrier-info">
                      <h3>{carrier.display_name}</h3>
                      <span className={`service-badge ${getServiceTypeBadgeClass(carrier.service_type)}`}>
                        {carrier.service_type}
                      </span>
                    </div>
                    <div className="carrier-status">
                      <span className={`status-indicator ${carrier.is_active ? 'active' : 'inactive'}`}>
                        {carrier.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="carrier-meta">
                    <span className="carrier-code">{carrier.carrier_code}</span>
                    <span className="carrier-group">{carrier.carrier_group}</span>
                  </div>
                  <div className="carrier-actions">
                    <button
                      className="view-rates-btn"
                      onClick={() => handleCarrierRatesClick(carrier._id)}
                    >
                      View/Edit Rates
                    </button>
                    <button
                      className={`toggle-status-btn ${carrier.is_active ? 'deactivate' : 'activate'}`}
                      onClick={() => handleToggleCarrierStatus(carrier)}
                    >
                      {carrier.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="ratecard-categories">
          <p className="categories-note">
            Select a user category to view and edit legacy rate card pricing.
            For carrier-specific rates, use the "By Carrier" view.
          </p>
          <div className="categories-grid">
            {categories.map((category) => (
              <button
                key={category.id}
                className="category-button"
                onClick={() => handleCategoryClick(category.route)}
              >
                <div className="category-icon">RC</div>
                <div className="category-label">{category.label}</div>
                <div className="category-arrow">-&gt;</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRateCard;
