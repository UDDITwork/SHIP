import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService, AdminClient } from '../services/adminService';
import { walletService } from '../services/walletService';
import './AdminWalletRecharge.css';

interface WalletRechargeModalProps {
  client: AdminClient;
  isOpen: boolean;
  onClose: () => void;
  onRecharge: (clientId: string, amount: number, type: 'credit' | 'debit', description?: string) => Promise<void>;
  onUpdateLabel: (clientId: string, label: string) => Promise<void>;
}

const WalletRechargeModal: React.FC<WalletRechargeModalProps> = ({
  client,
  isOpen,
  onClose,
  onRecharge,
  onUpdateLabel
}) => {
  const [amount, setAmount] = useState('');
  const [transactionType, setTransactionType] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');
  const [selectedLabel, setSelectedLabel] = useState(client?.user_category || 'Basic User');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  // Reset form when client changes — but never reset loading if a request is in-flight
  useEffect(() => {
    if (!loading) {
      setAmount('');
      setTransactionType('credit');
      setReason('');
      setError(null);
      setSuccess(false);
      setSubmittedKey(null);
    }
  }, [client._id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Block if already submitting
    if (loading) return;

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (parseFloat(amount) < 1) {
      setError('Minimum amount is ₹1');
      return;
    }

    // For debit, validate sufficient balance
    if (transactionType === 'debit' && parseFloat(amount) > (client?.wallet_balance || 0)) {
      setError(`Insufficient balance. Current balance: ₹${client?.wallet_balance || 0}`);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onRecharge(client._id, parseFloat(amount), transactionType, reason.trim() || undefined);
      setSuccess(true);
      setAmount('');
      setReason('');
      setSubmittedKey(Date.now().toString());

      // Show success message for 2 seconds before closing
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleLabelChange = async (newLabel: string) => {
    try {
      await onUpdateLabel(client._id, newLabel);
      setSelectedLabel(newLabel);
    } catch (err: any) {
      setError(err.message || 'Failed to update user label');
    }
  };

  const handleClose = () => {
    setAmount('');
    setTransactionType('credit');
    setReason('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!isOpen || !client) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Wallet Adjustment</h3>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="client-info">
            <h4>{client.company_name}</h4>
            <p>Client ID: {client.client_id}</p>
            <p>Current Balance: ₹{client.wallet_balance || 0}</p>
          </div>

          <form onSubmit={handleSubmit} className="recharge-form">
            <div className="form-group">
              <label htmlFor="transactionType">Transaction Type</label>
              <select
                id="transactionType"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value as 'credit' | 'debit')}
                className="transaction-type-select"
              >
                <option value="credit">Add Money (Credit)</option>
                <option value="debit">Deduct Money (Debit)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="amount">{transactionType === 'credit' ? 'Add' : 'Deduct'} Amount (₹)</label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Enter amount to ${transactionType === 'credit' ? 'add' : 'deduct'}`}
                min="1"
                step="0.01"
                required
              />
              {transactionType === 'debit' && (
                <small className="form-note">
                  Available balance: ₹{client?.wallet_balance || 0}
                </small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="reason">
                Reason/Description
                <span className="optional-badge">(Optional)</span>
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Enter reason for ${transactionType === 'credit' ? 'credit' : 'debit'} (e.g., "Payment adjustment", "Refund for order XYZ", "Penalty for late payment", etc.)`}
                rows={3}
                maxLength={500}
                className="reason-textarea"
              />
              <small className="form-note">
                This reason will be displayed in the client's wallet transactions and billing history.
                {reason.length > 0 && <span className="char-count"> ({reason.length}/500 characters)</span>}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="userLabel">User Category</label>
              <select
                id="userLabel"
                value={selectedLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
                className="label-select"
              >
                <option value="Basic User">Basic User</option>
                <option value="Lite User">Lite User</option>
                <option value="New User">New User</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">✅ Wallet updated successfully! Balance updated.</div>}

            <div className="form-actions">
              <button type="button" onClick={handleClose} className="cancel-btn">
                Cancel
              </button>
              <button type="submit" disabled={loading} className={`submit-btn ${transactionType === 'debit' ? 'debit-btn' : ''}`}>
                {loading ? (transactionType === 'credit' ? 'Adding...' : 'Deducting...') :
                 transactionType === 'credit' ? 'Add to Wallet' : 'Deduct from Wallet'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const AdminWalletRecharge: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<AdminClient | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters and search
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    user_type: '',
    sortBy: 'created_at',
    sortOrder: -1
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalClients: 0,
    hasNext: false,
    hasPrev: false
  });

  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Reset all page state when menu item is clicked again
  const resetPageState = () => {
    setFilters({
      search: '',
      status: '',
      user_type: '',
      sortBy: 'created_at',
      sortOrder: -1
    });
    setPage(1);
    setError(null);
    setSuccessMessage(null);
    setSelectedClient(null);
    setModalOpen(false);
  };

  // Listen for admin-page-reset event from AdminLayout
  useEffect(() => {
    const handlePageReset = (event: CustomEvent) => {
      if (event.detail?.path === '/admin/wallet-recharge') {
        resetPageState();
      }
    };

    window.addEventListener('admin-page-reset', handlePageReset as EventListener);
    return () => {
      window.removeEventListener('admin-page-reset', handlePageReset as EventListener);
    };
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminService.getClients({
        page,
        limit,
        ...filters
      });

      setClients(response.data.clients);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSearch = (searchTerm: string) => {
    setFilters(prev => ({ ...prev, search: searchTerm }));
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleClientClick = (client: AdminClient) => {
    setSelectedClient(client);
    setModalOpen(true);
  };

  const handleRecharge = async (clientId: string, amount: number, type: 'credit' | 'debit', description?: string): Promise<void> => {
    try {
      await adminService.adjustWallet(clientId, amount, type, description);

      // Refresh the clients list to show updated balances
      fetchClients();

      // Trigger wallet balance update for the client (if they're currently logged in)
      try {
        await walletService.refreshBalance();
      } catch (error) {
        console.log('Could not refresh wallet balance (client may not be logged in)');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update wallet');
    }
  };

  const handleUpdateLabel = async (clientId: string, label: string) => {
    try {
      console.log('🏷️ Updating client label:', { clientId, label });
      const response = await adminService.updateClientLabel(clientId, label);
      console.log('🏷️ Label update response:', response);

      // Show success message
      setSuccessMessage(`✅ User category updated to "${label}" successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Refresh the clients list to show updated labels
      await fetchClients();
      console.log('🏷️ Clients list refreshed after label update');
    } catch (err: any) {
      console.error('🏷️ Error updating label:', err);
      setError(err.message || 'Failed to update user label');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedClient(null);
  };

  return (
    <div className="admin-wallet-recharge">
      <div className="page-header">
        <h1>Wallet Recharge</h1>
        <p>Manage client wallet balances and add funds</p>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search clients..."
            value={filters.search}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-controls">
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="pending_verification">Pending Verification</option>
          </select>

          <select
            value={filters.user_type}
            onChange={(e) => handleFilterChange('user_type', e.target.value)}
            className="filter-select"
          >
            <option value="">All Types</option>
            <option value="e-commerce-sellers">E-commerce Sellers</option>
            <option value="direct-to-consumer-brands">D2C Brands</option>
            <option value="manufacturers-wholesalers">Manufacturers</option>
            <option value="corporate-enterprise">Corporate</option>
            <option value="courier-service-providers">Courier Services</option>
            <option value="individual-shippers">Individual Shippers</option>
          </select>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="success-message-global">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="error-message-global">
          {error}
        </div>
      )}

      {/* Clients List */}
      <div className="clients-section">
        {loading ? (
          <div className="loading">Loading clients...</div>
        ) : error ? (
          <div className="error">Error: {error}</div>
        ) : (
          <>
            <div className="clients-table">
              <table>
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Company Name</th>
                    <th>Contact Person</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Current Balance</th>
                    <th>Status</th>
                    <th>Add Label</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client._id}>
                      <td>
                        <span className="client-id">{client.client_id}</span>
                      </td>
                      <td>
                        <div
                          className="company-info clickable"
                          onClick={() => navigate(`/admin/clients/${client._id}/dashboard`)}
                          title="View client dashboard"
                        >
                          <strong>{client.company_name}</strong>
                        </div>
                      </td>
                      <td>{client.your_name}</td>
                      <td>{client.email}</td>
                      <td>{client.phone_number}</td>
                      <td>
                        <span className="wallet-balance">
                          ₹{client.wallet_balance || 0}
                        </span>
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: getStatusColor(client.account_status)
                          }}
                        >
                          {client.account_status?.replace('_', ' ') || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <select
                          value={client.user_category || 'Basic User'}
                          onChange={(e) => handleUpdateLabel(client._id, e.target.value)}
                          className="label-dropdown"
                        >
                          <option value="Basic User">Basic User</option>
                          <option value="Lite User">Lite User</option>
                          <option value="New User">New User</option>
                          <option value="Advanced">Advanced</option>
                        </select>
                      </td>
                      <td>
                        <button
                          onClick={() => handleClientClick(client)}
                          className="recharge-btn"
                        >
                          Recharge
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={!pagination.hasPrev}
                  className="page-btn"
                >
                  Previous
                </button>

                <span className="page-info">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={!pagination.hasNext}
                  className="page-btn"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recharge Modal */}
      {selectedClient && (
        <WalletRechargeModal
          client={selectedClient}
          isOpen={modalOpen}
          onClose={handleCloseModal}
          onRecharge={handleRecharge}
          onUpdateLabel={handleUpdateLabel}
        />
      )}
    </div>
  );
};

// Helper function to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return '#10b981';
    case 'inactive':
      return '#6b7280';
    case 'suspended':
      return '#ef4444';
    case 'pending_verification':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
};

export default AdminWalletRecharge;
