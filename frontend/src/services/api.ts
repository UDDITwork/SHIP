import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { environmentConfig } from '../config/environment';
import { requestDeduplicator } from '../utils/requestDeduplicator';
import { DataCache } from '../utils/dataCache';

// Use the environment configuration
const API_BASE_URL = environmentConfig.apiUrl;

class ApiService {
  private api: AxiosInstance;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000, // Increased timeout to 30 seconds for initial requests and DB cold starts
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Don't set Content-Type for FormData - let browser handle it
        if (config.data instanceof FormData) {
          delete config.headers['Content-Type'];
        }
        
        // Generate request ID for correlation
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        (config as any).requestId = requestId;
        (config as any).startTime = Date.now();
        
        // Enhanced aggressive request logging
        const logData = {
          '🔵 REQUEST ID': requestId,
          '📤 METHOD': config.method?.toUpperCase(),
          '🌐 URL': `${config.baseURL}${config.url}`,
          '📋 FULL URL': config.url,
          '🔗 BASE URL': config.baseURL,
          '📦 DATA': config.data instanceof FormData ? '[FormData]' : config.data,
          '📏 DATA SIZE': config.data instanceof FormData ? '[FormData]' : (config.data ? JSON.stringify(config.data).length : 0),
          '🔑 HAS TOKEN': !!token,
          '📎 IS FORMDATA': config.data instanceof FormData,
          '⏰ TIMESTAMP': new Date().toISOString(),
          '📍 STACK TRACE': new Error().stack?.split('\n').slice(1, 5).join('\n')
        };
        
        console.group(`🚀 [${requestId}] FRONTEND API REQUEST`);
        console.log('📤 Request Details:', logData);
        console.log('📋 Headers:', config.headers);
        console.log('🔍 Full Config:', config);
        console.groupEnd();
        
        return config;
      },
      (error) => {
        console.group('❌ FRONTEND REQUEST SETUP ERROR');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        console.groupEnd();
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        const requestId = (response.config as any).requestId || 'unknown';
        const duration = (response.config as any).startTime ? Date.now() - (response.config as any).startTime : 0;
        
        const logData = {
          '🔵 REQUEST ID': requestId,
          '✅ STATUS': response.status,
          '📥 URL': response.config.url,
          '⏱️ DURATION': `${duration}ms`,
          '📦 DATA SIZE': response.data ? JSON.stringify(response.data).length : 0,
          '📋 RESPONSE DATA': response.data,
          '📏 HEADERS': response.headers,
          '⏰ TIMESTAMP': new Date().toISOString()
        };
        
        console.group(`✅ [${requestId}] FRONTEND API RESPONSE`);
        console.log('📥 Response Details:', logData);
        console.log('📋 Full Response:', response);
        console.groupEnd();
        
        return response;
      },
      (error) => {
        const requestId = (error.config as any)?.requestId || 'unknown';
        const duration = (error.config as any)?.startTime ? Date.now() - (error.config as any).startTime : 0;
        
        // Enhanced aggressive error logging with full context
        const errorDetails: Record<string, any> = {
          '🔵 REQUEST ID': requestId,
          '❌ ERROR TYPE': error.name || 'Unknown',
          '📤 METHOD': error.config?.method?.toUpperCase(),
          '🌐 URL': error.config ? `${error.config.baseURL}${error.config.url}` : 'N/A',
          '📋 FULL URL': error.config?.url,
          '🔗 BASE URL': error.config?.baseURL,
          '📊 HTTP STATUS': error.response?.status || 'NO RESPONSE',
          '📝 STATUS TEXT': error.response?.statusText || 'N/A',
          '💬 ERROR MESSAGE': error.message,
          '🔢 ERROR CODE': error.code,
          '⏱️ DURATION': `${duration}ms`,
          '📦 REQUEST DATA': error.config?.data,
          '📥 RESPONSE DATA': error.response?.data,
          '🔑 HAS TOKEN': !!error.config?.headers?.Authorization,
          '⏰ TIMESTAMP': new Date().toISOString(),
          '🌐 NETWORK ERROR': !error.response,
          '⏰ TIMEOUT': error.code === 'ECONNABORTED',
          '🔌 CONNECTION REFUSED': error.code === 'ECONNREFUSED',
          '📡 STACK TRACE': error.stack
        };
        
        console.group(`❌ [${requestId}] FRONTEND API ERROR`);
        console.error('🚨 Error Details:', errorDetails);
        console.error('📋 Full Error Object:', error);
        console.error('📤 Request Config:', error.config);
        console.error('📥 Response Data:', error.response?.data);
        console.error('📏 Response Headers:', error.response?.headers);
        console.error('📍 Stack Trace:', error.stack);
        
        // Database sync issue detection
        if (error.response?.status === 503) {
          const serverMessage = error.response.data?.message || 'Service temporarily unavailable';
          console.error('🔌 DATABASE SYNC ISSUE DETECTED');
          console.error('📊 Database Status:', {
            'Status': 'UNAVAILABLE',
            'Message': serverMessage,
            'Possible Causes': [
              'Database connection lost',
              'Database is initializing',
              'Database query timeout',
              'Database connection pool exhausted'
            ]
          });
          errorDetails['🔌 DATABASE ISSUE'] = true;
        }
        
        // Network connectivity issues
        if (!error.response) {
          console.error('🌐 NETWORK CONNECTIVITY ISSUE');
          console.error('📊 Network Status:', {
            'Backend Reachable': false,
            'Possible Causes': [
              'Backend server is down',
              'Network connection lost',
              'CORS configuration issue',
              'Firewall blocking request'
            ]
          });
        }
        
        // Backend error analysis
        if (error.response?.status >= 500) {
          console.error('🔥 BACKEND SERVER ERROR');
          console.error('📊 Server Error Details:', {
            'Status': error.response.status,
            'Message': error.response.data?.message,
            'Error Type': 'SERVER_ERROR',
            'Possible Causes': [
              'Backend application error',
              'Database query failed',
              'Internal server exception',
              'Service unavailable'
            ]
          });
        }
        
        // Client error analysis
        if (error.response?.status >= 400 && error.response?.status < 500) {
          console.error('⚠️ CLIENT ERROR');
          console.error('📊 Client Error Details:', {
            'Status': error.response.status,
            'Message': error.response.data?.message,
            'Error Type': 'CLIENT_ERROR',
            'Validation Errors': error.response.data?.errors
          });
        }
        
        console.groupEnd();
        
        // Special handling for timeout and connection errors
        if (error.code === 'ECONNABORTED') {
          console.error('⏰ REQUEST TIMEOUT - Backend might be down or slow');
          errorDetails['💬 USER MESSAGE'] = 'Request timeout - The server is taking longer than expected. Please try again.';
        } else if (!error.response) {
          console.error('🌐 NETWORK ERROR - Cannot connect to backend');
          errorDetails['💬 USER MESSAGE'] = 'Network error - Cannot connect to backend server. Please check your connection and try again.';
        } else if (error.response.status === 503) {
          const serverMessage = error.response.data?.message || 'Service temporarily unavailable';
          console.error('🔌 SERVICE UNAVAILABLE - Database may not be ready');
          errorDetails['💬 USER MESSAGE'] = serverMessage.includes('Database') || serverMessage.includes('database')
            ? 'Database is initializing. Please wait a moment and try again.'
            : serverMessage;
        }
        
        if (error.response?.status === 401) {
          const requestUrl = error.config?.url || '';
          // Skip redirect for admin API calls — let the admin UI handle auth errors
          if (!requestUrl.includes('/admin/')) {
            console.error('🔐 UNAUTHORIZED - Clearing auth, cache and redirecting');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Clear all cached data to prevent stale cross-user data
            DataCache.clearAll();
            window.location.href = '/login';
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  // Retry helper with exponential backoff
  private async retryRequest<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    retries = this.maxRetries
  ): Promise<AxiosResponse<T>> {
    const attemptNumber = this.maxRetries - retries + 1;
    const requestId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`🔄 [${requestId}] Retry Attempt ${attemptNumber}/${this.maxRetries}`);
      return await requestFn();
    } catch (error: any) {
      console.group(`❌ [${requestId}] Retry Attempt ${attemptNumber} Failed`);
      console.error('Error Details:', {
        'Status': error.response?.status,
        'Code': error.code,
        'Message': error.message,
        'Will Retry': retries > 0
      });
      
      // Don't retry on 401 (auth errors) or 4xx client errors (except 429)
      if (error.response?.status === 401 || 
          (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429)) {
        console.error('🚫 Not retrying - Client error (4xx)');
        console.groupEnd();
        throw error;
      }

      // CRITICAL: NEVER retry on 429 (rate limit) - retrying makes it exponentially worse!
      // The rate limit window is 15 minutes, so retrying immediately will just hit the limit again
      if (error.response?.status === 429) {
        console.error('🚫 Rate limit exceeded - NOT retrying. Use cached data or wait before making new requests.');
        console.error('📊 Rate Limit Info:', {
          'Status': 429,
          'Retry After': error.response?.headers?.['retry-after'],
          'Message': 'Rate limit window is 15 minutes'
        });
        console.groupEnd();
        throw error;
      }

      // Retry on network errors, timeouts, or 5xx server errors (NOT 429)
      if (retries > 0 && (
        !error.response || 
        error.response.status >= 500 || 
        error.code === 'ECONNABORTED' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT'
      )) {
        const delay = this.retryDelay * Math.pow(2, this.maxRetries - retries);
        console.log(`⏳ Waiting ${delay}ms before retry ${attemptNumber + 1}/${this.maxRetries}...`);
        console.log('📊 Retry Strategy:', {
          'Current Attempt': attemptNumber,
          'Remaining Retries': retries - 1,
          'Delay (ms)': delay,
          'Error Type': error.response ? 'SERVER_ERROR' : 'NETWORK_ERROR'
        });
        console.groupEnd();
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryRequest(requestFn, retries - 1);
      }
      
      console.error('🚫 No more retries - Failing request');
      console.groupEnd();
      throw error;
    }
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    // Don't use deduplicator for GET requests - it was blocking legitimate requests across tabs
    // The deduplicator was causing content to not render when multiple tabs/components request the same endpoint
    const response = await this.retryRequest(() => this.api.get<T>(url, config));
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    // Use deduplicator for critical endpoints that should not be called twice
    // This includes wallet/payment endpoints AND ticket messages to prevent duplicates
    const isPaymentEndpoint = url.includes('/wallet') ||
                              url.includes('/payment') ||
                              url.includes('/recharge') ||
                              url.includes('/initiate-payment') ||
                              url.includes('/handle-payment');

    // Also deduplicate ticket message submissions to prevent duplicate messages
    const isTicketMessageEndpoint = url.includes('/tickets/') && url.includes('/messages');

    if (isPaymentEndpoint || isTicketMessageEndpoint) {
      const key = `POST:${url}:${JSON.stringify(data)}`;
      return requestDeduplicator.get(key, async () => {
        // For ticket messages, don't retry as the message might already be saved
        // Backend has duplicate detection, but retries can still cause issues
        if (isTicketMessageEndpoint) {
          const response = await this.api.post<T>(url, data, config);
          return response.data;
        }
        const response = await this.retryRequest(() => this.api.post<T>(url, data, config));
        return response.data;
      });
    }

    // For all other POST requests, don't use deduplicator
    const response = await this.retryRequest(() => this.api.post<T>(url, data, config));
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.retryRequest(() => this.api.put<T>(url, data, config));
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.retryRequest(() => this.api.patch<T>(url, data, config));
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.retryRequest(() => this.api.delete<T>(url, config));
    return response.data;
  }

  async uploadFile<T>(url: string, file: File, onUploadProgress?: (progressEvent: any) => void): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.api.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });

    return response.data;
  }
}

export const apiService = new ApiService();