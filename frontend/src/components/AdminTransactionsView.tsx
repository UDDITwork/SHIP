import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/adminService';
import { formatDateSmart } from '../utils/dateFormat';
import AWBLink from './AWBLink';
import DateRangeFilter from './DateRangeFilter';
import './AdminTransactionsView.css';

interface BillingClient {
  _id: string;
  client_id: string;
  company_name: string;
  email: string;
  your_name: string;
  wallet_balance: number;
  total_credits: number;
  total_debits: number;
}

interface WalletTransaction {
  transaction_id: string;
  transaction_type: 'credit' | 'debit';
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

const AdminTransactionsView: React.FC = () => {
  // Client list state
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientPage, setClientPage] = useState(1);
  const [clientTotalPages, setClientTotalPages] = useState(1);
  const [clientTotalCount, setClientTotalCount] = useState(0);

  // Transaction detail state
  const [selectedClient, setSelectedClient] = useState<BillingClient | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnSearch, setTxnSearch] = useState('');
  const [txnType, setTxnType] = useState<'all' | 'credit' | 'debit'>('all');
  const [txnDateFrom, setTxnDateFrom] = useState('');
  const [txnDateTo, setTxnDateTo] = useState('');
  const [txnPage, setTxnPage] = useState(1);
  const [txnTotalPages, setTxnTotalPages] = useState(1);
  const [txnTotalCount, setTxnTotalCount] = useState(0);
  const [txnSummary, setTxnSummary] = useState<{ current_balance: number; total_credits: number; total_debits: number } | null>(null);

  const clientLimit = 25;
  const txnLimit = 25;

  // Fetch client list
  const fetchClients = useCallback(async () => {
    try {
      setClientsLoading(true);
      const response = await adminService.getBillingClients({
        page: clientPage,
        limit: clientLimit,
        search: clientSearch.trim() || undefined
      });
      if (response.success && response.data) {
        setClients(response.data.clients);
        setClientTotalPages(response.data.pagination.pages);
        setClientTotalCount(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching billing clients:', error);
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  }, [clientPage, clientSearch]);

  useEffect(() => {
    if (!selectedClient) {
      fetchClients();
    }
  }, [fetchClients, selectedClient]);

  // Fetch transactions for selected client
  const fetchTransactions = useCallback(async () => {
    if (!selectedClient) return;
    try {
      setTxnLoading(true);
      const response = await adminService.getClientWalletTransactions(selectedClient._id, {
        page: txnPage,
        limit: txnLimit,
        type: txnType !== 'all' ? txnType : undefined,
        date_from: txnDateFrom || undefined,
        date_to: txnDateTo || undefined
      });
      if (response.success && response.data) {
        setTransactions(response.data.transactions);
        setTxnTotalPages(response.data.pagination.total_pages);
        setTxnTotalCount(response.data.pagination.total_count);
        setTxnSummary(response.data.summary);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    } finally {
      setTxnLoading(false);
    }
  }, [selectedClient, txnPage, txnType, txnDateFrom, txnDateTo]);

  useEffect(() => {
    if (selectedClient) {
      fetchTransactions();
    }
  }, [fetchTransactions, selectedClient]);

  const handleShowClient = (client: BillingClient) => {
    setSelectedClient(client);
    setTransactions([]);
    setTxnSearch('');
    setTxnType('all');
    setTxnDateFrom('');
    setTxnDateTo('');
    setTxnPage(1);
    setTxnSummary(null);
  };

  const handleBackToClients = () => {
    setSelectedClient(null);
    setTransactions([]);
    setTxnSummary(null);
  };

  const formatDate = (dateString: string) => formatDateSmart(dateString);

  const formatWeight = (weight: number | null) => {
    if (!weight) return 'N/A';
    return `${(weight / 1000).toFixed(2)} kg`;
  };

  // Filter transactions locally by AWB search
  const filteredTransactions = txnSearch
    ? transactions.filter(txn => txn.awb_number?.toLowerCase().includes(txnSearch.toLowerCase()))
    : transactions;

  // ---- Transaction Detail View ----
  if (selectedClient) {
    return (
      <div className="atv-detail">
        <button className="atv-back-btn" onClick={handleBackToClients}>
          &larr; Back to Clients
        </button>

        <div className="atv-detail-header">
          <div>
            <h2>{selectedClient.company_name}</h2>
            <span className="atv-client-id">{selectedClient.client_id}</span>
          </div>
          {txnSummary && (
            <div className="atv-summary-cards">
              <div className="atv-summary-card">
                <span className="atv-summary-label">Current Balance</span>
                <span className="atv-summary-value">₹{txnSummary.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="atv-summary-card credit">
                <span className="atv-summary-label">Total Credits</span>
                <span className="atv-summary-value">₹{txnSummary.total_credits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="atv-summary-card debit">
                <span className="atv-summary-label">Total Debits</span>
                <span className="atv-summary-value">₹{txnSummary.total_debits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="atv-filters">
          <input
            type="text"
            className="atv-search-input"
            placeholder="Search by AWB Number..."
            value={txnSearch}
            onChange={(e) => setTxnSearch(e.target.value)}
          />
          <select
            className="atv-type-select"
            value={txnType}
            onChange={(e) => {
              setTxnType(e.target.value as 'all' | 'credit' | 'debit');
              setTxnPage(1);
            }}
          >
            <option value="all">All Types</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <DateRangeFilter
            onApply={(startDate, endDate) => {
              setTxnDateFrom(startDate);
              setTxnDateTo(endDate);
              setTxnPage(1);
            }}
            onReset={() => {
              setTxnDateFrom('');
              setTxnDateTo('');
              setTxnPage(1);
            }}
          />
        </div>

        {/* Transactions Table */}
        <div className="atv-table-container">
          {txnLoading ? (
            <div className="atv-loading">Loading transactions...</div>
          ) : (
            <table className="atv-table">
              <thead>
                <tr>
                  <th>TRANSACTION DETAILS</th>
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
                    <td colSpan={8} className="atv-empty">No transactions found</td>
                  </tr>
                ) : (
                  filteredTransactions.map((txn, index) => (
                    <tr key={index}>
                      <td>
                        <div className="atv-txn-id">{txn.transaction_id}</div>
                        <div className="atv-txn-date">{formatDate(txn.transaction_date)}</div>
                      </td>
                      <td>
                        {txn.order_id ? txn.order_id.split(' ')[1] + ' ' + txn.order_id.split(' ')[0].toUpperCase() : '-'}
                      </td>
                      <td>
                        <AWBLink awb={txn.awb_number || ''} />
                      </td>
                      <td>
                        <div>{formatWeight(txn.weight)}</div>
                        {txn.zone && <div className="atv-zone">{txn.zone}</div>}
                      </td>
                      <td>{txn.description}</td>
                      <td>
                        {txn.transaction_type === 'credit' && (
                          <span className="atv-amount credit">+₹{txn.amount.toFixed(2)}</span>
                        )}
                      </td>
                      <td>
                        {txn.transaction_type === 'debit' && (
                          <span className="atv-amount debit">-₹{txn.amount.toFixed(2)}</span>
                        )}
                      </td>
                      <td>₹{txn.closing_balance ? txn.closing_balance.toFixed(2) : '0.00'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {txnTotalPages > 1 && (
          <div className="atv-pagination">
            <button
              className="pagination-btn"
              disabled={txnPage === 1}
              onClick={() => setTxnPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {txnPage} of {txnTotalPages} ({txnTotalCount} total)
            </span>
            <button
              className="pagination-btn"
              disabled={txnPage === txnTotalPages}
              onClick={() => setTxnPage(p => Math.min(txnTotalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Client List View ----
  return (
    <div className="atv-clients">
      <div className="atv-clients-header">
        <h2>Client Transactions</h2>
        <input
          type="text"
          className="atv-search-input"
          placeholder="Search by client name, ID, or email..."
          value={clientSearch}
          onChange={(e) => {
            setClientSearch(e.target.value);
            setClientPage(1);
          }}
        />
      </div>

      <div className="atv-table-container">
        {clientsLoading ? (
          <div className="atv-loading">Loading clients...</div>
        ) : (
          <table className="atv-table">
            <thead>
              <tr>
                <th>CLIENT NAME</th>
                <th>CLIENT ID</th>
                <th className="atv-numeric">TOTAL CREDIT</th>
                <th className="atv-numeric">TOTAL DEBIT</th>
                <th className="atv-numeric">CURRENT BALANCE</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="atv-empty">No clients found</td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client._id}>
                    <td>
                      <div className="atv-client-name">{client.company_name}</div>
                      <div className="atv-client-email">{client.email}</div>
                    </td>
                    <td className="atv-client-id-cell">{client.client_id}</td>
                    <td className="atv-numeric credit">₹{client.total_credits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="atv-numeric debit">₹{client.total_debits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="atv-numeric">₹{client.wallet_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <button className="atv-show-btn" onClick={() => handleShowClient(client)}>
                        Show
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {clientTotalPages > 1 && (
        <div className="atv-pagination">
          <button
            className="pagination-btn"
            disabled={clientPage === 1}
            onClick={() => setClientPage(p => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {clientPage} of {clientTotalPages} ({clientTotalCount} total)
          </span>
          <button
            className="pagination-btn"
            disabled={clientPage === clientTotalPages}
            onClick={() => setClientPage(p => Math.min(clientTotalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminTransactionsView;
