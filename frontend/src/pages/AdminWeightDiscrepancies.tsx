import React, { useState, useEffect, useCallback } from 'react';
import { environmentConfig } from '../config/environment';
import { formatDateTime } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './AdminWeightDiscrepancies.css';

type ViewMode = 'master' | 'client';

interface WeightDiscrepancy {
  _id: string;
  awb_number: string;
  client_id: {
    _id: string;
    company_name: string;
    email: string;
    phone_number: string;
    client_id?: string;
  };
  order_id: {
    _id: string;
    order_id: string;
    status?: string;
  };
  discrepancy_date: string;
  awb_status: string;
  client_declared_weight: number;
  volumetric_weight: number | null;
  delhivery_updated_weight: number;
  weight_discrepancy: number;
  deduction_amount: number;
  processed: boolean;
  upload_batch_id: string;
  dispute_status: 'NEW' | 'DISPUTE' | 'FINAL WEIGHT';
  action_taken: string | null;
  dispute_raised_at: string | null;
  action_taken_at: string | null;
  ticket_id: { _id: string; ticket_id: string; status?: string } | null;
  updatedAt: string;
}

interface ClientSummaryRow {
  client_id: string;
  client_id_code: string;
  company_name: string;
  email: string;
  phone_number: string;
  all: number;
  new_count: number;
  pending_count: number;
  rejected_count: number;
  total_deduction: number;
  total_refunds: number;
}

interface Financial {
  total_deduction: number;
  total_refunds: number;
}

const adminHeaders = () => ({
  'x-admin-email': localStorage.getItem('admin_email') || '',
  'x-admin-password': localStorage.getItem('admin_password') || 'jpmcA123'
});

const AdminWeightDiscrepancies: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('master');

  // Master table state
  const [discrepancies, setDiscrepancies] = useState<WeightDiscrepancy[]>([]);
  const [total, setTotal] = useState(0);
  const [financial, setFinancial] = useState<Financial>({ total_deduction: 0, total_refunds: 0 });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [disputeStatus, setDisputeStatus] = useState('all');
  const [actionTakenFilter, setActionTakenFilter] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('discrepancy_date');
  const [sortOrder, setSortOrder] = useState('-1');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Client table state
  const [clientSummary, setClientSummary] = useState<ClientSummaryRow[]>([]);
  const [clientFinancial, setClientFinancial] = useState<Financial>({ total_deduction: 0, total_refunds: 0 });
  const [clientLoading, setClientLoading] = useState(false);

  const fetchDiscrepancies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (disputeStatus !== 'all') params.append('dispute_status', disputeStatus);
      if (actionTakenFilter) params.append('action_taken', actionTakenFilter);
      if (clientSearch) params.append('client_search', clientSearch);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);

      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies?${params}`, {
        headers: adminHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDiscrepancies(data.data.discrepancies || []);
        setTotal(data.data.pagination.total || 0);
        setFinancial(data.data.financial || { total_deduction: 0, total_refunds: 0 });
      }
    } catch (error) {
      console.error('Error fetching discrepancies:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, disputeStatus, actionTakenFilter, clientSearch, dateFrom, dateTo, sortBy, sortOrder]);

  const fetchClientSummary = useCallback(async () => {
    setClientLoading(true);
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/client-summary`, {
        headers: adminHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setClientSummary(data.data.clients || []);
        setClientFinancial(data.data.financial || { total_deduction: 0, total_refunds: 0 });
      }
    } catch (error) {
      console.error('Error fetching client summary:', error);
    } finally {
      setClientLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'master') fetchDiscrepancies();
  }, [viewMode, fetchDiscrepancies]);

  useEffect(() => {
    if (viewMode === 'client') fetchClientSummary();
  }, [viewMode, fetchClientSummary]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, disputeStatus, actionTakenFilter, clientSearch, dateFrom, dateTo, sortBy, sortOrder]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      alert('Please upload a valid Excel file (.xlsx, .xls, .csv)');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/bulk-import`, {
        method: 'POST',
        headers: adminHeaders(),
        body: formData
      });
      if (response.ok) {
        const result = await response.json();
        setUploadResult(result.data);
        alert(`Import completed!\nSuccessful: ${result.data.successful}\nFailed: ${result.data.failed}`);
        fetchDiscrepancies();
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleAcceptDispute = async (id: string) => {
    if (!window.confirm('Accept this dispute and refund the amount to client wallet?')) return;
    setProcessingAction(id);
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/${id}/accept-dispute`, {
        method: 'PUT',
        headers: adminHeaders()
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Dispute accepted! ₹${result.data.refund_amount?.toFixed(2)} refunded to client.`);
        fetchDiscrepancies();
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Accept dispute error:', error);
      alert('Failed to accept dispute');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleRejectDispute = async (id: string) => {
    if (!window.confirm('Reject this dispute?')) return;
    setProcessingAction(id);
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/${id}/reject-dispute`, {
        method: 'PUT',
        headers: adminHeaders()
      });
      if (response.ok) {
        alert('Dispute rejected.');
        fetchDiscrepancies();
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Reject dispute error:', error);
      alert('Failed to reject dispute');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleActionChange = (id: string, action: string) => {
    if (action === 'DISPUTE ACCEPTED BY COURIER') handleAcceptDispute(id);
    else if (action === 'DISPUTE REJECTED BY COURIER') handleRejectDispute(id);
  };

  const handleBulkAction = async (action: 'accept' | 'reject') => {
    if (selectedIds.size === 0) return;
    const label = action === 'accept' ? 'accept' : 'reject';
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${selectedIds.size} selected dispute(s)?`)) return;
    setProcessingBulk(true);
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/bulk-action`, {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), action })
      });
      if (response.ok) {
        const result = await response.json();
        alert(`Done! Processed: ${result.data.processed}, Skipped: ${result.data.skipped}`);
        setSelectedIds(new Set());
        fetchDiscrepancies();
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Bulk action error:', error);
      alert('Bulk action failed');
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (selectedIds.size > 0) {
      params.append('ids', Array.from(selectedIds).join(','));
    } else {
      if (search) params.append('search', search);
      if (disputeStatus !== 'all') params.append('dispute_status', disputeStatus);
      if (actionTakenFilter) params.append('action_taken', actionTakenFilter);
      if (clientSearch) params.append('client_search', clientSearch);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
    }
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/export?${params}`, {
        headers: adminHeaders()
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        alert(`Export failed: ${err.message || response.statusText}`);
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `weight_discrepancies_${Date.now()}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed');
    }
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = `${environmentConfig.apiUrl.replace('/api', '')}/public/weight_discrepancy_template.xlsx`;
    link.download = 'Weight_Discrepancy_Template.xlsx';
    link.click();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(discrepancies.map(d => d._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const getActionDisplay = (disc: WeightDiscrepancy) => {
    const status = disc.dispute_status || 'NEW';
    if (status === 'NEW') return <span className="action-placeholder">—</span>;
    if (status === 'DISPUTE' && !disc.action_taken) {
      return (
        <select
          className="action-select"
          value=""
          onChange={(e) => handleActionChange(disc._id, e.target.value)}
          disabled={processingAction === disc._id}
        >
          <option value="">PENDING</option>
          <option value="DISPUTE ACCEPTED BY COURIER">ACCEPT</option>
          <option value="DISPUTE REJECTED BY COURIER">REJECT</option>
        </select>
      );
    }
    return (
      <span className={`action-taken ${disc.action_taken?.includes('ACCEPTED') ? 'accepted' : disc.action_taken?.includes('REJECTED') ? 'rejected' : 'no-action'}`}>
        {disc.action_taken || 'N/A'}
      </span>
    );
  };

  const calcAging = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  const fmtDate = (d: string) => formatDateTime(d);
  const fmtKg = (g: number | null | undefined) => g == null ? '—' : ((g / 1000).toFixed(2) + ' kg');

  // Live AWB status: prefer order's live status over stored awb_status
  const getAwbStatus = (disc: WeightDiscrepancy) =>
    (disc.order_id as any)?.status || disc.awb_status || 'Unknown';

  // Financial boxes for client filter
  const displayFinancial = viewMode === 'client' ? clientFinancial : financial;

  const handleClientRowClick = (clientRow: ClientSummaryRow, filterStatus?: string, filterActionTaken?: string) => {
    setViewMode('master');
    setClientSearch(clientRow.company_name || clientRow.email);
    if (filterStatus && filterStatus !== 'all') setDisputeStatus(filterStatus);
    else setDisputeStatus('all');
    setActionTakenFilter(filterActionTaken || '');
    setPage(1);
  };

  return (
    <div className="admin-weight-discrepancies">
      {/* Header with view toggle */}
      <div className="page-header">
        <div>
          <h1>Weight Discrepancies</h1>
          <p>Manage weight discrepancies and charges</p>
        </div>
        <div className="view-toggle-group">
          <button
            className={`view-toggle-btn ${viewMode === 'master' ? 'active' : ''}`}
            onClick={() => setViewMode('master')}
          >
            Master Table
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'client' ? 'active' : ''}`}
            onClick={() => setViewMode('client')}
          >
            Client Table
          </button>
        </div>
      </div>

      {/* Financial Dashboard Boxes */}
      <div className="financial-dashboard">
        <div className="financial-box deduction">
          <span className="financial-label">Total Extra Deduction</span>
          <span className="financial-value">₹{(displayFinancial.total_deduction || 0).toFixed(2)}</span>
        </div>
        <div className="financial-box refund">
          <span className="financial-label">Total Refunds</span>
          <span className="financial-value">₹{(displayFinancial.total_refunds || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* ==================== MASTER TABLE VIEW ==================== */}
      {viewMode === 'master' && (
        <>
          {/* Upload + Template buttons */}
          <div className="upload-section">
            <div className="upload-controls">
              <div className="upload-box">
                <input
                  type="file"
                  id="file-upload"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                <label htmlFor="file-upload" className="upload-label">
                  {uploading ? 'Uploading...' : '⬆ Upload Excel File'}
                </label>
              </div>
              <button className="btn-outline" onClick={handleDownloadTemplate}>
                ⬇ Download Sample Template
              </button>
              <button className="btn-outline" onClick={handleExport}>
                ⬇ Download Excel Report {selectedIds.size > 0 ? `(${selectedIds.size} selected)` : '(filtered)'}
              </button>
            </div>
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div className={`result-box ${uploadResult.failed === 0 ? 'success' : 'warning'}`}>
              <h3>Upload Results</h3>
              <p>Total: {uploadResult.total} | Successful: {uploadResult.successful} | Failed: {uploadResult.failed}</p>
              {uploadResult.errors?.length > 0 && (
                <details className="error-details">
                  <summary>Errors ({uploadResult.errors.length})</summary>
                  <ul>
                    {uploadResult.errors.map((err: any, idx: number) => (
                      <li key={idx}>Row {err.row}: {err.error} {err.awb ? `(AWB: ${err.awb})` : ''}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="filters-section">
            <input
              type="text"
              placeholder="Search by AWB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input"
            />
            <input
              type="text"
              placeholder="Search by client name / email..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="filter-input"
            />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="filter-input" title="Date from" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="filter-input" title="Date to" />
            <select value={disputeStatus} onChange={(e) => setDisputeStatus(e.target.value)} className="filter-select">
              <option value="all">All Status</option>
              <option value="NEW">NEW</option>
              <option value="DISPUTE">DISPUTE</option>
              <option value="FINAL WEIGHT">FINAL WEIGHT</option>
            </select>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [by, ord] = e.target.value.split(':');
                setSortBy(by);
                setSortOrder(ord);
              }}
              className="filter-select"
            >
              <option value="discrepancy_date:-1">Date: Newest First</option>
              <option value="discrepancy_date:1">Date: Oldest First</option>
              <option value="weight_discrepancy:-1">Weight Diff: High to Low</option>
              <option value="weight_discrepancy:1">Weight Diff: Low to High</option>
            </select>
            {(search || clientSearch || dateFrom || dateTo || disputeStatus !== 'all' || actionTakenFilter) && (
              <button className="btn-clear" onClick={() => {
                setSearch(''); setClientSearch(''); setDateFrom(''); setDateTo(''); setDisputeStatus('all'); setActionTakenFilter('');
              }}>Clear Filters</button>
            )}
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div className="bulk-action-bar">
              <span>{selectedIds.size} row(s) selected</span>
              <button
                className="bulk-btn accept"
                disabled={processingBulk}
                onClick={() => handleBulkAction('accept')}
              >
                ✓ Mark as Accepted
              </button>
              <button
                className="bulk-btn reject"
                disabled={processingBulk}
                onClick={() => handleBulkAction('reject')}
              >
                ✗ Mark as Rejected
              </button>
              <button className="bulk-btn clear" onClick={() => setSelectedIds(new Set())}>
                Clear Selection
              </button>
            </div>
          )}

          {/* Master Table */}
          <div className="table-container">
            {loading ? (
              <div className="loading"><div className="spinner"></div><p>Loading...</p></div>
            ) : (
              <table className="discrepancies-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={discrepancies.length > 0 && selectedIds.size === discrepancies.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th>AWB Number</th>
                    <th>Order ID</th>
                    <th>Client Name</th>
                    <th>Dead Weight</th>
                    <th>Volumetric Weight</th>
                    <th>Charged Weight</th>
                    <th>Weight Difference</th>
                    <th>Extra Deduction</th>
                    <th>AWB Status</th>
                    <th>Dispute Status</th>
                    <th>Ticket ID</th>
                    <th>Aging (Days)</th>
                    <th>Last Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="no-data">No discrepancies found</td>
                    </tr>
                  ) : (
                    discrepancies.map((disc) => {
                      const aging = calcAging(disc.discrepancy_date);
                      const awbStatus = getAwbStatus(disc);
                      const isSelected = selectedIds.has(disc._id);
                      return (
                        <tr key={disc._id} className={isSelected ? 'row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleSelectRow(disc._id, e.target.checked)}
                            />
                          </td>
                          <td className="awb-cell"><AWBLink awb={disc.awb_number} /></td>
                          <td>{disc.order_id?.order_id || 'N/A'}</td>
                          <td>
                            <div className="client-info">
                              <div>{disc.client_id?.company_name || 'N/A'}</div>
                              <div className="client-email">{disc.client_id?.email || ''}</div>
                            </div>
                          </td>
                          <td>{fmtKg(disc.client_declared_weight)}</td>
                          <td>{fmtKg(disc.volumetric_weight)}</td>
                          <td>{fmtKg(disc.delhivery_updated_weight)}</td>
                          <td className="diff-cell">{fmtKg(disc.weight_discrepancy)}</td>
                          <td className="deduction-cell">-₹{(disc.deduction_amount || 0).toFixed(2)}</td>
                          <td>
                            <span className={`status-badge ${awbStatus.toLowerCase().replace(/\s/g, '-')}`}>
                              {awbStatus}
                            </span>
                          </td>
                          <td>
                            <span className={`dispute-status-badge ${(disc.dispute_status || 'NEW').toLowerCase().replace(/\s/g, '-')}`}>
                              {disc.dispute_status || 'NEW'}
                            </span>
                          </td>
                          <td>
                            {disc.ticket_id ? (
                              <span className="ticket-id-badge">{disc.ticket_id.ticket_id}</span>
                            ) : '—'}
                          </td>
                          <td className={aging >= 7 ? 'aging-critical' : aging >= 3 ? 'aging-warn' : ''}>
                            {aging}d
                          </td>
                          <td>{fmtDate(disc.updatedAt)}</td>
                          <td className="action-cell">
                            {getActionDisplay(disc)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!loading && discrepancies.length > 0 && (
            <div className="pagination-section">
              <div className="pagination-info">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
              </div>
              <div className="pagination-nav">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>←</button>
                <span>Page {page} of {Math.ceil(total / limit)}</span>
                <button onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))} disabled={page >= Math.ceil(total / limit)}>→</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== CLIENT TABLE VIEW ==================== */}
      {viewMode === 'client' && (
        <>
          {clientLoading ? (
            <div className="loading"><div className="spinner"></div><p>Loading client summary...</p></div>
          ) : (
            <div className="table-container">
              <table className="discrepancies-table">
                <thead>
                  <tr>
                    <th>Client ID</th>
                    <th>Client Details</th>
                    <th className="numeric">All Discrepancies</th>
                    <th className="numeric">New</th>
                    <th className="numeric">Dispute Pending by Courier</th>
                    <th className="numeric">Dispute Rejected by Courier</th>
                  </tr>
                </thead>
                <tbody>
                  {clientSummary.length === 0 ? (
                    <tr><td colSpan={6} className="no-data">No client data found</td></tr>
                  ) : (
                    clientSummary.map((row) => (
                      <tr key={String(row.client_id)}>
                        <td><span className="client-id-badge">{row.client_id_code || String(row.client_id).slice(-6)}</span></td>
                        <td>
                          <div className="client-info">
                            <div className="client-company">{row.company_name}</div>
                            <div className="client-email">{row.email}</div>
                            {row.phone_number && <div className="client-email">{row.phone_number}</div>}
                          </div>
                        </td>
                        <td className="numeric">
                          <button className="count-btn" onClick={() => handleClientRowClick(row, 'all')}>
                            {row.all}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn new" onClick={() => handleClientRowClick(row, 'NEW')}>
                            {row.new_count}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn dispute" onClick={() => handleClientRowClick(row, 'DISPUTE')}>
                            {row.pending_count}
                          </button>
                        </td>
                        <td className="numeric">
                          <button className="count-btn rejected" onClick={() => handleClientRowClick(row, undefined, 'DISPUTE REJECTED BY COURIER')}>
                            {row.rejected_count}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminWeightDiscrepancies;
