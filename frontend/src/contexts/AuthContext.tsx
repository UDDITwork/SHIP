import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType, RegisterData } from '../types';
import { authService } from '../services/authService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async (authToken?: string) => {
    try {
      // Use provided token or fall back to state token
      const tokenToUse = authToken || token;
      if (!tokenToUse) return;
      
      const response = await authService.getCurrentUser();
      const updatedUser = response.user;
      
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      console.log('🔄 User data refreshed from MongoDB:', {
        user_category: updatedUser.user_category,
        company_name: updatedUser.company_name
      });
    } catch (err: any) {
      console.error('Failed to refresh user data:', err);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      let storedToken = localStorage.getItem('token');
      let storedUser = localStorage.getItem('user');

      if (typeof window !== 'undefined') {
        try {
          const url = new URL(window.location.href);
          const impersonationToken = url.searchParams.get('impersonation_token');

          if (impersonationToken) {
            storedToken = impersonationToken;
            storedUser = null;
            localStorage.setItem('token', impersonationToken);
            localStorage.setItem('impersonation_session', 'true');
            localStorage.removeItem('user');
            setUser(null);
            url.searchParams.delete('impersonation_token');
            window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
          }
        } catch (error) {
          console.error('Failed to process impersonation token from URL:', error);
        }
      }

      if (storedToken) {
        setToken(storedToken);

        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (err) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            storedToken = null;
            storedUser = null;
          }
        }

        if (storedToken) {
          try {
            await refreshUser(storedToken);
          } catch (err) {
            console.error('Failed to fetch fresh user data on mount:', err);
          }
        }
      } else {
        setUser(null);
        setToken(null);
      }

      setLoading(false);
    };

    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // WebSocket connection is handled in Layout.tsx to avoid duplicate connections

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authService.login(email, password, rememberMe);
      
      setUser(response.user);
      setToken(response.token);
      
      // Store token and user data
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      
      // If remember me is enabled, token will have longer expiration (30d instead of 7d)
      // The backend handles this automatically
      
      return response;
    } catch (err: any) {
      // Handle different types of errors with user-friendly messages
      let errorMessage = 'Login failed';
      
      if (err.response) {
        // Server responded with an error
        const status = err.response.status;
        const serverMessage = err.response.data?.message || '';
        
        if (status === 503) {
          // Service Unavailable - Database not ready
          errorMessage = serverMessage.includes('Database') || serverMessage.includes('database')
            ? 'Database is initializing. Please wait a moment and try again.'
            : serverMessage || 'Service temporarily unavailable. Please try again in a moment.';
        } else if (status === 401) {
          errorMessage = serverMessage || 'Invalid email or password';
        } else if (status === 423) {
          errorMessage = serverMessage || 'Account is locked. Please try again later.';
        } else {
          errorMessage = serverMessage || 'Login failed. Please try again.';
        }
      } else if (err.code === 'ECONNABORTED') {
        // Request timeout
        errorMessage = 'Request timeout - The server is taking longer than expected. Please try again.';
      } else if (!err.response) {
        // Network error
        errorMessage = 'Cannot connect to server. Please check your internet connection and try again.';
      } else {
        errorMessage = err.message || 'Login failed';
      }
      
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: RegisterData) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authService.register(userData);
      
      // Log the response for debugging
      console.log('🔧 Registration Response:', response);
      
      // Don't automatically log in the user after registration
      // Just return the response for the component to handle
      return response;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('impersonation_session');
    sessionStorage.removeItem('location_verified');
    // DO NOT clear remembered_email and remembered_password on logout
    // These should persist based on user's Remember Me checkbox choice
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    logout,
    refreshUser,
    loading,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};