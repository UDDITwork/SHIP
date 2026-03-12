import React, { useState, useEffect } from 'react';
import { adminService, AdminClient } from '../services/adminService';
import './AdminOrphanRecovery.css';

interface RecoveryResult {
  awb: string;
  status: 'recovered' | 'already_exists' | 'not_found' | 'failed';
  order_id?: string;
  current_status?: string;
  mapped_status?: string;
  customer?: string;
  error?: string;
}

interface RecoverySummary {
  total: number;
  recovered: number;
  already_exists: number;
  not_found: number;
  failed: number;
}

export const AdminOrphanRecovery: React.FC = () => {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [awbInput, setAwbInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RecoveryResult[] | null>(null);
  const [summary, setSummary] = useState<RecoverySummary | null>(null);
  const [clientName, setClientName] = useState('');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await adminService.getClients({ limit: 500, status: 'active' });
        setClients(response.data.clients);
      } catch (err) {
        console.error('Failed to load clients:', err);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  const parseAWBs = (input: string): string[] => {
    return input
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  const handleRecover = async () => {
    const awbs = parseAWBs(awbInput);

    if (!selectedClient) {
      setError('Please select a client');
      return;
    }
    if (awbs.length === 0) {
      setError('Please enter at least one AWB number');
      return;
    }
    if (awbs.length > 20) {
      setError('Maximum 20 AWBs per request');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setSummary(null);

    try {
      const response = await adminService.recoverOrphanAWBsBulk(awbs, selectedClient);
      setResults(response.results);
      setSummary(response.summary);
      setClientName(response.client);

      // Clear input on success
      if (response.summary.recovered > 0) {
        setAwbInput('');
      }
    } catch (err: any) {
      setError(err.message || 'Recovery failed');
    } finally {
      setLoading(false);
    }
  };

  const statusLabel: Record<string, string> = {
    recovered: 'Recovered',
    already_exists: 'Already Exists',
    not_found: 'Not Found',
    failed: 'Failed'
  };

  return (
    <div className="admin-orphan-recovery">
      <div className="page-header">
        <h1>Recover Orphan AWBs</h1>
        <p className="subtitle">
          Recover orders that exist on Delhivery but are missing from Shipsarthi's database
        </p>
      </div>

      <div className="instructions-card">
        <h3>How it works</h3>
        <p>
          When an order is booked and Delhivery assigns an AWB but the order fails to save in our database
          (e.g., due to a timeout), the AWB becomes "orphaned". This tool fetches the shipment details
          from Delhivery's tracking API and creates the order record in Shipsarthi so it appears on the
          client's dashboard.
        </p>
      </div>

      <div className="recovery-form">
        <h3>Recovery Details</h3>

        <div className="form-group">
          <label>Client *</label>
          <select
            className="client-select"
            value={selectedClient}
            onChange={e => { setSelectedClient(e.target.value); setError(null); }}
            disabled={loadingClients || loading}
          >
            <option value="">
              {loadingClients ? 'Loading clients...' : '-- Select Client --'}
            </option>
            {clients.map(client => (
              <option key={client._id} value={client._id}>
                {client.company_name} ({client.email})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>AWB Numbers *</label>
          <textarea
            className="awb-textarea"
            value={awbInput}
            onChange={e => { setAwbInput(e.target.value); setError(null); }}
            placeholder={'44800710008540\n44800710008551\n44800710008422\n44800710008411'}
            disabled={loading}
          />
          <div className="form-hint">
            One AWB per line, or separate with commas. Maximum 20 per request.
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <button
          className="btn-recover"
          onClick={handleRecover}
          disabled={!selectedClient || !awbInput.trim() || loading}
        >
          {loading ? 'Processing...' : 'Verify & Recover'}
        </button>

        {loading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>Checking each AWB on Delhivery and recovering... This may take a moment.</p>
          </div>
        )}
      </div>

      {summary && results && (
        <div className="results-section">
          <h3>Recovery Results — {clientName}</h3>

          {summary.recovered > 0 && (
            <div className="success-banner">
              Successfully recovered {summary.recovered} order(s). They will now appear on the client's dashboard.
            </div>
          )}

          <div className="results-summary">
            <div className="stat-card">
              <div className="stat-label">Total</div>
              <div className="stat-value">{summary.total}</div>
            </div>
            <div className="stat-card recovered">
              <div className="stat-label">Recovered</div>
              <div className="stat-value">{summary.recovered}</div>
            </div>
            <div className="stat-card exists">
              <div className="stat-label">Already Exist</div>
              <div className="stat-value">{summary.already_exists}</div>
            </div>
            <div className="stat-card not-found">
              <div className="stat-label">Not Found</div>
              <div className="stat-value">{summary.not_found}</div>
            </div>
            {summary.failed > 0 && (
              <div className="stat-card failed">
                <div className="stat-label">Failed</div>
                <div className="stat-value">{summary.failed}</div>
              </div>
            )}
          </div>

          <div className="results-table">
            <table>
              <thead>
                <tr>
                  <th>AWB</th>
                  <th>Status</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={idx}>
                    <td className="awb-cell">{r.awb}</td>
                    <td>
                      <span className={`status-badge ${r.status}`}>
                        {statusLabel[r.status] || r.status}
                      </span>
                    </td>
                    <td>{r.order_id || '—'}</td>
                    <td>{r.customer || '—'}</td>
                    <td>
                      {r.status === 'recovered' && r.mapped_status && `Status: ${r.mapped_status}`}
                      {r.status === 'already_exists' && r.current_status && `Current: ${r.current_status}`}
                      {r.status === 'not_found' && 'AWB not found on Delhivery'}
                      {r.status === 'failed' && (r.error || 'Unknown error')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
