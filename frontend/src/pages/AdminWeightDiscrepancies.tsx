import React, { useState, useEffect, useCallback } from 'react';
import { environmentConfig } from '../config/environment';
import './AdminWeightDiscrepancies.css';

interface WeightDiscrepancy {
  _id: string;
  awb_number: string;
  client_id: {
    _id: string;
    company_name: string;
    email: string;
    phone_number: string;
  };
  order_id: {
    _id: string;
    order_id: string;
  };
  discrepancy_date: string;
  awb_status: string;
  client_declared_weight: number;
  delhivery_updated_weight: number;
  weight_discrepancy: number;
  deduction_amount: number;
  processed: boolean;
  upload_batch_id: string;
  dispute_status: 'NEW' | 'DISPUTE' | 'FINAL WEIGHT';
  action_taken: string | null;
  dispute_raised_at: string | null;
  action_taken_at: string | null;
}

const AdminWeightDiscrepancies: React.FC = () => {
  const [discrepancies, setDiscrepancies] = useState<WeightDiscrepancy[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [disputeStatus, setDisputeStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const fetchDiscrepancies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (disputeStatus !== 'all') params.append('dispute_status', disputeStatus);

      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies?${params}`, {
        headers: {
          'x-admin-email': localStorage.getItem('admin_email') || '',
          'x-admin-password': 'jpmcA123'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDiscrepancies(data.data.discrepancies || []);
        setTotal(data.data.pagination.total || 0);
      }
    } catch (error) {
      console.error('Error fetching discrepancies:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, disputeStatus]);

  useEffect(() => {
    fetchDiscrepancies();
  }, [fetchDiscrepancies]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
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
        headers: {
          'x-admin-email': localStorage.getItem('admin_email') || '',
          'x-admin-password': 'jpmcA123'
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        setUploadResult(result.data);
        alert(`Import completed!\nSuccessful: ${result.data.successful}\nFailed: ${result.data.failed}`);
        fetchDiscrepancies(); // Refresh list
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleAcceptDispute = async (id: string) => {
    if (!window.confirm('Accept this dispute and refund the amount to client wallet?')) return;

    setProcessingAction(id);
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/weight-discrepancies/${id}/accept-dispute`, {
        method: 'PUT',
        headers: {
          'x-admin-email': localStorage.getItem('admin_email') || '',
          'x-admin-password': 'jpmcA123'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Dispute accepted! ₹${result.data.refund_amount.toFixed(2)} refunded to client.`);
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
        headers: {
          'x-admin-email': localStorage.getItem('admin_email') || '',
          'x-admin-password': 'jpmcA123'
        }
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
    if (action === 'DISPUTE ACCEPTED BY COURIER') {
      handleAcceptDispute(id);
    } else if (action === 'DISPUTE REJECTED BY COURIER') {
      handleRejectDispute(id);
    }
  };

  const getActionDisplay = (disc: WeightDiscrepancy) => {
    const status = disc.dispute_status || 'NEW';

    if (status === 'NEW') {
      return <span className="action-placeholder">------</span>;
    }

    if (status === 'DISPUTE' && !disc.action_taken) {
      return (
        <select
          className="action-select"
          value=""
          onChange={(e) => handleActionChange(disc._id, e.target.value)}
          disabled={processingAction === disc._id}
        >
          <option value="">PENDING</option>
          <option value="DISPUTE ACCEPTED BY COURIER">DISPUTE ACCEPTED BY COURIER</option>
          <option value="DISPUTE REJECTED BY COURIER">DISPUTE REJECTED BY COURIER</option>
        </select>
      );
    }

    return (
      <span className={`action-taken ${disc.action_taken?.includes('ACCEPTED') ? 'accepted' : disc.action_taken?.includes('REJECTED') ? 'rejected' : 'no-action'}`}>
        {disc.action_taken || 'N/A'}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
           ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="admin-weight-discrepancies">
        {/* Header */}
        <div className="page-header">
          <h1>Weight Discrepancies</h1>
          <p>Manage weight discrepancies and charges</p>
        </div>

        {/* Upload Section */}
        <div className="upload-section">
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
              {uploading ? 'Uploading...' : 'Upload Excel File'}
            </label>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search by AWB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="filter-group">
            <select
              value={disputeStatus}
              onChange={(e) => setDisputeStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="NEW">NEW</option>
              <option value="DISPUTE">DISPUTE</option>
              <option value="FINAL WEIGHT">FINAL WEIGHT</option>
            </select>
          </div>
        </div>

        {/* Results Message */}
        {uploadResult && (
          <div className={`result-box ${uploadResult.failed === 0 ? 'success' : 'warning'}`}>
            <h3>Upload Results</h3>
            <p>Total: {uploadResult.total} | Successful: {uploadResult.successful} | Failed: {uploadResult.failed}</p>
            {uploadResult.errors.length > 0 && (
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

        {/* Discrepancies Table */}
        <div className="table-container">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading...</p>
            </div>
          ) : (
            <table className="discrepancies-table">
              <thead>
                <tr>
                  <th>AWB Number</th>
                  <th>Client</th>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>AWB Status</th>
                  <th>Declared</th>
                  <th>Actual</th>
                  <th>Difference</th>
                  <th>Deduction</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="no-data">No discrepancies found</td>
                  </tr>
                ) : (
                  discrepancies.map((disc) => {
                    const awbStatus = disc.awb_status || 'Unknown';
                    const disputeStatus = disc.dispute_status || 'NEW';
                    return (
                      <tr key={disc._id}>
                        <td className="awb-cell">{disc.awb_number}</td>
                        <td>
                          <div className="client-info">
                            <div>{disc.client_id?.company_name || 'N/A'}</div>
                            <div className="client-email">{disc.client_id?.email || ''}</div>
                          </div>
                        </td>
                        <td>{disc.order_id?.order_id || 'N/A'}</td>
                        <td>{formatDate(disc.discrepancy_date)}</td>
                        <td>
                          <span className={`status-badge ${awbStatus.toLowerCase().replace(' ', '-')}`}>
                            {awbStatus}
                          </span>
                        </td>
                        <td>{(disc.client_declared_weight || 0).toFixed(2)} g</td>
                        <td>{(disc.delhivery_updated_weight || 0).toFixed(2)} g</td>
                        <td className="diff-cell">{(disc.weight_discrepancy || 0).toFixed(2)} g</td>
                        <td className="deduction-cell">-₹{(disc.deduction_amount || 0).toFixed(2)}</td>
                        <td>
                          <span className={`dispute-status-badge ${disputeStatus.toLowerCase().replace(' ', '-')}`}>
                            {disputeStatus}
                          </span>
                        </td>
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
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total}
            </div>
            <div className="pagination-nav">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                ←
              </button>
              <span>Page {page} of {Math.ceil(total / limit)}</span>
              <button onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))} disabled={page >= Math.ceil(total / limit)}>
                →
              </button>
            </div>
          </div>
        )}
    </div>
  );
};

export default AdminWeightDiscrepancies;
