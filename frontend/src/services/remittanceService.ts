import { apiService } from './api';

export interface Remittance {
  remittance_number: string;
  date: string;
  remittance_date?: string;
  bank_transaction_id: string | null;
  state: 'upcoming' | 'processing' | 'settled';
  total_remittance: number;
  total_orders: number;
  processed_on?: string;
  settlement_date?: string;
}

export interface RemittanceDetail extends Remittance {
  account_details: {
    bank: string;
    beneficiary_name: string;
    account_number: string;
    ifsc_code: string;
  };
  remittance_orders: Array<{
    awb_number: string;
    amount_collected: number;
    order_id: string;
    delivered_date?: string;
  }>;
}

export interface RemittanceFilters {
  page?: number;
  limit?: number;
  search?: string;
  state?: 'upcoming' | 'processing' | 'settled' | 'all';
  date_from?: string;
  date_to?: string;
}

export interface RemittancesResponse {
  success: boolean;
  data: {
    remittances: Remittance[];
    pagination: {
      current_page: number;
      total_pages: number;
      total_count: number;
      per_page: number;
    };
  };
}

export interface RemittanceDetailResponse {
  success: boolean;
  data: RemittanceDetail;
}

export interface UpcomingRemittanceResponse {
  success: boolean;
  data: {
    total_amount: number;
    total_orders: number;
    count: number;
    remittances: Array<{
      remittance_number: string;
      remittance_date: string;
      state: string;
      total_remittance: number;
      total_orders: number;
    }>;
  };
}

class RemittanceService {
  /**
   * Get all remittances for the logged-in user
   */
  async getRemittances(filters: RemittanceFilters = {}): Promise<RemittancesResponse> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.state) params.append('state', filters.state);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);

    return apiService.get<RemittancesResponse>(`/remittances?${params.toString()}`);
  }

  /**
   * Get upcoming remittances for the logged-in user
   */
  async getUpcoming(): Promise<UpcomingRemittanceResponse> {
    return apiService.get<UpcomingRemittanceResponse>('/remittances/upcoming');
  }

  /**
   * Get remittance details by remittance number
   */
  async getRemittanceDetail(remittanceNumber: string): Promise<RemittanceDetailResponse> {
    return apiService.get<RemittanceDetailResponse>(`/remittances/${encodeURIComponent(remittanceNumber)}`);
  }

  /**
   * Download AWB data for a remittance
   */
  async downloadAWBData(remittanceNumber: string): Promise<Blob> {
    const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/remittances/${encodeURIComponent(remittanceNumber)}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to download AWB data');
    }

    return response.blob();
  }
}

export const remittanceService = new RemittanceService();
