import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { invoiceService, InvoiceDetail as InvoiceDetailType } from '../services/invoiceService';
import { formatDate as formatDateUtil } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './InvoiceDetail.css';

const InvoiceDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransactions, setShowTransactions] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusUpdateData, setStatusUpdateData] = useState({
    amount_paid: 0,
    payment_method: 'wallet_deduction' as 'wallet_deduction' | 'bank_transfer' | 'upi' | 'auto_debit' | 'razorpay',
    payment_reference: ''
  });

  const fetchInvoiceDetail = useCallback(async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await invoiceService.getInvoiceDetail(id);
      
      if (response.success) {
        setInvoice(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching invoice detail:', err);
      setError(err.message || 'Failed to fetch invoice details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoiceDetail();
  }, [fetchInvoiceDetail]);

  const handleDownloadInvoice = async () => {
    if (!id) return;
    try {
      await invoiceService.downloadInvoice(id);
    } catch (err: any) {
      alert(err.message || 'Failed to download invoice');
    }
  };

  const handleDownloadTransactionList = async () => {
    if (!id) return;
    try {
      setDownloadingCSV(true);
      await invoiceService.getTransactionList(id, 'csv');
    } catch (err: any) {
      alert(err.message || 'Failed to download transaction list');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!id || !invoice) return;
    
    try {
      setUpdatingStatus(true);
      await invoiceService.updateInvoiceStatus(
        id,
        'paid',
        {
          amount_paid: statusUpdateData.amount_paid || invoice.amounts.grand_total,
          payment_method: statusUpdateData.payment_method,
          payment_reference: statusUpdateData.payment_reference
        }
      );
      
      // Refresh invoice data
      await fetchInvoiceDetail();
      setShowStatusModal(false);
      alert('Invoice status updated successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to update invoice status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatDate = (dateString: string) => formatDateUtil(dateString);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'status-badge paid';
      case 'overdue':
        return 'status-badge overdue';
      case 'pending':
        return 'status-badge pending';
      default:
        return 'status-badge';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="invoice-detail-container">
          <div className="loading-spinner">Loading invoice details...</div>
        </div>
      </Layout>
    );
  }

  if (error || !invoice) {
    return (
      <Layout>
        <div className="invoice-detail-container">
          <div className="error-banner">
            {error || 'Invoice not found'}
          </div>
          <button onClick={() => navigate('/invoices')} className="back-btn">
            ← Back to Invoices
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="invoice-detail-container">
        {/* Back Navigation */}
        <button onClick={() => navigate('/invoices')} className="back-btn">
          ← Invoice Details
        </button>

        {/* Invoice Header */}
        <div className="invoice-header">
          <div className="invoice-header-left">
            <div className="invoice-icon">📄</div>
            <div className="invoice-number">{invoice.invoice_number}</div>
          </div>
          <div className="invoice-header-right">
            <button className="need-help-btn">
              🎧 Need Help?
            </button>
          </div>
        </div>

        {/* Status and Date */}
        <div className="invoice-status-row">
          <span className={getStatusBadgeClass(invoice.payment_status)}>
            {invoice.payment_status.charAt(0).toUpperCase() + invoice.payment_status.slice(1)}
          </span>
          <span className="invoice-date">
            📅 Invoice Date: {formatDate(invoice.invoice_date)}
          </span>
        </div>

        {/* Main Content - Two Columns */}
        <div className="invoice-content-grid">
          {/* Left Column: Invoice Details */}
          <div className="invoice-details-card">
            <div className="card-header">
              <h3>📄 Invoice Details</h3>
              <button className="download-link" onClick={handleDownloadInvoice}>
                Download Invoice
              </button>
            </div>
            <div className="card-body">
              {/* Invoice Amount */}
              <div className="invoice-amount-section">
                <div className={`status-icon ${invoice.payment_status === 'paid' ? 'paid' : 'pending'}`}>
                  {invoice.payment_status === 'paid' ? '✓' : '⚠'}
                </div>
                <div className="amount-label">Invoice Amount</div>
                <div className="amount-value">₹ {invoice.amounts.grand_total.toFixed(2)}</div>
              </div>

              {/* GST Number */}
              <div className="detail-row">
                <span className="detail-label">GST Number:</span>
                <span className="detail-value">{invoice.gst_info?.buyer_gstin || 'N/A'}</span>
              </div>

              {/* Billing Address */}
              <div className="detail-row">
                <span className="detail-label">Billing Address:</span>
                <span className="detail-value">
                  {invoice.billing_address?.address || ''} {invoice.billing_address?.city || ''} {invoice.billing_address?.pincode || ''} {invoice.billing_address?.state || ''}
                </span>
              </div>

              {/* Due Date (if not paid) */}
              {invoice.payment_status !== 'paid' && invoice.due_date && (
                <div className="detail-row">
                  <span className="detail-label">Due Date:</span>
                  <span className="detail-value">{formatDate(invoice.due_date)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Bill Info */}
          <div className="bill-info-card">
            <div className="card-header">
              <h3>📋 Bill Info</h3>
            </div>
            <div className="card-body">
              <div className="bill-item">
                <span className="bill-label">Freight</span>
                <span className="bill-value">₹ {invoice.bill_info.freight.toFixed(2)}</span>
              </div>
              
              {invoice.bill_info.igst_amount > 0 ? (
                <>
                  <div className="bill-item">
                    <span className="bill-label">IGST({invoice.bill_info.igst_rate}%)</span>
                    <span className="bill-value">+ ₹ {invoice.bill_info.igst_amount.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="bill-item">
                    <span className="bill-label">CGST({invoice.bill_info.cgst_rate}%)</span>
                    <span className="bill-value">+ ₹ {invoice.bill_info.cgst_amount.toFixed(2)}</span>
                  </div>
                  <div className="bill-item">
                    <span className="bill-label">SGST({invoice.bill_info.sgst_rate}%)</span>
                    <span className="bill-value">+ ₹ {invoice.bill_info.sgst_amount.toFixed(2)}</span>
                  </div>
                </>
              )}
              
              <div className="bill-item total">
                <span className="bill-label">
                  {invoice.payment_status === 'paid' ? (
                    <>✓ Amount Paid</>
                  ) : (
                    <>Total Amount</>
                  )}
                </span>
                <span className="bill-value">₹ {invoice.bill_info.total_amount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Section */}
        <div className="transaction-section">
          <div className="transaction-section-left">
            <span className="info-icon">ℹ️</span>
            <button
              className="view-transactions-link"
              onClick={() => setShowTransactions(!showTransactions)}
            >
              View invoice charges by transaction
            </button>
          </div>
          <div className="transaction-section-right">
            <button
              className="download-transaction-btn"
              onClick={handleDownloadTransactionList}
              disabled={downloadingCSV}
            >
              {downloadingCSV ? 'Downloading...' : 'Download Transaction list →'}
            </button>
          </div>
        </div>

        {/* Status Update Button (if not paid) */}
        {invoice.payment_status !== 'paid' && (
          <div className="status-update-section">
            <button
              className="update-status-btn"
              onClick={() => {
                setStatusUpdateData({
                  amount_paid: invoice.amounts.grand_total,
                  payment_method: 'wallet_deduction',
                  payment_reference: ''
                });
                setShowStatusModal(true);
              }}
            >
              Mark as Paid
            </button>
          </div>
        )}

        {/* Status Update Modal */}
        {showStatusModal && (
          <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Update Invoice Status</h3>
              <div className="modal-form">
                <label>
                  Amount Paid:
                  <input
                    type="number"
                    value={statusUpdateData.amount_paid}
                    onChange={(e) => setStatusUpdateData({
                      ...statusUpdateData,
                      amount_paid: parseFloat(e.target.value) || 0
                    })}
                    min="0"
                    max={invoice.amounts.grand_total}
                  />
                </label>
                <label>
                  Payment Method:
                  <select
                    value={statusUpdateData.payment_method}
                    onChange={(e) => setStatusUpdateData({
                      ...statusUpdateData,
                      payment_method: e.target.value as any
                    })}
                  >
                    <option value="wallet_deduction">Wallet Deduction</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="auto_debit">Auto Debit</option>
                    <option value="razorpay">Razorpay</option>
                  </select>
                </label>
                <label>
                  Payment Reference (Optional):
                  <input
                    type="text"
                    value={statusUpdateData.payment_reference}
                    onChange={(e) => setStatusUpdateData({
                      ...statusUpdateData,
                      payment_reference: e.target.value
                    })}
                    placeholder="Transaction ID, UPI Reference, etc."
                  />
                </label>
                <div className="modal-actions">
                  <button
                    className="cancel-btn"
                    onClick={() => setShowStatusModal(false)}
                    disabled={updatingStatus}
                  >
                    Cancel
                  </button>
                  <button
                    className="confirm-btn"
                    onClick={handleUpdateStatus}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? 'Updating...' : 'Mark as Paid'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transaction List Table */}
        {showTransactions && invoice.shipment_charges && invoice.shipment_charges.length > 0 && (
          <div className="transaction-table-container">
            <table className="transaction-table">
              <thead>
                <tr>
                  <th>AWB Number</th>
                  <th>Order ID</th>
                  <th>Order Date</th>
                  <th>Delivery Date</th>
                  <th>Status</th>
                  <th>Zone</th>
                  <th>Charged Weight (g)</th>
                  <th>Payment Mode</th>
                  <th>Forward Charge</th>
                  <th>RTO Charge</th>
                  <th>COD Charge</th>
                  <th>Total Charge</th>
                </tr>
              </thead>
              <tbody>
                {invoice.shipment_charges.map((charge, index) => (
                  <tr key={index}>
                    <td><AWBLink awb={charge.awb_number} /></td>
                    <td>{charge.internal_order_id}</td>
                    <td>{charge.order_date ? formatDate(charge.order_date) : 'N/A'}</td>
                    <td>{charge.delivery_date ? formatDate(charge.delivery_date) : 'N/A'}</td>
                    <td>{charge.shipment_status}</td>
                    <td>{charge.zone}</td>
                    <td>{charge.weight?.charged_weight || 0}</td>
                    <td>{charge.payment_mode}</td>
                    <td>₹ {charge.charges.forward_charge.toFixed(2)}</td>
                    <td>₹ {charge.charges.rto_charge.toFixed(2)}</td>
                    <td>₹ {charge.charges.cod_charge.toFixed(2)}</td>
                    <td>₹ {charge.total_charge.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default InvoiceDetail;

