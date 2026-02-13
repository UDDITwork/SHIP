import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService } from '../services/adminService';
import DocumentViewer from '../components/DocumentViewer';
import KYCApprovalPanel from '../components/KYCApprovalPanel';
import './AdminKYC.css';

interface KYCDocument {
  _id?: string;
  document_type: string;
  document_status: string;
  file_url: string;
  upload_date: string;
  verification_date?: string;
  mimetype?: string;
  original_filename?: string;
}

interface VerificationHistory {
  action: 'verified' | 'rejected' | 'note_sent';
  staff_id?: string;
  staff_name?: string;
  notes?: string;
  timestamp: string;
}

interface ClientKYCData {
  client: {
    _id: string;
    client_id: string;
    company_name: string;
    your_name: string;
    email: string;
    phone_number: string;
    kyc_status: {
      status: 'pending' | 'verified' | 'rejected';
      verified_date?: string;
      verification_notes?: string;
      verified_by_staff_name?: string;
      verification_history: VerificationHistory[];
    };
  };
  documents: KYCDocument[];
}

const AdminKYC: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [kycData, setKycData] = useState<ClientKYCData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('gst_certificate');
  const [actionLoading, setActionLoading] = useState(false);

  // Document type mapping
  const documentTypes = [
    { key: 'gst_certificate', label: 'GST Certificate', icon: '📄' },
    { key: 'photo', label: 'Photo ID Selfie', icon: '📸', legacyKey: 'photo_selfie' },
    { key: 'pan', label: 'PAN Card', icon: '🆔', legacyKey: 'pan_card' },
    { key: 'aadhar', label: 'Aadhaar Card', icon: '🆔', legacyKey: 'aadhaar_card' }
  ];

  const fetchKYCData = useCallback(async () => {
    if (!clientId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await adminService.getAllKYCDocuments(clientId);
      setKycData(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load KYC data');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchKYCData();
  }, [fetchKYCData]);

  const getDocumentByType = (type: string, legacyType?: string): KYCDocument | null => {
    if (!kycData) return null;

    // Try to find by new type first, then legacy type
    const doc = kycData.documents.find(d => d.document_type === type);
    if (doc) return doc;

    if (legacyType) {
      return kycData.documents.find(d => d.document_type === legacyType) || null;
    }

    return null;
  };

  const handleKYCAction = async (action: 'verify' | 'reject', notes: string) => {
    if (!clientId) return;

    setActionLoading(true);
    setError(null);

    try {
      await adminService.verifyKYC(clientId, action, notes);
      // Show success message
      alert(`KYC ${action === 'verify' ? 'verified' : 'rejected'} successfully!`);
      // Refresh data
      await fetchKYCData();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} KYC`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendNotes = async (notes: string) => {
    if (!clientId) return;

    setActionLoading(true);
    setError(null);

    try {
      await adminService.sendKYCNotes(clientId, notes);
      // Show success message
      alert('Notes sent successfully!');
      // Refresh data
      await fetchKYCData();
    } catch (err: any) {
      setError(err.message || 'Failed to send notes');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-kyc">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading KYC data...</p>
        </div>
      </div>
    );
  }

  if (error && !kycData) {
    return (
      <div className="admin-kyc">
        <div className="error-container">
          <p className="error-message">{error}</p>
          <button onClick={fetchKYCData} className="btn-primary">
            Retry
          </button>
          <button onClick={() => navigate('/admin/clients')} className="btn-secondary">
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  if (!kycData) {
    return (
      <div className="admin-kyc">
        <div className="error-container">
          <p className="error-message">No KYC data found</p>
          <button onClick={() => navigate('/admin/clients')} className="btn-secondary">
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  const { client } = kycData;

  return (
    <div className="admin-kyc">
      {/* Header */}
      <div className="kyc-header">
        <div className="header-left">
          <button className="back-button" onClick={() => navigate('/admin/clients')}>
            ← Back to Clients
          </button>
          <div className="client-info-header">
            <h1>KYC Documents - {client.company_name}</h1>
            <div className="client-badges">
              <span className={`kyc-badge ${client.kyc_status.status}`}>
                KYC: {client.kyc_status.status.toUpperCase()}
              </span>
              <span className="client-id-badge">{client.client_id}</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button
            className="btn-secondary"
            onClick={() => navigate(`/admin/clients/${client._id}/dashboard`)}
          >
            View Dashboard
          </button>
        </div>
      </div>

      {/* Client Info Card */}
      <div className="client-info-card">
        <div className="info-item">
          <span className="info-label">Contact Person</span>
          <span className="info-value">{client.your_name}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Email</span>
          <span className="info-value">{client.email}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Phone</span>
          <span className="info-value">{client.phone_number}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Client ID</span>
          <span className="info-value">{client.client_id}</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Document Tabs */}
      <div className="documents-section">
        <div className="document-tabs">
          {documentTypes.map((docType) => {
            const doc = getDocumentByType(docType.key, docType.legacyKey);
            const hasDocument = !!doc;

            return (
              <button
                key={docType.key}
                className={`tab-button ${activeTab === docType.key ? 'active' : ''} ${hasDocument ? 'has-document' : 'no-document'}`}
                onClick={() => setActiveTab(docType.key)}
              >
                <span className="tab-icon">{docType.icon}</span>
                <span className="tab-label">{docType.label}</span>
                {hasDocument && <span className="tab-indicator">✓</span>}
              </button>
            );
          })}
        </div>

        {/* Document Viewer */}
        <div className="document-content">
          {documentTypes.map((docType) => {
            if (activeTab !== docType.key) return null;

            const doc = getDocumentByType(docType.key, docType.legacyKey);

            if (!doc) {
              return (
                <div key={docType.key} className="document-empty-state">
                  <div className="empty-icon">{docType.icon}</div>
                  <h3>Document Pending</h3>
                  <p>The client has not uploaded {docType.label} yet.</p>
                </div>
              );
            }

            return (
              <DocumentViewer
                key={docType.key}
                url={doc.file_url}
                mimetype={doc.mimetype || 'application/octet-stream'}
                filename={doc.original_filename || `${docType.label}.pdf`}
                documentType={docType.label}
                uploadDate={doc.upload_date}
                status={doc.document_status}
              />
            );
          })}
        </div>
      </div>

      {/* KYC Approval Panel */}
      <KYCApprovalPanel
        kycStatus={client.kyc_status.status}
        verifiedBy={client.kyc_status.verified_by_staff_name}
        verifiedDate={client.kyc_status.verified_date}
        verificationNotes={client.kyc_status.verification_notes}
        verificationHistory={client.kyc_status.verification_history || []}
        onVerify={(notes) => handleKYCAction('verify', notes)}
        onReject={(notes) => handleKYCAction('reject', notes)}
        onSendNotes={handleSendNotes}
        loading={actionLoading}
      />
    </div>
  );
};

export default AdminKYC;
