import React, { useState } from 'react';
import './KYCApprovalPanel.css';

interface VerificationHistory {
  action: 'verified' | 'rejected' | 'note_sent';
  staff_id?: string;
  staff_name?: string;
  notes?: string;
  timestamp: string;
}

interface KYCApprovalPanelProps {
  kycStatus: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedDate?: string;
  verificationNotes?: string;
  verificationHistory: VerificationHistory[];
  onVerify: (notes: string) => void;
  onReject: (notes: string) => void;
  onSendNotes: (notes: string) => void;
  loading: boolean;
}

const KYCApprovalPanel: React.FC<KYCApprovalPanelProps> = ({
  kycStatus,
  verifiedBy,
  verifiedDate,
  verificationNotes,
  verificationHistory,
  onVerify,
  onReject,
  onSendNotes,
  loading
}) => {
  const [notes, setNotes] = useState('');

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${day}/${month}/${year}, ${hour12}:${minutes} ${ampm}`;
  };

  const handleVerify = () => {
    if (window.confirm('Are you sure you want to verify this KYC?')) {
      onVerify(notes);
      setNotes('');
    }
  };

  const handleReject = () => {
    if (!notes.trim()) {
      alert('Please provide rejection reason in notes');
      return;
    }
    if (window.confirm('Are you sure you want to reject this KYC?')) {
      onReject(notes);
      setNotes('');
    }
  };

  const handleSendNotes = () => {
    if (!notes.trim()) {
      alert('Please enter notes to send');
      return;
    }
    onSendNotes(notes);
    setNotes('');
  };

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'verified':
        return 'action-verified';
      case 'rejected':
        return 'action-rejected';
      case 'note_sent':
        return 'action-note';
      default:
        return '';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Rejected';
      case 'note_sent':
        return 'Note Sent';
      default:
        return action;
    }
  };

  return (
    <div className="kyc-approval-panel">
      <h2>KYC Verification</h2>

      {/* Current Status */}
      {kycStatus === 'verified' && (
        <div className="status-display verified">
          <div className="status-icon">✓</div>
          <div className="status-content">
            <h3>KYC Verified</h3>
            {verifiedBy && <p className="verified-by">Verified by: {verifiedBy}</p>}
            {verifiedDate && <p className="verified-date">Date: {formatDateTime(verifiedDate)}</p>}
            {verificationNotes && <p className="verification-notes">{verificationNotes}</p>}
          </div>
        </div>
      )}

      {kycStatus === 'rejected' && (
        <div className="status-display rejected">
          <div className="status-icon">✗</div>
          <div className="status-content">
            <h3>KYC Rejected</h3>
            {verifiedBy && <p className="verified-by">Rejected by: {verifiedBy}</p>}
            {verifiedDate && <p className="verified-date">Date: {formatDateTime(verifiedDate)}</p>}
            {verificationNotes && <p className="verification-notes">{verificationNotes}</p>}
          </div>
        </div>
      )}

      {/* Verification History */}
      {verificationHistory && verificationHistory.length > 0 && (
        <div className="verification-history">
          <h3>Verification History</h3>
          <div className="history-list">
            {verificationHistory.map((entry, index) => (
              <div key={index} className="history-item">
                <div className="history-header">
                  <span className={`history-action-badge ${getActionBadgeClass(entry.action)}`}>
                    {getActionLabel(entry.action)}
                  </span>
                  <span className="history-date">{formatDateTime(entry.timestamp)}</span>
                </div>
                {entry.staff_name && (
                  <p className="history-staff">By: {entry.staff_name}</p>
                )}
                {entry.notes && (
                  <p className="history-notes">{entry.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Form */}
      <div className="approval-form">
        <div className="form-group">
          <label htmlFor="kyc-notes">Verification Notes</label>
          <textarea
            id="kyc-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about the verification process, document quality, or reasons for rejection..."
            rows={4}
            disabled={loading}
          />
        </div>

        <div className="button-group">
          <button
            className="btn-verify"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Verify KYC'}
          </button>
          <button
            className="btn-reject"
            onClick={handleReject}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Reject KYC'}
          </button>
          <button
            className="btn-notes"
            onClick={handleSendNotes}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Notes Only'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KYCApprovalPanel;
