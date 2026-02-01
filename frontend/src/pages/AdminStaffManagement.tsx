import React, { useState, useEffect } from 'react';
import { adminService, Staff, StaffPermissions } from '../services/adminService';
import { formatDate } from '../utils/dateFormat';
import './AdminStaffManagement.css';

const DEFAULT_PERMISSIONS: StaffPermissions = {
  dashboard: true,
  clients: true,
  orders: true,
  tickets: true,
  billing: true,
  remittances: true,
  ndr: true,
  weight_discrepancies: true,
  wallet_recharge: false,
  rate_cards: false,
  carriers: false,
  staff_management: false,
  can_recharge_wallet: false,
  can_change_client_category: false,
  can_generate_monthly_billing: false
};

const PERMISSION_LABELS: Record<keyof StaffPermissions, string> = {
  dashboard: 'Dashboard',
  clients: 'Clients',
  orders: 'Orders',
  tickets: 'Tickets',
  billing: 'Billing',
  remittances: 'Remittances',
  ndr: 'NDR',
  weight_discrepancies: 'Weight Discrepancies',
  wallet_recharge: 'Wallet Recharge',
  rate_cards: 'Rate Cards',
  carriers: 'Carriers',
  staff_management: 'Staff Management',
  can_recharge_wallet: 'Can Recharge Wallet',
  can_change_client_category: 'Can Change Client Category',
  can_generate_monthly_billing: 'Can Generate Monthly Billing'
};

const AdminStaffManagement: React.FC = () => {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsStaff, setPermissionsStaff] = useState<Staff | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [permissionsData, setPermissionsData] = useState<StaffPermissions>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getStaff();
      if (response.success && Array.isArray(response.data)) {
        setStaffList(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch staff list');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const response = await adminService.createStaff(
        formData.name,
        formData.email,
        formData.password
      );

      if (response.success) {
        setFormData({ name: '', email: '', password: '' });
        setShowCreateForm(false);
        await fetchStaff();
        alert('Staff account created successfully!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create staff account');
    }
  };

  const handleEditStaff = (staff: Staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      email: staff.email,
      password: ''
    });
    setShowCreateForm(true);
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    try {
      setError(null);
      const updates: any = {
        name: formData.name,
        email: formData.email
      };

      if (formData.password) {
        updates.password = formData.password;
      }

      const response = await adminService.updateStaff(editingStaff._id, updates);

      if (response.success) {
        setFormData({ name: '', email: '', password: '' });
        setShowCreateForm(false);
        setEditingStaff(null);
        await fetchStaff();
        alert('Staff account updated successfully!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update staff account');
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this staff account?')) {
      return;
    }

    try {
      setError(null);
      const response = await adminService.deleteStaff(staffId);

      if (response.success) {
        await fetchStaff();
        alert('Staff account deactivated successfully!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate staff account');
    }
  };

  const handleCancel = () => {
    setShowCreateForm(false);
    setEditingStaff(null);
    setFormData({ name: '', email: '', password: '' });
  };

  const handleOpenPermissions = (staff: Staff) => {
    setPermissionsStaff(staff);
    setPermissionsData(staff.permissions || DEFAULT_PERMISSIONS);
    setShowPermissionsModal(true);
  };

  const handlePermissionChange = (key: keyof StaffPermissions) => {
    setPermissionsData(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSavePermissions = async () => {
    if (!permissionsStaff) return;

    try {
      setError(null);
      const response = await adminService.updateStaff(permissionsStaff._id, {
        permissions: permissionsData
      } as any);

      if (response.success) {
        setShowPermissionsModal(false);
        setPermissionsStaff(null);
        await fetchStaff();
        alert('Permissions updated successfully!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions');
    }
  };

  if (loading && staffList.length === 0) {
    return (
      <div className="admin-staff-management">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading staff...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-staff-management">
      <div className="admin-header">
        <div className="header-content">
          <div>
            <h1>Staff Management</h1>
            <p>Create and manage staff accounts for the admin portal</p>
          </div>
          <div className="header-actions">
            {!showCreateForm && (
              <button
                className="btn-primary"
                onClick={() => setShowCreateForm(true)}
              >
                + Create Staff Account
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      {showCreateForm && (
        <div className="create-staff-form">
          <h2>{editingStaff ? 'Edit Staff Account' : 'Create Staff Account'}</h2>
          <form onSubmit={editingStaff ? handleUpdateStaff : handleCreateStaff}>
            <div className="form-group">
              <label htmlFor="name">Staff Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter staff name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email *</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="Enter email address"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                Password {editingStaff ? '(leave blank to keep current)' : '*'}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required={!editingStaff}
                minLength={6}
                placeholder="Enter password (min 6 characters)"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingStaff ? 'Update Staff' : 'Create Staff'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="staff-section">
        <div className="section-header">
          <h2>Staff Members ({staffList.length})</h2>
        </div>

        <div className="staff-table-container">
          <table className="staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="no-data">
                    No staff members found. Create your first staff account.
                  </td>
                </tr>
              ) : (
                staffList.map((staff) => (
                  <tr key={staff._id}>
                    <td>{staff.name}</td>
                    <td>{staff.email}</td>
                    <td>
                      <span className="role-badge">{staff.role}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${staff.is_active ? 'active' : 'inactive'}`}>
                        {staff.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(staff.createdAt)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-permissions"
                          onClick={() => handleOpenPermissions(staff)}
                          title="Manage Permissions"
                        >
                          Permissions
                        </button>
                        <button
                          className="btn-edit"
                          onClick={() => handleEditStaff(staff)}
                          title="Edit Staff"
                        >
                          Edit
                        </button>
                        <button
                          className="btn-delete"
                          onClick={() => handleDeleteStaff(staff._id)}
                          title="Deactivate Staff"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Modal */}
      {showPermissionsModal && permissionsStaff && (
        <div className="modal-overlay" onClick={() => setShowPermissionsModal(false)}>
          <div className="modal-content permissions-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Permissions for {permissionsStaff.name}</h2>
              <button className="close-btn" onClick={() => setShowPermissionsModal(false)}>
                x
              </button>
            </div>

            <div className="permissions-content">
              <div className="permissions-section">
                <h3>Menu Access</h3>
                <p className="section-desc">Control which menu items this staff member can see</p>
                <div className="permissions-grid">
                  {(['dashboard', 'clients', 'orders', 'tickets', 'billing', 'remittances', 'ndr', 'weight_discrepancies'] as const).map(key => (
                    <label key={key} className="permission-item">
                      <input
                        type="checkbox"
                        checked={permissionsData[key]}
                        onChange={() => handlePermissionChange(key)}
                      />
                      <span className="checkmark"></span>
                      <span className="permission-label">{PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="permissions-section">
                <h3>Optional Access (Requires Explicit Grant)</h3>
                <p className="section-desc">These permissions are disabled by default</p>
                <div className="permissions-grid">
                  {(['wallet_recharge', 'rate_cards', 'carriers', 'staff_management'] as const).map(key => (
                    <label key={key} className="permission-item restricted">
                      <input
                        type="checkbox"
                        checked={permissionsData[key]}
                        onChange={() => handlePermissionChange(key)}
                      />
                      <span className="checkmark"></span>
                      <span className="permission-label">{PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="permissions-section">
                <h3>Action Permissions</h3>
                <p className="section-desc">Control specific actions this staff member can perform</p>
                <div className="permissions-grid">
                  {(['can_recharge_wallet', 'can_change_client_category', 'can_generate_monthly_billing'] as const).map(key => (
                    <label key={key} className="permission-item action">
                      <input
                        type="checkbox"
                        checked={permissionsData[key]}
                        onChange={() => handlePermissionChange(key)}
                      />
                      <span className="checkmark"></span>
                      <span className="permission-label">{PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPermissionsModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSavePermissions}>
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStaffManagement;
