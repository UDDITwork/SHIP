import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService, Carrier, RateCard } from '../services/adminService';
import {
  ArrowLeft,
  Save,
  History,
  Edit2,
  X,
  Check,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import './AdminCarrierRates.css';

interface RatesByCategory {
  'New User': RateCard | null;
  'Lite User': RateCard | null;
  'Basic User': RateCard | null;
  'Advanced': RateCard | null;
}

const CATEGORIES = ['New User', 'Lite User', 'Basic User', 'Advanced'];
const ZONES = ['A', 'B', 'C', 'D', 'E', 'F'];

const AdminCarrierRates: React.FC = () => {
  const { carrierId } = useParams<{ carrierId: string }>();
  const navigate = useNavigate();

  const [carrier, setCarrier] = useState<Carrier | null>(null);
  const [rates, setRates] = useState<RatesByCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('New User');
  const [editMode, setEditMode] = useState(false);
  const [editedRateCard, setEditedRateCard] = useState<RateCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [rateHistory, setRateHistory] = useState<RateCard[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    forward: true,
    rto: true,
    cod: true
  });

  useEffect(() => {
    if (carrierId) {
      fetchCarrierRates();
    }
  }, [carrierId]);

  const fetchCarrierRates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getCarrierRates(carrierId!);
      if (response.success) {
        setCarrier(response.data.carrier);
        setRates(response.data.rates);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch carrier rates');
    } finally {
      setLoading(false);
    }
  };

  const fetchRateHistory = async (category: string) => {
    try {
      const response = await adminService.getCarrierRateHistory(carrierId!, category);
      if (response.success) {
        setRateHistory(response.data.history);
        setShowHistory(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch rate history');
    }
  };

  const handleEditClick = () => {
    const currentRate = rates?.[activeCategory as keyof RatesByCategory];
    if (currentRate) {
      setEditedRateCard(JSON.parse(JSON.stringify(currentRate)));
    } else {
      // Create empty rate card structure
      setEditedRateCard({
        userCategory: activeCategory,
        carrier: carrier?.carrier_code || '',
        forwardCharges: getDefaultWeightSlabs(),
        rtoCharges: getDefaultRTOSlabs(),
        codCharges: {
          percentage: 2,
          minimumAmount: 30,
          gstAdditional: true
        },
        zoneDefinitions: ZONES.map(zone => ({ zone, definition: '' })),
        termsAndConditions: []
      });
    }
    setEditMode(true);
  };

  const getDefaultWeightSlabs = () => [
    { condition: '0-250 gm', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: '250-500 gm', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'Add. 500 gm till 5 kg', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'Upto 5 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'Add. 1 kgs till 10 kg', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'Upto 10 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'Add. 1 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } }
  ];

  const getDefaultRTOSlabs = () => [
    { condition: 'DTO 0-250 gm', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'DTO 250-500 gm', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'DTO Add. 500 gm till 5 kg', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'DTO Upto 5 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'DTO Add. 1 kgs till 10 kg', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'DTO Upto 10 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
    { condition: 'DTO Add. 1 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } }
  ];

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditedRateCard(null);
  };

  const handleSaveRates = async () => {
    if (!editedRateCard || !carrierId) return;

    try {
      setSaving(true);
      setError(null);

      const response = await adminService.saveCarrierRate(carrierId, activeCategory, {
        forwardCharges: editedRateCard.forwardCharges,
        rtoCharges: editedRateCard.rtoCharges,
        codCharges: editedRateCard.codCharges
      });

      if (response.success) {
        setEditMode(false);
        setEditedRateCard(null);
        await fetchCarrierRates();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save rate card');
    } finally {
      setSaving(false);
    }
  };

  const handleZoneChange = (
    type: 'forwardCharges' | 'rtoCharges',
    slabIndex: number,
    zone: string,
    value: string
  ) => {
    if (!editedRateCard) return;

    const numValue = parseFloat(value) || 0;
    const updated = { ...editedRateCard };
    (updated[type][slabIndex].zones as any)[zone] = numValue;
    setEditedRateCard(updated);
  };

  const handleCODChange = (field: keyof RateCard['codCharges'], value: string | boolean) => {
    if (!editedRateCard) return;

    const updated = { ...editedRateCard };
    if (field === 'gstAdditional') {
      updated.codCharges.gstAdditional = value as boolean;
    } else {
      updated.codCharges[field] = parseFloat(value as string) || 0;
    }
    setEditedRateCard(updated);
  };

  const toggleSection = (section: 'forward' | 'rto' | 'cod') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const currentRate = rates?.[activeCategory as keyof RatesByCategory];
  const displayRate = editMode ? editedRateCard : currentRate;

  if (loading) {
    return (
      <div className="admin-carrier-rates">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading carrier rates...</p>
        </div>
      </div>
    );
  }

  if (!carrier) {
    return (
      <div className="admin-carrier-rates">
        <div className="error-container">
          <p>Carrier not found</p>
          <button className="btn-primary" onClick={() => navigate('/admin/carriers')}>
            Back to Carriers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-carrier-rates">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/admin/carriers')}>
          <ArrowLeft size={18} />
          Back to Carriers
        </button>
        <div className="header-info">
          <h1>{carrier.display_name}</h1>
          <span className="carrier-code">{carrier.carrier_code}</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      <div className="category-tabs">
        {CATEGORIES.map(category => (
          <button
            key={category}
            className={`category-tab ${activeCategory === category ? 'active' : ''}`}
            onClick={() => {
              setActiveCategory(category);
              setEditMode(false);
              setEditedRateCard(null);
            }}
          >
            {category}
            {rates?.[category as keyof RatesByCategory] && (
              <span className="rate-indicator"></span>
            )}
          </button>
        ))}
      </div>

      <div className="rate-card-container">
        <div className="rate-card-header">
          <div className="header-left">
            <h2>{activeCategory} Rate Card</h2>
            {currentRate?.version && (
              <span className="version-badge">v{currentRate.version}</span>
            )}
            {currentRate?.effective_from && (
              <span className="effective-date">
                Effective: {new Date(currentRate.effective_from).toLocaleDateString('en-GB')}
              </span>
            )}
          </div>
          <div className="header-actions">
            {!editMode ? (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => fetchRateHistory(activeCategory)}
                >
                  <History size={16} /> View History
                </button>
                <button className="btn-primary" onClick={handleEditClick}>
                  <Edit2 size={16} /> Edit Rates
                </button>
              </>
            ) : (
              <>
                <button className="btn-secondary" onClick={handleCancelEdit}>
                  <X size={16} /> Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSaveRates}
                  disabled={saving}
                >
                  <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </div>

        {!displayRate ? (
          <div className="no-rates">
            <p>No rate card configured for {activeCategory}.</p>
            <button className="btn-primary" onClick={handleEditClick}>
              Create Rate Card
            </button>
          </div>
        ) : (
          <div className="rate-tables">
            {/* Forward Charges Section */}
            <div className="rate-section">
              <div
                className="section-header"
                onClick={() => toggleSection('forward')}
              >
                <h3>Forward Charges</h3>
                {expandedSections.forward ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
              {expandedSections.forward && (
                <div className="table-wrapper">
                  <table className="rate-table">
                    <thead>
                      <tr>
                        <th>Weight Slab</th>
                        {ZONES.map(zone => (
                          <th key={zone}>Zone {zone}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRate.forwardCharges.map((slab, index) => (
                        <tr key={index}>
                          <td className="slab-name">{slab.condition}</td>
                          {ZONES.map(zone => (
                            <td key={zone}>
                              {editMode ? (
                                <input
                                  type="number"
                                  value={(slab.zones as any)[zone] || 0}
                                  onChange={(e) => handleZoneChange('forwardCharges', index, zone, e.target.value)}
                                  min="0"
                                  step="0.01"
                                />
                              ) : (
                                <span className="rate-value">
                                  {(slab.zones as any)[zone] || 0}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RTO Charges Section */}
            <div className="rate-section">
              <div
                className="section-header"
                onClick={() => toggleSection('rto')}
              >
                <h3>RTO / DTO Charges</h3>
                {expandedSections.rto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
              {expandedSections.rto && (
                <div className="table-wrapper">
                  <table className="rate-table">
                    <thead>
                      <tr>
                        <th>Weight Slab</th>
                        {ZONES.map(zone => (
                          <th key={zone}>Zone {zone}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRate.rtoCharges.map((slab, index) => (
                        <tr key={index}>
                          <td className="slab-name">{slab.condition}</td>
                          {ZONES.map(zone => (
                            <td key={zone}>
                              {editMode ? (
                                <input
                                  type="number"
                                  value={(slab.zones as any)[zone] || 0}
                                  onChange={(e) => handleZoneChange('rtoCharges', index, zone, e.target.value)}
                                  min="0"
                                  step="0.01"
                                />
                              ) : (
                                <span className="rate-value">
                                  {(slab.zones as any)[zone] || 0}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* COD Charges Section */}
            <div className="rate-section">
              <div
                className="section-header"
                onClick={() => toggleSection('cod')}
              >
                <h3>COD Charges</h3>
                {expandedSections.cod ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
              {expandedSections.cod && (
                <div className="cod-charges">
                  <div className="cod-field">
                    <label>Percentage (%)</label>
                    {editMode ? (
                      <input
                        type="number"
                        value={displayRate.codCharges.percentage}
                        onChange={(e) => handleCODChange('percentage', e.target.value)}
                        min="0"
                        step="0.1"
                      />
                    ) : (
                      <span>{displayRate.codCharges.percentage}%</span>
                    )}
                  </div>
                  <div className="cod-field">
                    <label>Minimum Amount (INR)</label>
                    {editMode ? (
                      <input
                        type="number"
                        value={displayRate.codCharges.minimumAmount}
                        onChange={(e) => handleCODChange('minimumAmount', e.target.value)}
                        min="0"
                      />
                    ) : (
                      <span>{displayRate.codCharges.minimumAmount}</span>
                    )}
                  </div>
                  <div className="cod-field">
                    <label>GST Additional</label>
                    {editMode ? (
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={displayRate.codCharges.gstAdditional}
                          onChange={(e) => handleCODChange('gstAdditional', e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    ) : (
                      <span>{displayRate.codCharges.gstAdditional ? 'Yes' : 'No'}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rate History Modal */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal-content history-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Rate History - {activeCategory}</h2>
              <button className="close-btn" onClick={() => setShowHistory(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="history-list">
              {rateHistory.length === 0 ? (
                <p className="no-history">No rate history available</p>
              ) : (
                rateHistory.map((rate, index) => (
                  <div key={rate._id || index} className={`history-item ${rate.is_current ? 'current' : ''}`}>
                    <div className="history-header">
                      <span className="version">Version {rate.version || 1}</span>
                      {rate.is_current && <span className="current-badge">Current</span>}
                    </div>
                    <div className="history-dates">
                      <span>From: {rate.effective_from ? new Date(rate.effective_from).toLocaleDateString('en-GB') : 'N/A'}</span>
                      {rate.effective_to && (
                        <span>To: {new Date(rate.effective_to).toLocaleDateString('en-GB')}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCarrierRates;
