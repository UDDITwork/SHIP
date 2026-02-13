import { apiService } from './api';

export interface User {
  _id: string;
  client_id: string;
  company_name: string;
  your_name: string;
  email: string;
  phone_number: string;
  user_type: string;
  gstin: string;
  joined_date: string;
  avatar_url?: string;
  company_logo_url?: string;
  company_logo_public_id?: string;
  company_logo_uploaded_at?: string;
  address: {
    full_address: string;
    landmark: string;
    pincode: string;
    city: string;
    state: string;
  };
  bank_details: {
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch_name: string;
    account_holder_name: string;
  };
  documents: Array<{
    document_type: string;
    document_status: string;
    file_url: string;
    upload_date: string;
  }>;
  kyc_status: {
    status: 'pending' | 'verified' | 'rejected';
    verified_date?: string;
    verification_notes?: string;
  };
  profile_locked_fields?: {
    company_name?: boolean;
    your_name?: boolean;
    gstin?: boolean;
    phone_number?: boolean;
    email?: boolean;
    bank_details?: boolean;
  };
  can_create_shipments?: boolean;
  api_details: {
    public_key: string;
    private_key: string;
    api_documentation_version: string;
  };
}

export interface UpdateProfileData {
  company_name?: string;
  your_name?: string;
  email?: string;
  phone_number?: string;
  gstin?: string;
  address?: {
    full_address: string;
    landmark: string;
    pincode: string;
    city: string;
    state: string;
  };
  bank_details?: {
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch_name: string;
    account_holder_name: string;
  };
}

export interface PasswordResetData {
  current_password: string;
  new_password: string;
}

export interface DocumentUploadData {
  file: File;
  document_type: string;
}

class UserService {
  // Get user profile
  async getProfile(): Promise<User> {
    const response = await apiService.get<{ status: string; data?: User; message?: string }>('/users/profile');
    // Verify response has data property
    if (response.status === 'success' && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to load user profile');
  }

  // Update user profile
  async updateProfile(data: UpdateProfileData): Promise<User> {
    const response = await apiService.put<{ status: string; data?: User; message?: string }>('/users/profile', data);
    // Verify response has data property
    if (response.status === 'success' && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to update profile');
  }

  // Reset password
  async resetPassword(data: PasswordResetData): Promise<{ message: string }> {
    const response = await apiService.post<{ message: string }>('/users/reset-password', data);
    return response;
  }

  // Upload document
  async uploadDocument(data: DocumentUploadData): Promise<{ message: string; document_url: string }> {
    console.log('🔍 UPLOAD DOCUMENT DEBUG:', {
      file: data.file,
      fileName: data.file?.name,
      fileSize: data.file?.size,
      fileType: data.file?.type,
      documentType: data.document_type
    });

    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('document_type', data.document_type);

    console.log('🔍 FORMDATA CREATED:', {
      hasFile: formData.has('file'),
      hasDocumentType: formData.has('document_type'),
      formDataEntries: Array.from(formData.entries())
    });

    const response = await apiService.post<{ message: string; document_url: string }>('/users/upload-document', formData);
    return response;
  }

  // Get user documents
  async getDocuments(): Promise<Array<{
    document_type: string;
    document_status: string;
    file_url: string;
    upload_date: string;
  }>> {
    const response = await apiService.get<{ data: Array<{
      document_type: string;
      document_status: string;
      file_url: string;
      upload_date: string;
    }> }>('/users/documents');
    return response.data;
  }

  // Update avatar
  async updateAvatar(file: File): Promise<{ message: string; avatar_url: string }> {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await apiService.post<{ status: string; message: string; data?: { avatar_url: string } }>('/users/avatar', formData);
    
    // Verify response has data property
    if (response.status === 'success' && response.data?.avatar_url) {
      return {
        message: response.message,
        avatar_url: response.data.avatar_url
      };
    }
    throw new Error(response.message || 'Failed to update avatar');
  }

  // Update company logo
  async updateCompanyLogo(file: File): Promise<{
    message: string;
    company_logo_url: string;
    company_logo_public_id?: string;
    company_logo_uploaded_at?: string;
  }> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await apiService.post<{
      status: string;
      message: string;
      data?: {
        company_logo_url: string;
        company_logo_public_id?: string;
        company_logo_uploaded_at?: string;
      };
    }>('/users/company-logo', formData);

    if (response.status === 'success' && response.data?.company_logo_url) {
      return {
        message: response.message || 'Company logo updated successfully',
        company_logo_url: response.data.company_logo_url,
        company_logo_public_id: response.data.company_logo_public_id,
        company_logo_uploaded_at: response.data.company_logo_uploaded_at
      };
    }

    throw new Error(response.message || 'Failed to update company logo');
  }

  // Get label settings
  async getLabelSettings(): Promise<{
    label_types?: string[];
    use_order_channel_logo?: boolean;
    component_visibility?: {
      logo?: boolean;
      customer_phone?: boolean;
      dimensions?: boolean;
      weight?: boolean;
      payment_type?: boolean;
      invoice_number?: boolean;
      invoice_date?: boolean;
      company_name?: boolean;
      company_gstin?: boolean;
      pickup_address?: boolean;
      company_phone?: boolean;
      sku?: boolean;
      product_name?: boolean;
      shipping_charges?: boolean;
      amount_prepaid?: boolean;
      amount_cod?: boolean;
      message?: boolean;
    };
    logo_url?: string | null;
  }> {
    const response = await apiService.get<{
      status: string;
      data: any;
    }>('/users/label-settings');

    if (response.status === 'success' && response.data) {
      return response.data;
    }

    // Return default settings if not found
    return {
      label_types: ['Standard'],
      use_order_channel_logo: false,
      component_visibility: {
        logo: true,
        customer_phone: false,
        dimensions: false,
        weight: false,
        payment_type: true,
        invoice_number: true,
        invoice_date: true,
        company_name: false,
        company_gstin: false,
        pickup_address: true,
        company_phone: false,
        sku: false,
        product_name: true,
        shipping_charges: false,
        amount_prepaid: true,
        amount_cod: true,
        message: true
      },
      logo_url: null
    };
  }

  // Update label settings
  async updateLabelSettings(settings: {
    label_types?: string[];
    use_order_channel_logo?: boolean;
    component_visibility?: {
      logo?: boolean;
      customer_phone?: boolean;
      dimensions?: boolean;
      weight?: boolean;
      payment_type?: boolean;
      invoice_number?: boolean;
      invoice_date?: boolean;
      company_name?: boolean;
      company_gstin?: boolean;
      pickup_address?: boolean;
      company_phone?: boolean;
      sku?: boolean;
      product_name?: boolean;
      shipping_charges?: boolean;
      amount_prepaid?: boolean;
      amount_cod?: boolean;
      message?: boolean;
    };
    logo_url?: string | null;
  }): Promise<{
    message: string;
    data: any;
  }> {
    const response = await apiService.post<{
      status: string;
      message: string;
      data: any;
    }>('/users/label-settings', settings);

    if (response.status === 'success') {
      return {
        message: response.message || 'Label settings updated successfully',
        data: response.data
      };
    }

    throw new Error(response.message || 'Failed to update label settings');
  }

  // Upload label logo (reuse company logo upload)
  async uploadLabelLogo(file: File): Promise<{
    message: string;
    company_logo_url: string;
    company_logo_public_id?: string;
    company_logo_uploaded_at?: string;
  }> {
    // Reuse the company logo upload endpoint
    const result = await this.updateCompanyLogo(file);
    
    // Also update label settings to use this logo
    await this.updateLabelSettings({ logo_url: result.company_logo_url });
    
    return result;
  }

  // Get API documentation
  async getApiDocumentation(): Promise<{ version: string; download_url: string }> {
    const response = await apiService.get<{ data: { version: string; download_url: string } }>('/users/api-docs');
    return response.data;
  }

  // Regenerate API keys
  async regenerateApiKeys(): Promise<{
    public_key: string;
    private_key: string;
  }> {
    const response = await apiService.post<{ data: {
      public_key: string;
      private_key: string;
    } }>('/users/regenerate-api-keys');
    return response.data;
  }

  // Get KYC status
  async getKycStatus(): Promise<{
    status: string;
    verified_date?: string;
    requirements: string[];
  }> {
    const response = await apiService.get<{ data: {
      status: string;
      verified_date?: string;
      requirements: string[];
    } }>('/users/kyc-status');
    return response.data;
  }

  // Submit KYC for verification
  async submitKyc(): Promise<{ message: string }> {
    const response = await apiService.post<{ message: string }>('/users/submit-kyc');
    return response;
  }

  // Get user profile (for Layout component)
  async getUserProfile(): Promise<{ data: UserProfile }> {
    const response = await apiService.get<{ status: string; data: UserProfile }>('/users/profile');
    // Backend returns { status: 'success', data: {...} }
    // apiService.get returns the axios response.data, which is already the unwrapped response
    if (response.status === 'success' && response.data) {
      return { data: response.data };
    }
    throw new Error('Failed to load user profile');
  }

  // Get dashboard data
  async getDashboardData(): Promise<{ data: DashboardData }> {
    const response = await apiService.get<{ data: DashboardData }>('/dashboard/overview');
    return response;
  }
}

export const userService = new UserService();

// Export interfaces for external use
export interface UserProfile {
  _id: string;
  client_id: string;
  company_name: string;
  your_name: string;
  email: string;
  phone_number: string;
  user_type: string;
  gstin: string;
  joined_date: string;
  avatar_url?: string;
  account_status?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  address: {
    full_address: string;
    landmark: string;
    pincode: string;
    city: string;
    state: string;
  };
  bank_details: {
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch_name: string;
    account_holder_name: string;
  };
  documents: Array<{
    document_type: string;
    document_status: string;
    file_url: string;
    upload_date: string;
  }>;
  kyc_status: {
    status: string;
    verified_date?: string;
  };
  api_details: {
    public_key: string;
    private_key: string;
    api_documentation_version: string;
  };
  walletBalance?: number;
  wallet_balance?: number;
  initials?: string;
  company_logo_url?: string;
  company_logo_public_id?: string;
  company_logo_uploaded_at?: string;
}

export interface DashboardData {
  metrics: {
    todaysOrders: {
      current: number;
      previous: number;
    };
    todaysRevenue: {
      current: number;
      previous: number;
    };
    averageShippingCost: {
      amount: number;
      totalOrders: number;
    };
  };
  shipmentStatus: {
    totalOrder: number;
    newOrder: number;
    pickupPending: number;
    inTransit: number;
    delivered: number;
    ndrPending: number;
    rto: number;
  };
  ndrStatus: {
    totalNDR: number;
    yourReattempt: number;
    buyerReattempt: number;
    ndrDelivered: number;
    ndrUndelivered: number;
    rtoTransit: number;
    rtoDelivered: number;
  };
  codStatus: {
    totalCOD: number;
    lastCODRemitted: number;
    nextCODAvailable: number;
  };
}