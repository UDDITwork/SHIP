// Location: frontend/src/components/BulkActionBar.tsx
import React, { useState } from 'react';
import './BulkActionBar.css';

interface BulkActionBarProps {
  selectedCount: number;
  selectedOrders: string[];
  currentTab: string;
  onBulkAWB: () => void;
  onBulkPickup: () => void;
  onBulkCancel: () => void;
  onBulkLabel: (format: string) => void;
  onBulkNeedHelp?: () => void;
  onClearSelection: () => void;
}

const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  selectedOrders: _selectedOrders,
  currentTab,
  onBulkAWB,
  onBulkPickup,
  onBulkCancel,
  onBulkLabel,
  onBulkNeedHelp,
  onClearSelection
}) => {
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);

  // Suppress unused variable warning - selectedOrders may be used in future features
  void _selectedOrders;

  if (selectedCount === 0) return null;

  // Determine which actions are available based on current tab
  const canGenerateAWB = currentTab === 'new';
  const canRequestPickup = currentTab === 'ready_to_ship';
  const canCancel = ['new', 'ready_to_ship', 'pickups_manifests'].includes(currentTab);
  const canPrintLabel = ['ready_to_ship', 'pickups_manifests', 'in_transit', 'out_for_delivery', 'delivered', 'all'].includes(currentTab);
  const canNeedHelp = ['in_transit', 'out_for_delivery'].includes(currentTab);

  const labelFormats = [
    { id: 'thermal', name: 'Thermal (4" x 6")' },
    { id: 'standard', name: 'Standard (4" x 6")' },
    { id: '2in1', name: '2-in-1 (A4 Paper)' },
    { id: '4in1', name: '4-in-1 (A4 Paper)' }
  ];

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-bar-content">
        <div className="selection-info">
          <span className="selection-count">{selectedCount} order{selectedCount > 1 ? 's' : ''} selected</span>
        </div>

        <div className="bulk-actions">
          {canGenerateAWB && (
            <button
              className="bulk-action-btn generate-awb"
              onClick={onBulkAWB}
              title="Generate AWB for selected orders"
            >
              Generate AWB
            </button>
          )}

          {canRequestPickup && (
            <button
              className="bulk-action-btn request-pickup"
              onClick={onBulkPickup}
              title="Request pickup for selected orders"
            >
              Create Pickup
            </button>
          )}

          {canCancel && (
            <button
              className="bulk-action-btn cancel"
              onClick={onBulkCancel}
              title="Cancel selected orders"
            >
              Cancel
            </button>
          )}

          {canPrintLabel && (
            <div className="label-dropdown-container">
              <button
                className="bulk-action-btn print-label"
                onClick={() => setShowLabelDropdown(!showLabelDropdown)}
                title="Print labels for selected orders"
              >
                Print Label
                <span className="dropdown-arrow">o</span>
              </button>

              {showLabelDropdown && (
                <div className="label-dropdown">
                  {labelFormats.map(format => (
                    <button
                      key={format.id}
                      className="label-format-option"
                      onClick={() => {
                        onBulkLabel(format.id);
                        setShowLabelDropdown(false);
                      }}
                    >
                      {format.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {canNeedHelp && onBulkNeedHelp && (
            <button
              className="bulk-action-btn need-help"
              onClick={onBulkNeedHelp}
              title="Get help for selected orders"
            >
              Need Help
            </button>
          )}
        </div>

        <button
          className="clear-selection-btn"
          onClick={onClearSelection}
          title="Clear selection"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default BulkActionBar;
