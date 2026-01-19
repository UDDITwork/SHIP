import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService, Carrier } from '../services/adminService';
import {
  Truck,
  Plus,
  Search,
  Filter,
  ToggleLeft,
  ToggleRight,
  ChevronRight,
  ArrowUpDown,
  Plane,
  Package,
  Zap,
  Edit2,
  Trash2,
  X
} from 'lucide-react';
import './AdminCarriers.css';

const AdminCarriers: React.FC = () => {
  const navigate = useNavigate();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'a-z' | 'z-a'>('a-z');
  const [showInactive, setShowInactive] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);

  const [formData, setFormData] = useState({
    carrier_code: '',
    display_name: '',
    carrier_group: '',
    service_type: 'surface' as 'surface' | 'air' | 'premium' | 'express',
    zone_type: 'standard' as 'standard' | 'regional',
    weight_slab_type: 'option1' as 'option1' | 'option2',
    description: '',
    priority_order: 0
  });

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

  const handleCreateCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const response = await adminService.createCarrier(formData);
      if (response.success) {
        resetForm();
        setShowCreateModal(false);
        await fetchCarriers();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create carrier');
    }
  };

  const handleUpdateCarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCarrier) return;

    try {
      setError(null);
      const response = await adminService.updateCarrier(editingCarrier._id, {
        display_name: formData.display_name,
        description: formData.description,
        priority_order: formData.priority_order,
        zone_type: formData.zone_type,
        weight_slab_type: formData.weight_slab_type
      });
      if (response.success) {
        resetForm();
        setEditingCarrier(null);
        setShowCreateModal(false);
        await fetchCarriers();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update carrier');
    }
  };

  const handleToggleActive = async (carrier: Carrier) => {
    try {
      setError(null);
      if (carrier.is_active) {
        await adminService.deactivateCarrier(carrier._id);
      } else {
        await adminService.activateCarrier(carrier._id);
      }
      await fetchCarriers();
    } catch (err: any) {
      setError(err.message || 'Failed to update carrier status');
    }
  };

  const handleDeleteCarrier = async (carrier: Carrier) => {
    if (!window.confirm(`Are you sure you want to delete "${carrier.display_name}"? This will deactivate the carrier.`)) {
      return;
    }
    try {
      setError(null);
      await adminService.deleteCarrier(carrier._id);
      await fetchCarriers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete carrier');
    }
  };

  const handleEdit = (carrier: Carrier) => {
    setEditingCarrier(carrier);
    setFormData({
      carrier_code: carrier.carrier_code,
      display_name: carrier.display_name,
      carrier_group: carrier.carrier_group,
      service_type: carrier.service_type,
      zone_type: carrier.zone_type,
      weight_slab_type: carrier.weight_slab_type,
      description: carrier.description || '',
      priority_order: carrier.priority_order
    });
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormData({
      carrier_code: '',
      display_name: '',
      carrier_group: '',
      service_type: 'surface',
      zone_type: 'standard',
      weight_slab_type: 'option1',
      description: '',
      priority_order: 0
    });
    setEditingCarrier(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'priority_order' ? parseInt(value) || 0 : value
    }));
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'air':
        return <Plane size={16} />;
      case 'premium':
        return <Zap size={16} />;
      case 'express':
        return <Zap size={16} />;
      default:
        return <Truck size={16} />;
    }
  };

  const filteredCarriers = carriers.filter(carrier =>
    carrier.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    carrier.carrier_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    carrier.carrier_group.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && carriers.length === 0) {
    return (
      <div className="admin-carriers">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading carriers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-carriers">
      <div className="admin-header">
        <div className="header-content">
          <div>
            <h1>Carrier Management</h1>
            <p>Manage shipping carriers and their rate configurations</p>
          </div>
          <div className="header-actions">
            <button
              className="btn-primary"
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
            >
              <Plus size={16} /> Add Carrier
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

      <div className="filters-bar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search carriers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-buttons">
          <button
            className={`filter-btn ${sortOrder === 'a-z' ? 'active' : ''}`}
            onClick={() => setSortOrder('a-z')}
          >
            <ArrowUpDown size={14} /> A-Z
          </button>
          <button
            className={`filter-btn ${sortOrder === 'z-a' ? 'active' : ''}`}
            onClick={() => setSortOrder('z-a')}
          >
            <ArrowUpDown size={14} /> Z-A
          </button>
          <button
            className={`filter-btn ${showInactive ? 'active' : ''}`}
            onClick={() => setShowInactive(!showInactive)}
          >
            <Filter size={14} /> {showInactive ? 'All' : 'Active Only'}
          </button>
        </div>
      </div>

      <div className="carriers-grid">
        {filteredCarriers.length === 0 ? (
          <div className="empty-state">
            <Package size={48} />
            <h3>No carriers found</h3>
            <p>Create a new carrier to get started</p>
          </div>
        ) : (
          filteredCarriers.map(carrier => (
            <div key={carrier._id} className={`carrier-card ${!carrier.is_active ? 'inactive' : ''}`}>
              <div className="carrier-header">
                <div className="carrier-icon">
                  {getServiceIcon(carrier.service_type)}
                </div>
                <div className="carrier-info">
                  <h3>{carrier.display_name}</h3>
                  <span className="carrier-code">{carrier.carrier_code}</span>
                </div>
                <div className="carrier-status">
                  <button
                    className={`toggle-btn ${carrier.is_active ? 'active' : ''}`}
                    onClick={() => handleToggleActive(carrier)}
                    title={carrier.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {carrier.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                </div>
              </div>

              <div className="carrier-details">
                <div className="detail-row">
                  <span className="label">Group:</span>
                  <span className="value">{carrier.carrier_group}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Service:</span>
                  <span className={`service-badge ${carrier.service_type}`}>
                    {carrier.service_type}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">Zone Type:</span>
                  <span className="value">{carrier.zone_type === 'standard' ? 'A-F Zones' : 'Regional'}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Rate Cards:</span>
                  <span className="value">{carrier.rate_card_count || 0} / 4</span>
                </div>
              </div>

              {carrier.description && (
                <p className="carrier-description">{carrier.description}</p>
              )}

              <div className="carrier-actions">
                <button
                  className="action-btn edit"
                  onClick={() => handleEdit(carrier)}
                  title="Edit Carrier"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  className="action-btn view-rates"
                  onClick={() => navigate(`/admin/carriers/${carrier._id}/rates`)}
                >
                  View Rates <ChevronRight size={16} />
                </button>
                <button
                  className="action-btn delete"
                  onClick={() => handleDeleteCarrier(carrier)}
                  title="Delete Carrier"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); resetForm(); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCarrier ? 'Edit Carrier' : 'Add New Carrier'}</h2>
              <button className="close-btn" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={editingCarrier ? handleUpdateCarrier : handleCreateCarrier}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Carrier Code *</label>
                  <input
                    type="text"
                    name="carrier_code"
                    value={formData.carrier_code}
                    onChange={handleInputChange}
                    placeholder="e.g., DELHIVERY_SURFACE"
                    required
                    disabled={!!editingCarrier}
                  />
                  <small>Unique identifier (uppercase)</small>
                </div>

                <div className="form-group">
                  <label>Display Name *</label>
                  <input
                    type="text"
                    name="display_name"
                    value={formData.display_name}
                    onChange={handleInputChange}
                    placeholder="e.g., Delhivery Surface"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Carrier Group *</label>
                  <input
                    type="text"
                    name="carrier_group"
                    value={formData.carrier_group}
                    onChange={handleInputChange}
                    placeholder="e.g., DELHIVERY"
                    required
                    disabled={!!editingCarrier}
                  />
                  <small>Parent company name</small>
                </div>

                <div className="form-group">
                  <label>Service Type *</label>
                  <select
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingCarrier}
                  >
                    <option value="surface">Surface</option>
                    <option value="air">Air</option>
                    <option value="premium">Premium</option>
                    <option value="express">Express</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Zone Type</label>
                  <select
                    name="zone_type"
                    value={formData.zone_type}
                    onChange={handleInputChange}
                  >
                    <option value="standard">Standard (Zone A-F)</option>
                    <option value="regional">Regional (City, Metro, etc.)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Weight Slab Type</label>
                  <select
                    name="weight_slab_type"
                    value={formData.weight_slab_type}
                    onChange={handleInputChange}
                  >
                    <option value="option1">Granular (0.25, 0.5, 1kg...)</option>
                    <option value="option2">Simple (5kg, 10kg, 20kg...)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority Order</label>
                  <input
                    type="number"
                    name="priority_order"
                    value={formData.priority_order}
                    onChange={handleInputChange}
                    min="0"
                  />
                  <small>Lower number = higher priority in lists</small>
                </div>

                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Brief description of this carrier service..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingCarrier ? 'Update Carrier' : 'Create Carrier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCarriers;
