import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiService } from '../services/api';
import './PaymentConfirmation.css';

interface TransactionDetails {
  transaction_id: string;
  gateway_order_id: string;
  gateway_transaction_id: string;
  gateway_session_id: string;
  gateway_reference_id: string;
  bank_ref_no: string;
  amount: number;
  currency: string;
  status: string;
  payment_status: string;
  payment_method: string;
  payment_method_type: string;
  payment_gateway: string;
  transaction_date: string;
  payment_date: string;
  created_at: string;
  updated_at: string;
  opening_balance: number;
  closing_balance: number;
  transaction_type: string;
  transaction_category: string;
  description: string;
  user_info: {
    name: string;
    email: string;
    phone: string;
  };
  notes: string;
}

const PaymentConfirmation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const orderId = searchParams.get('order_id');
  const status = searchParams.get('status') || 'unknown';

  useEffect(() => {
    const fetchTransactionDetails = async () => {
      if (!orderId) {
        setLoading(false);
        setError('No order ID provided');
        return;
      }

      try {
        const response = await apiService.get<{
          success: boolean;
          data: TransactionDetails;
          message?: string;
        }>(`/billing/wallet/transaction-details/${orderId}`);

        if (response.success && response.data) {
          setTransactionDetails(response.data);
        } else {
          setError(response.message || 'Failed to fetch transaction details');
        }
      } catch (err: unknown) {
        console.error('Error fetching transaction details:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load transaction details';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionDetails();
  }, [orderId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getDayOfWeek = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { weekday: 'long' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      'upi': 'UPI',
      'net_banking': 'Net Banking',
      'credit_card': 'Credit Card',
      'debit_card': 'Debit Card',
      'wallet': 'Wallet',
      'hdfc_smartgateway': 'HDFC SmartGateway',
      'bank_transfer': 'Bank Transfer'
    };
    return methods[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusInfo = () => {
    switch (status) {
      case 'success':
        return {
          icon: '✓',
          title: 'Payment Successful!',
          message: 'Your wallet has been credited successfully.',
          className: 'success'
        };
      case 'failed':
        return {
          icon: '✗',
          title: 'Payment Failed',
          message: transactionDetails?.notes || 'Your payment could not be processed. Please try again.',
          className: 'failed'
        };
      case 'pending':
        return {
          icon: '⏳',
          title: 'Payment Processing',
          message: 'Your payment is being processed. This may take a few minutes.',
          className: 'pending'
        };
      case 'error':
        return {
          icon: '⚠',
          title: 'Error Occurred',
          message: 'An error occurred while processing your payment. Please contact support.',
          className: 'error'
        };
      default:
        return {
          icon: '?',
          title: 'Status Unknown',
          message: 'Unable to determine payment status. Please check your transaction history.',
          className: 'unknown'
        };
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!receiptRef.current) return;

    setDownloadingPdf(true);
    try {
      // Dynamically import html2pdf.js
      const html2pdf = (await import('html2pdf.js')).default;

      const element = receiptRef.current;
      const opt = {
        margin: 10,
        filename: `Shipsarthi_Receipt_${transactionDetails?.transaction_id || orderId}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please use the Print option instead.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const statusInfo = getStatusInfo();

  if (loading) {
    return (
      <Layout>
        <div className="payment-confirmation-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading transaction details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="payment-confirmation-container">
        <div className="receipt-wrapper" ref={receiptRef}>
          {/* Company Header - Visible in Print */}
          <div className="receipt-header print-only">
            <img src="/shipsarthi-logo.png" alt="Shipsarthi" className="company-logo" />
            <div className="company-info">
              <h1>SHIPSARTHI</h1>
              <p>Your Trusted Logistics Partner</p>
              <p className="company-address">
                Email: support@shipsarthi.com | Phone: +91-XXXXXXXXXX
              </p>
            </div>
          </div>

          <div className="receipt-title print-only">
            <h2>PAYMENT RECEIPT</h2>
            <p>Receipt No: {transactionDetails?.transaction_id || 'N/A'}</p>
          </div>

          {/* Status Banner */}
          <div className={`status-banner ${statusInfo.className}`}>
            <div className="status-icon">{statusInfo.icon}</div>
            <div className="status-content">
              <h2>{statusInfo.title}</h2>
              <p>{statusInfo.message}</p>
            </div>
          </div>

          {error && !transactionDetails && (
            <div className="error-banner">
              <p>{error}</p>
              <button onClick={() => navigate('/billing')} className="btn-primary">
                Go to Billing
              </button>
            </div>
          )}

          {transactionDetails && (
            <>
              {/* Transaction Summary */}
              <div className="details-section">
                <h3 className="section-title">Transaction Details</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Transaction ID</span>
                    <span className="detail-value monospace">{transactionDetails.transaction_id}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Order ID (HDFC)</span>
                    <span className="detail-value monospace">{transactionDetails.gateway_order_id || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Gateway TXN ID</span>
                    <span className="detail-value monospace">{transactionDetails.gateway_transaction_id || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Bank Reference No.</span>
                    <span className="detail-value monospace">{transactionDetails.bank_ref_no || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="details-section">
                <h3 className="section-title">Payment Information</h3>
                <div className="details-grid">
                  <div className="detail-item highlight">
                    <span className="detail-label">Amount</span>
                    <span className="detail-value amount">{formatCurrency(transactionDetails.amount)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Payment Method</span>
                    <span className="detail-value">{formatPaymentMethod(transactionDetails.payment_method)}</span>
                  </div>
                  {transactionDetails.payment_method_type && (
                    <div className="detail-item">
                      <span className="detail-label">Payment Type</span>
                      <span className="detail-value">{transactionDetails.payment_method_type}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <span className="detail-label">Payment Gateway</span>
                    <span className="detail-value">{transactionDetails.payment_gateway?.toUpperCase() || 'HDFC'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span className={`detail-value status-badge ${transactionDetails.status}`}>
                      {transactionDetails.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Date & Time */}
              <div className="details-section">
                <h3 className="section-title">Date & Time</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Date</span>
                    <span className="detail-value">{formatDate(transactionDetails.transaction_date)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Time</span>
                    <span className="detail-value">{formatTime(transactionDetails.transaction_date)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Day</span>
                    <span className="detail-value">{getDayOfWeek(transactionDetails.transaction_date)}</span>
                  </div>
                </div>
              </div>

              {/* Wallet Balance Update */}
              {status === 'success' && (
                <div className="details-section balance-section">
                  <h3 className="section-title">Wallet Balance</h3>
                  <div className="balance-grid">
                    <div className="balance-item">
                      <span className="balance-label">Opening Balance</span>
                      <span className="balance-value">{formatCurrency(transactionDetails.opening_balance)}</span>
                    </div>
                    <div className="balance-item add">
                      <span className="balance-label">Amount Added</span>
                      <span className="balance-value">+ {formatCurrency(transactionDetails.amount)}</span>
                    </div>
                    <div className="balance-item total">
                      <span className="balance-label">Closing Balance</span>
                      <span className="balance-value">{formatCurrency(transactionDetails.closing_balance)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* User Details */}
              <div className="details-section">
                <h3 className="section-title">Account Details</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Name</span>
                    <span className="detail-value">{transactionDetails.user_info.name}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{transactionDetails.user_info.email}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Phone</span>
                    <span className="detail-value">{transactionDetails.user_info.phone}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="details-section">
                <h3 className="section-title">Description</h3>
                <p className="description-text">{transactionDetails.description}</p>
              </div>

              {/* Receipt Footer - Print Only */}
              <div className="receipt-footer print-only">
                <p className="footer-note">This is a computer-generated receipt and does not require a signature.</p>
                <p className="footer-timestamp">
                  Generated on: {new Date().toLocaleString('en-IN')}
                </p>
                <p className="footer-company">Thank you for using Shipsarthi!</p>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons - Hidden in Print */}
        <div className="action-buttons no-print">
          <button onClick={handlePrint} className="btn-secondary">
            <span className="btn-icon">🖨️</span>
            Print Receipt
          </button>
          <button
            onClick={handleDownloadPdf}
            className="btn-secondary"
            disabled={downloadingPdf}
          >
            <span className="btn-icon">📥</span>
            {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button onClick={() => navigate('/billing')} className="btn-primary">
            <span className="btn-icon">💰</span>
            Go to Billing
          </button>
          {status === 'success' && (
            <button
              onClick={() => navigate('/billing')}
              className="btn-outline"
            >
              <span className="btn-icon">➕</span>
              Recharge Again
            </button>
          )}
          {(status === 'failed' || status === 'error') && (
            <button
              onClick={() => navigate('/billing')}
              className="btn-warning"
            >
              <span className="btn-icon">🔄</span>
              Try Again
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default PaymentConfirmation;
