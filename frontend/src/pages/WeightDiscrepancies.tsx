import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { environmentConfig } from '../config/environment';
import { ticketService } from '../services/ticketService';
import { formatDateSmart } from '../utils/dateFormat';
import AWBLink from '../components/AWBLink';
import './WeightDiscrepancies.css';

// Import SVG icons for summary cards
import CartNewIcon from '../weightdiscrepancyvectors/cart-new.svg';
import CartPendingIcon from '../weightdiscrepancyvectors/cart-pending.svg';
import CartAcceptedIcon from '../weightdiscrepancyvectors/cart-accepted.svg';
import CartRejectedIcon from '../weightdiscrepancyvectors/cart-rejected.svg';

interface WeightDiscrepancy {
  _id: string;
  awb_number: string;
  order_id: {
    _id: string;
    order_id: string;
  };
  discrepancy_date: string;
  awb_status: string;
  client_declared_weight: number;
  delhivery_updated_weight: number;
  weight_discrepancy: number;
  deduction_amount: number;
  processed: boolean;
  transaction_id?: {
    transaction_id: string;
    amount: number;
  };
  dispute_status: 'NEW' | 'DISPUTE' | 'FINAL WEIGHT';
  action_taken: string | null;
}

interface Summary {
  total_discrepancies: number;
  total_weight_discrepancy: number;
  total_deduction: number;
  disputes_accepted: number;
  disputes_rejected: number;
}

const INITIAL_SUMMARY: Summary = {
  total_discrepancies: 0,
  total_weight_discrepancy: 0,
  total_deduction: 0,
  disputes_accepted: 0,
  disputes_rejected: 0
};

const createInitialSummary = (): Summary => ({
  ...INITIAL_SUMMARY
});

const WeightDiscrepancies: React.FC = () => {
  const [discrepancies, setDiscrepancies] = useState<WeightDiscrepancy[]>([]);
  const [summary, setSummary] = useState<Summary>(() => createInitialSummary());
  const [loading, setLoading] = useState(false);

  // Filters
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [total, setTotal] = useState(0);

  // Ticket creation state
  const [raisingIssue, setRaisingIssue] = useState<string | null>(null);
  const [ticketMessage, setTicketMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dispute modal state
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<WeightDiscrepancy | null>(null);
  const [disputeDescription, setDisputeDescription] = useState('');

  const fetchDiscrepancies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (search) params.append('search', search);
      if (status !== 'all') params.append('status', status);

      const response = await fetch(`${environmentConfig.apiUrl}/weight-discrepancies?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDiscrepancies(data.data.discrepancies || []);
        setSummary(data.data.summary || createInitialSummary());
        setTotal(data.data.pagination.total || 0);
      }
    } catch (error) {
      console.error('Error fetching discrepancies:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, status]);

  useEffect(() => {
    fetchDiscrepancies();
  }, [fetchDiscrepancies]);

  // Poll weight discrepancies from MongoDB (no WebSocket dependency)
  // Refresh every 60 seconds to avoid rate limiting while keeping data fresh
  useEffect(() => {
    const pollInterval = setInterval(() => {
      console.log('Polling weight discrepancies from MongoDB...');
      fetchDiscrepancies();
    }, 60000); // Poll every 60 seconds (1 minute) to avoid rate limiting

    return () => clearInterval(pollInterval);
  }, [fetchDiscrepancies]);

  const formatDate = (dateString: string) => formatDateSmart(dateString);

  const openDisputeModal = (discrepancy: WeightDiscrepancy) => {
    setSelectedDiscrepancy(discrepancy);
    setDisputeDescription('');
    setShowDisputeModal(true);
  };

  const closeDisputeModal = () => {
    setShowDisputeModal(false);
    setSelectedDiscrepancy(null);
    setDisputeDescription('');
  };

  const handleRaiseDispute = async () => {
    if (!selectedDiscrepancy) return;

    // Validate description length
    if (!disputeDescription || disputeDescription.trim().length < 10) {
      setTicketMessage({ type: 'error', text: 'Please provide a detailed description (minimum 10 characters)' });
      setTimeout(() => setTicketMessage(null), 5000);
      return;
    }

    const discrepancy = selectedDiscrepancy;
    setRaisingIssue(discrepancy._id);
    setTicketMessage(null);

    try {
      // First, call the raise-dispute endpoint to update status
      const disputeResponse = await fetch(`${environmentConfig.apiUrl}/weight-discrepancies/${discrepancy._id}/raise-dispute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!disputeResponse.ok) {
        const error = await disputeResponse.json();
        throw new Error(error.message || 'Failed to raise dispute');
      }

      // Then create the support ticket with user-provided description
      const description = `Weight Discrepancy Dispute for AWB: ${discrepancy.awb_number}

Order ID: ${discrepancy.order_id?.order_id || 'N/A'}
AWB Number: ${discrepancy.awb_number}
AWB Status: ${discrepancy.awb_status}
Discrepancy Date: ${formatDate(discrepancy.discrepancy_date)}

Weight Details:
- Declared Weight: ${discrepancy.client_declared_weight.toFixed(2)} g
- Actual Weight: ${discrepancy.delhivery_updated_weight.toFixed(2)} g
- Weight Difference: ${discrepancy.weight_discrepancy.toFixed(2)} g

Deduction Amount: ₹${discrepancy.deduction_amount.toFixed(2)}
Transaction ID: ${discrepancy.transaction_id?.transaction_id || 'N/A'}

Dispute Reason:
${disputeDescription.trim()}`;

      await ticketService.createTicket({
        category: 'shipment_dispute',
        awb_numbers: [discrepancy.awb_number],
        comment: description
      });

      setTicketMessage({ type: 'success', text: 'Dispute raised successfully! Ticket created and sent to admin.' });
      closeDisputeModal(); // Close modal on success
      fetchDiscrepancies(); // Refresh to show updated status

      // Clear message after 5 seconds
      setTimeout(() => {
        setTicketMessage(null);
      }, 5000);
    } catch (error: any) {
      console.error('Error raising dispute:', error);
      const errorMessage = error.message || 'Failed to raise dispute. Please try again.';
      setTicketMessage({ type: 'error', text: errorMessage });

      // Clear error message after 5 seconds
      setTimeout(() => {
        setTicketMessage(null);
      }, 5000);
    } finally {
      setRaisingIssue(null);
    }
  };

  const getDisputeStatusDisplay = (discrepancy: WeightDiscrepancy) => {
    if (discrepancy.dispute_status === 'NEW') {
      return (
        <button
          className="raise-issue-btn"
          onClick={() => openDisputeModal(discrepancy)}
          disabled={raisingIssue === discrepancy._id}
          title="Raise dispute for this weight discrepancy"
        >
          {raisingIssue === discrepancy._id ? 'Raising...' : 'Raise Dispute'}
        </button>
      );
    }

    if (discrepancy.action_taken) {
      const badgeClass = discrepancy.action_taken.includes('ACCEPTED')
        ? 'accepted'
        : discrepancy.action_taken.includes('REJECTED')
        ? 'rejected'
        : 'no-action';

      return (
        <span className={`dispute-badge ${badgeClass}`}>
          {discrepancy.action_taken.includes('ACCEPTED')
            ? 'Dispute Accepted'
            : discrepancy.action_taken.includes('REJECTED')
            ? 'Dispute Rejected'
            : 'No Action Taken'}
        </span>
      );
    }

    return <span className="dispute-badge pending">Dispute Pending</span>;
  };

  return (
    <Layout>
      <div className="weight-discrepancies-container">
        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card dark">
            <div className="summary-card-icon">
              <img src={CartNewIcon} alt="New Discrepancies" />
            </div>
            <div className="summary-card-content">
              <div className="summary-card-label">New Weight Discrepancies</div>
              <div className="summary-card-value">{summary.total_discrepancies}</div>
            </div>
          </div>

          <div className="summary-card dark">
            <div className="summary-card-icon">
              <img src={CartPendingIcon} alt="Disputes Pending" />
            </div>
            <div className="summary-card-content">
              <div className="summary-card-label">Disputes Pending by Courier</div>
              <div className="summary-card-value">{summary.total_discrepancies - summary.disputes_accepted - summary.disputes_rejected}</div>
            </div>
          </div>

          <div className="summary-card dark">
            <div className="summary-card-icon">
              <img src={CartAcceptedIcon} alt="Disputes Accepted" />
            </div>
            <div className="summary-card-content">
              <div className="summary-card-label">Disputes Accepted by Courier</div>
              <div className="summary-card-value">{summary.disputes_accepted}</div>
            </div>
          </div>

          <div className="summary-card dark">
            <div className="summary-card-icon">
              <img src={CartRejectedIcon} alt="Disputes Rejected" />
            </div>
            <div className="summary-card-content">
              <div className="summary-card-label">Disputes Rejected by Courier</div>
              <div className="summary-card-value">{summary.disputes_rejected}</div>
            </div>
          </div>
        </div>

        {/* Ticket Message */}
        {ticketMessage && (
          <div className={`ticket-message ${ticketMessage.type}`}>
            {ticketMessage.text}
          </div>
        )}

        {/* Filters Section */}
        <div className="filters-section">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search by AWB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="In Transit">In Transit</option>
              <option value="Delivered">Delivered</option>
              <option value="RTO">RTO</option>
              <option value="NDR">NDR</option>
            </select>
          </div>
        </div>

        {/* Discrepancies Table */}
        <div className="table-container">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading discrepancies...</p>
            </div>
          ) : (
            <table className="discrepancies-table">
              <thead>
                <tr>
                  <th>AWB NUMBER</th>
                  <th>ORDER ID</th>
                  <th>DATE & TIME</th>
                  <th>AWB STATUS</th>
                  <th>DECLARED WEIGHT</th>
                  <th>ACTUAL WEIGHT</th>
                  <th>DIFFERENCE</th>
                  <th>DEDUCTION AMOUNT</th>
                  <th>TRANSACTION ID</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="no-data">
                      <div className="no-discrepancies">
                        <div className="no-discrepancies-icon">
                          <img src={CartNewIcon} alt="No Discrepancies" />
                        </div>
                        <h3>No weight discrepancies found</h3>
                        <p>Weight discrepancies will appear here when charged</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  discrepancies.map((disc) => (
                    <tr key={disc._id}>
                      <td className="awb-cell"><AWBLink awb={disc.awb_number} /></td>
                      <td>{disc.order_id?.order_id || 'N/A'}</td>
                      <td>{formatDate(disc.discrepancy_date)}</td>
                      <td>
                        <span className={`status-badge ${disc.awb_status.toLowerCase().replace(' ', '-')}`}>
                          {disc.awb_status}
                        </span>
                      </td>
                      <td>{disc.client_declared_weight.toFixed(2)} g</td>
                      <td>{disc.delhivery_updated_weight.toFixed(2)} g</td>
                      <td className="diff-cell">{disc.weight_discrepancy.toFixed(2)} g</td>
                      <td className="deduction-cell">-₹{disc.deduction_amount.toFixed(2)}</td>
                      <td className="transaction-id">{disc.transaction_id?.transaction_id || 'N/A'}</td>
                      <td>
                        {getDisputeStatusDisplay(disc)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && discrepancies.length > 0 && (
          <div className="pagination-section">
            <div className="pagination-info">
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total}
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
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="pagination-btn"
              >
                ←
              </button>
              <button className="pagination-btn active">{page}</button>
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))}
                disabled={page >= Math.ceil(total / limit)}
                className="pagination-btn"
              >
                →
              </button>
            </div>
          </div>
        )}

        {/* Dispute Modal */}
        {showDisputeModal && selectedDiscrepancy && (
          <div className="modal-overlay" onClick={closeDisputeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Raise Weight Discrepancy Dispute</h2>
                <button className="modal-close" onClick={closeDisputeModal}>×</button>
              </div>

              <div className="modal-body">
                <div className="dispute-info">
                  <p><strong>AWB:</strong> {selectedDiscrepancy.awb_number}</p>
                  <p><strong>Order ID:</strong> {selectedDiscrepancy.order_id?.order_id || 'N/A'}</p>
                  <p><strong>Weight Discrepancy:</strong> {selectedDiscrepancy.weight_discrepancy.toFixed(2)} g</p>
                  <p><strong>Deduction:</strong> ₹{selectedDiscrepancy.deduction_amount.toFixed(2)}</p>
                </div>

                <div className="form-group">
                  <label htmlFor="dispute-description">
                    Dispute Description <span className="required">*</span>
                  </label>
                  <textarea
                    id="dispute-description"
                    value={disputeDescription}
                    onChange={(e) => setDisputeDescription(e.target.value)}
                    placeholder="Please provide a detailed explanation of why you are disputing this weight discrepancy. Include any evidence or information that supports your claim."
                    className={`dispute-textarea ${disputeDescription.trim().length > 0 && disputeDescription.trim().length < 10 ? 'error' : ''}`}
                    rows={5}
                  />
                  <div className="char-counter">
                    <span className={disputeDescription.trim().length < 10 ? 'text-danger' : 'text-success'}>
                      {disputeDescription.trim().length} characters
                    </span>
                    <span className="text-muted"> (minimum 10 required)</span>
                  </div>
                  <p className="help-text">
                    You can attach images/videos via the support ticket that will be automatically created.
                  </p>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={closeDisputeModal}>Cancel</button>
                <button
                  className="btn-primary"
                  onClick={handleRaiseDispute}
                  disabled={raisingIssue !== null || disputeDescription.trim().length < 10}
                >
                  {raisingIssue ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WeightDiscrepancies;
