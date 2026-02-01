import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { userService, UserProfile } from '../services/userService';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { formatDate } from '../utils/dateFormat';
import './Profile.css';

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const fetchUserProfile = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userService.getUserProfile();
      setUser(response.data);
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  // Refresh profile when navigating back to this page (e.g., from settings)
  useEffect(() => {
    if (location.pathname === '/profile') {
      fetchUserProfile();
    }
  }, [location.pathname, fetchUserProfile]);

  const generateInitials = (name: string): string => {
    if (!name) return 'U';
    const words = name.trim().split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getKycStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { class: string; label: string } } = {
      verified: { class: 'status-verified', label: '✓ Verified' },
      pending: { class: 'status-pending', label: '⏳ Pending' },
      rejected: { class: 'status-rejected', label: '✗ Rejected' }
    };
    return statusMap[status] || { class: 'status-pending', label: status };
  };

  const getAccountStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { class: string; label: string } } = {
      active: { class: 'status-active', label: '✓ Active' },
      inactive: { class: 'status-inactive', label: '○ Inactive' },
      suspended: { class: 'status-suspended', label: '⚠ Suspended' },
      pending_verification: { class: 'status-pending', label: '⏳ Pending Verification' }
    };
    return statusMap[status] || { class: 'status-pending', label: status };
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${type} copied to clipboard!`);
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="profile-container">
          <div className="profile-loading">
            <div className="loading-spinner"></div>
            <p>Loading your profile...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="profile-container">
          <div className="profile-error">
            <p>Failed to load profile. Please try again.</p>
            <button onClick={fetchUserProfile} className="retry-btn">Retry</button>
          </div>
        </div>
      </Layout>
    );
  }

  const kycStatus = getKycStatusBadge(user.kyc_status?.status || 'pending');
  const accountStatus = getAccountStatusBadge(user.account_status || 'pending_verification');
  const initials = user.initials || generateInitials(user.your_name || user.company_name || '');

  return (
    <Layout>
      <div className="profile-container">
        {/* Profile Header */}
        <div className="profile-header-section">
          <div className="profile-avatar-section">
            <div className="profile-avatar-large">
              {user.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt="Profile Avatar" 
                  className="avatar-image"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      const span = document.createElement('span');
                      span.className = 'avatar-text';
                      span.textContent = initials;
                      parent.appendChild(span);
                    }
                  }}
                />
              ) : (
                <span className="avatar-text">{initials}</span>
              )}
            </div>
            <div className="profile-info-header">
              <h1 className="profile-name">{user.company_name || 'Your Company'}</h1>
              <p className="profile-contact">{user.your_name}</p>
              <p className="profile-email">{user.email}</p>
              <div className="profile-status-badges">
                <span className={`status-badge ${accountStatus.class}`}>{accountStatus.label}</span>
                <span className={`status-badge ${kycStatus.class}`}>{kycStatus.label}</span>
              </div>
            </div>
          </div>
          <Link className="edit-profile-btn" to="/account-settings">
            ✏️ Edit Profile
          </Link>
        </div>

        {/* Main Content Grid */}
        <div className="profile-grid">
          {/* Left Column - Basic Information */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>👤 Basic Information</h2>
            </div>
            <div className="profile-card-content">
              <div className="info-row">
                <span className="info-label">Client ID:</span>
                <span className="info-value">{user.client_id || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Company Name:</span>
                <span className="info-value">{user.company_name || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Your Name:</span>
                <span className="info-value">{user.your_name || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email:</span>
                <span className="info-value">{user.email || 'N/A'}</span>
                {user.email_verified && <span className="verified-badge">✓ Verified</span>}
              </div>
              <div className="info-row">
                <span className="info-label">Phone:</span>
                <span className="info-value">{user.phone_number || 'N/A'}</span>
                {user.phone_verified && <span className="verified-badge">✓ Verified</span>}
              </div>
              <div className="info-row">
                <span className="info-label">User Type:</span>
                <span className="info-value">{user.user_type || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">GSTIN:</span>
                <span className="info-value">{user.gstin || 'Not provided'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Joined Date:</span>
                <span className="info-value">
                  {user.joined_date ? formatDate(user.joined_date) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column - Address Information */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>📍 Address Information</h2>
            </div>
            <div className="profile-card-content">
              {user.address?.full_address ? (
                <>
                  <div className="info-row full-width">
                    <span className="info-label">Full Address:</span>
                    <span className="info-value">{user.address.full_address}</span>
                  </div>
                  {user.address.landmark && (
                    <div className="info-row">
                      <span className="info-label">Landmark:</span>
                      <span className="info-value">{user.address.landmark}</span>
                    </div>
                  )}
                  <div className="info-row">
                    <span className="info-label">City:</span>
                    <span className="info-value">{user.address.city || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">State:</span>
                    <span className="info-value">{user.address.state || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Pincode:</span>
                    <span className="info-value">{user.address.pincode || 'N/A'}</span>
                  </div>
                </>
              ) : (
                <p className="no-data-text">No address information available</p>
              )}
            </div>
          </div>

          {/* Bank Details */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>🏦 Bank Details</h2>
            </div>
            <div className="profile-card-content">
              {user.bank_details?.bank_name ? (
                <>
                  <div className="info-row">
                    <span className="info-label">Bank Name:</span>
                    <span className="info-value">{user.bank_details.bank_name}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Account Holder:</span>
                    <span className="info-value">{user.bank_details.account_holder_name || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Account Number:</span>
                    <span className="info-value masked">
                      {user.bank_details.account_number ? 
                        `****${user.bank_details.account_number.slice(-4)}` : 'N/A'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">IFSC Code:</span>
                    <span className="info-value">{user.bank_details.ifsc_code || 'N/A'}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Branch:</span>
                    <span className="info-value">{user.bank_details.branch_name || 'N/A'}</span>
                  </div>
                </>
              ) : (
                <p className="no-data-text">No bank details available</p>
              )}
            </div>
          </div>

          {/* API Details */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>🔑 API Details</h2>
              <button 
                className="toggle-keys-btn"
                onClick={() => setShowApiKeys(!showApiKeys)}
              >
                {showApiKeys ? '👁️ Hide' : '👁️ Show'} Keys
              </button>
            </div>
            <div className="profile-card-content">
              {user.api_details?.public_key ? (
                <>
                  <div className="info-row full-width">
                    <span className="info-label">Public Key:</span>
                    <div className="api-key-container">
                      <span className="info-value api-key">
                        {showApiKeys ? user.api_details.public_key : '••••••••••••••••'}
                      </span>
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(user.api_details.public_key, 'Public Key')}
                        title="Copy Public Key"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="info-row full-width">
                    <span className="info-label">Private Key:</span>
                    <div className="api-key-container">
                      <span className="info-value api-key">
                        {showPrivateKey && showApiKeys ? 
                          (user.api_details.private_key || 'Not available') : 
                          '••••••••••••••••'}
                      </span>
                      <div className="key-actions">
                        <button 
                          className="copy-btn"
                          onClick={() => {
                            if (user.api_details.private_key) {
                              copyToClipboard(user.api_details.private_key, 'Private Key');
                            }
                          }}
                          title="Copy Private Key"
                          disabled={!showPrivateKey || !showApiKeys}
                        >
                          📋
                        </button>
                        <button 
                          className="toggle-key-btn"
                          onClick={() => setShowPrivateKey(!showPrivateKey)}
                          disabled={!showApiKeys}
                          title={showPrivateKey ? 'Hide Private Key' : 'Show Private Key'}
                        >
                          {showPrivateKey ? '👁️‍🗨️' : '👁️'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="info-row">
                    <span className="info-label">API Version:</span>
                    <span className="info-value">{user.api_details.api_documentation_version || '1.0'}</span>
                  </div>
                  <div className="api-warning">
                    ⚠️ Keep your API keys secure. Never share your private key publicly.
                  </div>
                  <button 
                    className="regenerate-keys-btn"
                    onClick={() => navigate('/settings')}
                  >
                    🔄 Regenerate Keys
                  </button>
                </>
              ) : (
                <>
                  <p className="no-data-text">No API keys generated</p>
                  <button 
                    className="generate-keys-btn"
                    onClick={() => navigate('/settings')}
                  >
                    Generate API Keys
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>📄 Documents</h2>
            </div>
            <div className="profile-card-content">
              {user.documents && user.documents.length > 0 ? (
                <div className="documents-list">
                  {user.documents.map((doc, index) => (
                    <div key={index} className="document-item">
                      <div className="document-info">
                        <span className="document-type">
                          {doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        <span className={`document-status status-${doc.document_status}`}>
                          {doc.document_status}
                        </span>
                      </div>
                      {doc.file_url && (
                        <a 
                          href={doc.file_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="view-document-btn"
                        >
                          View 📄
                        </a>
                      )}
                      <span className="document-date">
                        {doc.upload_date ? formatDate(doc.upload_date) : 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data-text">No documents uploaded</p>
              )}
            </div>
          </div>

          {/* Account Summary */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2>📊 Account Summary</h2>
            </div>
            <div className="profile-card-content">
              <div className="info-row">
                <span className="info-label">Account Status:</span>
                <span className={`status-badge ${accountStatus.class}`}>{accountStatus.label}</span>
              </div>
              <div className="info-row">
                <span className="info-label">KYC Status:</span>
                <span className={`status-badge ${kycStatus.class}`}>{kycStatus.label}</span>
              </div>
              {user.kyc_status?.verified_date && (
                <div className="info-row">
                  <span className="info-label">KYC Verified:</span>
                  <span className="info-value">
                    {formatDate(user.kyc_status.verified_date)}
                  </span>
                </div>
              )}
              <div className="info-row">
                <span className="info-label">Wallet Balance:</span>
                <span className="info-value wallet-balance">
                  ₹{((user as any).wallet_balance || user.walletBalance || 0).toFixed(2)}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Email Verified:</span>
                <span className="info-value">
                  {user.email_verified ? <span className="verified-badge">✓ Yes</span> : <span className="unverified-badge">✗ No</span>}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Phone Verified:</span>
                <span className="info-value">
                  {user.phone_verified ? <span className="verified-badge">✓ Yes</span> : <span className="unverified-badge">✗ No</span>}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
