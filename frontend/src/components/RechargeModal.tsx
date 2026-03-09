import React, { useState } from 'react';
import { apiService } from '../services/api';
import './RechargeModal.css';

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const MIN_AMOUNT = 500;
const MAX_AMOUNT = 50000;

const RechargeModal: React.FC<RechargeModalProps> = ({ isOpen, onClose, currentBalance }) => {
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (loading) return;
    setAmount('');
    setError('');
    onClose();
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setError('');
  };

  const handleQuickSelect = (amt: number) => {
    setAmount(amt.toString());
    setError('');
  };

  const getValidationError = (): string => {
    if (!amount) return '';
    const num = parseFloat(amount);
    if (isNaN(num)) return 'Please enter a valid amount';
    if (num < MIN_AMOUNT) return `Minimum recharge amount is ₹${MIN_AMOUNT}`;
    if (num > MAX_AMOUNT) return `Maximum recharge amount is ₹${MAX_AMOUNT.toLocaleString()}`;
    return '';
  };

  const isValid = (): boolean => {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= MIN_AMOUNT && num <= MAX_AMOUNT;
  };

  const handleProceed = async () => {
    const validationError = getValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

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
      }>('/billing/wallet/initiate-payment', { amount: parseFloat(amount) });

      if (response.success && response.data?.payment_link) {
        localStorage.setItem('hdfc_order_id', response.data.order_id);
        window.location.href = response.data.payment_link;
      } else {
        setError(response.message || 'Failed to initiate payment');
        setLoading(false);
      }
    } catch (err: unknown) {
      console.error('Recharge initiation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to initiate payment';
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inlineError = amount ? getValidationError() : '';

  return (
    <div className="recharge-modal-overlay" onClick={handleClose}>
      <div className="recharge-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="recharge-modal-header">
          <h2>Recharge Wallet</h2>
          <button className="close-button" onClick={handleClose} disabled={loading}>
            ✕
          </button>
        </div>

        <div className="recharge-modal-body">
          <div className="recharge-balance-row">
            <span className="recharge-balance-label">Current Balance:</span>
            <span className="recharge-balance-value">₹{currentBalance.toFixed(2)}</span>
          </div>

          <div className="recharge-amount-section">
            <label className="recharge-field-label">Enter Amount (₹)</label>
            <div className="recharge-input-wrapper">
              <span className="recharge-rupee-icon">₹</span>
              <input
                type="number"
                className="recharge-amount-input"
                placeholder="Enter amount (500 - 50,000)"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                disabled={loading}
              />
            </div>
            {(inlineError || error) && (
              <div className="recharge-error-msg">{inlineError || error}</div>
            )}
          </div>

          <div className="recharge-quick-amounts">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                className={`recharge-quick-btn ${amount === amt.toString() ? 'selected' : ''}`}
                onClick={() => handleQuickSelect(amt)}
                disabled={loading}
              >
                ₹{amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <div className="recharge-modal-footer">
          <button className="recharge-cancel-btn" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="recharge-proceed-btn"
            onClick={handleProceed}
            disabled={loading || !isValid()}
          >
            {loading ? 'Processing...' : 'Proceed to Pay'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RechargeModal;
