import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService, RateCard } from '../services/adminService';
import './AdminRateCardCategory.css';

const AdminRateCardCategory: React.FC = () => {
  const { userCategory } = useParams<{ userCategory: string }>();
  const navigate = useNavigate();
  const [rateCard, setRateCard] = useState<RateCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedRateCard, setEditedRateCard] = useState<RateCard | null>(null);

  useEffect(() => {
    if (userCategory) {
      fetchRateCard();
    }
  }, [userCategory]);

  const fetchRateCard = async () => {
    try {
      setLoading(true);
      setError(null);
      // Convert URL param back to proper category name
      const categoryName = userCategory
        ?.split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') || '';
      
      const data = await adminService.getRateCard(categoryName);
      setRateCard(data);
      setEditedRateCard(JSON.parse(JSON.stringify(data))); // Deep copy
    } catch (err: any) {
      setError(err.message || 'Failed to load rate card');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedRateCard(JSON.parse(JSON.stringify(rateCard))); // Deep copy for editing
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedRateCard(JSON.parse(JSON.stringify(rateCard))); // Reset to original
  };

  const handleZonePriceChange = (
    type: 'forward' | 'rto' | 'dto',
    slabIndex: number,
    zone: 'A' | 'B' | 'C' | 'D' | 'E' | 'F',
    value: string
  ) => {
    if (!editedRateCard) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue) && value !== '') return;

    const updated = { ...editedRateCard };
    const charges = type === 'forward' ? updated.forwardCharges : type === 'dto' ? (updated.dtoCharges || []) : updated.rtoCharges;
    const updatedCharges = [...charges];
    updatedCharges[slabIndex] = {
      ...updatedCharges[slabIndex],
      zones: {
        ...updatedCharges[slabIndex].zones,
        [zone]: value === '' ? 0 : numValue
      }
    };

    if (type === 'forward') {
      updated.forwardCharges = updatedCharges;
    } else if (type === 'dto') {
      updated.dtoCharges = updatedCharges;
    } else {
      updated.rtoCharges = updatedCharges;
    }

    setEditedRateCard(updated);
  };

  const handleCODChange = (field: 'percentage' | 'minimumAmount', value: string) => {
    if (!editedRateCard) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue) && value !== '') return;

    const updated = { ...editedRateCard };
    updated.codCharges = {
      ...updated.codCharges,
      [field]: value === '' ? 0 : numValue
    };
    setEditedRateCard(updated);
  };

  const handleSave = async () => {
    if (!editedRateCard || !userCategory) return;

    try {
      setSaving(true);
      setError(null);

      const categoryName = userCategory
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const updates = {
        forwardCharges: editedRateCard.forwardCharges,
        rtoCharges: editedRateCard.rtoCharges,
        dtoCharges: editedRateCard.dtoCharges || [],
        codCharges: editedRateCard.codCharges
      };

      await adminService.updateRateCard(categoryName, updates);
      setRateCard(editedRateCard);
      setIsEditing(false);
      
      // Show success message (you can add a toast notification here)
      alert('Rate card updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update rate card');
    } finally {
      setSaving(false);
    }
  };

  const getDisplayCategoryName = () => {
    if (!userCategory) return '';
    return userCategory
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="admin-ratecard-category">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading rate card...</p>
        </div>
      </div>
    );
  }

  if (error && !rateCard) {
    return (
      <div className="admin-ratecard-category">
        <div className="error-container">
          <p>{error}</p>
          <button onClick={() => navigate('/admin/ratecard')}>Back to Categories</button>
        </div>
      </div>
    );
  }

  const displayCard = isEditing && editedRateCard ? editedRateCard : rateCard;

  if (!displayCard) return null;

  return (
    <div className="admin-ratecard-category">
      <div className="admin-header">
        <div className="header-content">
          <div>
            <button className="back-button" onClick={() => navigate('/admin/ratecard')}>
              ← Back
            </button>
            <h1>Rate Card - {getDisplayCategoryName()}</h1>
            <p>Carrier: {displayCard.carrier}</p>
          </div>
          <div className="header-actions">
            {!isEditing ? (
              <button className="edit-button" onClick={handleEdit}>
                ✏️ Edit
              </button>
            ) : (
              <div className="edit-actions">
                <button className="cancel-button" onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
                <button className="save-button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="rate-card-content">
        {/* Forward Charges Table */}
        <div className="charges-section">
          <h3>Slab Condition (Forward Shipping Rates)</h3>
          <div className="table-container">
            <table className="rate-table">
              <thead>
                <tr>
                  <th>Slab Condition</th>
                  <th>Zone A</th>
                  <th>Zone B</th>
                  <th>Zone C</th>
                  <th>Zone D</th>
                  <th>Zone E</th>
                  <th>Zone F</th>
                </tr>
              </thead>
              <tbody>
                {displayCard.forwardCharges.map((slab, index) => (
                  <tr key={index}>
                    <td className="condition-cell">{slab.condition}</td>
                    {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((zone) => (
                      <td key={zone} className={isEditing ? 'editable-cell' : ''}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={slab.zones[zone]}
                            onChange={(e) => handleZonePriceChange('forward', index, zone, e.target.value)}
                            className="price-input"
                            min="0"
                            step="0.01"
                          />
                        ) : (
                          `₹${slab.zones[zone]}`
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DTO Charges Table */}
        <div className="charges-section">
          <h3>DTO (Direct to Origin) Charges</h3>
          <div className="table-container">
            <table className="rate-table">
              <thead>
                <tr>
                  <th>DTO Slab Condition</th>
                  <th>Zone A</th>
                  <th>Zone B</th>
                  <th>Zone C</th>
                  <th>Zone D</th>
                  <th>Zone E</th>
                  <th>Zone F</th>
                </tr>
              </thead>
              <tbody>
                {(displayCard.dtoCharges && displayCard.dtoCharges.length > 0
                  ? displayCard.dtoCharges
                  : displayCard.rtoCharges?.filter(s => s.condition?.startsWith('DTO')) || []
                ).map((slab, index) => (
                  <tr key={index}>
                    <td className="condition-cell">{slab.condition}</td>
                    {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((zone) => (
                      <td key={zone} className={isEditing ? 'editable-cell' : ''}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={slab.zones[zone]}
                            onChange={(e) => handleZonePriceChange('dto', index, zone, e.target.value)}
                            className="price-input"
                            min="0"
                            step="0.01"
                          />
                        ) : (
                          `₹${slab.zones[zone]}`
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RTO Charges Table */}
        <div className="charges-section">
          <h3>RTO (Return to Origin) Charges</h3>
          <div className="table-container">
            <table className="rate-table">
              <thead>
                <tr>
                  <th>RTO Slab Condition</th>
                  <th>Zone A</th>
                  <th>Zone B</th>
                  <th>Zone C</th>
                  <th>Zone D</th>
                  <th>Zone E</th>
                  <th>Zone F</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rtoSlabs = displayCard.rtoCharges?.filter(s => s.condition?.startsWith('RTO')) || [];
                  const defaultRTOSlabs = [
                    { condition: 'RTO 0-250 gm', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
                    { condition: 'RTO 250-500 gm', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
                    { condition: 'RTO Add. 500 gm till 5kg', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
                    { condition: 'RTO Upto 5kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
                    { condition: 'RTO Add. 1 kgs till 10k', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
                    { condition: 'RTO Upto 10 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } },
                    { condition: 'RTO Add. 1 kgs', zones: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 } }
                  ];
                  const slabsToShow = rtoSlabs.length > 0 ? rtoSlabs : defaultRTOSlabs;
                  return slabsToShow.map((slab, index) => (
                    <tr key={index}>
                      <td className="condition-cell">{slab.condition}</td>
                      {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((zone) => (
                        <td key={zone} className={isEditing ? 'editable-cell' : ''}>
                          {isEditing ? (
                            <input
                              type="number"
                              value={slab.zones[zone]}
                              onChange={(e) => handleZonePriceChange('rto', index, zone, e.target.value)}
                              className="price-input"
                              min="0"
                              step="0.01"
                            />
                          ) : (
                            `₹${slab.zones[zone]}`
                          )}
                        </td>
                      ))}
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* COD Charges */}
        <div className="cod-section">
          <h3>COD Charges</h3>
          <div className="cod-info">
            {isEditing ? (
              <div className="cod-inputs">
                <div className="cod-input-group">
                  <label>Percentage:</label>
                  <input
                    type="number"
                    value={displayCard.codCharges.percentage}
                    onChange={(e) => handleCODChange('percentage', e.target.value)}
                    className="cod-input"
                    min="0"
                    step="0.01"
                  />
                  <span>%</span>
                </div>
                <div className="cod-input-group">
                  <label>Minimum Amount:</label>
                  <input
                    type="number"
                    value={displayCard.codCharges.minimumAmount}
                    onChange={(e) => handleCODChange('minimumAmount', e.target.value)}
                    className="cod-input"
                    min="0"
                    step="0.01"
                  />
                  <span>₹</span>
                </div>
                <div className="cod-checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={displayCard.codCharges.gstAdditional}
                      onChange={(e) => {
                        if (editedRateCard) {
                          setEditedRateCard({
                            ...editedRateCard,
                            codCharges: {
                              ...editedRateCard.codCharges,
                              gstAdditional: e.target.checked
                            }
                          });
                        }
                      }}
                    />
                    GST Additional
                  </label>
                </div>
              </div>
            ) : (
              <p>
                {displayCard.codCharges.percentage}% or ₹{displayCard.codCharges.minimumAmount}/- 
                Whichever is Higher {displayCard.codCharges.gstAdditional ? '(GST Additional)' : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRateCardCategory;

