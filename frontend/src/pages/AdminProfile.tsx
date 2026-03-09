import React, { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import './AdminProfile.css';

const AdminProfile: React.FC = () => {
  const [profile, setProfile] = useState<{ user_id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Change User ID form
  const [userIdForm, setUserIdForm] = useState({ old_user_id: '', password: '', new_user_id: '' });
  const [userIdLoading, setUserIdLoading] = useState(false);

  // Change Password form
  const [passwordForm, setPasswordForm] = useState({ user_id: '', old_password: '', new_password: '', confirm_password: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await adminService.getAdminProfile();
      if (response.success && response.data) {
        setProfile(response.data);
        setUserIdForm(prev => ({ ...prev, old_user_id: response.data.user_id }));
        setPasswordForm(prev => ({ ...prev, user_id: response.data.user_id }));
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeUserId = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!userIdForm.old_user_id || !userIdForm.password || !userIdForm.new_user_id) {
      setMessage({ type: 'error', text: 'All fields are required' });
      return;
    }

    setUserIdLoading(true);
    try {
      const response = await adminService.changeAdminUserId(userIdForm);
      if (response.success) {
        // Update localStorage with new user_id
        localStorage.setItem('admin_userid', userIdForm.new_user_id);
        setProfile(prev => prev ? { ...prev, user_id: userIdForm.new_user_id } : prev);
        setUserIdForm(prev => ({ ...prev, old_user_id: userIdForm.new_user_id, password: '', new_user_id: '' }));
        setPasswordForm(prev => ({ ...prev, user_id: userIdForm.new_user_id }));
        setMessage({ type: 'success', text: 'User ID changed successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to change User ID' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to change User ID' });
    } finally {
      setUserIdLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!passwordForm.user_id || !passwordForm.old_password || !passwordForm.new_password) {
      setMessage({ type: 'error', text: 'All fields are required' });
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (passwordForm.new_password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await adminService.changeAdminPassword({
        user_id: passwordForm.user_id,
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password
      });
      if (response.success) {
        // Update localStorage with new password
        localStorage.setItem('admin_password', passwordForm.new_password);
        setPasswordForm(prev => ({ ...prev, old_password: '', new_password: '', confirm_password: '' }));
        setMessage({ type: 'success', text: 'Password changed successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to change password' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to change password' });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return <div className="admin-profile"><div className="loading">Loading profile...</div></div>;
  }

  return (
    <div className="admin-profile">
      <h1>Admin Profile</h1>

      {message && (
        <div className={`profile-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Current Info */}
      <div className="profile-card">
        <h2>Account Information</h2>
        <div className="profile-field">
          <span className="field-label">User ID</span>
          <span className="field-value">{profile?.user_id || '-'}</span>
        </div>
        <div className="profile-field">
          <span className="field-label">Email</span>
          <span className="field-value">{profile?.email || '-'}</span>
        </div>
      </div>

      {/* Change User ID */}
      <div className="profile-card">
        <h2>Change User ID</h2>
        <form onSubmit={handleChangeUserId}>
          <div className="form-group">
            <label>Current User ID</label>
            <input
              type="text"
              value={userIdForm.old_user_id}
              onChange={(e) => setUserIdForm(prev => ({ ...prev, old_user_id: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Password (for verification)</label>
            <input
              type="password"
              value={userIdForm.password}
              onChange={(e) => setUserIdForm(prev => ({ ...prev, password: e.target.value }))}
              placeholder="Enter your current password"
              required
            />
          </div>
          <div className="form-group">
            <label>New User ID</label>
            <input
              type="text"
              value={userIdForm.new_user_id}
              onChange={(e) => setUserIdForm(prev => ({ ...prev, new_user_id: e.target.value }))}
              placeholder="Enter new User ID"
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={userIdLoading}>
            {userIdLoading ? 'Changing...' : 'Change User ID'}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="profile-card">
        <h2>Change Password</h2>
        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label>User ID (for verification)</label>
            <input
              type="text"
              value={passwordForm.user_id}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, user_id: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={passwordForm.old_password}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, old_password: e.target.value }))}
              placeholder="Enter current password"
              required
            />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={passwordForm.new_password}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
              placeholder="Enter new password (min 6 chars)"
              required
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={passwordForm.confirm_password}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
              placeholder="Re-enter new password"
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={passwordLoading}>
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminProfile;
