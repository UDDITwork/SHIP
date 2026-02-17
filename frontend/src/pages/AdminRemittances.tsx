import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../services/adminService';
import './AdminRemittances.css';

type TabType = 'upload' | 'master' | 'clients';
type RemittanceState = 'all' | 'upcoming' | 'processing' | 'settled';

interface RemittanceRow {
  _id: string;
  remittance_number: string;
  client_id: string;
  company_name: string;
  date: string;
  remittance_date: string;
  total_remittance: number;
  state: string;
  bank_transaction_id: string;
  total_orders: number;
  settlement_date?: string;
}

interface ClientSummary {
  user_id: string;
  client_name: string;
  client_id: string;
  email: string;
  total_remittance_amount: number;
  total_remittances: number;
  total_orders: number;
  upcoming_count: number;
  upcoming_amount: number;
  processing_count: number;
  processing_amount: number;
  settled_count: number;
  settled_amount: number;
}

interface UploadResult {
  total_rows: number;
  valid: number;
  failed: number;
  remittances_created: number;
  remittances: Array<{
    remittance_number: string;
    client: string;
    client_id: string;
    total_amount: number;
    orders_count: number;
    remittance_date: string;
  }>;
  errors: Array<{ row: number; awb: string; error: string }>;
  error_report_base64?: string;
}

const AdminRemittances: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('master');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Master table state
  const [remittances, setRemittances] = useState<RemittanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<RemittanceState>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });

  // Client summary state
  const [clientSummary, setClientSummary] = useState<ClientSummary[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStateBadge = (state: string) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      upcoming: { bg: '#e3f2fd', color: '#1565c0', label: 'Upcoming' },
      processing: { bg: '#fff3e0', color: '#e65100', label: 'Processing' },
      settled: { bg: '#e8f5e9', color: '#2e7d32', label: 'Settled' }
    };
    const s = styles[state] || { bg: '#f5f5f5', color: '#666', label: state };
    return <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{s.label}</span>;
  };

  // Fetch master table
  const fetchRemittances = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getRemittances({
        page: pagination.page,
        limit: pagination.limit,
        search: searchQuery,
        state: stateFilter === 'all' ? undefined : stateFilter
      });
      if (res.success) {
        setRemittances(res.data.remittances);
        setPagination(prev => ({ ...prev, total: res.data.pagination.total, pages: res.data.pagination.pages }));
      }
    } catch (err: any) {
      console.error('Fetch remittances error:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, stateFilter]);

  // Fetch client summary
  const fetchClientSummary = useCallback(async () => {
    setClientsLoading(true);
    try {
      const res = await adminService.getRemittanceClientSummary();
      if (res.success) {
        setClientSummary(res.data);
      }
    } catch (err: any) {
      console.error('Fetch client summary error:', err);
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'master') fetchRemittances();
    if (activeTab === 'clients') fetchClientSummary();
  }, [activeTab, fetchRemittances, fetchClientSummary]);

  // Upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExts = ['.xlsx', '.xls', '.csv'];
    if (!validExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
      alert('Please upload a valid Excel file (.xlsx, .xls, .csv)');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const result = await adminService.uploadCODRemittance(file);
      if (result.success) {
        setUploadResult(result.data);
      } else {
        throw new Error(result.message || 'Upload failed');
      }
    } catch (error: any) {
      setUploadError(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const downloadErrorReport = () => {
    if (!uploadResult?.error_report_base64) return;
    const byteChars = atob(uploadResult.error_report_base64);
    const byteNumbers = new Array(byteChars.length).fill(0).map((_, i) => byteChars.charCodeAt(i));
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remittance_errors.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  // State actions
  const handleProcess = async (id: string) => {
    if (!window.confirm('Move this remittance to Processing?')) return;
    try {
      await adminService.processRemittance(id);
      fetchRemittances();
    } catch (err: any) {
      alert(err.message || 'Failed to process remittance');
    }
  };

  const handleSettle = async (id: string) => {
    const utr = prompt('Enter Bank Transaction ID / UTR Number:');
    if (!utr) return;
    try {
      await adminService.settleRemittance(id, utr);
      fetchRemittances();
    } catch (err: any) {
      alert(err.message || 'Failed to settle remittance');
    }
  };

  return (
    <div className="admin-remittances">
      <div className="page-header">
        <h1>Remittances</h1>
        <p>Manage COD remittance cycles, upload AWBs, and track settlements</p>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Upload COD AWBs</button>
        <button className={`tab-btn ${activeTab === 'master' ? 'active' : ''}`} onClick={() => setActiveTab('master')}>Master Table</button>
        <button className={`tab-btn ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>Client Summary</button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="tab-content">
          <div className="requirements-section">
            <h3>Required Excel Format</h3>
            <div className="info-box">
              <p><strong>Simple upload:</strong> Only 2 columns needed - <code>AWB Number</code> and <code>Remittance Date</code></p>
              <p>System auto-fetches: Client Name, Order ID, COD Amount, Delivery Date, Bank Details</p>
              <p><strong>Validations:</strong> AWB must exist, order must be Delivered, payment mode must be COD, COD amount &gt; 0, not already remitted</p>
            </div>
          </div>

          <div className="upload-section">
            <div className="upload-box">
              <input type="file" id="file-upload" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={uploading} style={{ display: 'none' }} />
              <label htmlFor="file-upload" className="upload-label">
                {uploading ? <span>Uploading and processing...</span> : <span>Click to upload Excel file (.xlsx, .xls, .csv)</span>}
              </label>
            </div>
          </div>

          {uploadError && <div className="error-box"><h3>Upload Error</h3><p>{uploadError}</p></div>}

          {uploadResult && (
            <div className={`result-box ${uploadResult.failed === 0 ? 'success' : 'warning'}`}>
              <h3>Upload Results</h3>
              <div className="result-stats">
                <div className="stat-item"><span className="stat-label">Total Rows:</span><span className="stat-value">{uploadResult.total_rows}</span></div>
                <div className="stat-item"><span className="stat-label">Valid:</span><span className="stat-value success">{uploadResult.valid}</span></div>
                <div className="stat-item"><span className="stat-label">Failed:</span><span className="stat-value error">{uploadResult.failed}</span></div>
                <div className="stat-item"><span className="stat-label">Remittances Created:</span><span className="stat-value">{uploadResult.remittances_created}</span></div>
              </div>

              {uploadResult.remittances.length > 0 && (
                <details className="details-section" open>
                  <summary>Created Remittances ({uploadResult.remittances.length})</summary>
                  <div className="details-list">
                    {uploadResult.remittances.map((r, idx) => (
                      <div key={idx} className="detail-item">
                        <strong>{r.remittance_number}</strong> - {r.client} ({r.client_id}) - {r.orders_count} orders - {formatCurrency(r.total_amount)} - Date: {formatDate(r.remittance_date)}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {uploadResult.errors.length > 0 && (
                <details className="error-details">
                  <summary>Errors ({uploadResult.errors.length})</summary>
                  {uploadResult.error_report_base64 && (
                    <button className="btn-download-errors" onClick={downloadErrorReport}>Download Error Report</button>
                  )}
                  <ul>
                    {uploadResult.errors.slice(0, 20).map((err, idx) => (
                      <li key={idx}>Row {err.row}: AWB {err.awb || '-'} - {err.error}</li>
                    ))}
                    {uploadResult.errors.length > 20 && <li>...and {uploadResult.errors.length - 20} more</li>}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Master Table Tab */}
      {activeTab === 'master' && (
        <div className="tab-content">
          <div className="filters-row">
            <input
              type="text"
              placeholder="Search remittance number..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="search-input"
            />
            <select value={stateFilter} onChange={e => { setStateFilter(e.target.value as RemittanceState); setPagination(p => ({ ...p, page: 1 })); }} className="state-filter">
              <option value="all">All States</option>
              <option value="upcoming">Upcoming</option>
              <option value="processing">Processing</option>
              <option value="settled">Settled</option>
            </select>
          </div>

          {loading ? (
            <div className="loading-spinner">Loading...</div>
          ) : (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Client ID</th>
                      <th>Remittance No.</th>
                      <th>Remittance Date</th>
                      <th>Amount</th>
                      <th>Orders</th>
                      <th>Status</th>
                      <th>Bank Txn ID</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remittances.length === 0 ? (
                      <tr><td colSpan={9} className="empty-row">No remittances found</td></tr>
                    ) : remittances.map(r => (
                      <tr key={r._id} onClick={() => navigate(`/admin/remittances/${r._id}`)} style={{ cursor: 'pointer' }}>
                        <td>{r.company_name}</td>
                        <td>{r.client_id}</td>
                        <td><strong>{r.remittance_number}</strong></td>
                        <td>{formatDate(r.remittance_date)}</td>
                        <td>{formatCurrency(r.total_remittance)}</td>
                        <td>{r.total_orders}</td>
                        <td>{getStateBadge(r.state)}</td>
                        <td>{r.bank_transaction_id || '-'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {r.state === 'upcoming' && <button className="btn-action btn-process" onClick={() => handleProcess(r._id)}>Process</button>}
                          {r.state === 'processing' && <button className="btn-action btn-settle" onClick={() => handleSettle(r._id)}>Settle</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination.pages > 1 && (
                <div className="pagination">
                  <button disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>Previous</button>
                  <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
                  <button disabled={pagination.page >= pagination.pages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Client Summary Tab */}
      {activeTab === 'clients' && (
        <div className="tab-content">
          {clientsLoading ? (
            <div className="loading-spinner">Loading...</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th>Client ID</th>
                    <th>Total Amount</th>
                    <th>Total Remittances</th>
                    <th>Upcoming</th>
                    <th>Processing</th>
                    <th>Settled</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSummary.length === 0 ? (
                    <tr><td colSpan={7} className="empty-row">No client remittance data found</td></tr>
                  ) : clientSummary.map(c => (
                    <tr key={c.user_id}>
                      <td><strong>{c.client_name}</strong></td>
                      <td>{c.client_id}</td>
                      <td>{formatCurrency(c.total_remittance_amount)}</td>
                      <td>{c.total_remittances}</td>
                      <td>{c.upcoming_count} ({formatCurrency(c.upcoming_amount)})</td>
                      <td>{c.processing_count} ({formatCurrency(c.processing_amount)})</td>
                      <td>{c.settled_count} ({formatCurrency(c.settled_amount)})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRemittances;
