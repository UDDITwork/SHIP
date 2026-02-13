import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import './DocumentViewer.css';

interface DocumentViewerProps {
  url: string;
  mimetype?: string;
  filename?: string;
  openInline?: boolean;
  documentType?: string;
  uploadDate?: string;
  status?: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  url,
  mimetype,
  filename,
  openInline = true,
  documentType,
  uploadDate,
  status
}) => {
  const [loadError, setLoadError] = useState(false);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const isPDF = mimetype?.includes('pdf') || url.toLowerCase().endsWith('.pdf');
  const isImage = mimetype?.startsWith('image/') ||
                  /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);

  const handleOpenInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="document-viewer">
      <div className="document-viewer-header">
        <div className="document-info">
          {documentType && <h3>{documentType}</h3>}
          {filename && <span className="document-filename">{filename}</span>}
        </div>
        <div className="document-meta">
          {uploadDate && (
            <span className="upload-date">Uploaded: {formatDate(uploadDate)}</span>
          )}
          {status && (
            <span className={`status-badge ${status}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          )}
          <button
            className="open-new-tab-button"
            onClick={handleOpenInNewTab}
            title="Open in new tab"
          >
            <ExternalLink size={16} />
            Open in New Tab
          </button>
        </div>
      </div>

      <div className="document-viewer-content">
        {loadError ? (
          <div className="document-unsupported">
            <div className="unsupported-icon">📄</div>
            <p>Unable to display document preview</p>
            <button
              className="view-document-button"
              onClick={handleOpenInNewTab}
            >
              Open in New Tab
            </button>
          </div>
        ) : (
          <>
            {isImage ? (
              <div className="document-image-container">
                <img
                  src={url}
                  alt={filename || documentType || 'Document'}
                  className="document-image"
                  onError={() => setLoadError(true)}
                />
              </div>
            ) : isPDF ? (
              <div className="document-pdf-container">
                <iframe
                  src={url}
                  title={documentType || filename || 'Document'}
                  className="document-pdf-iframe"
                  onError={() => setLoadError(true)}
                />
              </div>
            ) : (
              <div className="document-unsupported">
                <div className="unsupported-icon">📄</div>
                <p>Preview not available for this file type</p>
                <button
                  className="view-document-button"
                  onClick={handleOpenInNewTab}
                >
                  Open Document
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
