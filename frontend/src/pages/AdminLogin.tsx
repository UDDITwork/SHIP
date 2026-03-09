import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { environmentConfig } from '../config/environment';
import './AdminLogin.css';

const AdminLogin: React.FC = () => {
  const [credentials, setCredentials] = useState({
    userId: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Verify credentials via API (supports both admin User ID and staff email)
      const response = await fetch(`${environmentConfig.apiUrl}/admin/staff/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-userid': credentials.userId,
          'x-admin-email': credentials.userId,
          'x-admin-password': credentials.password
        }
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.admin) {
          // Admin login
          localStorage.setItem('admin_authenticated', 'true');
          localStorage.setItem('admin_userid', data.admin.user_id);
          localStorage.setItem('admin_email', data.admin.email);
          localStorage.setItem('admin_password', credentials.password);
          localStorage.setItem('admin_role', 'admin');
          localStorage.removeItem('is_staff');
          localStorage.removeItem('staff_name');
          localStorage.removeItem('staff_email');
          navigate('/admin/dashboard');
          setLoading(false);
          return;
        }

        if (data.success && data.staff) {
          // Staff login
          localStorage.setItem('admin_authenticated', 'true');
          localStorage.setItem('is_staff', 'true');
          localStorage.setItem('staff_name', data.staff.name);
          localStorage.setItem('staff_email', data.staff.email);
          localStorage.setItem('admin_email', data.staff.email);
          localStorage.setItem('admin_password', credentials.password);
          localStorage.setItem('admin_role', 'staff');
          navigate('/admin/dashboard');
          setLoading(false);
          return;
        }
      }

      setError('Invalid User ID or password');
    } catch (err: any) {
      setError('Login failed. Please try again.');
      console.error('Login error:', err);
    }

    setLoading(false);
  };

  return (
    <div className="admin-login">
      <div className="login-container">
        <div className="login-header">
          <h1>Admin Portal</h1>
          <p>Enter your credentials to access the management panel</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="userId">User ID</label>
            <input
              type="text"
              id="userId"
              name="userId"
              value={credentials.userId}
              onChange={handleInputChange}
              placeholder="Enter User ID or staff email"
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={credentials.password}
              onChange={handleInputChange}
              placeholder="Enter password"
              required
              className="form-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-button"
          >
            {loading ? 'Signing In...' : 'Sign In to Admin Panel'}
          </button>
        </form>

        <div className="login-footer">
          <p>Authorized personnel only</p>
          <button
            onClick={() => navigate('/')}
            className="back-button"
          >
            ← Back to Main Site
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
