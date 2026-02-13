import React, { useState } from 'react';
import { adminService } from '../services/adminService';
import BillingClientList from '../components/BillingClientList';
import InvoiceManagementView from '../components/InvoiceManagementView';
import ManualInvoiceUploadModal from '../components/ManualInvoiceUploadModal';
import './AdminBilling.css';

interface BillingPeriod {
  start_date: string;
  end_date: string;
  cycle_number: number;
  month: number;
  year: number;
}

interface BulkGenerationResult {
  generated: number;
  failed: number;
  errors: Array<{
    client_id: string;
    error: string;
  }>;
}

const AdminBilling: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'generate' | 'invoices'>('generate');
  const [generating, setGenerating] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [generationResult, setGenerationResult] = useState<BulkGenerationResult | null>(null);

  // Manual invoice upload
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const handleGenerateBulkBills = async (clientIds: string[], billingPeriod: BillingPeriod) => {
    try {
      setGenerating(true);
      const response = await adminService.generateBulkBills(clientIds, billingPeriod);

      if (response.success) {
        setGenerationResult(response.data);
        setShowSuccessModal(true);
      } else {
        alert(`Error: ${response.message || 'Failed to generate bills'}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message || 'Failed to generate bulk bills'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleUploadManualInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setShowUploadModal(true);
  };

  const handleUpload = async (file: File, notes: string) => {
    if (!selectedInvoiceId) return;

    try {
      await adminService.uploadManualInvoice(selectedInvoiceId, file, notes);
      alert('Manual invoice uploaded successfully');
      setShowUploadModal(false);
      setSelectedInvoiceId(null);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload invoice');
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setGenerationResult(null);
  };

  return (
    <div className="admin-billing-page">
      <div className="billing-header">
        <div>
          <h1>Billing Management</h1>
          <p>Generate invoices and manage billing for clients</p>
        </div>
      </div>

      <div className="billing-tabs">
        <button
          className={`tab-btn ${activeTab === 'generate' ? 'active' : ''}`}
          onClick={() => setActiveTab('generate')}
        >
          Generate Bills
        </button>
        <button
          className={`tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Invoice Management
        </button>
      </div>

      <div className="billing-content">
        {activeTab === 'generate' ? (
          <BillingClientList
            onGenerateBills={handleGenerateBulkBills}
            generating={generating}
          />
        ) : (
          <InvoiceManagementView
            onUploadManualInvoice={handleUploadManualInvoice}
          />
        )}
      </div>

      {showSuccessModal && generationResult && (
        <div className="modal-overlay" onClick={handleCloseSuccessModal}>
          <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Bulk Bill Generation Complete</h2>
              <button className="close-btn" onClick={handleCloseSuccessModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="success-summary">
                <div className="summary-item success">
                  <span className="summary-label">Successfully Generated</span>
                  <span className="summary-count">{generationResult.generated}</span>
                </div>
                {generationResult.failed > 0 && (
                  <div className="summary-item failed">
                    <span className="summary-label">Failed</span>
                    <span className="summary-count">{generationResult.failed}</span>
                  </div>
                )}
              </div>

              {generationResult.errors.length > 0 && (
                <div className="errors-section">
                  <h3>Errors</h3>
                  <div className="errors-list">
                    {generationResult.errors.map((err, index) => (
                      <div key={index} className="error-item">
                        <strong>{err.client_id}:</strong> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="confirm-btn" onClick={handleCloseSuccessModal}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadModal && selectedInvoiceId && (
        <ManualInvoiceUploadModal
          isOpen={showUploadModal}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedInvoiceId(null);
          }}
          onUpload={handleUpload}
          invoiceId={selectedInvoiceId}
        />
      )}
    </div>
  );
};

export default AdminBilling;
