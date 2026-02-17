import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService } from '../services/adminService';
import './AdminRemittances.css';

const AdminRemittanceDetail: React.FC = () => {
  const { remittanceId } = useParams<{ remittanceId: string }>();
  const navigate = useNavigate();
  const [remittance, setRemittance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [addAwbInput, setAddAwbInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = !localStorage.getItem('staff_email');

  const formatCurrency = (amount: number) => `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    return <span style={{ background: s.bg, color: s.color, padding: '6px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: 600 }}>{s.label}</span>;
  };

  const fetchRemittance = async () => {
    if (!remittanceId) return;
    setLoading(true);
    try {
      const res = await adminService.getRemittanceDetail(remittanceId);
      if (res.success) {
        setRemittance(res.data);
      }
    } catch (err: any) {
      console.error('Fetch remittance detail error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRemittance(); }, [remittanceId]);

  const handleAddAwb = async () => {
    if (!addAwbInput.trim()) return;
    setActionLoading(true);
    try {
      await adminService.addAWBToRemittance(remittanceId!, addAwbInput.trim());
      setAddAwbInput('');
      fetchRemittance();
    } catch (err: any) {
      alert(err.message || 'Failed to add AWB');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAwb = async (awb: string) => {
    if (!window.confirm(`Remove AWB ${awb} from this remittance?`)) return;
    setActionLoading(true);
    try {
      const res = await adminService.removeAWBFromRemittance(remittanceId!, awb);
      if (res.deleted) {
        navigate('/admin/remittances');
        return;
      }
      fetchRemittance();
    } catch (err: any) {
      alert(err.message || 'Failed to remove AWB');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!window.confirm('Move this remittance to Processing?')) return;
    try {
      await adminService.processRemittance(remittanceId!);
      fetchRemittance();
    } catch (err: any) {
      alert(err.message || 'Failed to process');
    }
  };

  const handleSettle = async () => {
    const utr = prompt('Enter Bank Transaction ID / UTR Number:');
    if (!utr) return;
    try {
      await adminService.settleRemittance(remittanceId!, utr);
      fetchRemittance();
    } catch (err: any) {
      alert(err.message || 'Failed to settle');
    }
  };

  if (loading) return <div className="admin-remittances"><div className="loading-spinner">Loading...</div></div>;
  if (!remittance) return <div className="admin-remittances"><div className="error-box">Remittance not found</div></div>;

  const user = remittance.user_id || {};
  const canModify = remittance.state !== 'settled';

  return (
    <div className="admin-remittances">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/admin/remittances')}>Back to Remittances</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
          <h1>{remittance.remittance_number}</h1>
          {getStateBadge(remittance.state)}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="detail-cards">
        <div className="detail-card">
          <h3>Remittance Details</h3>
          <div className="card-row"><span>Amount:</span><strong style={{ fontSize: '18px' }}>{formatCurrency(remittance.total_remittance)}</strong></div>
          <div className="card-row"><span>Total Orders:</span><strong>{remittance.total_orders}</strong></div>
          <div className="card-row"><span>Remittance Date:</span><strong>{formatDate(remittance.remittance_date || remittance.date)}</strong></div>
          <div className="card-row"><span>Created:</span><strong>{formatDate(remittance.date)}</strong></div>
          {remittance.bank_transaction_id && <div className="card-row"><span>UTR / Bank Txn ID:</span><strong>{remittance.bank_transaction_id}</strong></div>}
          {remittance.settlement_date && <div className="card-row"><span>Settlement Date:</span><strong>{formatDate(remittance.settlement_date)}</strong></div>}
        </div>

        <div className="detail-card">
          <h3>Client Info</h3>
          <div className="card-row"><span>Company:</span><strong>{user.company_name || '-'}</strong></div>
          <div className="card-row"><span>Client ID:</span><strong>{user.client_id || '-'}</strong></div>
          <div className="card-row"><span>Email:</span><strong>{user.email || '-'}</strong></div>
          <div className="card-row"><span>Phone:</span><strong>{user.phone_number || '-'}</strong></div>
        </div>

        <div className="detail-card">
          <h3>Bank Details</h3>
          <div className="card-row"><span>Bank:</span><strong>{remittance.account_details?.bank || user.bank_details?.bank_name || '-'}</strong></div>
          <div className="card-row"><span>Beneficiary:</span><strong>{remittance.account_details?.beneficiary_name || user.bank_details?.account_holder_name || '-'}</strong></div>
          <div className="card-row"><span>Account:</span><strong>{remittance.account_details?.account_number ? `XXXX${remittance.account_details.account_number.slice(-4)}` : '-'}</strong></div>
          <div className="card-row"><span>IFSC:</span><strong>{remittance.account_details?.ifsc_code || user.bank_details?.ifsc_code || '-'}</strong></div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-bar">
        {remittance.state === 'upcoming' && <button className="btn-action btn-process" onClick={handleProcess}>Move to Processing</button>}
        {remittance.state === 'processing' && <button className="btn-action btn-settle" onClick={handleSettle}>Settle with UTR</button>}
      </div>

      {/* Add AWB (admin only, not settled) */}
      {isAdmin && canModify && (
        <div className="add-awb-section">
          <h3>Add AWB</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Enter AWB number"
              value={addAwbInput}
              onChange={e => setAddAwbInput(e.target.value)}
              className="search-input"
              style={{ flex: 1 }}
            />
            <button className="btn-action btn-process" onClick={handleAddAwb} disabled={actionLoading || !addAwbInput.trim()}>
              {actionLoading ? 'Adding...' : 'Add AWB'}
            </button>
          </div>
        </div>
      )}

      {/* AWB Table */}
      <div className="table-container" style={{ marginTop: '16px' }}>
        <h3>AWB Orders ({remittance.remittance_orders?.length || 0})</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>AWB Number</th>
              <th>Order ID</th>
              <th>Amount Collected</th>
              <th>Delivered Date</th>
              {isAdmin && canModify && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {(remittance.remittance_orders || []).map((order: any, idx: number) => (
              <tr key={idx}>
                <td><strong>{order.awb_number}</strong></td>
                <td>{order.order_reference?.order_id || order.order_id || '-'}</td>
                <td>{formatCurrency(order.amount_collected)}</td>
                <td>{formatDate(order.delivered_date)}</td>
                {isAdmin && canModify && (
                  <td>
                    <button className="btn-action btn-remove" onClick={() => handleRemoveAwb(order.awb_number)} disabled={actionLoading}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminRemittanceDetail;
