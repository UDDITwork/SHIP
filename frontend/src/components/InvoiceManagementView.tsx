import React, { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import { formatDateTime } from '../utils/dateFormat';
import './InvoiceManagementView.css';

interface Invoice {
  _id: string;
  invoice_number: string;
  invoice_date: string;
  user_id: {
    client_id: string;
    company_name: string;
    email: string;
  };
  amounts: {
    grand_total: number;
  };
  payment_status: string;
  status: string;
  documents: {
    invoice_pdf_url?: string;
    excel_shipment_list_url?: string;
    manual_invoice_url?: string;
  };
}

interface InvoiceManagementViewProps {
  onUploadManualInvoice: (invoiceId: string) => void;
}

const InvoiceManagementView: React.FC<InvoiceManagementViewProps> = ({ onUploadManualInvoice }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchClientId, setSearchClientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Summary
  const [summary, setSummary] = useState({
    total_amount: 0,
    paid_amount: 0,
    pending_amount: 0
  });

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    fetchInvoices();
  }, [page, searchClientId, dateFrom, dateTo, statusFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        page,
        limit
      };

      if (searchClientId) params.client_id = searchClientId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (statusFilter) params.status = statusFilter;

      const response = await adminService.getAllInvoices(params);

      setInvoices(response.data.invoices);
      setTotalCount(response.data.pagination.total_count);
      setTotalPages(response.data.pagination.total_pages);
      setSummary(response.data.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchClientId('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('');
    setPage(1);
  };

  const handleViewPDF = (invoice: Invoice) => {
    const pdfUrl = invoice.documents.manual_invoice_url || invoice.documents.invoice_pdf_url;
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else {
      alert('No PDF available for this invoice');
    }
  };

  const handleDownloadExcel = async (invoice: Invoice) => {
    try {
      const response = await adminService.getInvoiceExcel(invoice._id);
      if (response.data.excel_url) {
        window.open(response.data.excel_url, '_blank');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to download Excel');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      pending: { label: 'Pending', className: 'status-pending' },
      paid: { label: 'Paid', className: 'status-paid' },
      overdue: { label: 'Overdue', className: 'status-overdue' },
      partially_paid: { label: 'Partially Paid', className: 'status-partial' },
      disputed: { label: 'Disputed', className: 'status-disputed' }
    };

    const statusInfo = statusMap[status] || { label: status, className: 'status-default' };

    return (
      <span className={`status-badge ${statusInfo.className}`}>
        {statusInfo.label}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="invoice-management-view">
      <div className="filters-section">
        <h3>Filters</h3>
        <div className="filters-row">
          <div className="filter-group">
            <label>Client ID</label>
            <input
              type="text"
              placeholder="Search by Client ID..."
              value={searchClientId}
              onChange={(e) => {
                setSearchClientId(e.target.value);
                setPage(1);
              }}
              className="filter-input"
            />
          </div>
          <div className="filter-group">
            <label>From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="filter-input"
              max={dateTo || undefined}
            />
          </div>
          <div className="filter-group">
            <label>To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="filter-input"
              min={dateFrom || undefined}
            />
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
          <div className="filter-group">
            <button
              className="reset-filters-btn"
              onClick={handleResetFilters}
              disabled={!searchClientId && !dateFrom && !dateTo && !statusFilter}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="summary-section">
        <div className="summary-card">
          <span className="summary-label">Total Amount</span>
          <span className="summary-value">Rs {summary.total_amount.toFixed(2)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Paid Amount</span>
          <span className="summary-value success">Rs {summary.paid_amount.toFixed(2)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Pending Amount</span>
          <span className="summary-value danger">Rs {summary.pending_amount.toFixed(2)}</span>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      <div className="invoices-table-container">
        <div className="table-header">
          <h3>Invoices</h3>
          {loading && <span className="loading-indicator">Loading...</span>}
        </div>

        <div className="table-wrapper">
          <table className="invoices-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Invoice Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="loading-cell">Loading invoices...</td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">No invoices found</td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice._id}>
                    <td className="invoice-number">{invoice.invoice_number}</td>
                    <td>
                      <div className="client-info">
                        <strong>{invoice.user_id.company_name}</strong>
                        <small>{invoice.user_id.client_id}</small>
                      </div>
                    </td>
                    <td>{formatDate(invoice.invoice_date)}</td>
                    <td className="amount">Rs {invoice.amounts.grand_total.toFixed(2)}</td>
                    <td>{getStatusBadge(invoice.payment_status)}</td>
                    <td className="actions-cell">
                      <div className="actions-dropdown">
                        <button
                          className="actions-btn"
                          onClick={() => setOpenDropdown(openDropdown === invoice._id ? null : invoice._id)}
                        >
                          Actions ▾
                        </button>
                        {openDropdown === invoice._id && (
                          <div className="dropdown-menu">
                            <button
                              className="dropdown-item"
                              onClick={() => {
                                handleViewPDF(invoice);
                                setOpenDropdown(null);
                              }}
                            >
                              View PDF
                            </button>
                            <button
                              className="dropdown-item"
                              onClick={() => {
                                handleDownloadExcel(invoice);
                                setOpenDropdown(null);
                              }}
                            >
                              Download Excel
                            </button>
                            <button
                              className="dropdown-item"
                              onClick={() => {
                                onUploadManualInvoice(invoice._id);
                                setOpenDropdown(null);
                              }}
                            >
                              Upload Manual Invoice
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-controls">
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages} • {totalCount} total invoices
          </span>
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceManagementView;
