import { apiService } from './api';
import { DataCache } from '../utils/dataCache';

export interface WalletBalance {
  balance: number;
  currency: string;
}

export interface InitiatePaymentResponse {
  success: boolean;
  message: string;
  data: {
    transaction_id: string;
    order_id: string;
    payment_link: string;
    sdk_payload?: unknown;
    amount: number;
    currency: string;
  };
}

export interface PaymentStatusResponse {
  success: boolean;
  message: string;
  data: {
    transaction_id: string;
    status: string;
    amount: number;
    new_balance?: number;
    is_pending?: boolean;
    error_code?: string;
    txn_id?: string;
  };
}

export interface TransactionDetailsResponse {
  success: boolean;
  message?: string;
  data: {
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
  };
}

class WalletService {
  private listeners: Array<(balance: WalletBalance) => void> = [];

  // Subscribe to wallet balance updates
  subscribe(listener: (balance: WalletBalance) => void) {
    this.listeners.push(listener);

    // Immediately notify with cached data if available
    const cached = DataCache.get<WalletBalance>('walletBalance');
    if (cached) {
      listener(cached);
    }

    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners of wallet balance changes
  notifyBalanceUpdate(balance: WalletBalance) {
    // Always cache the balance
    DataCache.set('walletBalance', balance);
    this.listeners.forEach(listener => listener(balance));
  }

  // Get current wallet balance - with cache fallback so it NEVER fails
  async getWalletBalance(useCache: boolean = true): Promise<WalletBalance> {
    // Try cache first for instant response
    if (useCache) {
      const cached = DataCache.get<WalletBalance>('walletBalance');
      if (cached) {
        // Still fetch fresh data in background, but return cached immediately
        this.getWalletBalance(false).catch(() => {
          // Ignore errors - we have cached data
        });
        return cached;
      }
    }

    try {
      const response = await apiService.get<{
        success: boolean;
        data: {
          balance: number;
          currency: string;
        };
      }>('/user/wallet-balance');

      if (response.success) {
        const balance = {
          balance: response.data.balance,
          currency: response.data.currency || 'INR'
        };

        // Cache it
        DataCache.set('walletBalance', balance);

        // Notify all listeners
        this.notifyBalanceUpdate(balance);

        return balance;
      }
      throw new Error('Failed to fetch wallet balance');
    } catch (error) {
      console.error('Error fetching wallet balance:', error);

      // On error, return stale cache - app continues working
      const stale = DataCache.getStale<WalletBalance>('walletBalance');
      if (stale) {
        console.log('Using cached wallet balance due to API error:', stale);
        return stale;
      }

      // No cache either - return default (don't throw)
      const defaultBalance: WalletBalance = { balance: 0, currency: 'INR' };
      return defaultBalance;
    }
  }

  // Refresh wallet balance and notify listeners
  async refreshBalance(): Promise<WalletBalance> {
    return this.getWalletBalance(false); // Force fresh fetch
  }

  // Initiate wallet recharge via HDFC SmartGateway
  async initiatePayment(amount: number): Promise<InitiatePaymentResponse> {
    const response = await apiService.post<InitiatePaymentResponse>(
      '/billing/wallet/initiate-payment',
      { amount }
    );
    return response;
  }

  // Handle payment response after HDFC redirect
  async handlePaymentResponse(orderId: string): Promise<PaymentStatusResponse> {
    const response = await apiService.post<PaymentStatusResponse>(
      '/billing/wallet/handle-payment-response',
      { order_id: orderId }
    );

    // If payment was successful, refresh balance
    if (response.success && response.data?.new_balance !== undefined) {
      const newBalance: WalletBalance = {
        balance: response.data.new_balance,
        currency: 'INR'
      };
      this.notifyBalanceUpdate(newBalance);
    }

    return response;
  }

  // Check payment status
  async checkPaymentStatus(orderId: string): Promise<PaymentStatusResponse> {
    const response = await apiService.get<PaymentStatusResponse>(
      `/billing/wallet/payment-status/${orderId}`
    );
    return response;
  }

  // Get complete transaction details for confirmation page
  async getTransactionDetails(orderId: string): Promise<TransactionDetailsResponse> {
    const response = await apiService.get<TransactionDetailsResponse>(
      `/billing/wallet/transaction-details/${orderId}`
    );
    return response;
  }
}

export const walletService = new WalletService();
