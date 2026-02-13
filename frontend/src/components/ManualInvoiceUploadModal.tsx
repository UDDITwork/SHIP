import React, { useState } from 'react';
import './ManualInvoiceUploadModal.css';

interface ManualInvoiceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, notes: string) => Promise<void>;
  invoiceId: string;
}

const ManualInvoiceUploadModal: React.FC<ManualInvoiceUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  invoiceId
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      setSelectedFile(null);
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    if (!notes.trim()) {
      setError('Please provide a reason for manual upload');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      await onUpload(selectedFile, notes);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload invoice');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setNotes('');
    setError(null);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content manual-invoice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload Manual Invoice</h2>
          <button className="close-btn" onClick={handleClose} disabled={uploading}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Upload a manually created invoice PDF for this billing period. Please provide a reason for the manual upload.
          </p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-section">
            <label className="form-label">Invoice PDF</label>
            <div className="file-upload-area">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="file-input"
                id="invoice-file"
                disabled={uploading}
              />
              <label htmlFor="invoice-file" className="file-upload-label">
                <svg
                  className="upload-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <span className="upload-text">
                  {selectedFile ? 'Change file' : 'Choose PDF file'}
                </span>
                <span className="upload-hint">Maximum file size: 10MB</span>
              </label>
            </div>

            {selectedFile && (
              <div className="file-preview">
                <svg
                  className="file-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <div className="file-info">
                  <span className="file-name">{selectedFile.name}</span>
                  <span className="file-size">{formatFileSize(selectedFile.size)}</span>
                </div>
                <button
                  className="remove-file-btn"
                  onClick={() => setSelectedFile(null)}
                  disabled={uploading}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="form-section">
            <label className="form-label" htmlFor="notes">
              Reason for Manual Upload *
            </label>
            <textarea
              id="notes"
              className="notes-textarea"
              placeholder="Explain why you're uploading a manual invoice (e.g., corrections, adjustments, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={uploading}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-btn"
            onClick={handleClose}
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            className="upload-btn"
            onClick={handleUpload}
            disabled={!selectedFile || !notes.trim() || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualInvoiceUploadModal;
