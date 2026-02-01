import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LocationGate from './LocationGate';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-primary-600 rounded-full animate-pulse"></div>
          <div className="w-4 h-4 bg-primary-600 rounded-full animate-pulse animation-delay-100"></div>
          <div className="w-4 h-4 bg-primary-600 rounded-full animate-pulse animation-delay-200"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <LocationGate>{children}</LocationGate>;
};

export default ProtectedRoute;