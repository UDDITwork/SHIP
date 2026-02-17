import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { remittanceService, Remittance } from '../services/remittanceService';
import { formatDate as formatDateUtil } from '../utils/dateFormat';
import './Remittances.css';

const Remittances: React.FC = () => {
  const navigate = useNavigate();
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'upcoming' | 'processing' | 'settled'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [upcoming, setUpcoming] = useState<{total_amount: number; total_orders: number; count: number; remittances: any[]} | null>(null);

  const limit = 25;

  // Quick date select options
  const getQuickDateRange = (option: string) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setHours(0, 0, 0, 0);

    switch (option) {
      case 'today':
        return { from: from.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        return { from: yesterday.toISOString().split('T')[0], to: yesterday.toISOString().split('T')[0] };
      case 'thisWeek':
        const weekStart = new Date(from);
        weekStart.setDate(from.getDate() - from.getDay()); // Start of week (Sunday)
        return { from: weekStart.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      case 'thisMonth':
        const monthStart = new Date(from.getFullYear(), from.getMonth(), 1);
        return { from: monthStart.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      case 'lastWeek':
        const lastWeekEnd = new Date(from);
        lastWeekEnd.setDate(from.getDate() - from.getDay() - 1);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 6);
        return { from: lastWeekStart.toISOString().split('T')[0], to: lastWeekEnd.toISOString().split('T')[0] };
      case 'lastMonth':
        const lastMonthEnd = new Date(from.getFullYear(), from.getMonth(), 0);
        const lastMonthStart = new Date(from.getFullYear(), from.getMonth() - 1, 1);
        return { from: lastMonthStart.toISOString().split('T')[0], to: lastMonthEnd.toISOString().split('T')[0] };
      case 'last90Days':
        const ninetyDaysAgo = new Date(from);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        return { from: ninetyDaysAgo.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
      default:
        return null;
    }
  };

  const handleQuickDateSelect = (option: string) => {
    const range = getQuickDateRange(option);
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
      setPage(1);
    }
  };

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    return formatDateUtil(dateString);
  };

  const fetchRemittances = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {
        page,
        limit,
        search: searchQuery.trim() || undefined,
        state: stateFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined
      };

      const response = await remittanceService.getRemittances(filters);
      
      if (response.success && response.data) {
        setRemittances(response.data.remittances);
        setTotalPages(response.data.pagination.total_pages);
        setTotalCount(response.data.pagination.total_count);
      }
    } catch (error) {
      console.error('Error fetching remittances:', error);
      setRemittances([]);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, stateFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchRemittances();
  }, [fetchRemittances]);

  // Fetch upcoming remittances once
  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        const res = await remittanceService.getUpcoming();
        if (res.success && res.data) {
          setUpcoming(res.data);
        }
      } catch {
        // silently ignore
      }
    };
    fetchUpcoming();
  }, []);

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDatePicker]);

  const handleRemittanceClick = (remittanceNumber: string) => {
    navigate(`/remittances/${remittanceNumber}`);
  };

  const handleClearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setShowDatePicker(false);
  };

  const handleApplyDateFilter = () => {
    setShowDatePicker(false);
    setPage(1);
  };

  const formatDate = (dateString: string) => formatDateUtil(dateString);

  return (
    <Layout>
      <div className="remittances-container">
        <div className="remittances-header">
          <h1>Remittances</h1>
          <button className="learn-more-btn">Learn More ?</button>
        </div>

        {/* Upcoming Banner */}
        {upcoming && upcoming.count > 0 && (
          <div className="upcoming-banner">
            <div className="upcoming-banner-content">
              <div className="upcoming-banner-icon">&#8986;</div>
              <div className="upcoming-banner-info">
                <strong>Upcoming Remittance{upcoming.count > 1 ? 's' : ''}</strong>
                <span>{upcoming.count} remittance{upcoming.count > 1 ? 's' : ''} with {upcoming.total_orders} orders totaling Rs. {upcoming.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        )}

        {/* Search & Filter Section */}
        <div className="remittances-filters">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by Remittance Number"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="state-filter-box">
            <select
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value as any);
                setPage(1);
              }}
            >
              <option value="all">All States</option>
              <option value="upcoming">Upcoming</option>
              <option value="processing">Processing</option>
              <option value="settled">Settled</option>
            </select>
          </div>
          <div className="date-filter" ref={datePickerRef}>
            <button
              className="calendar-btn"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              📅 Processed On {dateFrom ? formatDateForDisplay(dateFrom) : ''} {dateTo && dateFrom ? `to ${formatDateForDisplay(dateTo)}` : ''}
              {!dateFrom && !dateTo && ' (Select Date)'}
            </button>
            {showDatePicker && (
              <div className="date-picker-dropdown">
                <div className="date-picker-header">
                  <h4>Select Date Range</h4>
                  <button className="close-btn" onClick={() => setShowDatePicker(false)}>✕</button>
                </div>
                <div className="quick-select-options">
                  <button onClick={() => handleQuickDateSelect('today')}>Today</button>
                  <button onClick={() => handleQuickDateSelect('yesterday')}>Yesterday</button>
                  <button onClick={() => handleQuickDateSelect('thisWeek')}>This Week</button>
                  <button onClick={() => handleQuickDateSelect('thisMonth')}>This Month</button>
                  <button onClick={() => handleQuickDateSelect('lastWeek')}>Last Week</button>
                  <button onClick={() => handleQuickDateSelect('lastMonth')}>Last Month</button>
                  <button onClick={() => handleQuickDateSelect('last90Days')}>Last 90 Days</button>
                </div>
                <div className="custom-date-range">
                  <label>From:</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <label>To:</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    min={dateFrom}
                  />
                </div>
                <div className="date-picker-actions">
                  <button onClick={handleApplyDateFilter} disabled={!dateFrom || !dateTo}>
                    Done
                  </button>
                  <button onClick={handleClearDateFilter}>Clear</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Remittances Table */}
        <div className="remittances-table-container">
          {loading ? (
            <div className="loading-state">Loading remittances...</div>
          ) : (
            <table className="remittances-table">
              <thead>
                <tr>
                  <th>REMITTANCE NUMBER</th>
                  <th>REMITTANCE DATE</th>
                  <th>BANK'S TRANSACTION ID</th>
                  <th>STATUS</th>
                  <th>TOTAL REMITTANCE</th>
                </tr>
              </thead>
              <tbody>
                {remittances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-state">
                      No remittances found
                    </td>
                  </tr>
                ) : (
                  remittances.map((remittance) => (
                    <tr key={remittance.remittance_number}>
                      <td>
                        <button
                          className="remittance-link"
                          onClick={() => handleRemittanceClick(remittance.remittance_number)}
                        >
                          {remittance.remittance_number}
                        </button>
                      </td>
                      <td>{formatDate(remittance.remittance_date || remittance.date)}</td>
                      <td>{remittance.bank_transaction_id || '-'}</td>
                      <td>
                        <span className={`status-badge ${remittance.state}`}>
                          {remittance.state.charAt(0).toUpperCase() + remittance.state.slice(1)}
                        </span>
                      </td>
                      <td>₹ {remittance.total_remittance.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages} ({totalCount} total)
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Remittances;

