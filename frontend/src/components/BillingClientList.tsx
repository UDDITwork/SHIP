import React, { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import './BillingClientList.css';

interface Client {
  _id: string;
  client_id: string;
  company_name: string;
  user_category?: string;
  wallet_balance: number;
}

interface BillingClientListProps {
  onGenerateBills: (clientIds: string[], billingPeriod: BillingPeriod) => void;
  generating: boolean;
}

interface BillingPeriod {
  start_date: string;
  end_date: string;
  cycle_number: number;
  month: number;
  year: number;
}

const BillingClientList: React.FC<BillingClientListProps> = ({ onGenerateBills, generating }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Billing period
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>({
    start_date: '',
    end_date: '',
    cycle_number: 1,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  useEffect(() => {
    fetchClients();
  }, [page, limit]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getClients({
        page,
        limit,
        status: 'active'
      });

      setClients(response.data.clients);
      setTotalClients(response.data.pagination.totalClients);
      setTotalPages(response.data.pagination.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
    setSelectAll(newSelected.size === clients.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedClients(new Set());
      setSelectAll(false);
    } else {
      const allIds = new Set(clients.map(c => c._id));
      setSelectedClients(allIds);
      setSelectAll(true);
    }
  };

  const handleGenerateBills = () => {
    if (selectedClients.size === 0) {
      alert('Please select at least one client');
      return;
    }

    if (!billingPeriod.start_date || !billingPeriod.end_date) {
      alert('Please select billing period dates');
      return;
    }

    onGenerateBills(Array.from(selectedClients), billingPeriod);
  };

  return (
    <div className="billing-client-list">
      <div className="billing-period-selector">
        <h3>Select Billing Period</h3>
        <div className="period-fields">
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={billingPeriod.start_date}
              onChange={(e) => setBillingPeriod({ ...billingPeriod, start_date: e.target.value })}
              className="date-input"
            />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              value={billingPeriod.end_date}
              onChange={(e) => setBillingPeriod({ ...billingPeriod, end_date: e.target.value })}
              className="date-input"
              min={billingPeriod.start_date}
            />
          </div>
          <div className="form-group">
            <label>Cycle</label>
            <select
              value={billingPeriod.cycle_number}
              onChange={(e) => setBillingPeriod({ ...billingPeriod, cycle_number: parseInt(e.target.value) })}
              className="cycle-select"
            >
              <option value={1}>Cycle 1 (1st-15th)</option>
              <option value={2}>Cycle 2 (16th-End)</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      <div className="clients-table-container">
        <div className="table-controls">
          <div className="pagination-size">
            <label>Show:</label>
            <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          {selectedClients.size > 0 && (
            <div className="action-bar">
              <span className="selected-count">{selectedClients.size} client(s) selected</span>
              <button
                className="generate-bills-btn"
                onClick={handleGenerateBills}
                disabled={generating}
              >
                {generating ? 'Generating...' : `Generate Bills for Selected`}
              </button>
            </div>
          )}
        </div>

        <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="clients-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    disabled={loading || generating}
                  />
                </th>
                <th>Client ID</th>
                <th>Company Name</th>
                <th>User Category</th>
                <th>Wallet Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="loading-cell">Loading clients...</td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-cell">No active clients found</td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client._id}
                    className={selectedClients.has(client._id) ? 'selected' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedClients.has(client._id)}
                        onChange={() => handleSelectClient(client._id)}
                        disabled={generating}
                      />
                    </td>
                    <td>{client.client_id}</td>
                    <td>{client.company_name}</td>
                    <td>
                      <span className="category-badge">
                        {client.user_category || 'Basic User'}
                      </span>
                    </td>
                    <td className="wallet-balance">
                      Rs {client.wallet_balance.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-controls">
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading || generating}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages} • {totalClients} total clients
          </span>
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading || generating}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillingClientList;
