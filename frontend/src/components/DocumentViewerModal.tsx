import React, { useState, useEffect, useCallback } from 'react';
import { adminService, ClientDocument } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import './DocumentViewerModal.css';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onKYCUpdate: () => void;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  onKYCUpdate
}) => {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [clientInfo, setClientInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ClientDocument | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminService.getClientDocuments(clientId);
      setDocuments(response.data.documents);
      setClientInfo(response.data.client);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (isOpen && clientId) {
      fetchDocuments();
    }
  }, [isOpen, clientId, fetchDocuments]);

  const handleVerifyKYC = async () => {
    if (!clientInfo) return;
    
    setIsVerifying(true);
    try {
      await adminService.updateClientKYC(
        clientId,
        'verified',
        verificationNotes || 'Documents verified by admin'
      );
      onKYCUpdate();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to verify KYC');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRejectKYC = async () => {
    if (!clientInfo) return;
    
    setIsVerifying(true);
    try {
      await adminService.updateClientKYC(
        clientId,
        'rejected',
        verificationNotes || 'Documents rejected by admin'
      );
      onKYCUpdate();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reject KYC');
    } finally {
      setIsVerifying(false);
    }
  };

  const getDocumentTypeName = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'gst_certificate': 'GST Certificate',
      'photo_selfie': 'Photo/Selfie',
      'pan_card': 'PAN Card',
      'aadhaar_card': 'Aadhaar Card'
    };
    return typeMap[type] || type;
  };

  const getDocumentIcon = (type: string) => {
    const iconMap: { [key: string]: string } = {
      'gst_certificate': '📄',
      'photo_selfie': '📸',
      'pan_card': '🆔',
      'aadhaar_card': '🆔'
    };
    return iconMap[type] || '📄';
  };

  const isImageFile = (url: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageExtensions.some(ext => url.toLowerCase().includes(ext));
  };

  if (!isOpen) return null;

  return (
    <div className="document-viewer-modal-overlay">
      <div className="document-viewer-modal">
        <div className="document-viewer-modal-header">
          <h2>KYC Documents - {clientName}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="document-viewer-modal-content">
          {loading && (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading documents...</p>
            </div>
          )}

          {error && (
            <div className="error-container">
              <p className="error-message">{error}</p>
              <button onClick={fetchDocuments} className="retry-button">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && clientInfo && (
            <>
              <div className="client-info">
                <h3>Client Information</h3>
                <div className="client-details">
                  <p><strong>Client ID:</strong> {clientInfo.client_id}</p>
                  <p><strong>Company:</strong> {clientInfo.company_name}</p>
                  <p><strong>Contact:</strong> {clientInfo.your_name}</p>
                  <p><strong>Email:</strong> {clientInfo.email}</p>
                  <p><strong>KYC Status:</strong> 
                    <span className={`kyc-status ${clientInfo.kyc_status.status}`}>
                      {clientInfo.kyc_status.status.toUpperCase()}
                    </span>
                  </p>
                </div>
              </div>

              <div className="documents-section">
                <h3>Uploaded Documents ({documents.length})</h3>
                {documents.length === 0 ? (
                  <div className="no-documents">
                    <p>No documents uploaded yet.</p>
                  </div>
                ) : (
                  <div className="documents-grid">
                    {documents.map((doc, index) => (
                      <div key={index} className="document-card">
                        <div className="document-header">
                          <span className="document-icon">
                            {getDocumentIcon(doc.type)}
                          </span>
                          <h4>{getDocumentTypeName(doc.type)}</h4>
                        </div>
                        <div className="document-preview">
                          {isImageFile(doc.url) ? (
                            <img 
                              src={doc.url} 
                              alt={doc.name}
                              className="document-image"
                              onClick={() => setSelectedDocument(doc)}
                            />
                          ) : (
                            <div className="document-file">
                              <div className="file-icon">📄</div>
                              <p>{doc.name}</p>
                            </div>
                          )}
                        </div>
                        <div className="document-actions">
                          <button 
                            className="view-button"
                            onClick={() => window.open(doc.url, '_blank')}
                          >
                            View Full Size
                          </button>
                        </div>
                        <div className="document-info">
                          <p><strong>Status:</strong> {doc.status}</p>
                          <p><strong>Uploaded:</strong> {formatDate(doc.uploadedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {documents.length > 0 && (
                <div className="verification-section">
                  <h3>KYC Verification</h3>
                  <div className="verification-notes">
                    <label htmlFor="verification-notes">Verification Notes (Optional):</label>
                    <textarea
                      id="verification-notes"
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      placeholder="Add any notes about the verification process..."
                      rows={3}
                    />
                  </div>
                  <div className="verification-actions">
                    <button 
                      className="verify-button"
                      onClick={handleVerifyKYC}
                      disabled={isVerifying}
                    >
                      {isVerifying ? 'Verifying...' : 'Verify KYC'}
                    </button>
                    <button 
                      className="reject-button"
                      onClick={handleRejectKYC}
                      disabled={isVerifying}
                    >
                      {isVerifying ? 'Rejecting...' : 'Reject KYC'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Full-size document viewer */}
      {selectedDocument && (
        <div className="document-fullscreen-overlay" onClick={() => setSelectedDocument(null)}>
          <div className="document-fullscreen-content" onClick={(e) => e.stopPropagation()}>
            <div className="document-fullscreen-header">
              <h3>{getDocumentTypeName(selectedDocument.type)}</h3>
              <button onClick={() => setSelectedDocument(null)}>×</button>
            </div>
            <div className="document-fullscreen-body">
              {isImageFile(selectedDocument.url) ? (
                <img 
                  src={selectedDocument.url} 
                  alt={selectedDocument.name}
                  className="fullscreen-image"
                />
              ) : (
                <div className="fullscreen-file">
                  <p>This document cannot be previewed in the browser.</p>
                  <a 
                    href={selectedDocument.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="download-link"
                  >
                    Download Document
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentViewerModal;
