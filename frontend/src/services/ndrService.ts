import { apiService } from './api';

export interface NDROrder {
  _id: string;
  order_id: string;
  awb_number: string;
  customer_info: {
    buyer_name: string;
    phone: string;
    email?: string;
  };
  delivery_address: {
    full_address: string;
    city: string;
    state: string;
    pincode: string;
  };
  products?: Array<{
    product_name: string;
    quantity: number;
    selling_price?: number;
    sku?: string;
  }>;
  payment_info?: {
    payment_mode: string;
    total_amount?: number;
    cod_amount?: number;
  };
  ndr_info: {
    is_ndr: boolean;
    ndr_reason: string;
    nsl_code: string;
    ndr_attempts: number;
    last_ndr_date: string;
    resolution_action?: string | null;
    next_attempt_date?: string;
    action_history: Array<{
      action: string;
      timestamp: string;
      upl_id: string;
      status: string;
      remarks: string;
    }>;
  };
  delhivery_data: {
    waybill: string;
    status: string;
    scans?: Array<{
      ScanType: string;
      ScanDateTime: string;
      ScanLocation: string;
      Remarks: string;
    }>;
  };
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NDRFilters {
  page?: number;
  limit?: number;
  status?: 'action_required' | 'action_taken' | 'delivered' | 'rto' | 'all';
  ndr_reason?: string;
  nsl_code?: string;
  attempts_min?: number;
  attempts_max?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface NDRStats {
  action_required: number;
  action_taken: number;
  delivered: number;
  rto: number;
  all: number;
}

export interface NDROverview {
  period_days: number;
  total_ndrs: number;
  reason_breakdown: Array<{
    _id: string;
    count: number;
    avg_attempts: number;
  }>;
}

export interface NDRActionData {
  waybill: string;
  action: 'RE-ATTEMPT' | 'PICKUP_RESCHEDULE';
  reason?: string;
}

export interface BulkNDRActionData {
  order_ids: string[];
  action: 'RE-ATTEMPT' | 'PICKUP_RESCHEDULE';
  reason?: string;
}

export interface NDRStatusResponse {
  success: boolean;
  data: any;
  status: string;
  waybills: string[];
}

export interface CustomerInfoUpdate {
  updated_address?: string;
  updated_phone?: string;
  preferred_delivery_date?: string;
  customer_notes?: string;
}

class NDRService {
  // Get all NDR orders with filters and pagination
  async getNDROrders(filters: NDRFilters = {}): Promise<{
    orders: NDROrder[];
    pagination: {
      current_page: number;
      total_pages: number;
      total_orders: number;
      per_page: number;
    };
  }> {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.status) params.append('status', filters.status);
    if (filters.ndr_reason) params.append('ndr_reason', filters.ndr_reason);
    if (filters.nsl_code) params.append('nsl_code', filters.nsl_code);
    if (filters.attempts_min) params.append('attempts_min', filters.attempts_min.toString());
    if (filters.attempts_max) params.append('attempts_max', filters.attempts_max.toString());
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.search) params.append('search', filters.search);

    const response = await apiService.get<{
      data: {
        orders: NDROrder[];
        pagination: {
          current_page: number;
          total_pages: number;
          total_orders: number;
          per_page: number;
        };
      }
    }>(`/ndr?${params.toString()}`);
    
    return response.data;
  }

  // Get single NDR order by ID
  async getNDROrder(orderId: string): Promise<NDROrder> {
    const response = await apiService.get<{ data: NDROrder }>(`/ndr/${orderId}`);
    return response.data;
  }

  // Take NDR action (Re-Attempt or Pickup Reschedule)
  async takeNDRAction(actionData: NDRActionData): Promise<{
    waybill: string;
    action: string;
    upl_id: string;
    next_attempt_date?: string;
  }> {
    const response = await apiService.post<{
      data: {
        waybill: string;
        action: string;
        upl_id: string;
        next_attempt_date?: string;
      };
    }>('/ndr/action', actionData);
    
    return response.data;
  }

  // Get NDR status by UPL ID
  async getNDRStatus(uplId: string): Promise<NDRStatusResponse> {
    const response = await apiService.get<NDRStatusResponse>(`/ndr/status/${uplId}`);
    return response;
  }

  // Bulk NDR action
  async bulkNDRAction(bulkData: BulkNDRActionData): Promise<{
    upl_id: string;
    processed_count: number;
    waybills: string[];
  }> {
    const response = await apiService.post<{
      data: {
        upl_id: string;
        processed_count: number;
        waybills: string[];
      };
    }>('/ndr/bulk-action', bulkData);
    
    return response.data;
  }

  // Get NDR statistics/counts
  async getNDRStats(): Promise<NDRStats> {
    const response = await apiService.get<{ data: NDRStats }>('/ndr/statistics/counts');
    return response.data;
  }

  // Get NDR overview statistics
  async getNDROverview(period: number = 30): Promise<NDROverview> {
    const response = await apiService.get<{ data: NDROverview }>(`/ndr/statistics/overview?period=${period}`);
    return response.data;
  }

  // Update customer information for NDR
  async updateCustomerInfo(orderId: string, customerInfo: CustomerInfoUpdate): Promise<{
    order_id: string;
    updated_fields: string[];
  }> {
    const response = await apiService.patch<{
      data: {
        order_id: string;
        updated_fields: string[];
      };
    }>(`/ndr/${orderId}/customer-info`, customerInfo);
    
    return response.data;
  }

  // Validate NSL code for action
  validateNSLCode(nslCode: string, action: 'RE-ATTEMPT' | 'PICKUP_RESCHEDULE'): boolean {
    const allowedReAttemptCodes = ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
    const allowedRescheduleCodes = ['EOD-777', 'EOD-21'];

    if (action === 'RE-ATTEMPT') {
      return allowedReAttemptCodes.includes(nslCode);
    } else if (action === 'PICKUP_RESCHEDULE') {
      return allowedRescheduleCodes.includes(nslCode);
    }

    return false;
  }

  // Get allowed NSL codes for action
  getAllowedNSLCodes(action: 'RE-ATTEMPT' | 'PICKUP_RESCHEDULE'): string[] {
    if (action === 'RE-ATTEMPT') {
      return ['EOD-74', 'EOD-15', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-11', 'EOD-69', 'EOD-6'];
    } else if (action === 'PICKUP_RESCHEDULE') {
      return ['EOD-777', 'EOD-21'];
    }
    return [];
  }

  // Check if it's recommended time for NDR actions (after 9 PM)
  isRecommendedTime(): boolean {
    const currentHour = new Date().getHours();
    return currentHour >= 21;
  }

  // Get time recommendation message
  getTimeRecommendation(): string {
    const currentHour = new Date().getHours();
    if (currentHour < 21) {
      return `Current time: ${currentHour}:00. Recommended to apply NDR actions after 9 PM for better results.`;
    }
    return 'Good time to apply NDR actions (after 9 PM).';
  }
}

export const ndrService = new NDRService();
