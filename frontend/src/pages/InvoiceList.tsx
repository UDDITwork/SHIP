import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { invoiceService, Invoice, InvoiceFilters } from '../services/invoiceService';
import { formatDate as formatDateUtil } from '../utils/dateFormat';
import './InvoiceList.css';

const InvoiceList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'paid' | 'overdue' | 'all'>('all');
  
  // Tabs - determine from URL
  const getActiveTabFromPath = () => {
    if (location.pathname.includes('/credit-notes')) return 'credit-notes';
    if (location.pathname.includes('/debit-notes')) return 'debit-notes';
    return 'invoices';
  };
  const [activeTab, setActiveTab] = useState<'invoices' | 'credit-notes' | 'debit-notes'>(getActiveTabFromPath());
  
  // Date range picker state
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Update active tab when route changes
  useEffect(() => {
    setActiveTab(getActiveTabFromPath());
  }, [location.pathname]);

  // Set default date range (last 30 days)
  useEffect(() => {
    if (!dateFrom && !dateTo) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      setDateFrom(startDate.toISOString().split('T')[0]);
      setDateTo(endDate.toISOString().split('T')[0]);
    }
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    const operationId = `fetch_invoices_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    console.group(`📋 [${operationId}] InvoiceList.fetchInvoices`);
    console.log('🔍 Fetch Parameters:', {
      '📄 Page': page,
      '📏 Limit': limit,
      '📅 Date From': dateFrom,
      '📅 Date To': dateTo,
      '🏷️ Status Filter': statusFilter,
      '🔍 Search Term': searchTerm
    });
    
    try {
      setLoading(true);
      setError(null);
      
      const filters: InvoiceFilters = {
        page,
        limit,
        start_date: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        end_date: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
        status: statusFilter,
        search: searchTerm || undefined
      };
      
      console.log('📤 Sending Request with Filters:', filters);
      
      const response = await invoiceService.getInvoices(filters);
      
      const duration = Date.now() - startTime;
      
      if (response.success) {
        console.log('✅ Success:', {
          '📊 Invoice Count': response.data.invoices?.length || 0,
          '📄 Total Pages': response.data.pagination?.total_pages || 0,
          '📊 Total Count': response.data.pagination?.total_count || 0,
          '⏱️ Duration': `${duration}ms`
        });
        
        setInvoices(response.data.invoices);
        setTotalPages(response.data.pagination.total_pages);
        setTotalCount(response.data.pagination.total_count);
      } else {
        console.warn('⚠️ Response not successful:', response);
        setError('Failed to fetch invoices - Invalid response');
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      
      console.group(`❌ [${operationId}] InvoiceList.fetchInvoices ERROR`);
      console.error('🚨 Error Details:', {
        'Error Type': err.name,
        'Message': err.message,
        'Status': err.response?.status,
        'Status Text': err.response?.statusText,
        'Response Data': err.response?.data,
        'Error Code': err.code,
        'Network Error': !err.response,
        'Timeout': err.code === 'ECONNABORTED',
        'Duration': `${duration}ms`,
        'Stack Trace': err.stack
      });
      
      // Database sync issue detection
      if (err.response?.status === 503) {
        console.error('🔌 DATABASE SYNC ISSUE DETECTED');
        console.error('📊 Database may be unavailable or initializing');
      }
      
      // Backend connectivity issue
      if (!err.response) {
        console.error('🌐 BACKEND CONNECTIVITY ISSUE');
        console.error('📊 Backend server may be down or unreachable');
      }
      
      // 404 - Route not found
      if (err.response?.status === 404) {
        console.error('🔍 ROUTE NOT FOUND');
        console.error('📊 The API endpoint may not exist or route is misconfigured');
      }
      
      console.groupEnd();
      
      setError(err.message || 'Failed to fetch invoices');
    } finally {
      setLoading(false);
      console.log('🏁 Fetch operation completed');
      console.groupEnd();
    }
  }, [page, limit, dateFrom, dateTo, statusFilter, searchTerm]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Handle invoice click
  const handleInvoiceClick = (invoiceId: string) => {
    navigate(`/invoices/${invoiceId}`);
  };

  // Handle download invoice
  const handleDownloadInvoice = async (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    try {
      await invoiceService.downloadInvoice(invoiceId);
    } catch (err: any) {
      alert(err.message || 'Failed to download invoice');
    }
  };

  // Format date
  const formatDate = (dateString: string) => formatDateUtil(dateString);

  // Format date range display
  const formatDateRange = () => {
    if (dateFrom && dateTo) {
      return `${formatDateUtil(dateFrom)} to ${formatDateUtil(dateTo)}`;
    }
    return 'Select date range';
  };

  // Handle tab change
  const handleTabChange = (tab: 'invoices' | 'credit-notes' | 'debit-notes') => {
    setActiveTab(tab);
    if (tab === 'credit-notes') {
      navigate('/invoices/credit-notes');
    } else if (tab === 'debit-notes') {
      navigate('/invoices/debit-notes');
    } else {
      navigate('/invoices');
    }
  };

  return (
    <Layout>
      <div className="invoice-list-container">
        {/* Header */}
        <div className="invoice-list-header">
          <h1>Invoices</h1>
          <button className="learn-more-btn">
            <span>?</span> Learn More
          </button>
        </div>

        {/* Tabs */}
        <div className="invoice-tabs">
          <button
            className={`invoice-tab ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => handleTabChange('invoices')}
          >
            Invoice List
          </button>
          <button
            className={`invoice-tab ${activeTab === 'credit-notes' ? 'active' : ''}`}
            onClick={() => handleTabChange('credit-notes')}
          >
            Credit Notes
          </button>
          <button
            className={`invoice-tab ${activeTab === 'debit-notes' ? 'active' : ''}`}
            onClick={() => handleTabChange('debit-notes')}
          >
            Debit Notes
          </button>
        </div>

        {/* Filters */}
        <div className="invoice-filters">
          <div className="filter-left">
            <input
              type="text"
              className="search-input"
              placeholder="Search by invoice ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  fetchInvoices();
                }
              }}
            />
          </div>
          <div className="filter-right">
            <button
              className="date-range-badge"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              Date Range : {formatDateRange()}
            </button>
            {showDatePicker && (
              <div className="date-picker-dropdown">
                <div className="date-picker-inputs">
                  <label>
                    From:
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    To:
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </label>
                  <button
                    className="apply-date-btn"
                    onClick={() => {
                      setShowDatePicker(false);
                      setPage(1);
                      fetchInvoices();
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {/* Invoice Table */}
        <div className="invoice-table-container">
          {loading ? (
            <div className="loading-spinner">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              No invoices found for the selected date range
            </div>
          ) : (
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>INVOICE ID</th>
                  <th>INVOICE DATE</th>
                  <th>GST NUMBER</th>
                  <th>SERVICE TYPE</th>
                  <th>INVOICE AMOUNT</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.invoice_id}>
                    <td>
                      <button
                        className="invoice-id-link"
                        onClick={() => handleInvoiceClick(invoice.invoice_id)}
                      >
                        {invoice.invoice_number}
                      </button>
                    </td>
                    <td>{formatDate(invoice.invoice_date)}</td>
                    <td>{invoice.gst_number || 'N/A'}</td>
                    <td>
                      <span className="service-type">
                        🚚 {invoice.service_type}
                      </span>
                    </td>
                    <td className="amount-cell">₹{invoice.amounts.grand_total.toFixed(2)}</td>
                    <td>
                      <button
                        className="download-btn"
                        onClick={(e) => handleDownloadInvoice(e, invoice.invoice_id)}
                      >
                        📥 Download Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default InvoiceList;

