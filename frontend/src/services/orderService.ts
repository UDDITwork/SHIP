import { apiService } from './api';
import { DataCache } from '../utils/dataCache';

export interface PickupAddress {
  name?: string;
  full_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
}

export interface Order {
  _id: string;
  orderId: string;
  referenceId: string;
  orderDate: Date | string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  pin: string;
  city: string;
  state: string;
  productName: string;
  quantity: number;
  weight: number;
  length?: number;
  width?: number;
  height?: number;
  paymentMode: 'COD' | 'Prepaid' | 'Pickup' | 'REPL';
  codAmount?: number;
  totalAmount: number;
  warehouse: string;
  pickupLocation: string;
  pickup_address?: PickupAddress;
  status: string;
  awb?: string;
  trackingUrl?: string;
  pickupRequestId?: string;
  pickupRequestStatus?: 'pending' | 'scheduled' | 'in_transit' | 'completed' | 'failed';
  pickupRequestDate?: Date;
  pickupRequestTime?: string;
  deliveredDate?: Date | string;
  rtoDeliveredDate?: Date | string;
  cancelledDate?: Date | string;
  orderType?: 'forward' | 'reverse';
  delhivery_data?: {
    waybill?: string;
    cancellation_status?: string;
    cancellation_date?: Date | string;
    status_type?: string;
    pickup_request_id?: string;
    pickup_request_status?: string;
    [key: string]: any;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface OrderFilters {
  status?: string;
  order_type?: 'forward' | 'reverse';
  payment_mode?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  search_type?: 'order' | 'reference' | 'awb';
  state?: string;
  min_amount?: number;
  max_amount?: number;
}

interface OrdersResponse {
  status: string;
  data: {
    orders: any[];
    pagination?: {
      current_page: number;
      total_pages: number;
      total_orders: number;
      per_page: number;
    };
  };
}

class OrderService {
  private readonly CACHE_KEY = 'orders';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Get all orders with filters
   * Uses cache for instant display, then fetches fresh data from MongoDB
   */
  private getUserCachePrefix(): string {
    // Include user identity in cache key to prevent cross-user stale data
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        return user._id || user.id || '';
      } catch { /* ignore */ }
    }
    // Fallback: use a hash of the token to differentiate users
    return token ? token.slice(-8) : 'anon';
  }

  async getOrders(filters: OrderFilters = {}, useCache: boolean = true): Promise<Order[]> {
    // Generate cache key based on filters AND user identity
    const userPrefix = this.getUserCachePrefix();
    const cacheKey = `${this.CACHE_KEY}_${userPrefix}_${JSON.stringify(filters)}`;

    // Try to load from cache first for instant display
    // NOTE: Background refresh is handled by the component (Orders.tsx) — not here.
    // The component calls getOrders(filters, true) for instant cache, then
    // getOrders(filters, false) for fresh data, and updates UI with both.
    if (useCache) {
      const cached = DataCache.get<Order[]>(cacheKey);
      if (cached && cached.length > 0) {
        console.log(`📦 Orders loaded from cache (${cached.length} orders)`, { filters });
        return cached;
      }
    }

    try {
      console.log('📡 Fetching orders from MongoDB...', { filters });

      // Build query params
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.order_type) params.append('order_type', filters.order_type);
      if (filters.payment_mode) params.append('payment_mode', filters.payment_mode);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      if (filters.search) params.append('search', filters.search);
      if (filters.search_type) params.append('search_type', filters.search_type);
      if (filters.state) params.append('state', filters.state);
      if (typeof filters.min_amount === 'number') params.append('min_amount', filters.min_amount.toString());
      if (typeof filters.max_amount === 'number') params.append('max_amount', filters.max_amount.toString());

      const queryString = params.toString();
      const url = `/orders${queryString ? `?${queryString}` : ''}`;

      const response = await apiService.get<OrdersResponse>(url);

      if (response.status === 'success' && response.data?.orders) {
        // Transform backend data to frontend format
        const transformedOrders: Order[] = (response.data.orders || []).map((order: any) => ({
          _id: order._id,
          orderId: order.order_id,
          referenceId: order.reference_id || '',
          orderDate: order.order_date || order.createdAt,
          customerName: order.customer_info?.buyer_name || '',
          customerPhone: order.customer_info?.phone || '',
          customerAddress: order.delivery_address?.full_address || '',
          pin: order.delivery_address?.pincode || '',
          city: order.delivery_address?.city || '',
          state: order.delivery_address?.state || '',
          productName: order.products?.[0]?.product_name || '',
          quantity: order.products?.[0]?.quantity || 0,
          weight: order.package_info?.weight || 0,
          length: order.package_info?.dimensions?.length,
          width: order.package_info?.dimensions?.width,
          height: order.package_info?.dimensions?.height,
          paymentMode: order.payment_info?.payment_mode || 'Prepaid',
          codAmount: order.payment_info?.cod_amount || 0,
          totalAmount: order.payment_info?.total_amount || 0,
          warehouse: order.pickup_address?.name || order.pickup_info?.warehouse_id?.name || '',
          pickupLocation: order.pickup_address?.full_address || order.pickup_info?.warehouse_id?.address?.full_address || '',
          pickup_address: order.pickup_address ? {
            name: order.pickup_address.name,
            full_address: order.pickup_address.full_address,
            city: order.pickup_address.city,
            state: order.pickup_address.state,
            pincode: order.pickup_address.pincode,
            phone: order.pickup_address.phone
          } : undefined,
          status: order.status,
          deliveredDate: order.delivered_date,
          rtoDeliveredDate: order.rto_delivered_date,
          cancelledDate: order.cancelled_date,
          orderType: order.order_type,
          awb: order.delhivery_data?.waybill || order.shipping_info?.awb_number || '',
          trackingUrl: order.delhivery_data?.tracking_url || '',
          pickupRequestId: order.delhivery_data?.pickup_request_id || '',
          pickupRequestStatus: order.delhivery_data?.pickup_request_status || 'pending',
          pickupRequestDate: order.delhivery_data?.pickup_request_date,
          pickupRequestTime: order.delhivery_data?.pickup_request_time || '',
          delhivery_data: order.delhivery_data ? {
            waybill: order.delhivery_data.waybill,
            cancellation_status: order.delhivery_data.cancellation_status,
            cancellation_date: order.delhivery_data.cancellation_date,
            status_type: order.delhivery_data.status_type,
            pickup_request_id: order.delhivery_data.pickup_request_id,
            pickup_request_status: order.delhivery_data.pickup_request_status,
            ...order.delhivery_data
          } : undefined,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }));

        // Cache the transformed orders (short TTL for empty results to avoid stale empty state)
        const ttl = transformedOrders.length > 0 ? this.CACHE_TTL : 15 * 1000; // 15s for empty
        DataCache.set(cacheKey, transformedOrders, ttl);
        console.log(`✅ Orders fetched from MongoDB and cached (${transformedOrders.length} orders, TTL: ${ttl / 1000}s)`);

        return transformedOrders;
      }

      throw new Error('Invalid response format from orders API');
    } catch (error: any) {
      console.error('❌ Error fetching orders:', error);

      // On error, try to return stale cache - app continues working
      const stale = DataCache.getStale<Order[]>(cacheKey);
      if (stale && stale.length > 0) {
        console.log(`⚠️ Using stale cached orders due to API error (${stale.length} orders)`, error);
        return stale;
      }

      // No cache either - return empty array (don't throw)
      console.warn('⚠️ No orders cache available, returning empty array');
      return [];
    }
  }

  /**
   * Get single order by ID
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    try {
      const response = await apiService.get<{ status: string; data: any }>(`/orders/${orderId}`);
      
      if (response.status === 'success' && response.data) {
        const order = response.data;
        return {
          _id: order._id,
          orderId: order.order_id,
          referenceId: order.reference_id || '',
          orderDate: order.order_date || order.createdAt,
          customerName: order.customer_info?.buyer_name || '',
          customerPhone: order.customer_info?.phone || '',
          customerAddress: order.delivery_address?.full_address || '',
          pin: order.delivery_address?.pincode || '',
          city: order.delivery_address?.city || '',
          state: order.delivery_address?.state || '',
          productName: order.products?.[0]?.product_name || '',
          quantity: order.products?.[0]?.quantity || 0,
          weight: order.package_info?.weight || 0,
          length: order.package_info?.dimensions?.length,
          width: order.package_info?.dimensions?.width,
          height: order.package_info?.dimensions?.height,
          paymentMode: order.payment_info?.payment_mode || 'Prepaid',
          codAmount: order.payment_info?.cod_amount || 0,
          totalAmount: order.payment_info?.total_amount || 0,
          warehouse: order.pickup_address?.name || order.pickup_info?.warehouse_id?.name || '',
          pickupLocation: order.pickup_address?.full_address || order.pickup_info?.warehouse_id?.address?.full_address || '',
          pickup_address: order.pickup_address ? {
            name: order.pickup_address.name,
            full_address: order.pickup_address.full_address,
            city: order.pickup_address.city,
            state: order.pickup_address.state,
            pincode: order.pickup_address.pincode,
            phone: order.pickup_address.phone
          } : undefined,
          status: order.status,
          deliveredDate: order.delivered_date,
          rtoDeliveredDate: order.rto_delivered_date,
          cancelledDate: order.cancelled_date,
          orderType: order.order_type,
          awb: order.delhivery_data?.waybill || order.shipping_info?.awb_number || '',
          trackingUrl: order.delhivery_data?.tracking_url || '',
          pickupRequestId: order.delhivery_data?.pickup_request_id || '',
          pickupRequestStatus: order.delhivery_data?.pickup_request_status || 'pending',
          pickupRequestDate: order.delhivery_data?.pickup_request_date,
          pickupRequestTime: order.delhivery_data?.pickup_request_time || '',
          delhivery_data: order.delhivery_data ? {
            waybill: order.delhivery_data.waybill,
            cancellation_status: order.delhivery_data.cancellation_status,
            cancellation_date: order.delhivery_data.cancellation_date,
            status_type: order.delhivery_data.status_type,
            pickup_request_id: order.delhivery_data.pickup_request_id,
            pickup_request_status: order.delhivery_data.pickup_request_status,
            ...order.delhivery_data
          } : undefined,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      }
      return null;
    } catch (error: any) {
      console.error('Error fetching order by ID:', error);
      // Propagate the actual error instead of silently returning null
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      if (status === 401) {
        throw new Error('Session expired. Please login again.');
      } else if (status === 404) {
        throw new Error('Order not found');
      } else if (status === 403) {
        throw new Error(message || 'Access denied');
      } else {
        throw new Error(message || 'Failed to fetch order details');
      }
    }
  }

  /**
   * Clear orders cache (useful after creating/updating orders)
   */
  clearCache(filters?: OrderFilters): void {
    if (filters) {
      const userPrefix = this.getUserCachePrefix();
      const cacheKey = `${this.CACHE_KEY}_${userPrefix}_${JSON.stringify(filters)}`;
      DataCache.clear(cacheKey);
    } else {
      // Clear all order caches — use startsWith for safety (won't hit wallet/dashboard/user caches)
      const prefix = `app_cache_${this.CACHE_KEY}`;
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      });
    }
    console.log('🗑️ Orders cache cleared');
  }

  /**
   * Refresh orders (force fresh fetch from MongoDB)
   */
  async refreshOrders(filters: OrderFilters = {}): Promise<Order[]> {
    // Clear cache for these filters first
    this.clearCache(filters);
    // Fetch fresh data
    return this.getOrders(filters, false);
  }

  /**
   * Sync TrackingOrder statuses to Order models
   * This fixes any existing orders that have status mismatches
   */
  async syncOrders(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await apiService.post<{ status: string; message: string; data: any }>('/orders/sync-statuses');

      if (response.status === 'success') {
        // Clear all caches after sync
        this.clearCache();
        return {
          success: true,
          data: response.data
        };
      }

      return {
        success: false,
        error: 'Failed to sync orders'
      };
    } catch (error: any) {
      console.error('Error syncing orders:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync orders'
      };
    }
  }

  // ==========================================
  // BULK OPERATIONS
  // ==========================================

  /**
   * Bulk Generate AWB for multiple orders
   */
  async bulkGenerateAWB(orderIds: string[]): Promise<BulkResult> {
    try {
      const response = await apiService.post<BulkResult>('/orders/bulk/generate-awb', {
        order_ids: orderIds
      });

      // Clear cache after bulk operation
      this.clearCache();

      return response;
    } catch (error: any) {
      console.error('Error in bulk AWB generation:', error);
      return {
        status: 'error',
        total: orderIds.length,
        success: 0,
        failed: orderIds.length,
        results: orderIds.map(id => ({
          order_id: id,
          status: 'failed' as const,
          error: error.message || 'Unknown error'
        }))
      };
    }
  }

  /**
   * Bulk Request Pickup for multiple orders
   */
  async bulkRequestPickup(
    orderIds: string[],
    pickupDate: string,
    pickupTime: string
  ): Promise<BulkResult> {
    try {
      const response = await apiService.post<BulkResult>('/orders/bulk/request-pickup', {
        order_ids: orderIds,
        pickup_date: pickupDate,
        pickup_time: pickupTime
      });

      // Clear cache after bulk operation
      this.clearCache();

      return response;
    } catch (error: any) {
      console.error('Error in bulk pickup request:', error);
      return {
        status: 'error',
        total: orderIds.length,
        success: 0,
        failed: orderIds.length,
        results: orderIds.map(id => ({
          order_id: id,
          status: 'failed' as const,
          error: error.message || 'Unknown error'
        }))
      };
    }
  }

  /**
   * Bulk Cancel multiple orders
   */
  async bulkCancel(orderIds: string[]): Promise<BulkResult> {
    try {
      const response = await apiService.post<BulkResult>('/orders/bulk/cancel', {
        order_ids: orderIds
      });

      // Clear cache after bulk operation
      this.clearCache();

      return response;
    } catch (error: any) {
      console.error('Error in bulk cancellation:', error);
      return {
        status: 'error',
        total: orderIds.length,
        success: 0,
        failed: orderIds.length,
        results: orderIds.map(id => ({
          order_id: id,
          status: 'failed' as const,
          error: error.message || 'Unknown error'
        }))
      };
    }
  }

  /**
   * Bulk Print Labels for multiple orders
   * Opens labels in a new window
   */
  async bulkPrintLabels(orderIds: string[], format: string): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = (await import('../config/environment')).environmentConfig.apiUrl;

      // Open the bulk labels URL in a new window
      const url = `${apiUrl}/orders/bulk/labels?order_ids=${orderIds.join(',')}&format=${format}`;

      // Create a temporary form to POST with auth
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (!response.ok) {
        throw new Error('Failed to generate labels');
      }

      const html = await response.text();

      // Open in new window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
    } catch (error: any) {
      console.error('Error in bulk label print:', error);
      throw error;
    }
  }
}

// Bulk operation result interface
export interface BulkResult {
  status: 'completed' | 'stopped' | 'error';
  total: number;
  success: number;
  failed: number;
  skipped?: number;
  results: Array<{
    order_id: string;
    awb?: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    pickup_id?: string;
  }>;
  stopped_reason?: string;
}

export const orderService = new OrderService();
