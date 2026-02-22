import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { remittanceService, Remittance } from '../services/remittanceService';
import { formatDate as formatDateUtil } from '../utils/dateFormat';
import DateRangeFilter from '../components/DateRangeFilter';
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
  const [upcoming, setUpcoming] = useState<{total_amount: number; total_orders: number; count: number; remittances: any[]} | null>(null);

  const limit = 25;

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

  const handleRemittanceClick = (remittanceNumber: string) => {
    navigate(`/remittances/${remittanceNumber}`);
  };

  const handleDateFilterApply = (startDate: string, endDate: string) => {
    setDateFrom(startDate);
    setDateTo(endDate);
    setPage(1);
  };

  const handleDateFilterReset = () => {
    setDateFrom('');
    setDateTo('');
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
          <DateRangeFilter
            onApply={handleDateFilterApply}
            onReset={handleDateFilterReset}
          />
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

