import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { apiService } from '../services/api';
import { formatDateSmart } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './Billing.css';

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
}

interface WalletSummary {
  current_balance: number;
  total_credits: number;
  total_debits: number;
}

interface WalletTransactionsResponse {
  success: boolean;
  data: {
    transactions: WalletTransaction[];
    summary: {
      current_balance: number;
      total_credits: number;
      total_debits: number;
    };
    pagination: {
      current_page: number;
      total_pages: number;
      total_count: number;
      per_page: number;
    };
  };
}

const CACHE_TTL_MS = 60_000; // 1 minute cache window

type CachedTransactionData = {
  transactions: WalletTransaction[];
  summary: {
    totalCredits: number;
    totalDebits: number;
  };
  pagination: {
    totalPages: number;
    totalCount: number;
  };
};

type TransactionCache = Record<string, {
  timestamp: number;
  data: CachedTransactionData;
}>;

const Billing: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State Management
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [summary, setSummary] = useState<WalletSummary>({
    current_balance: 0,
    total_credits: 0,
    total_debits: 0
  });
  const [loading, setLoading] = useState(false);

  // Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Search and Filters
  const [searchAWB, setSearchAWB] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [transactionType, setTransactionType] = useState('all');

  // Tabs
  const [activeTab, setActiveTab] = useState<'transactions' | 'recharges'>('transactions');

  // Recharge Modal State
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeLoading, setRechargeLoading] = useState(false);
  const [rechargeError, setRechargeError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed' | 'pending'>('idle');
  const [paymentMessage, setPaymentMessage] = useState('');

  // Cache for transaction requests keyed by parameters
  const transactionCacheRef = useRef<TransactionCache>({});

  // Stable refs for polling (avoids recreating intervals when callbacks change)
  const fetchTransactionsRef = useRef<(opts?: { forceRefresh?: boolean }) => Promise<void>>(null as any);
  const fetchWalletBalanceRef = useRef<() => Promise<void>>(null as any);

  const applyTransactionData = useCallback((data: CachedTransactionData) => {
    setTransactions(data.transactions);
    setSummary(prev => ({
      ...prev,
      total_credits: data.summary.totalCredits,
      total_debits: data.summary.totalDebits
    }));
    setTotalPages(data.pagination.totalPages);
    setTotalCount(data.pagination.totalCount);
  }, []);

  // Fetch current wallet balance (independent of filters)
  const fetchWalletBalance = useCallback(async () => {
    try {
      const response = await apiService.get<{
        success: boolean;
        data: {
          available_balance: number;
          pending_credits: number;
          pending_debits: number;
          effective_balance: number;
          currency: string;
        }
      }>('/billing/wallet/balance');

      if ((response as any).success) {
        const data = (response as any).data;
        // Use available_balance for Current Balance card
        setSummary(prev => ({
          ...prev,
          current_balance: Number(data.available_balance || 0)
        }));
      }
    } catch (error) {
      console.error('❌ Error fetching wallet balance:', error);
    }
  }, []);

  // Fetch wallet transactions
  const fetchTransactions = useCallback(async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);

      const effectiveType = activeTab === 'recharges' ? 'credit' : transactionType;
      if (effectiveType !== 'all') {
        params.append('type', effectiveType);
      }

      if (activeTab === 'recharges') {
        params.append('category', 'wallet_recharge');
      }

      const paramsString = params.toString();
      const cacheKey = `${activeTab}|${paramsString}`;
      const cachedEntry = transactionCacheRef.current[cacheKey];
      const isCacheValid = cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS);

      if (!forceRefresh && isCacheValid) {
        applyTransactionData(cachedEntry.data);
        setLoading(false);
        return;
      }

      if (cachedEntry && !forceRefresh) {
        applyTransactionData(cachedEntry.data);
      }

      const shouldShowLoading = forceRefresh || !cachedEntry;
      if (shouldShowLoading) {
        setLoading(true);
      }

      const response = await apiService.get<WalletTransactionsResponse>(`/billing/wallet-transactions?${paramsString}`);

      const fetchedTransactions: WalletTransaction[] = response?.data?.transactions || [];
      const sanitizedTransactions = activeTab === 'recharges'
        ? fetchedTransactions.filter(txn => {
            const category = (txn.transaction_category || '').toLowerCase();
            if (!category) return false;
            if (category.includes('refund')) return false;
            return category.includes('wallet_recharge');
          })
        : fetchedTransactions;

      const cacheData: CachedTransactionData = {
        transactions: sanitizedTransactions,
        summary: {
          totalCredits: Number(response?.data?.summary?.total_credits || 0),
          totalDebits: Number(response?.data?.summary?.total_debits || 0)
        },
        pagination: {
          totalPages: response?.data?.pagination?.total_pages || 1,
          totalCount: response?.data?.pagination?.total_count || sanitizedTransactions.length
        }
      };

      transactionCacheRef.current[cacheKey] = {
        timestamp: Date.now(),
        data: cacheData
      };

      applyTransactionData(cacheData);
    } catch (error) {
      console.error('❌ Error fetching transactions from MongoDB:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, limit, dateFrom, dateTo, transactionType, applyTransactionData]);

  // Handle payment redirect from HDFC (via backend)
  const handlePaymentRedirect = useCallback(async () => {
    const paymentStatusParam = searchParams.get('payment_status');
    const orderId = searchParams.get('order_id') || localStorage.getItem('hdfc_order_id');
    const isOldRedirect = searchParams.get('payment_redirect');

    // Handle new backend redirect (payment_status param)
    if (paymentStatusParam) {
      switch (paymentStatusParam) {
        case 'success':
          setPaymentStatus('success');
          setPaymentMessage('Payment successful! Your wallet has been credited.');
          fetchWalletBalance();
          fetchTransactions({ forceRefresh: true });
          break;
        case 'failed':
          setPaymentStatus('failed');
          setPaymentMessage('Payment failed. Please try again.');
          break;
        case 'pending':
          setPaymentStatus('pending');
          setPaymentMessage('Payment is being processed. Please wait...');
          break;
        case 'error':
          setPaymentStatus('failed');
          setPaymentMessage('An error occurred while processing payment.');
          break;
        default:
          setPaymentStatus('failed');
          setPaymentMessage('Payment status unknown. Please check your wallet balance.');
      }

      // Clear URL params
      localStorage.removeItem('hdfc_order_id');
      setSearchParams({});
      return;
    }

    // Legacy: Handle old redirect style (payment_redirect param)
    if (isOldRedirect && orderId) {
      setPaymentStatus('processing');
      setPaymentMessage('Verifying payment...');

      try {
        const response = await apiService.post<{
          success: boolean;
          message: string;
          data: {
            transaction_id: string;
            status: string;
            amount: number;
            new_balance?: number;
            is_pending?: boolean;
          };
        }>('/billing/wallet/handle-payment-response', { order_id: orderId });

        if (response.success && response.data) {
          if (response.data.is_pending) {
            setPaymentStatus('pending');
            setPaymentMessage('Payment is being processed. Please wait...');
          } else if (response.data.new_balance !== undefined) {
            setPaymentStatus('success');
            setPaymentMessage(`Payment successful! Wallet credited with Rs ${response.data.amount}`);
            // Refresh balance
            fetchWalletBalance();
            fetchTransactions({ forceRefresh: true });
          }
        } else {
          setPaymentStatus('failed');
          setPaymentMessage(response.message || 'Payment verification failed');
        }
      } catch (error: unknown) {
        console.error('Payment verification error:', error);
        setPaymentStatus('failed');
        const errorMessage = error instanceof Error ? error.message : 'Failed to verify payment';
        setPaymentMessage(errorMessage);
      }

      // Clear URL params and stored order ID
      localStorage.removeItem('hdfc_order_id');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, fetchWalletBalance, fetchTransactions]);

  // Initiate wallet recharge
  const initiateRecharge = async () => {
    const amount = parseFloat(rechargeAmount);

    if (isNaN(amount) || amount < 10 || amount > 50000) {
      setRechargeError('Amount must be between Rs 10 and Rs 50,000');
      return;
    }

    setRechargeLoading(true);
    setRechargeError('');

    try {
      const response = await apiService.post<{
        success: boolean;
        message: string;
        data: {
          transaction_id: string;
          order_id: string;
          payment_link: string;
          amount: number;
        };
      }>('/billing/wallet/initiate-payment', { amount });

      if (response.success && response.data?.payment_link) {
        // Store order ID for redirect handling
        localStorage.setItem('hdfc_order_id', response.data.order_id);

        // Redirect to HDFC payment page
        window.location.href = response.data.payment_link;
      } else {
        setRechargeError(response.message || 'Failed to initiate payment');
        setRechargeLoading(false);
      }
    } catch (error: unknown) {
      console.error('Recharge initiation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate payment';
      setRechargeError(errorMessage);
      setRechargeLoading(false);
    }
  };

  // Keep refs in sync with latest callback versions
  useEffect(() => { fetchTransactionsRef.current = fetchTransactions; }, [fetchTransactions]);
  useEffect(() => { fetchWalletBalanceRef.current = fetchWalletBalance; }, [fetchWalletBalance]);

  // One-time mount: initial fetch + payment redirect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    handlePaymentRedirect();
    fetchWalletBalance();
    fetchTransactions({ forceRefresh: true });
  }, []);

  // Stable polling intervals — never recreated
  useEffect(() => {
    const balanceInterval = setInterval(() => {
      fetchWalletBalanceRef.current();
    }, 60000);

    const transactionInterval = setInterval(() => {
      fetchTransactionsRef.current({ forceRefresh: true });
    }, CACHE_TTL_MS);

    return () => {
      clearInterval(balanceInterval);
      clearInterval(transactionInterval);
    };
  }, []);

  // Refresh transactions when filters/page/tab change
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Format date for display
  const formatDate = (dateString: string) => formatDateSmart(dateString);

  // Format weight display (weight provided in grams)
  const formatWeight = (weight: number | null) => {
    if (!weight) return 'N/A';
    return `${Math.round(weight)} g`;
  };

  // Get default date range (last 7 days)
  const getDefaultDateRange = () => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    setDateFrom(sevenDaysAgo.toISOString().split('T')[0]);
    setDateTo(today.toISOString().split('T')[0]);
  };

  // Set default date range on mount
  useEffect(() => {
    getDefaultDateRange();
  }, []);

  // Filter transactions by AWB search
  const filteredTransactions = searchAWB
    ? transactions.filter(txn => txn.awb_number.toLowerCase().includes(searchAWB.toLowerCase()))
    : transactions;

  return (
    <Layout>
      <div className="billing-container">
        {/* Wallet Summary Cards */}
        <div className="wallet-summary-cards">
          <div className="summary-card current-balance">
            <div className="summary-card-icon"><Wallet size={22} color="#002B59" /></div>
            <div className="summary-card-content">
              <div className="summary-card-label">Current Balance</div>
              <div className="summary-card-value green">₹{summary.current_balance.toFixed(2)}</div>
            </div>
          </div>

          <div className="summary-card total-credits">
            <div className="summary-card-icon"><ArrowDownCircle size={22} color="#002B59" /></div>
            <div className="summary-card-content">
              <div className="summary-card-label">Total Credit</div>
              <div className="summary-card-value">₹{summary.total_credits.toFixed(2)}</div>
            </div>
          </div>

          <div className="summary-card total-debits">
            <div className="summary-card-icon"><ArrowUpCircle size={22} color="#002B59" /></div>
            <div className="summary-card-content">
              <div className="summary-card-label">Total Debit</div>
              <div className="summary-card-value">₹{summary.total_debits.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Payment Status Banner */}
        {paymentStatus !== 'idle' && (
          <div className={`payment-status-banner ${paymentStatus}`}>
            {paymentStatus === 'processing' && <span className="loading-spinner-inline"></span>}
            {paymentStatus === 'success' && <span>&#10003;</span>}
            {paymentStatus === 'failed' && <span>&#10007;</span>}
            {paymentStatus === 'pending' && <span>&#8987;</span>}
            <span className="payment-status-message">{paymentMessage}</span>
            <button
              className="payment-status-close"
              onClick={() => setPaymentStatus('idle')}
            >
              &times;
            </button>
          </div>
        )}

        {/* Wallet Actions */}
        <div className="wallet-actions-bar">
          <button className="download-ledger-btn" onClick={() => alert('Download ledger feature coming soon')}>
            Download Ledger
          </button>
          <button className="recharge-wallet-btn" onClick={() => setShowRechargeModal(true)}>
            Recharge Wallet
          </button>
        </div>

        {/* Recharge Modal */}
        {showRechargeModal && (
          <div className="modal-overlay" onClick={() => !rechargeLoading && setShowRechargeModal(false)}>
            <div className="recharge-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Recharge Wallet</h3>
                <button
                  className="modal-close-btn"
                  onClick={() => !rechargeLoading && setShowRechargeModal(false)}
                  disabled={rechargeLoading}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <div className="current-balance-display">
                  <span>Current Balance:</span>
                  <span className="balance-amount">Rs {summary.current_balance.toFixed(2)}</span>
                </div>
                <div className="amount-input-group">
                  <label htmlFor="recharge-amount">Enter Amount (Rs)</label>
                  <input
                    type="number"
                    id="recharge-amount"
                    placeholder="Enter amount (10 - 50,000)"
                    value={rechargeAmount}
                    onChange={(e) => {
                      setRechargeAmount(e.target.value);
                      setRechargeError('');
                    }}
                    min="10"
                    max="50000"
                    disabled={rechargeLoading}
                  />
                  {rechargeError && <div className="error-message">{rechargeError}</div>}
                </div>
                <div className="quick-amounts">
                  {[100, 500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      className={`quick-amount-btn ${rechargeAmount === amt.toString() ? 'selected' : ''}`}
                      onClick={() => setRechargeAmount(amt.toString())}
                      disabled={rechargeLoading}
                    >
                      Rs {amt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowRechargeModal(false);
                    setRechargeAmount('');
                    setRechargeError('');
                  }}
                  disabled={rechargeLoading}
                >
                  Cancel
                </button>
                <button
                  className="proceed-btn"
                  onClick={initiateRecharge}
                  disabled={rechargeLoading || !rechargeAmount}
                >
                  {rechargeLoading ? 'Processing...' : 'Proceed to Pay'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="billing-tabs">
          <button
            className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </button>
          <button
            className={`tab-btn ${activeTab === 'recharges' ? 'active' : ''}`}
            onClick={() => setActiveTab('recharges')}
          >
            Recharges
          </button>
        </div>

        {/* Filters Section */}
        <div className="filters-section">
          <div className="filter-group">
            <label>AWB</label>
            <input
              type="text"
              placeholder="Search by AWB number"
              value={searchAWB}
              onChange={(e) => setSearchAWB(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group date-range-group">
            <label>Date Range</label>
            <div className="date-range-inputs">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="filter-input"
                max={dateTo || undefined}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="filter-input"
                min={dateFrom || undefined}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Transaction Type</label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Account Name</label>
            <select className="filter-select">
              <option value="all">All Accounts</option>
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="transactions-table-wrapper">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading transactions...</p>
            </div>
          ) : (
            <table className="wallet-transactions-table">
              <thead>
                <tr>
                  <th>TRANSACTION DETAILS</th>
                  <th>ACCOUNT DETAILS</th>
                  <th>ORDER ID</th>
                  <th>AWB / LRN</th>
                  <th>WEIGHT & ZONE</th>
                  <th>DESCRIPTION</th>
                  <th>CREDIT</th>
                  <th>DEBIT</th>
                  <th>UPDATED BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="no-data-cell">
                      <div className="no-transactions">
                        <div className="no-transactions-icon"><Wallet size={32} color="#002B59" /></div>
                        <h3>No transactions found</h3>
                        <p>Your wallet transaction history will appear here</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((txn, index) => (
                    <tr key={index} className="transaction-row">
                      <td>
                        <div className="transaction-id">{txn.transaction_id}</div>
                        <div className="transaction-date">{formatDate(txn.transaction_date)}</div>
                      </td>
                      <td>
                        <div className="account-name">{txn.account_name}</div>
                        <div className="account-email">{txn.account_email}</div>
                      </td>
                      <td>
                        <div className="order-id-display">
                          {txn.order_id ? txn.order_id.split(' ')[1] + ' ' + txn.order_id.split(' ')[0].toUpperCase() : '-'}
                        </div>
                      </td>
                      <td>
                        <div className="awb-display">
                          <AWBLink awb={txn.awb_number || ''} />
                        </div>
                      </td>
                      <td>
                        <div className="weight-display">{formatWeight(txn.weight)}</div>
                        {txn.zone && <div className="zone-display">{txn.zone}</div>}
                      </td>
                      <td>
                        <div className="description-display">{txn.description}</div>
                      </td>
                      <td>
                        {txn.transaction_type === 'credit' && (
                          <div className="amount credit">+₹{txn.amount.toFixed(2)}</div>
                        )}
                      </td>
                      <td>
                        {txn.transaction_type === 'debit' && (
                          <div className="amount debit">-₹{txn.amount.toFixed(2)}</div>
                        )}
                      </td>
                      <td>
                        <div className="balance-display">
                          ₹{txn.closing_balance ? txn.closing_balance.toFixed(2) : '0.00'}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredTransactions.length > 0 && (
          <div className="pagination-section">
            <div className="pagination-info">
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, totalCount)} of {totalCount}
            </div>

            <div className="pagination-per-page">
              <label>Show</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="per-page-select"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span>per page</span>
            </div>

            <div className="pagination-nav">
              <button
                className="pagination-btn"
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                disabled={page === 1}
              >
                ←
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    className={`pagination-btn ${page === pageNum ? 'active' : ''}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                className="pagination-btn"
                onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Billing;
