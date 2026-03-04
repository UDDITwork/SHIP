import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService, Carrier } from '../services/adminService';
import { ChevronLeft } from 'lucide-react';
import './AdminRateCard.css';

type SortOrder = 'a-z' | 'z-a' | 'newest' | 'oldest';

const getWeightSlabSummary = (type: string): string[] => {
  if (type === 'option2') return ['0-5 kg', '+1 kg/9 kg', '10 kg', '+1 kg/19 kg', '>20 kg'];
  return ['0-250 gm', '250-500 gm', '+500 gm/5 kg', '+1 kg/10 kg', '>10 kg'];
};

const AdminRateCard: React.FC = () => {
  const navigate = useNavigate();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('a-z');
  const [showInactive, setShowInactive] = useState(false);
  const [viewMode, setViewMode] = useState<'carriers' | 'categories'>('carriers');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    { id: 'new-user', label: 'New User' },
    { id: 'basic-user', label: 'Basic User' },
    { id: 'lite-user', label: 'Lite User' },
    { id: 'advanced', label: 'Advanced' }
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
        active_only: !showInactive
      });
      if (response.success) {
        setCarriers(response.data);
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

  const handleCarrierRatesClick = (carrierId: string, category?: string) => {
    const url = category
      ? `/admin/carriers/${carrierId}/rates?category=${encodeURIComponent(category)}`
      : `/admin/carriers/${carrierId}/rates`;
    navigate(url);
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
              onClick={() => { setViewMode('carriers'); setSelectedCategory(null); }}
            >
              By Carrier
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'categories' ? 'active' : ''}`}
              onClick={() => { setViewMode('categories'); setSelectedCategory(null); }}
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
                className={`filter-btn ${sortOrder === 'a-z' ? 'active' : ''}`}
                onClick={() => setSortOrder('a-z')}
              >
                A-Z
              </button>
              <button
                className={`filter-btn ${sortOrder === 'z-a' ? 'active' : ''}`}
                onClick={() => setSortOrder('z-a')}
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
                  <div className="rc-slab-chips">
                    {getWeightSlabSummary(carrier.weight_slab_type).map(slab => (
                      <span key={slab} className="rc-slab-chip">{slab}</span>
                    ))}
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
          {/* Category selector buttons */}
          <div className="categories-grid">
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-button ${selectedCategory === category.label ? 'selected' : ''}`}
                onClick={() => setSelectedCategory(
                  selectedCategory === category.label ? null : category.label
                )}
              >
                <div className="category-icon">RC</div>
                <div className="category-label">{category.label}</div>
                <div className="category-arrow">{selectedCategory === category.label ? '▼' : '→'}</div>
              </button>
            ))}
          </div>

          {/* Inline carrier grid for selected category */}
          {selectedCategory && (
            <div className="category-carriers-section">
              <div className="category-carriers-header">
                <button
                  className="back-to-categories-btn"
                  onClick={() => setSelectedCategory(null)}
                >
                  <ChevronLeft size={16} /> Categories
                </button>
                <h3>Carriers for <span className="selected-cat-name">{selectedCategory}</span></h3>
              </div>

              {loading ? (
                <div className="loading-state">Loading carriers...</div>
              ) : carriers.length === 0 ? (
                <div className="empty-state">
                  <p>No carriers available.</p>
                  <button onClick={() => navigate('/admin/carriers')}>Add Carrier</button>
                </div>
              ) : (
                <div className="carriers-grid">
                  {carriers.map((carrier) => (
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
                          {(carrier.rate_card_count || 0) > 0 ? (
                            <span className="rate-exists-badge">Rates Set</span>
                          ) : (
                            <span className="rate-missing-badge">No Rates</span>
                          )}
                        </div>
                      </div>
                      <div className="carrier-meta">
                        <span className="carrier-code">{carrier.carrier_code}</span>
                      </div>
                      <div className="rc-slab-chips">
                        {getWeightSlabSummary(carrier.weight_slab_type).map(slab => (
                          <span key={slab} className="rc-slab-chip">{slab}</span>
                        ))}
                      </div>
                      <div className="carrier-actions">
                        <button
                          className="view-rates-btn"
                          onClick={() => handleCarrierRatesClick(carrier._id, selectedCategory)}
                        >
                          View/Edit Rates →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRateCard;
