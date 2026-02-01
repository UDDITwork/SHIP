import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminService } from '../services/adminService';
import { formatDateTime } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './AdminBilling.css';

interface BillingClientRow {
  _id: string;
  client_id: string;
  company_name: string;
  email: string;
  your_name: string;
  wallet_balance: number;
  total_credits: number;
  total_debits: number;
}

interface BillingListPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface ClientBillingDetails {
  _id: string;
  client_id: string;
  company_name: string;
  email: string;
  your_name: string;
  phone_number: string;
}

interface WalletBalanceSummary {
  available_balance: number;
  pending_credits: number;
  pending_debits: number;
  effective_balance: number;
  currency: string;
}

interface WalletTransaction {
  transaction_id: string;
  transaction_type: 'credit' | 'debit';
  transaction_category?: string;
  amount: number;
  description: string;
  status: string;
  transaction_date: string;
  account_name: string;
  account_email: string;
  order_id: string;
  awb_number: string;
  weight: number | null;
  zone: string;
  closing_balance: number;
  // Staff/Admin who performed the transaction (for manual adjustments)
  performed_by?: {
    name: string;
    email: string;
    role: 'admin' | 'staff' | 'system';
  } | null;
  created_by?: string;
}

interface WalletTransactionSummary {
  current_balance: number;
  total_credits: number;
  total_debits: number;
}

interface WalletTransactionPagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
}

const LIST_PAGE_SIZE = 10;
const TRANSACTION_PAGE_SIZE = 25;

const AdminBilling: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  // List view state
  const [clients, setClients] = useState<BillingClientRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPagination, setListPagination] = useState<BillingListPagination>({
    page: 1,
    limit: LIST_PAGE_SIZE,
    total: 0,
    pages: 1
  });

  // Monthly billing generation state
  const [showMonthlyBillingModal, setShowMonthlyBillingModal] = useState(false);
  const [billingMonth, setBillingMonth] = useState('');
  const [billingYear, setBillingYear] = useState(new Date().getFullYear().toString());
  const [generatingBilling, setGeneratingBilling] = useState(false);

  // Detail view state
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [clientDetails, setClientDetails] = useState<ClientBillingDetails | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletBalanceSummary | null>(null);

  // Transactions state
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [transactionsSummary, setTransactionsSummary] = useState<WalletTransactionSummary | null>(null);
  const [transactionsPagination, setTransactionsPagination] = useState<WalletTransactionPagination>({
    current_page: 1,
    total_pages: 1,
    total_count: 0,
    per_page: TRANSACTION_PAGE_SIZE
  });
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionType, setTransactionType] = useState<'all' | 'credit' | 'debit'>('all');
  const [transactionDateFrom, setTransactionDateFrom] = useState('');
  const [transactionDateTo, setTransactionDateTo] = useState('');
  const [transactionSearchAWB, setTransactionSearchAWB] = useState('');

  const filteredTransactions = useMemo(() => {
    if (!transactionSearchAWB.trim()) {
      return transactions;
    }
    const term = transactionSearchAWB.trim().toLowerCase();
    return transactions.filter((txn) =>
      txn.awb_number?.toLowerCase().includes(term) ||
      txn.order_id?.toLowerCase().includes(term)
    );
  }, [transactions, transactionSearchAWB]);

  const resetTransactionFilters = () => {
    setTransactionType('all');
    setTransactionDateFrom('');
    setTransactionDateTo('');
    setTransactionSearchAWB('');
    setTransactionsPage(1);
  };

  const handleGenerateMonthlyBilling = async () => {
    if (!billingMonth || !billingYear) {
      alert('Please select both month and year');
      return;
    }

    const confirmMessage = `This will generate monthly billing for ${getMonthName(parseInt(billingMonth))} ${billingYear}. Continue?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setGeneratingBilling(true);
    try {
      const response = await adminService.generateMonthlyBilling({
        month: parseInt(billingMonth),
        year: parseInt(billingYear)
      });

      if (response.success) {
        alert(`Monthly billing generated successfully!\n\nProcessed: ${response.data?.processed || 0} clients\nTotal amount: Rs ${response.data?.totalAmount?.toFixed(2) || '0.00'}`);
        setShowMonthlyBillingModal(false);
        setBillingMonth('');
      } else {
        alert(`Error: ${response.message || 'Failed to generate billing'}`);
      }
    } catch (error: any) {
      alert(`Error: ${error?.message || 'Failed to generate monthly billing'}`);
    } finally {
      setGeneratingBilling(false);
    }
  };

  const getMonthName = (monthNum: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1] || '';
  };

  // Reset all page state when menu item is clicked again
  const resetPageState = () => {
    // Reset list view state
    setListSearch('');
    setListPage(1);
    setListError(null);
    // Reset transaction filters
    resetTransactionFilters();
    // Reset detail view state
    setClientDetails(null);
    setWalletSummary(null);
    setTransactions([]);
    setDetailsError(null);
    setTransactionsError(null);
    // Navigate to base billing page if on a client detail page
    if (clientId) {
      navigate('/admin/billing');
    }
  };

  // Listen for admin-page-reset event from AdminLayout
  useEffect(() => {
    const handlePageReset = (event: CustomEvent) => {
      if (event.detail?.path === '/admin/billing') {
        resetPageState();
      }
    };

    window.addEventListener('admin-page-reset', handlePageReset as EventListener);
    return () => {
      window.removeEventListener('admin-page-reset', handlePageReset as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Fetch billing clients list (list view)
  useEffect(() => {
    if (clientId) {
      return;
    }

    let isMounted = true;
    const fetchClients = async () => {
      setListLoading(true);
      setListError(null);
      try {
        const response = await adminService.getBillingClients({
          page: listPage,
          limit: LIST_PAGE_SIZE,
          search: listSearch.trim() || undefined
        });

        if (!isMounted) return;

        const responseData = response?.data;
        setClients(responseData?.clients ?? []);
        if (responseData?.pagination) {
          setListPagination(responseData.pagination);
        } else {
          setListPagination({
            page: listPage,
            limit: LIST_PAGE_SIZE,
            total: responseData?.clients?.length ?? 0,
            pages: 1
          });
        }
      } catch (error: any) {
        if (!isMounted) return;
        setListError(error?.message || 'Failed to fetch billing clients.');
        setClients([]);
      } finally {
        if (isMounted) {
          setListLoading(false);
        }
      }
    };

    fetchClients();

    return () => {
      isMounted = false;
    };
  }, [clientId, listPage, listSearch]);

  // Fetch client billing details and wallet balance (detail view)
  useEffect(() => {
    if (!clientId) {
      return;
    }

    let isMounted = true;
    const fetchClientDetails = async () => {
      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const [detailsResponse, balanceResponse] = await Promise.all([
          adminService.getClientBillingDetails(clientId),
          adminService.getClientWalletBalance(clientId)
        ]);

        if (!isMounted) return;

        setClientDetails(detailsResponse?.data ?? null);
        setWalletSummary(balanceResponse?.data ?? null);
      } catch (error: any) {
        if (!isMounted) return;
        setDetailsError(error?.message || 'Failed to load client billing details.');
        setClientDetails(null);
        setWalletSummary(null);
      } finally {
        if (isMounted) {
          setDetailsLoading(false);
        }
      }
    };

    fetchClientDetails();

    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Fetch client transactions (detail view)
  useEffect(() => {
    if (!clientId) {
      return;
    }

    let isMounted = true;
    const fetchTransactions = async () => {
      setTransactionsLoading(true);
      setTransactionsError(null);
      try {
        const params: {
          page: number;
          limit: number;
          type?: string;
          date_from?: string;
          date_to?: string;
        } = {
          page: transactionsPage,
          limit: TRANSACTION_PAGE_SIZE
        };

        if (transactionType !== 'all') {
          params.type = transactionType;
        }
        if (transactionDateFrom) {
          params.date_from = transactionDateFrom;
        }
        if (transactionDateTo) {
          params.date_to = transactionDateTo;
        }

        const response = await adminService.getClientWalletTransactions(clientId, params);

        if (!isMounted) return;

        const responseData = response?.data;
        setTransactions(responseData?.transactions ?? []);
        setTransactionsSummary(responseData?.summary ?? null);
        if (responseData?.pagination) {
          setTransactionsPagination(responseData.pagination);
        } else {
          setTransactionsPagination({
            current_page: transactionsPage,
            total_pages: 1,
            total_count: responseData?.transactions?.length ?? 0,
            per_page: TRANSACTION_PAGE_SIZE
          });
        }
      } catch (error: any) {
        if (!isMounted) return;
        setTransactionsError(error?.message || 'Failed to load wallet transactions.');
        setTransactions([]);
        setTransactionsSummary(null);
      } finally {
        if (isMounted) {
          setTransactionsLoading(false);
        }
      }
    };

    fetchTransactions();

    return () => {
      isMounted = false;
    };
  }, [clientId, transactionsPage, transactionType, transactionDateFrom, transactionDateTo]);

  const renderListView = () => (
    <div className="admin-billing">
      <div className="billing-header">
        <div>
          <h1>Client Billing Overview</h1>
          <p>Review wallet balances and billing activity for every client.</p>
        </div>
        <div className="billing-header-actions">
          <input
            type="text"
            placeholder="Search by company, name, email, or client ID..."
            value={listSearch}
            onChange={(event) => {
              setListSearch(event.target.value);
              setListPage(1);
            }}
            className="billing-search-input"
          />
          <button
            className="generate-billing-btn"
            onClick={() => setShowMonthlyBillingModal(true)}
          >
            Generate Monthly Billing
          </button>
        </div>
      </div>

      {/* Monthly Billing Modal */}
      {showMonthlyBillingModal && (
        <div className="modal-overlay" onClick={() => setShowMonthlyBillingModal(false)}>
          <div className="modal-content billing-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Generate Monthly Billing</h2>
              <button className="close-btn" onClick={() => setShowMonthlyBillingModal(false)}>x</button>
            </div>
            <div className="modal-body">
              <p className="modal-description">
                Generate billing invoices for all clients for a specific month. This will calculate shipping charges,
                COD fees, and any adjustments for the selected period.
              </p>
              <div className="billing-form-row">
                <div className="form-group">
                  <label>Month</label>
                  <select
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="billing-select"
                  >
                    <option value="">Select Month</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Year</label>
                  <select
                    value={billingYear}
                    onChange={(e) => setBillingYear(e.target.value)}
                    className="billing-select"
                  >
                    {[...Array(5)].map((_, i) => {
                      const year = new Date().getFullYear() - i;
                      return <option key={year} value={year}>{year}</option>;
                    })}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowMonthlyBillingModal(false)}
                disabled={generatingBilling}
              >
                Cancel
              </button>
              <button
                className="generate-btn"
                onClick={handleGenerateMonthlyBilling}
                disabled={generatingBilling || !billingMonth}
              >
                {generatingBilling ? 'Generating...' : 'Generate Billing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {listError && (
        <div className="billing-error">
          <span>{listError}</span>
          <button onClick={() => setListError(null)}>Dismiss</button>
        </div>
      )}

      <div className="billing-table-card">
        <div className="table-header">
          <h2>Clients</h2>
          {listLoading && <span className="loading-indicator">Loading…</span>}
        </div>

        <div className="table-responsive">
          <table className="billing-table">
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Wallet Balance</th>
                <th>Total Credits</th>
                <th>Total Debits</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listLoading && clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">Loading clients…</td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">No clients found.</td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client._id}>
                    <td>
                      <span className="client-id">{client.client_id}</span>
                    </td>
                    <td>
                      <div className="company-meta">
                        <strong>{client.company_name}</strong>
                        <small>{client.your_name}</small>
                      </div>
                    </td>
                    <td>
                      <div className="contact-meta">
                        <span>{client.email}</span>
                        <small>{client.your_name}</small>
                      </div>
                    </td>
                    <td className="numeric">₹{client.wallet_balance.toFixed(2)}</td>
                    <td className="numeric success">₹{client.total_credits.toFixed(2)}</td>
                    <td className="numeric danger">₹{client.total_debits.toFixed(2)}</td>
                    <td className="actions">
                      <button
                        className="link-button"
                        onClick={() => navigate(`/admin/billing/${client._id}`)}
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pagination-footer">
        <button
          className="pagination-btn"
          disabled={listPage <= 1 || listLoading}
          onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
        >
          Previous
        </button>
        <span className="pagination-info">
          Page {listPagination.page} of {Math.max(listPagination.pages, 1)} • {listPagination.total} clients
        </span>
        <button
          className="pagination-btn"
          disabled={listPage >= listPagination.pages || listLoading}
          onClick={() => setListPage((prev) => Math.min(listPagination.pages, prev + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );

  const renderDetailView = () => (
    <div className="admin-billing">
      <button className="back-button" onClick={() => navigate('/admin/billing')}>
        ← Back to Clients
      </button>

      {detailsError ? (
        <div className="billing-error">
          <span>{detailsError}</span>
          <button onClick={() => setDetailsError(null)}>Dismiss</button>
        </div>
      ) : (
        <div className="billing-header">
          <div>
            <h1>{clientDetails?.company_name || 'Client Billing'}</h1>
            {clientDetails && (
              <p>
                Client ID: <strong>{clientDetails.client_id}</strong> • Contact: {clientDetails.your_name} ({clientDetails.email})
              </p>
            )}
          </div>
        </div>
      )}

      <div className="summary-cards">
        <div className="summary-card accent">
          <span className="summary-label">Available Balance</span>
          <span className="summary-value">
            {walletSummary ? `₹${walletSummary.available_balance.toFixed(2)}` : detailsLoading ? 'Loading…' : '—'}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Pending Credits</span>
          <span className="summary-value">
            {walletSummary ? `₹${walletSummary.pending_credits.toFixed(2)}` : detailsLoading ? 'Loading…' : '—'}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Pending Debits</span>
          <span className="summary-value">
            {walletSummary ? `₹${walletSummary.pending_debits.toFixed(2)}` : detailsLoading ? 'Loading…' : '—'}
          </span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Effective Balance</span>
          <span className="summary-value">
            {walletSummary ? `₹${walletSummary.effective_balance.toFixed(2)}` : detailsLoading ? 'Loading…' : '—'}
          </span>
        </div>
      </div>

      {transactionsError && (
        <div className="billing-error">
          <span>{transactionsError}</span>
          <button onClick={() => setTransactionsError(null)}>Dismiss</button>
        </div>
      )}

      <div className="transactions-card">
        <div className="transactions-header">
          <div>
            <h2>Wallet Transactions</h2>
            {transactionsSummary && (
              <p>
                Current Balance: ₹{transactionsSummary.current_balance.toFixed(2)} • Credits: ₹{transactionsSummary.total_credits.toFixed(2)} • Debits: ₹{transactionsSummary.total_debits.toFixed(2)}
              </p>
            )}
          </div>
          <div className="transactions-actions">
            <input
              type="text"
              placeholder="Search by AWB or order ID"
              value={transactionSearchAWB}
              onChange={(event) => setTransactionSearchAWB(event.target.value)}
              className="billing-search-input"
            />
            <select
              value={transactionType}
              onChange={(event) => {
                setTransactionType(event.target.value as 'all' | 'credit' | 'debit');
                setTransactionsPage(1);
              }}
              className="billing-select"
            >
              <option value="all">All Types</option>
              <option value="credit">Credits</option>
              <option value="debit">Debits</option>
            </select>
            <input
              type="date"
              value={transactionDateFrom}
              onChange={(event) => {
                setTransactionDateFrom(event.target.value);
                setTransactionsPage(1);
              }}
              className="billing-date"
              max={transactionDateTo || undefined}
            />
            <input
              type="date"
              value={transactionDateTo}
              onChange={(event) => {
                setTransactionDateTo(event.target.value);
                setTransactionsPage(1);
              }}
              className="billing-date"
              min={transactionDateFrom || undefined}
            />
            <button
              className="reset-btn"
              onClick={resetTransactionFilters}
              disabled={
                !transactionDateFrom &&
                !transactionDateTo &&
                transactionType === 'all' &&
                !transactionSearchAWB
              }
            >
              Reset
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="billing-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>AWB / Order</th>
                <th>Status</th>
                <th>Performed By</th>
                <th>Amount</th>
                <th>Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {transactionsLoading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">Loading transactions…</td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">No transactions found with the current filters.</td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
                  <tr key={txn.transaction_id}>
                    <td>{formatDateTime(txn.transaction_date)}</td>
                    <td>
                      <span className={`badge ${txn.transaction_type}`}>
                        {txn.transaction_type === 'credit' ? 'Credit' : 'Debit'}
                      </span>
                    </td>
                    <td>
                      <div className="description-cell">
                        <strong>{txn.description || '—'}</strong>
                        <small>{txn.transaction_category || 'General'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="identifiers-cell">
                        <AWBLink awb={txn.awb_number || ''} />
                        <small>{txn.order_id || '—'}</small>
                      </div>
                    </td>
                    <td>{txn.status || 'Pending'}</td>
                    <td>
                      {txn.performed_by ? (
                        <div className="performed-by-cell">
                          <span className="performer-name">{txn.performed_by.name}</span>
                          <small className={`performer-role role-${txn.performed_by.role}`}>
                            {txn.performed_by.role === 'staff' ? 'Staff' : txn.performed_by.role === 'admin' ? 'Admin' : 'System'}
                          </small>
                        </div>
                      ) : (
                        <span className="system-performer">System</span>
                      )}
                    </td>
                    <td className={txn.transaction_type === 'credit' ? 'numeric success' : 'numeric danger'}>
                      {txn.transaction_type === 'credit' ? '+' : '-'}₹{txn.amount.toFixed(2)}
                    </td>
                    <td className="numeric">₹{txn.closing_balance.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-footer">
          <button
            className="pagination-btn"
            disabled={transactionsPage <= 1 || transactionsLoading}
            onClick={() => setTransactionsPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {transactionsPagination.current_page} of {Math.max(transactionsPagination.total_pages, 1)} • {transactionsPagination.total_count} transactions
          </span>
          <button
            className="pagination-btn"
            disabled={transactionsPage >= transactionsPagination.total_pages || transactionsLoading}
            onClick={() => setTransactionsPage((prev) => Math.min(transactionsPagination.total_pages, prev + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  return clientId ? renderDetailView() : renderListView();
};

export default AdminBilling;

