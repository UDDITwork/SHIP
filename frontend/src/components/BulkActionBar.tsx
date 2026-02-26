// Location: frontend/src/components/BulkActionBar.tsx
import React from 'react';
import './BulkActionBar.css';

interface BulkActionBarProps {
  selectedCount: number;
  selectedOrders: string[];
  currentTab: string;
  onBulkAWB: () => void;
  onBulkPickup: () => void;
  onBulkCancel: () => void;
  onBulkLabel: () => void;
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
  // Suppress unused variable warning - selectedOrders may be used in future features
  void _selectedOrders;

  if (selectedCount === 0) return null;

  // Determine which actions are available based on current tab
  const canGenerateAWB = currentTab === 'new';
  const canRequestPickup = currentTab === 'ready_to_ship';
  const canCancel = ['new', 'ready_to_ship', 'pickups_manifests'].includes(currentTab);
  const canPrintLabel = ['ready_to_ship', 'pickups_manifests', 'in_transit', 'out_for_delivery', 'delivered', 'all'].includes(currentTab);
  const canNeedHelp = ['in_transit', 'out_for_delivery'].includes(currentTab);

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
            <button
              className="bulk-action-btn print-label"
              onClick={onBulkLabel}
              title="Print labels for selected orders"
            >
              Print Label
            </button>
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
