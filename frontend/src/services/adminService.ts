import { apiService } from './api';
import { environmentConfig } from '../config/environment';

export interface AdminClient {
  _id: string;
  client_id: string;
  company_name: string;
  your_name: string;
  email: string;
  phone_number: string;
  user_type: string;
  user_category?: string;
  account_status: 'active' | 'inactive' | 'suspended' | 'pending_verification';
  kyc_status: {
    status: 'pending' | 'verified' | 'rejected';
    verified_date?: Date;
    verification_notes?: string;
  };
  wallet_balance: number;
  created_at: Date;
  stats: {
    orders: number;
    packages: number;
    customers: number;
    recentOrders?: Array<{
      order_id: string;
      status: string;
      total_amount?: number;
      created_at?: string;
    }>;
  };
}

export interface AdminDashboard {
  overview: {
    totalClients: number;
    activeClients: number;
    pendingVerification: number;
    suspendedClients: number;
    totalOrders: number;
    totalPackages: number;
    totalCustomers: number;
  };
  clientsByType: Array<{
    _id: string;
    count: number;
  }>;
  monthlyRegistrations: Array<{
    _id: {
      year: number;
      month: number;
    };
    count: number;
  }>;
  recentClients: AdminClient[];
}

export interface AdminClientsResponse {
  success: boolean;
  data: {
    clients: AdminClient[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalClients: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

export interface AdminImpersonationResponse {
  token: string;
  expires_in: string;
  client: {
    _id: string;
    company_name: string;
    your_name: string;
    email: string;
    user_category?: string;
  };
}

export interface StaffPermissions {
  // Menu access
  dashboard: boolean;
  clients: boolean;
  orders: boolean;
  tickets: boolean;
  billing: boolean;
  remittances: boolean;
  ndr: boolean;
  weight_discrepancies: boolean;
  wallet_recharge: boolean;
  rate_cards: boolean;
  carriers: boolean;
  staff_management: boolean;
  // Action permissions
  can_recharge_wallet: boolean;
  can_change_client_category: boolean;
  can_generate_monthly_billing: boolean;
}

export interface Staff {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  created_by: string;
  is_active: boolean;
  permissions?: StaffPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface StaffResponse {
  success: boolean;
  data: Staff | Staff[];
  message?: string;
}

export interface GlobalSearchResult {
  orders: Array<{
    _id: string;
    order_id: string;
    awb_number: string;
    status: string;
    created_at: string;
    client_name: string;
    client_id: string;
    consignee_name: string;
  }>;
  packages: Array<{
    _id: string;
    awb_number: string;
    status: string;
    created_at: string;
    product_name: string;
    client_name: string;
    client_id: string;
  }>;
  customers: Array<{
    _id: string;
    name: string;
    phone: string;
    email: string;
    client_name: string;
    client_id: string;
    user_id: string;
  }>;
  clients: Array<{
    _id: string;
    company_name: string;
    client_id: string;
    phone_number: string;
    email: string;
    account_status: string;
  }>;
}

export interface GlobalSearchResponse {
  success: boolean;
  data: GlobalSearchResult;
}

export interface ClientDashboardData {
  client: {
    _id: string;
    company_name: string;
    your_name: string;
    email: string;
    phone_number: string;
    client_id: string;
    account_status: string;
    kyc_status: {
      status: string;
      verified_date?: string;
      verification_notes?: string;
    };
    wallet_balance: number;
    user_type: string;
    user_category?: string;
    created_at: string;
  };
  tickets: {
    open: number;
    in_progress: number;
    waiting_customer: number;
    escalated: number;
    resolved: number;
    closed: number;
    total: number;
  };
  orders: {
    new: number;
    ready_to_ship: number;
    pickup_scheduled: number;
    in_transit: number;
    out_for_delivery: number;
    delivered: number;
    ndr: number;
    rto_in_transit: number;
    rto_delivered: number;
    cancelled: number;
    lost: number;
    total: number;
  };
  ndr: {
    pending: number;
    reattempt_requested: number;
    rto_requested: number;
    resolved: number;
    total: number;
  };
  cod: {
    total_cod_orders: number;
    total_cod_amount: number;
    delivered_cod: number;
    pending_cod: number;
    rto_cod: number;
  };
  remittance: {
    total_remitted: number;
    pending_remittance: number;
    total_records: number;
  };
  recentTransactions: Array<{
    _id: string;
    type: string;
    amount: number;
    description: string;
    status: string;
    created_at: string;
  }>;
  recentOrders: Array<{
    _id: string;
    order_id: string;
    awb_number: string;
    status: string;
    consignee?: { name: string };
    created_at: string;
  }>;
}

export interface ClientDashboardResponse {
  success: boolean;
  data: ClientDashboardData;
}

export interface ZonePrices {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  F: number;
}

export interface WeightSlab {
  condition: string;
  zones: ZonePrices;
}

export interface RateCard {
  _id?: string;
  userCategory: string;
  carrier: string;
  carrier_id?: string;
  version?: number;
  effective_from?: string;
  effective_to?: string | null;
  is_current?: boolean;
  forwardCharges: WeightSlab[];
  rtoCharges: WeightSlab[];
  codCharges: {
    percentage: number;
    minimumAmount: number;
    gstAdditional: boolean;
  };
  zoneDefinitions: Array<{
    zone: string;
    definition: string;
  }>;
  termsAndConditions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RateCardResponse {
  success: boolean;
  data: RateCard | string[];
  message?: string;
}

// Carrier interfaces
export interface Carrier {
  _id: string;
  carrier_code: string;
  display_name: string;
  carrier_group: string;
  service_type: 'surface' | 'air' | 'premium' | 'express';
  is_active: boolean;
  zone_type: 'standard' | 'regional';
  weight_slab_type: 'option1' | 'option2';
  api_config?: {
    base_url?: string;
    api_key_required?: boolean;
    tracking_url_template?: string;
    waybill_prefix?: string;
  };
  description?: string;
  logo_url?: string;
  priority_order: number;
  rate_card_count?: number;
  rate_cards?: RateCard[];
  created_by?: string;
  updated_by?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CarrierListResponse {
  success: boolean;
  data: Carrier[];
  total: number;
}

export interface CarrierDetailResponse {
  success: boolean;
  data: Carrier;
}

export interface CarrierRatesResponse {
  success: boolean;
  data: {
    carrier: Carrier;
    rates: {
      'New User': RateCard | null;
      'Lite User': RateCard | null;
      'Basic User': RateCard | null;
      'Advanced': RateCard | null;
    };
    categories: string[];
  };
}

export interface CarrierRateHistoryResponse {
  success: boolean;
  data: {
    carrier: Carrier;
    history: RateCard[];
  };
}

export interface AdminTicket {
  _id: string;
  ticket_id: string;
  category: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  awb_numbers?: string[]; // Optional - only present for shipment-related categories
  user_id: {
    _id: string;
    company_name: string;
    your_name: string;
    email: string;
    phone_number: string;
    client_id: string;
  };
  conversation: Array<{
    message_type: 'user' | 'admin' | 'system';
    sender_name: string;
    staff_name?: string;
    sender?: string;
    message_content: string;
    message?: string;
    timestamp: string;
    is_internal?: boolean;
    attachments?: Array<{
      _id?: string;
      file_name: string;
      file_url: string;
      file_type: string;
      file_size?: number;
      mimetype?: string;
    }>;
  }>;
  assignment_info?: {
    assigned_to?: string;
    assigned_by?: string;
    assigned_by_staff?: string;
    assigned_date?: string;
    department?: string;
  };
  resolution?: {
    resolution_date?: string;
    resolution_summary?: string;
    resolution_category?: string;
    resolved_by_staff?: string;
    internal_notes?: string;
  };
  attachments?: Array<{
    _id?: string;
    file_name: string;
    file_url: string;
    file_type: string;
    file_size?: number;
    mimetype?: string;
  }>;
}

export interface AdminTicketsResponse {
  success: boolean;
  data: {
    tickets: AdminTicket[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalTickets: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    stats: {
      total_tickets: number;
      status_breakdown: {
        [key: string]: number;
      };
      status_counts?: {
        [key: string]: number;
      };
    };
  };
}

export interface AdminTicketSummaryTotals {
  all: number;
  open: number;
  in_progress: number;
  waiting_customer: number;
  resolved: number;
  closed: number;
  escalated: number;
}

export interface AdminTicketPriorityTotals {
  urgent: number;
  high: number;
  medium: number;
  low: number;
}

export interface AdminTicketSummaryClient {
  clientMongoId: string;
  clientId: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phoneNumber: string;
  totalTickets: number;
  statusCounts: {
    open: number;
    in_progress: number;
    waiting_customer: number;
    resolved: number;
    closed: number;
    escalated: number;
  };
  priorityCounts: {
    urgent: number;
    high: number;
    medium: number;
    low: number;
  };
  latestUpdatedAt: string | null;
}

export interface AdminTicketSummaryData {
  totals: AdminTicketSummaryTotals;
  priorityTotals?: AdminTicketPriorityTotals;
  clients: AdminTicketSummaryClient[];
}

export interface AdminTicketSummaryResponse {
  success: boolean;
  data: AdminTicketSummaryData;
}

export interface AdminTicketUpdateData {
  ticket?: AdminTicket;
  previous_status?: string;
  current_status?: string;
  previous_priority?: string;
  current_priority?: string;
  status_counts?: {
    [key: string]: number;
  };
}

export interface AdminTicketUpdateResponse {
  success: boolean;
  message: string;
  data?: AdminTicketUpdateData;
}

export interface AdminDashboardResponse {
  success: boolean;
  data: AdminDashboard;
}

export interface ClientDocument {
  type: string;
  name: string;
  url: string;
  uploadedAt: Date;
  status: string;
}

export interface ClientDocumentsResponse {
  success: boolean;
  data: {
    client: {
      id: string;
      client_id: string;
      company_name: string;
      your_name: string;
      email: string;
      kyc_status: {
        status: 'pending' | 'verified' | 'rejected';
        verified_date?: Date;
        verification_notes?: string;
      };
    };
    documents: ClientDocument[];
  };
}

export interface AdminOrderAddress {
  address_line_1?: string;
  address_line_2?: string;
  full_address?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  address_type?: string;
}

export interface AdminOrderPickupAddress {
  name?: string;
  full_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
}

export interface AdminOrderDetailsProduct {
  line_item: number;
  product_name?: string;
  product_description?: string;
  quantity?: number;
  unit_price?: number;
  hsn_code?: string;
  category?: string;
  sku?: string;
  discount?: number;
  tax?: number;
  tax_rate?: number;
  total_price?: number;
  [key: string]: any;
}

export interface AdminOrderDetailsStatusHistory {
  status: string;
  timestamp?: string;
  remarks?: string;
  location?: string;
  updated_by?: string;
  [key: string]: any;
}

export interface AdminOrderDetailsTrackingEvent {
  _id?: string;
  waybill?: string;
  order_id?: string;
  reference_no?: string;
  status: string;
  status_type?: string;
  status_date_time: string;
  status_location?: string;
  instructions?: string;
  nsl_code?: string;
  sort_code?: string;
  pickup_date?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface AdminOrderDetailsMetrics {
  total_products: number;
  total_units: number;
  volumetric_weight: number | null;
  actual_weight: number | null;
  order_value: number | null;
  cod_amount: number | null;
  total_amount: number | null;
  shipping_charges: number | null;
  grand_total: number | null;
}

export interface AdminOrderClientSummary {
  _id: string;
  client_id: string;
  company_name: string;
  your_name: string;
  email: string;
  phone_number: string;
  user_category?: string;
  account_status?: string;
  kyc_status?: {
    status: string;
    verified_date?: string;
    verification_notes?: string;
  };
  created_at?: string;
}

export interface AdminOrderDetails {
  _id: string;
  order_id: string;
  status: string;
  order_date?: string;
  reference_id?: string;
  invoice_number?: string;
  order_type?: string;
  shipping_mode?: string;
  delivery_address?: AdminOrderAddress;
  pickup_address?: AdminOrderPickupAddress;
  return_address?: AdminOrderAddress;
  customer_info?: {
    buyer_name?: string;
    phone?: string;
    alternate_phone?: string;
    email?: string;
    gstin?: string;
    [key: string]: any;
  };
  products: AdminOrderDetailsProduct[];
  package_info?: {
    weight?: number;
    dimensions?: {
      length?: number;
      width?: number;
      height?: number;
    };
    volumetric_weight?: number;
    package_type?: string;
    number_of_boxes?: number;
    weight_per_box?: number;
    rov_type?: string;
    rov_owner?: string;
    weight_photo_url?: string;
    dimensions_photo_url?: string;
    [key: string]: any;
  };
  payment_info?: {
    payment_mode?: string;
    cod_amount?: number;
    order_value?: number;
    total_amount?: number;
    shipping_charges?: number;
    grand_total?: number;
    [key: string]: any;
  };
  seller_info?: {
    name?: string;
    gst_number?: string;
    address?: string;
    reseller_name?: string;
    [key: string]: any;
  };
  delhivery_data?: Record<string, any>;
  mps_data?: Record<string, any>;
  ndr_info?: Record<string, any>;
  status_history: AdminOrderDetailsStatusHistory[];
  tracking_history: AdminOrderDetailsTrackingEvent[];
  metrics: AdminOrderDetailsMetrics;
  client?: AdminOrderClientSummary | null;
  special_instructions?: string;
  internal_notes?: string;
  cancellation_reason?: string;
  cancelled_date?: string;
  pickup_scheduled_date?: string;
  delivered_date?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

class AdminService {
  private getAdminHeaders() {
    const adminEmail = localStorage.getItem('admin_email') || localStorage.getItem('staff_email') || 'udditalerts247@gmail.com';
    const adminPassword = localStorage.getItem('admin_password') || 'jpmcA123';
    return {
      'x-admin-email': adminEmail,
      'x-admin-password': adminPassword
    };
  }

  async getDashboard(): Promise<AdminDashboard> {
    const response = await apiService.get<AdminDashboardResponse>('/admin/dashboard', {
      headers: this.getAdminHeaders()
    });
    return response.data;
  }

  async getClients(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    user_type?: string;
    sortBy?: string;
    sortOrder?: number;
  } = {}): Promise<AdminClientsResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    if (params.user_type) queryParams.append('user_type', params.user_type);
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder.toString());

    const response = await apiService.get<AdminClientsResponse>(`/admin/clients?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientDetails(clientId: string): Promise<AdminClient> {
    const response = await apiService.get<{ success: boolean; data: AdminClient }>(`/admin/clients/${clientId}`, {
      headers: this.getAdminHeaders()
    });
    return response.data;
  }

  async impersonateClient(clientId: string): Promise<AdminImpersonationResponse> {
    const response = await apiService.post<{ success: boolean; data: AdminImpersonationResponse }>(
      `/admin/clients/${clientId}/impersonate`,
      {},
      {
        headers: this.getAdminHeaders()
      }
    );
    return response.data;
  }

  async updateClientStatus(clientId: string, account_status: string): Promise<{ success: boolean; message: string; data: AdminClient }> {
    const response = await apiService.patch<{ success: boolean; message: string; data: AdminClient }>(`/admin/clients/${clientId}/status`, {
      account_status
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async updateClientKYC(clientId: string, kyc_status: string, verification_notes?: string): Promise<{ success: boolean; message: string; data: AdminClient }> {
    const response = await apiService.patch<{ success: boolean; message: string; data: AdminClient }>(`/admin/clients/${clientId}/kyc`, {
      kyc_status,
      verification_notes
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientPackages(clientId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);

    const response = await apiService.get(`/admin/clients/${clientId}/packages?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientCustomers(clientId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<any> {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);

    const response = await apiService.get(`/admin/clients/${clientId}/customers?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientDocuments(clientId: string): Promise<ClientDocumentsResponse> {
    const response = await apiService.get<ClientDocumentsResponse>(`/admin/clients/${clientId}/documents`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getTicketSummary(): Promise<AdminTicketSummaryData> {
    const response = await apiService.get<AdminTicketSummaryResponse>('/admin/tickets/summary', {
      headers: this.getAdminHeaders()
    });
    return response.data;
  }

  // Ticket management methods
  async getClientTickets(clientId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
    category?: string;
    priority?: string;
  } = {}): Promise<AdminTicketsResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.category) queryParams.append('category', params.category);
    if (params.priority) queryParams.append('priority', params.priority);

    const response = await apiService.get<AdminTicketsResponse>(`/admin/clients/${clientId}/tickets?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getAllTickets(params: {
    page?: number;
    limit?: number;
    status?: string;
    category?: string;
    priority?: string;
    assigned_to?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    sort_by?: string;
    sort_order?: string;
  } = {}): Promise<AdminTicketsResponse> {
    const queryParams = new URLSearchParams();

    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.category) queryParams.append('category', params.category);
    if (params.priority) queryParams.append('priority', params.priority);
    if (params.assigned_to) queryParams.append('assigned_to', params.assigned_to);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);
    if (params.search) queryParams.append('search', params.search);
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    if (params.sort_order) queryParams.append('sort_order', params.sort_order);

    const response = await apiService.get<AdminTicketsResponse>(`/admin/tickets?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getTicketDetails(ticketId: string): Promise<{ success: boolean; data: AdminTicket }> {
    const response = await apiService.get<{ success: boolean; data: AdminTicket }>(`/admin/tickets/${ticketId}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async sendTicketMessage(ticketId: string, message: string, isInternal: boolean = false, files?: File[]): Promise<{ success: boolean; message: string }> {
    // If there are files, use FormData
    if (files && files.length > 0) {
      const formData = new FormData();
      if (message && message.trim()) {
        formData.append('message', message);
      }
      formData.append('is_internal', isInternal.toString());

      files.forEach(file => {
        formData.append('files', file);
      });

      // Note: Do NOT set Content-Type header for FormData - browser must set it with boundary
      const response = await apiService.post<{ success: boolean; message: string }>(`/admin/tickets/${ticketId}/messages`, formData, {
        headers: this.getAdminHeaders()
      });
      return response;
    }

    // No files, use JSON
    const response = await apiService.post<{ success: boolean; message: string }>(`/admin/tickets/${ticketId}/messages`, {
      message,
      is_internal: isInternal
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async updateTicketStatus(ticketId: string, status: string, reason?: string): Promise<AdminTicketUpdateResponse> {
    const response = await apiService.patch<AdminTicketUpdateResponse>(`/admin/tickets/${ticketId}/status`, {
      status,
      reason
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async updateTicketPriority(ticketId: string, priority: 'low' | 'medium' | 'high' | 'urgent', reason?: string): Promise<AdminTicketUpdateResponse> {
    const response = await apiService.patch<AdminTicketUpdateResponse>(`/admin/tickets/${ticketId}/priority`, {
      priority,
      reason
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async downloadAttachment(ticketId: string, attachmentId: string, fallbackName?: string): Promise<{
    blob: Blob;
    contentType: string;
    filename: string;
  }> {
    const downloadUrl = `${environmentConfig.apiUrl}/admin/tickets/${ticketId}/attachments/${attachmentId}/download`;

    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        ...this.getAdminHeaders()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to download attachment' }));
      throw new Error(errorData.message || 'Failed to download attachment');
    }

    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('Content-Disposition');

    let filename = fallbackName || `attachment-${attachmentId}`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
      }
    }

    const blob = await response.blob();

    return {
      blob,
      contentType,
      filename
    };
  }

  async assignTicket(ticketId: string, assignedTo: string, department: string = 'customer_service'): Promise<{ success: boolean; message: string }> {
    const response = await apiService.patch<{ success: boolean; message: string }>(`/admin/tickets/${ticketId}/assign`, {
      assigned_to: assignedTo,
      department
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async resolveTicket(ticketId: string, resolutionSummary: string, resolutionCategory: string, internalNotes?: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.post<{ success: boolean; message: string }>(`/admin/tickets/${ticketId}/resolve`, {
      resolution_summary: resolutionSummary,
      resolution_category: resolutionCategory,
      internal_notes: internalNotes
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  // Notification methods
  async getNotifications(): Promise<{ success: boolean; data: { notifications: any[]; unread_count: number } }> {
    try {
      const response = await apiService.get<{ success: boolean; data: { notifications: any[]; unread_count: number } }>(`/admin/notifications`, {
        headers: this.getAdminHeaders()
      });
      return response;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return {
        success: false,
        data: { notifications: [], unread_count: 0 }
      };
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.patch<{ success: boolean; message: string }>(`/admin/notifications/${notificationId}/read`, {}, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async markAllNotificationsAsRead(): Promise<{ success: boolean; message: string }> {
    const response = await apiService.patch<{ success: boolean; message: string }>(`/admin/notifications/read-all`, {}, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  // Wallet recharge methods
  async rechargeWallet(clientId: string, amount: number, description?: string): Promise<{ success: boolean; message: string; data: any }> {
    const response = await apiService.post<{ success: boolean; message: string; data: any }>(`/admin/wallet-recharge`, {
      client_id: clientId,
      amount,
      description
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  // Wallet adjustment method (credit or debit)
  // Includes idempotency key to prevent duplicate transactions
  private _lastIdempotencyKey: string | null = null;

  async adjustWallet(clientId: string, amount: number, type: 'credit' | 'debit', description?: string): Promise<{ success: boolean; message: string; data: any }> {
    // Generate a stable idempotency key per logical operation.
    // Uses a 1-minute time bucket so retries within the same minute share the same key.
    const timeBucket = Math.floor(Date.now() / 60000);
    const idempotency_key = `wallet_${clientId}_${amount}_${type}_${timeBucket}`;

    // Prevent frontend from firing the same call twice concurrently
    if (this._lastIdempotencyKey === idempotency_key) {
      throw new Error('Please wait — this transaction is already being processed.');
    }
    this._lastIdempotencyKey = idempotency_key;

    try {
      const response = await apiService.post<{ success: boolean; message: string; data: any }>(`/admin/wallet-recharge`, {
        client_id: clientId,
        amount,
        type,
        description,
        idempotency_key
      }, {
        headers: this.getAdminHeaders()
      });
      return response;
    } finally {
      // Clear after 5 seconds to allow a genuinely new recharge
      setTimeout(() => {
        if (this._lastIdempotencyKey === idempotency_key) {
          this._lastIdempotencyKey = null;
        }
      }, 5000);
    }
  }

  // Legacy method - kept for backward compatibility
  async getClientWalletBalanceLegacy(clientId: string): Promise<{ success: boolean; data: { client_id: string; client_id_code: string; company_name: string; email: string; wallet_balance: number } }> {
    const response = await apiService.get<{ success: boolean; data: { client_id: string; client_id_code: string; company_name: string; email: string; wallet_balance: number } }>(`/admin/client-wallet/${clientId}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async updateClientLabel(clientId: string, user_category: string): Promise<{ success: boolean; message: string; data: AdminClient }> {
    const response = await apiService.patch<{ success: boolean; message: string; data: AdminClient }>(`/admin/clients/${clientId}/label`, {
      user_category
    }, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  // ============================================================================
  // ADMIN BILLING METHODS
  // ============================================================================

  async getBillingClients(params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{
    success: boolean;
    data: {
      clients: Array<{
        _id: string;
        client_id: string;
        company_name: string;
        email: string;
        your_name: string;
        wallet_balance: number;
        total_credits: number;
        total_debits: number;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);

    const response = await apiService.get<{
      success: boolean;
      data: {
        clients: Array<{
          _id: string;
          client_id: string;
          company_name: string;
          email: string;
          your_name: string;
          wallet_balance: number;
          total_credits: number;
          total_debits: number;
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      };
    }>(`/admin/billing/clients?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientBillingDetails(clientId: string): Promise<{
    success: boolean;
    data: {
      _id: string;
      client_id: string;
      company_name: string;
      email: string;
      your_name: string;
      phone_number: string;
    };
  }> {
    const response = await apiService.get<{
      success: boolean;
      data: {
        _id: string;
        client_id: string;
        company_name: string;
        email: string;
        your_name: string;
        phone_number: string;
      };
    }>(`/admin/billing/clients/${clientId}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientWalletBalance(clientId: string): Promise<{
    success: boolean;
    data: {
      available_balance: number;
      pending_credits: number;
      pending_debits: number;
      effective_balance: number;
      currency: string;
    };
  }> {
    const response = await apiService.get<{
      success: boolean;
      data: {
        available_balance: number;
        pending_credits: number;
        pending_debits: number;
        effective_balance: number;
        currency: string;
      };
    }>(`/admin/billing/clients/${clientId}/wallet-balance`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientWalletTransactions(clientId: string, params: {
    page?: number;
    limit?: number;
    type?: string;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<{
    success: boolean;
    data: {
      transactions: Array<{
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
        // Staff/Admin who performed the transaction (for manual adjustments)
        performed_by?: {
          name: string;
          email: string;
          role: 'admin' | 'staff' | 'system';
        } | null;
        created_by?: string;
        transaction_category?: string;
      }>;
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
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.type) queryParams.append('type', params.type);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);

    const response = await apiService.get<{
      success: boolean;
      data: {
        transactions: Array<{
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
          performed_by?: {
            name: string;
            email: string;
            role: 'admin' | 'staff' | 'system';
          } | null;
          created_by?: string;
          transaction_category?: string;
        }>;
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
    }>(`/admin/billing/clients/${clientId}/wallet-transactions?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async generateMonthlyBilling(params: {
    month: number;
    year: number;
  }): Promise<{
    success: boolean;
    message?: string;
    data?: {
      processed: number;
      totalAmount: number;
    };
  }> {
    const response = await apiService.post<{
      success: boolean;
      message?: string;
      data?: {
        processed: number;
        totalAmount: number;
      };
    }>('/admin/billing/generate-monthly', params, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  // ============================================================================
  // ADMIN ORDERS METHODS
  // ============================================================================

  async getOrdersClients(params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{
    success: boolean;
    data: {
      clients: Array<{
        _id: string;
        client_id: string;
        company_name: string;
        email: string;
        your_name: string;
        total_orders: number;
        orders_by_status: {
          new: number;
          ready_to_ship: number;
          pickups_manifests: number;
          in_transit: number;
          out_for_delivery: number;
          delivered: number;
          ndr: number;
          rto: number;
          cancelled: number;
        };
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);

    const response = await apiService.get<{
      success: boolean;
      data: {
        clients: Array<{
          _id: string;
          client_id: string;
          company_name: string;
          email: string;
          your_name: string;
          total_orders: number;
          orders_by_status: {
            new: number;
            ready_to_ship: number;
            pickups_manifests: number;
            in_transit: number;
            out_for_delivery: number;
            delivered: number;
            ndr: number;
          rto: number;
          cancelled: number;
          };
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      };
    }>(`/admin/orders/clients?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientOrders(clientId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
    order_type?: string;
    payment_mode?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
  } = {}): Promise<{
    status: string;
    data: {
      orders: any[];
      pagination: {
        current_page: number;
        total_pages: number;
        total_orders: number;
        per_page: number;
      };
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.order_type) queryParams.append('order_type', params.order_type);
    if (params.payment_mode) queryParams.append('payment_mode', params.payment_mode);
    if (params.search) queryParams.append('search', params.search);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);

    const response = await apiService.get<{
      status: string;
      data: {
        orders: any[];
        pagination: {
          current_page: number;
          total_pages: number;
          total_orders: number;
          per_page: number;
        };
      };
    }>(`/admin/orders/clients/${clientId}/orders?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientOrderStats(clientId: string): Promise<{
    success: boolean;
    data: {
      new: number;
      ready_to_ship: number;
      pickups_manifests: number;
      in_transit: number;
      out_for_delivery: number;
      delivered: number;
      ndr: number;
      rto: number;
      all: number;
    };
  }> {
    const response = await apiService.get<{
      success: boolean;
      data: {
        new: number;
        ready_to_ship: number;
        pickups_manifests: number;
        in_transit: number;
        out_for_delivery: number;
        delivered: number;
        ndr: number;
        rto: number;
        all: number;
      };
    }>(`/admin/orders/clients/${clientId}/stats`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getOrderDetails(orderId: string): Promise<{
    success: boolean;
    data: AdminOrderDetails;
  }> {
    const response = await apiService.get<{
      success: boolean;
      data: AdminOrderDetails;
    }>(`/admin/orders/${orderId}/details`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  // ============================================================================
  // ADMIN NDR METHODS
  // ============================================================================

  async getNDRClients(params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{
    success: boolean;
    data: {
      clients: Array<{
        _id: string;
        client_id: string;
        company_name: string;
        email: string;
        your_name: string;
        total_ndrs: number;
        ndrs_by_status: {
          action_required: number;
          action_taken: number;
          delivered: number;
          rto: number;
        };
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.search) queryParams.append('search', params.search);

    const response = await apiService.get<{
      success: boolean;
      data: {
        clients: Array<{
          _id: string;
          client_id: string;
          company_name: string;
          email: string;
          your_name: string;
          total_ndrs: number;
          ndrs_by_status: {
            action_required: number;
            action_taken: number;
            delivered: number;
            rto: number;
          };
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      };
    }>(`/admin/ndr/clients?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientNDRs(clientId: string, params: {
    page?: number;
    limit?: number;
    status?: string;
    ndr_reason?: string;
    nsl_code?: string;
    attempts_min?: number;
    attempts_max?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  } = {}): Promise<{
    status: string;
    data: {
      orders: any[];
      pagination: {
        current_page: number;
        total_pages: number;
        total_orders: number;
        per_page: number;
      };
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.status) queryParams.append('status', params.status);
    if (params.ndr_reason) queryParams.append('ndr_reason', params.ndr_reason);
    if (params.nsl_code) queryParams.append('nsl_code', params.nsl_code);
    if (params.attempts_min) queryParams.append('attempts_min', params.attempts_min.toString());
    if (params.attempts_max) queryParams.append('attempts_max', params.attempts_max.toString());
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);
    if (params.search) queryParams.append('search', params.search);

    const response = await apiService.get<{
      status: string;
      data: {
        orders: any[];
        pagination: {
          current_page: number;
          total_pages: number;
          total_orders: number;
          per_page: number;
        };
      };
    }>(`/admin/ndr/clients/${clientId}/ndrs?${queryParams.toString()}`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  async getClientNDRStats(clientId: string): Promise<{
    success: boolean;
    data: {
      action_required: number;
      action_taken: number;
      delivered: number;
      rto: number;
      all: number;
    };
  }> {
    const response = await apiService.get<{
      success: boolean;
      data: {
        action_required: number;
        action_taken: number;
        delivered: number;
        rto: number;
        all: number;
      };
    }>(`/admin/ndr/clients/${clientId}/stats`, {
      headers: this.getAdminHeaders()
    });
    return response;
  }

  /**
   * Upload remittance Excel file
   */
  async uploadRemittanceExcel(file: File): Promise<{
    success: boolean;
    message: string;
    data: {
      total: number;
      successful: number;
      failed: number;
      remittances_created: number;
      remittances_updated: number;
      errors: Array<{
        remittance_number?: string;
        row?: number;
        awb?: string;
        user_id?: string;
        error: string;
      }>;
      details: Array<{
        remittance_number: string;
        user_id: string;
        orders_count: number;
        total_remittance: number;
        action: string;
      }>;
    };
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${environmentConfig.apiUrl}/admin/remittances/upload`, {
      method: 'POST',
      headers: {
        'x-admin-email': localStorage.getItem('admin_email') || '',
        'x-admin-password': 'jpmcA123' // TODO: Use secure admin authentication
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload remittance file');
    }

    return response.json();
  }

  // Staff Management Methods
  async createStaff(name: string, email: string, password: string): Promise<StaffResponse> {
    const response = await apiService.post<StaffResponse>(
      '/admin/staff',
      { name, email, password },
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  async getStaff(): Promise<StaffResponse> {
    const response = await apiService.get<StaffResponse>(
      '/admin/staff',
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  async updateStaff(staffId: string, updates: { name?: string; email?: string; password?: string; is_active?: boolean }): Promise<StaffResponse> {
    const response = await apiService.patch<StaffResponse>(
      `/admin/staff/${staffId}`,
      updates,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  async deleteStaff(staffId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.delete<{ success: boolean; message: string }>(
      `/admin/staff/${staffId}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  async verifyStaffCredentials(email: string, password: string): Promise<{ success: boolean; message?: string; staff?: Staff; admin?: { email: string; role: string } }> {
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/admin/staff/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': email,
          'x-admin-password': password
        }
      });

      if (!response.ok) {
        return { success: false, message: 'Invalid credentials' };
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      return { success: false, message: error.message || 'Verification failed' };
    }
  }

  // Ratecard Management Methods
  async getRateCardCategories(): Promise<string[]> {
    const response = await apiService.get<RateCardResponse>(
      '/admin/ratecard',
      {
        headers: this.getAdminHeaders()
      }
    );
    return response.data as string[];
  }

  async getRateCard(userCategory: string): Promise<RateCard> {
    // Normalize category for URL
    const normalizedCategory = userCategory.toLowerCase().replace(/\s+/g, '-');
    const response = await apiService.get<RateCardResponse>(
      `/admin/ratecard/${normalizedCategory}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response.data as RateCard;
  }

  async updateRateCard(userCategory: string, updates: Partial<RateCard>): Promise<RateCardResponse> {
    // Normalize category for URL
    const normalizedCategory = userCategory.toLowerCase().replace(/\s+/g, '-');
    const response = await apiService.patch<RateCardResponse>(
      `/admin/ratecard/${normalizedCategory}`,
      updates,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Global search - search by AWB, Order ID, or Contact Number
  async globalSearch(query: string): Promise<GlobalSearchResult> {
    const response = await apiService.get<GlobalSearchResponse>(
      `/admin/global-search?query=${encodeURIComponent(query)}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response.data;
  }

  // Get client dashboard with comprehensive stats
  async getClientDashboard(clientId: string): Promise<ClientDashboardData> {
    const response = await apiService.get<ClientDashboardResponse>(
      `/admin/clients/${clientId}/dashboard`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response.data;
  }

  // ==================== CARRIER MANAGEMENT METHODS ====================

  // Get all carriers with optional filtering and sorting
  async getCarriers(params: {
    sort?: 'a-z' | 'z-a' | 'newest' | 'oldest';
    filter?: string;
    active_only?: boolean;
  } = {}): Promise<CarrierListResponse> {
    const queryParams = new URLSearchParams();
    if (params.sort) queryParams.append('sort', params.sort);
    if (params.filter) queryParams.append('filter', params.filter);
    if (params.active_only !== undefined) queryParams.append('active_only', params.active_only.toString());

    const queryString = queryParams.toString();
    const response = await apiService.get<CarrierListResponse>(
      `/admin/carriers${queryString ? `?${queryString}` : ''}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Get single carrier by ID
  async getCarrier(carrierId: string): Promise<Carrier> {
    const response = await apiService.get<CarrierDetailResponse>(
      `/admin/carriers/${carrierId}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response.data;
  }

  // Create new carrier
  async createCarrier(carrierData: {
    carrier_code: string;
    display_name: string;
    carrier_group: string;
    service_type: 'surface' | 'air' | 'premium' | 'express';
    zone_type?: 'standard' | 'regional';
    weight_slab_type?: 'option1' | 'option2';
    description?: string;
    priority_order?: number;
    api_config?: Carrier['api_config'];
  }): Promise<CarrierDetailResponse> {
    const response = await apiService.post<CarrierDetailResponse>(
      '/admin/carriers',
      carrierData,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Update carrier
  async updateCarrier(carrierId: string, updates: Partial<Carrier>): Promise<CarrierDetailResponse> {
    const response = await apiService.patch<CarrierDetailResponse>(
      `/admin/carriers/${carrierId}`,
      updates,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Delete carrier (soft delete)
  async deleteCarrier(carrierId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.delete<{ success: boolean; message: string }>(
      `/admin/carriers/${carrierId}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Activate carrier
  async activateCarrier(carrierId: string): Promise<CarrierDetailResponse> {
    const response = await apiService.post<CarrierDetailResponse>(
      `/admin/carriers/${carrierId}/activate`,
      {},
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Deactivate carrier
  async deactivateCarrier(carrierId: string): Promise<CarrierDetailResponse> {
    const response = await apiService.post<CarrierDetailResponse>(
      `/admin/carriers/${carrierId}/deactivate`,
      {},
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Get current rates for a carrier (all categories)
  async getCarrierRates(carrierId: string): Promise<CarrierRatesResponse> {
    const response = await apiService.get<CarrierRatesResponse>(
      `/admin/carriers/${carrierId}/rates`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Get rate history for a carrier
  async getCarrierRateHistory(carrierId: string, category?: string): Promise<CarrierRateHistoryResponse> {
    const queryParams = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await apiService.get<CarrierRateHistoryResponse>(
      `/admin/carriers/${carrierId}/rates/history${queryParams}`,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Create or update rate card for a carrier category
  async saveCarrierRate(carrierId: string, category: string, rateData: Partial<RateCard>): Promise<RateCardResponse> {
    const normalizedCategory = category.toLowerCase().replace(/\s+/g, '-');
    const response = await apiService.post<RateCardResponse>(
      `/admin/carriers/${carrierId}/rates/${normalizedCategory}`,
      rateData,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }

  // Update existing rate card for a carrier category
  async updateCarrierRate(carrierId: string, category: string, updates: Partial<RateCard>): Promise<RateCardResponse> {
    const normalizedCategory = category.toLowerCase().replace(/\s+/g, '-');
    const response = await apiService.patch<RateCardResponse>(
      `/admin/carriers/${carrierId}/rates/${normalizedCategory}`,
      updates,
      {
        headers: this.getAdminHeaders()
      }
    );
    return response;
  }
}

export const adminService = new AdminService();
