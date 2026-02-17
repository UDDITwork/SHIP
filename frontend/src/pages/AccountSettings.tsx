import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { userService, type User } from '../services/userService';
import { DataCache } from '../utils/dataCache';
import { environmentConfig } from '../config/environment';
import { formatDateTime } from '../utils/dateFormat';
import { Pencil, Loader, Eye, EyeOff, Lock } from 'lucide-react';
import './AccountSettings.css';

interface EditMode {
  userDetails: boolean;
  address: boolean;
  bankDetails: boolean;
}

const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const userRef = React.useRef<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if KYC is verified (for field locking)
  const isKycVerified = user?.kyc_status?.status === 'verified';

  // Helper function to check if a specific field is locked
  const isFieldLocked = (fieldName: string): boolean => {
    if (user?.kyc_status?.status === 'verified') {
      return ['company_name', 'your_name', 'gstin', 'phone_number', 'email', 'bank_details'].includes(fieldName);
    }
    return false;
  };
  const [editMode, setEditMode] = useState<EditMode>({
    userDetails: false,
    address: false,
    bankDetails: false
  });

  // Form states
  const [formData, setFormData] = useState({
    company_name: '',
    your_name: '',
    email: '',
    phone_number: '',
    gstin: '',
    address: {
      full_address: '',
      landmark: '',
      pincode: '',
      city: '',
      state: ''
    },
    bank_details: {
      bank_name: '',
      account_number: '',
      ifsc_code: '',
      branch_name: '',
      account_holder_name: ''
    }
  });

  // Password reset state
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  // Document upload state
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  
  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const fetchUserData = useCallback(async (retryCount = 0) => {
    // Load from cache FIRST - instant display, no freezing
    const cachedUser = DataCache.get<User>('userProfile');
    if (cachedUser) {
      setUser(cachedUser);
      setFormData({
        company_name: cachedUser.company_name || '',
        your_name: cachedUser.your_name || '',
        email: cachedUser.email || '',
        phone_number: cachedUser.phone_number || '',
        gstin: cachedUser.gstin || '',
        address: cachedUser.address || {
          full_address: '',
          landmark: '',
          pincode: '',
          city: '',
          state: ''
        },
        bank_details: cachedUser.bank_details || {
          bank_name: '',
          account_number: '',
          ifsc_code: '',
          branch_name: '',
          account_holder_name: ''
        }
      });
      setLoading(false); // Don't block UI if we have cached data
    } else {
      // Also try localStorage (AuthContext stores it there)
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser) as User;
          setUser(parsedUser);
          setFormData({
            company_name: parsedUser.company_name || '',
            your_name: parsedUser.your_name || '',
            email: parsedUser.email || '',
            phone_number: parsedUser.phone_number || '',
            gstin: parsedUser.gstin || '',
            address: parsedUser.address || {
              full_address: '',
              landmark: '',
              pincode: '',
              city: '',
              state: ''
            },
            bank_details: parsedUser.bank_details || {
              bank_name: '',
              account_number: '',
              ifsc_code: '',
              branch_name: '',
              account_holder_name: ''
            }
          });
          setLoading(false);
        } catch (e) {
          // Invalid JSON, continue to API fetch
        }
      }
    }

    // Only show loading if no cached data
    if (!cachedUser && !localStorage.getItem('user')) {
      setLoading(true);
    }

    try {
      // Fetch fresh data in background - doesn't block UI if we have cache
      const response = await userService.getProfile();
      console.log('✅ API Response:', response);
      
      // Update state with fresh data
      setUser(response);
      setFormData({ 
        company_name: response.company_name || '',
        your_name: response.your_name || '',
        email: response.email || '',
        phone_number: response.phone_number || '',
        gstin: response.gstin || '',
        address: response.address || {
          full_address: '',
          landmark: '',
          pincode: '',
          city: '',
          state: ''
        },
        bank_details: response.bank_details || {
          bank_name: '',
          account_number: '',
          ifsc_code: '',
          branch_name: '',
          account_holder_name: ''
        }
      });

      // Cache it for next time
      DataCache.set('userProfile', response);
      
    } catch (error: any) {
      console.error('❌ Error fetching user data:', error);
      
      // Check if it's an authentication error
      if (error?.response?.status === 401) {
        alert('Your session has expired. Please log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        DataCache.clear('userProfile');
        window.location.href = '/login';
        return;
      }
      
      // On error, use stale cache or localStorage - app continues working!
      const staleUser = DataCache.getStale<User>('userProfile');
      if (staleUser && !userRef.current) {
        console.log('📦 Using cached user data due to API error');
        setUser(staleUser);
        setFormData({
          company_name: staleUser.company_name || '',
          your_name: staleUser.your_name || '',
          email: staleUser.email || '',
          phone_number: staleUser.phone_number || '',
          gstin: staleUser.gstin || '',
          address: staleUser.address || {
            full_address: '',
            landmark: '',
            pincode: '',
            city: '',
            state: ''
          },
          bank_details: staleUser.bank_details || {
            bank_name: '',
            account_number: '',
            ifsc_code: '',
            branch_name: '',
            account_holder_name: ''
          }
        });
        // Don't show error alert if we have cached data - app works fine
        return;
      }

      // Only show error if we truly have no data at all
      if (!userRef.current && !staleUser) {
        const errorMessage = error?.response?.data?.message || error?.message || 'Failed to load user data. Please check if you are logged in and try again.';
        alert(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleInputChange = (section: string, field: string, value: string) => {
    // Auto-uppercase IFSC code to match backend validation
    const processedValue = (field === 'ifsc_code') ? value.toUpperCase() : value;
    if (section === 'address' || section === 'bank_details') {
      setFormData(prev => ({
        ...prev,
        [section]: {
          ...(prev as any)[section],
          [field]: processedValue
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const toggleEditMode = (section: keyof EditMode) => {
    setEditMode(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleSave = async (section: string) => {
    try {
      setLoading(true);
      
      let dataToUpdate = {};
      if (section === 'userDetails') {
        // Validate GSTIN format before sending
        if (formData.gstin && !validateGSTIN(formData.gstin)) {
          alert('Please enter a valid GSTIN format (e.g., 22ABCDE1234F1Z5)');
          setLoading(false);
          return;
        }
        
        dataToUpdate = {
          company_name: formData.company_name,
          your_name: formData.your_name,
          email: formData.email,
          phone_number: formData.phone_number,
          gstin: formData.gstin
        };
      } else if (section === 'address') {
        dataToUpdate = { address: formData.address };
      } else if (section === 'bankDetails') {
        dataToUpdate = { bank_details: formData.bank_details };
      }

      // Debug: Log the data being sent
      console.log('🚀 SENDING DATA TO BACKEND:', {
        section,
        dataToUpdate,
        timestamp: new Date().toISOString()
      });

      // API call to update
      const response = await userService.updateProfile(dataToUpdate);
      console.log('✅ BACKEND RESPONSE:', response);
      
      // Update both user state and form data
      setUser(response);
      setFormData({
        company_name: response.company_name || '',
        your_name: response.your_name || '',
        email: response.email || '',
        phone_number: response.phone_number || '',
        gstin: response.gstin || '',
        address: response.address || {
          full_address: '',
          landmark: '',
          pincode: '',
          city: '',
          state: ''
        },
        bank_details: response.bank_details || {
          bank_name: '',
          account_number: '',
          ifsc_code: '',
          branch_name: '',
          account_holder_name: ''
        }
      });

      // Cache the updated user data - persists across refreshes
      DataCache.set('userProfile', response);
      
      // Also update localStorage for AuthContext compatibility
      localStorage.setItem('user', JSON.stringify(response));
      
      alert(`${section} updated successfully!`);
      toggleEditMode(section as keyof EditMode);
      
      console.log('✅ FRONTEND UPDATED WITH NEW DATA:', response);

    } catch (error: any) {
      console.error(`Error updating ${section}:`, error);

      // Handle 403 KYC lock error
      if (error?.response?.status === 403) {
        alert(error.response.data.message || 'Your KYC has been approved. Profile details cannot be edited.');
        toggleEditMode(section as keyof EditMode); // Exit edit mode
      }
      // Handle validation errors from backend
      else if (error?.response?.data?.errors) {
        const validationErrors = error.response.data.errors;
        const errorMessages = Object.values(validationErrors).join(', ');
        alert(`Validation Error: ${errorMessages}`);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to update ${section}: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestProfileEdit = () => {
    navigate('/support', {
      state: {
        prefilledCategory: 'kyc_bank_verification',
        prefilledSubject: 'Profile Edit Request - KYC Verified Account',
        prefilledDescription: 'I need to update my verified profile details:\n\nField to update:\nReason for change:\nSupporting documents (if applicable):'
      }
    });
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.new_password !== passwordData.confirm_password) {
      alert('New password and confirm password do not match!');
      return;
    }

    if (passwordData.new_password.length < 6) {
      alert('Password must be at least 6 characters long!');
      return;
    }

    try {
      setLoading(true);

      // API call to reset password
      await userService.resetPassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      });

      alert('Password reset successfully!');
      setShowPasswordReset(false);
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: ''
      });

    } catch (error) {
      console.error('Error resetting password:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to reset password: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentUpload = async (documentType: string, file: File) => {
    console.log('🔍 HANDLE DOCUMENT UPLOAD:', {
      documentType,
      file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      isFile: file instanceof File
    });

    if (!file) {
      console.error('❌ NO FILE PROVIDED');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only JPG, PNG, and PDF files are allowed');
      return;
    }

    setUploadingDoc(documentType);

    try {
      const uploadStartTime = Date.now();
      console.log('🚀 UPLOADING DOCUMENT:', {
        documentType,
        fileName: file.name,
        fileSize: file.size,
        fileSizeMB: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        fileType: file.type,
        timestamp: new Date().toISOString(),
        uploadStartTime
      });

      // API call to upload document (will use Cloudinary in backend)
      const response = await userService.uploadDocument({
        file: file,
        document_type: documentType
      });

      const uploadDuration = Date.now() - uploadStartTime;
      console.log('✅ DOCUMENT UPLOAD SUCCESS:', {
        response,
        documentType,
        fileName: file.name,
        uploadDuration: `${uploadDuration}ms`,
        timestamp: new Date().toISOString()
      });
      alert('Document uploaded successfully!');
      fetchUserData();

    } catch (error: any) {
      console.error('❌ DOCUMENT UPLOAD ERROR:', {
        error,
        errorType: error?.constructor?.name,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        errorMessage: error?.response?.data?.error || error?.response?.data?.message,
        fullError: error?.response?.data,
        retryAfter: error?.response?.headers?.['retry-after'],
        timestamp: new Date().toISOString()
      });
      
      // Handle specific error cases
      let errorMessage = 'Failed to upload document';
      
      if (error?.response?.status === 429) {
        const retryAfter = error?.response?.headers?.['retry-after'] || '15';
        errorMessage = `Too many upload requests. Please wait ${retryAfter} minutes before trying again.`;
        console.warn('⚠️ RATE LIMIT HIT:', {
          retryAfter,
          endpoint: '/users/upload-document',
          documentType,
          timestamp: new Date().toISOString()
        });
      } else if (error?.response?.status === 413) {
        errorMessage = 'File is too large. Maximum size is 5MB.';
      } else if (error?.response?.status === 400) {
        errorMessage = error?.response?.data?.message || error?.response?.data?.error || 'Invalid file format or missing document type.';
      } else if (error?.response?.data?.message) {
        errorMessage = error?.response?.data?.message;
      } else if (error?.response?.data?.error) {
        errorMessage = error?.response?.data?.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setUploadingDoc(null);
    }
  };

  const getDocumentStatus = (docType: string) => {
    if (!user?.documents) return null;
    return user.documents.find(doc => doc.document_type === docType);
  };

  // ✅ Generate proper download URL with backend proxy that sets correct headers
  const handleViewDocument = async (cloudinaryUrl: string, documentType: string) => {
    if (!cloudinaryUrl) return;
    
    try {
      const encodedUrl = encodeURIComponent(cloudinaryUrl);
      // environmentConfig.apiUrl already includes '/api', so use '/users/documents/download' not '/api/users/documents/download'
      const downloadUrl = `${environmentConfig.apiUrl}/users/documents/download?url=${encodedUrl}&documentType=${encodeURIComponent(documentType)}`;
      
      // Fetch the document with authentication token
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please log in to view documents');
        return;
      }
      
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert('Access denied. Please log in again.');
          return;
        }
        const errorData = await response.json().catch(() => ({ message: 'Failed to download document' }));
        alert(errorData.message || 'Failed to download document');
        return;
      }
      
      // Get the content type and filename from headers
      const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'document';
      
      // Extract filename from Content-Disposition header
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
        if (filenameMatch && filenameMatch[1]) {
          // Remove quotes if present
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      // Get the actual file content as array buffer to preserve format exactly
      const arrayBuffer = await response.arrayBuffer();
      
      // Create blob with explicit MIME type to ensure format preservation
      // The Content-Type from backend determines the format (PDF, JPEG, PNG, etc.)
      const blob = new Blob([arrayBuffer], { type: contentType });
      
      // Determine if this is a viewable format (PDF, images) or should be downloaded
      const isViewableFormat = contentType.startsWith('application/pdf') || 
                               contentType.startsWith('image/');
      
      if (isViewableFormat) {
        // For PDFs and images: create a blob URL and open in new window for viewing
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');
        
        // Clean up the blob URL after a delay (after the window has loaded)
        if (newWindow) {
          // Revoke URL after window closes or after timeout
          setTimeout(() => {
            try {
              URL.revokeObjectURL(blobUrl);
            } catch (e) {
              console.warn('Error revoking blob URL:', e);
            }
          }, 60000); // 60 seconds should be enough for viewing
        } else {
          // If popup was blocked, fall back to download
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }
      } else {
        // For other formats: force download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
      
    } catch (error) {
      console.error('Error viewing document:', error);
      alert('Failed to view document. Please try again.');
    }
  };

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (JPEG/PNG only)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only JPEG and PNG images are allowed for profile photos');
      e.target.value = ''; // Reset input
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      e.target.value = ''; // Reset input
      return;
    }

    setUploadingAvatar(true);

    try {
      const response = await userService.updateAvatar(file);
      
      // Update user state with new avatar URL
      if (user) {
        const updatedUser = { ...user, avatar_url: response.avatar_url };
        setUser(updatedUser);
        DataCache.set('userProfile', updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      alert('Profile photo updated successfully!');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to upload profile photo';
      alert(errorMessage);
    } finally {
      setUploadingAvatar(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleLogoClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only JPEG, PNG, JPG, and SVG images are allowed for the company logo');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      e.target.value = '';
      return;
    }

    setUploadingLogo(true);

    try {
      const response = await userService.updateCompanyLogo(file);

      if (userRef.current) {
        const updatedUser: User = {
          ...userRef.current,
          company_logo_url: response.company_logo_url,
          company_logo_public_id: response.company_logo_public_id,
          company_logo_uploaded_at: response.company_logo_uploaded_at
        };
        setUser(updatedUser);
        DataCache.set('userProfile', updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      } else {
        await fetchUserData();
      }

      alert(response.message || 'Company logo updated successfully!');
    } catch (error: any) {
      console.error('Error uploading company logo:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to upload company logo';
      alert(errorMessage);
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
      case 'verified':
        return 'status-uploaded';
      case 'pending':
        return 'status-pending';
      case 'rejected':
        return 'status-rejected';
      default:
        return '';
    }
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (!accountNumber) return '';
    const visible = accountNumber.slice(-4);
    return `XXXXXXXXXX${visible}`;
  };

  const maskPrivateKey = (key: string) => {
    if (!key) return '';
    return `${key.slice(0, 10)}...${key.slice(-10)}`;
  };

  // GSTIN validation function
  const validateGSTIN = (gstin: string): boolean => {
    if (!gstin) return true; // Allow empty GSTIN
    // GSTIN format: 2 digits + 5 letters + 4 digits + 1 letter + 1 digit + Z + 1 alphanumeric
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin.toUpperCase());
  };

  if (loading && !user) {
    return (
      <Layout>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading account settings...</p>
        </div>
      </Layout>
    );
  }

  if (!user && !loading) {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      // Redirect to login if no token
      window.location.href = '/login';
      return null;
    }
    
    return (
      <Layout>
        <div className="loading-container">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Failed to Load User Data</h2>
            <p className="text-gray-600 mb-4">Unable to fetch your account information.</p>
            <div className="space-y-2">
              <button 
                onClick={() => fetchUserData()}
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 mr-2"
              >
                Retry
              </button>
              <button 
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  window.location.href = '/login';
                }}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
              >
                Logout & Login Again
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="account-settings-container">
        {/* Profile Header */}
        <div className="profile-header">
          <div className="profile-avatar">
            <div className="avatar-circle">
              {user?.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt="Profile" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    borderRadius: '50%', 
                    objectFit: 'cover' 
                  }} 
                />
              ) : (
                user?.your_name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
            <button 
              className="edit-avatar-btn" 
              onClick={handleAvatarClick}
              disabled={uploadingAvatar}
              title="Edit profile photo"
            >
              {uploadingAvatar ? <Loader size={14} /> : <Pencil size={14} />}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>
          <div className="profile-info">
            <h2>{user?.company_name || 'Loading...'}</h2>
            <p className="client-id">Client ID: {user?.client_id || 'Loading...'}</p>
          </div>
        <div className="company-logo-section">
          <div className="company-logo-preview">
            {user?.company_logo_url ? (
              <img 
                src={user.company_logo_url} 
                alt={`${user?.company_name || 'Company'} logo`} 
              />
            ) : (
              <span className="company-logo-placeholder">
                Upload your logo to show on shipping labels
              </span>
            )}
          </div>
          <button 
            className="upload-logo-btn"
            onClick={handleLogoClick}
            disabled={uploadingLogo}
          >
            {uploadingLogo ? 'Uploading...' : user?.company_logo_url ? 'Change Logo' : 'Upload Logo'}
          </button>
          <p className="company-logo-hint">Supports PNG, JPG, JPEG, SVG (max 5MB)</p>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml"
            onChange={handleLogoChange}
            style={{ display: 'none' }}
          />
        </div>
        </div>

        {/* KYC Verified Banner */}
        {isKycVerified && (
          <div style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            gap: '12px'
          }}>
            <div style={{ color: '#3b82f6', marginTop: '2px' }}>
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 600, color: '#1e3a8a' }}>
                KYC Verified
              </h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1e40af' }}>
                Your KYC has been approved. Profile details cannot be edited. To make changes, please contact admin or raise a support ticket.
              </p>
              <button
                onClick={handleRequestProfileEdit}
                style={{
                  fontSize: '14px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Request Profile Edit
              </button>
            </div>
          </div>
        )}

        {/* User Details Card */}
        <div className="settings-card">
          <div className="card-header">
            <h3>User Details</h3>
            <button
              className="edit-btn"
              onClick={() => toggleEditMode('userDetails')}
            >
              Edit
            </button>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <div className="info-item">
                <label>Company: {isFieldLocked('company_name') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.userDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => handleInputChange('', 'company_name', e.target.value)}
                      disabled={isFieldLocked('company_name')}
                      className={isFieldLocked('company_name') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('company_name') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.company_name || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>Email: {isFieldLocked('email') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.userDetails ? (
                  <div>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('', 'email', e.target.value)}
                      disabled={isFieldLocked('email')}
                      className={isFieldLocked('email') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('email') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.email || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>User: {isFieldLocked('your_name') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.userDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.your_name}
                      onChange={(e) => handleInputChange('', 'your_name', e.target.value)}
                      disabled={isFieldLocked('your_name')}
                      className={isFieldLocked('your_name') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('your_name') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.your_name || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>Phone: {isFieldLocked('phone_number') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.userDetails ? (
                  <div>
                    <input
                      type="tel"
                      value={formData.phone_number}
                      onChange={(e) => handleInputChange('', 'phone_number', e.target.value)}
                      maxLength={10}
                      disabled={isFieldLocked('phone_number')}
                      className={isFieldLocked('phone_number') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('phone_number') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.phone_number || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>User Type:</label>
                <span>{user?.user_type || 'Not set'}</span>
              </div>
              <div className="info-item">
                <label>Joined:</label>
                <span>{user?.joined_date ? formatDateTime(user.joined_date) : 'Not set'}</span>
              </div>
              <div className="info-item">
                <label>GSTIN: {isFieldLocked('gstin') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.userDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => handleInputChange('', 'gstin', e.target.value)}
                      style={{
                        borderColor: formData.gstin && !validateGSTIN(formData.gstin) ? '#ff4444' : '#ddd'
                      }}
                      placeholder="22ABCDE1234F1Z5"
                      disabled={isFieldLocked('gstin')}
                      className={isFieldLocked('gstin') ? 'disabled-input' : ''}
                    />
                    {formData.gstin && !validateGSTIN(formData.gstin) && !isFieldLocked('gstin') && (
                      <small style={{ color: '#ff4444', display: 'block', marginTop: '4px' }}>
                        Invalid GSTIN format. Use format: 22ABCDE1234F1Z5
                      </small>
                    )}
                    {isFieldLocked('gstin') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.gstin || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>Client ID:</label>
                <span>{user?.client_id || 'Not set'}</span>
              </div>
            </div>
            {editMode.userDetails && (
              <button
                className="save-btn"
                onClick={() => handleSave('userDetails')}
                disabled={loading || isKycVerified}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Address Card */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Address</h3>
            <button
              className="edit-btn"
              onClick={() => toggleEditMode('address')}
            >
              Edit
            </button>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <div className="info-item full-width">
                <label>Address:</label>
                {editMode.address ? (
                  <input
                    type="text"
                    value={formData.address.full_address}
                    onChange={(e) => handleInputChange('address', 'full_address', e.target.value)}
                  />
                ) : (
                  <span>{user?.address?.full_address || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>Landmark:</label>
                {editMode.address ? (
                  <input
                    type="text"
                    value={formData.address.landmark}
                    onChange={(e) => handleInputChange('address', 'landmark', e.target.value)}
                  />
                ) : (
                  <span>{user?.address?.landmark || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>City:</label>
                {editMode.address ? (
                  <input
                    type="text"
                    value={formData.address.city}
                    onChange={(e) => handleInputChange('address', 'city', e.target.value)}
                  />
                ) : (
                  <span>{user?.address?.city || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>Pincode:</label>
                {editMode.address ? (
                  <input
                    type="text"
                    value={formData.address.pincode}
                    onChange={(e) => handleInputChange('address', 'pincode', e.target.value)}
                    maxLength={6}
                  />
                ) : (
                  <span>{user?.address?.pincode || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>State:</label>
                {editMode.address ? (
                  <input
                    type="text"
                    value={formData.address.state}
                    onChange={(e) => handleInputChange('address', 'state', e.target.value)}
                  />
                ) : (
                  <span>{user?.address?.state || 'Not set'}</span>
                )}
              </div>
            </div>
            {editMode.address && (
              <button
                className="save-btn"
                onClick={() => handleSave('address')}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Bank Details Card */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Bank Details</h3>
            <button
              className="edit-btn"
              onClick={() => toggleEditMode('bankDetails')}
            >
              Edit
            </button>
          </div>
          <div className="card-body">
            <div className="info-grid">
              <div className="info-item">
                <label>Bank Name: {isFieldLocked('bank_details') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.bankDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.bank_details.bank_name}
                      onChange={(e) => handleInputChange('bank_details', 'bank_name', e.target.value)}
                      disabled={isFieldLocked('bank_details')}
                      className={isFieldLocked('bank_details') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('bank_details') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.bank_details?.bank_name || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>Branch Name: {isFieldLocked('bank_details') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.bankDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.bank_details.branch_name}
                      onChange={(e) => handleInputChange('bank_details', 'branch_name', e.target.value)}
                      disabled={isFieldLocked('bank_details')}
                      className={isFieldLocked('bank_details') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('bank_details') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.bank_details?.branch_name || 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>A/C No: {isFieldLocked('bank_details') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.bankDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.bank_details.account_number}
                      onChange={(e) => handleInputChange('bank_details', 'account_number', e.target.value)}
                      disabled={isFieldLocked('bank_details')}
                      className={isFieldLocked('bank_details') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('bank_details') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.bank_details?.account_number ? maskAccountNumber(user.bank_details.account_number) : 'Not set'}</span>
                )}
              </div>
              <div className="info-item">
                <label>IFSC: {isFieldLocked('bank_details') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.bankDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.bank_details.ifsc_code}
                      onChange={(e) => handleInputChange('bank_details', 'ifsc_code', e.target.value)}
                      disabled={isFieldLocked('bank_details')}
                      className={isFieldLocked('bank_details') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('bank_details') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.bank_details?.ifsc_code || 'Not set'}</span>
                )}
              </div>
              <div className="info-item full-width">
                <label>A/C Name: {isFieldLocked('bank_details') && <Lock size={14} style={{ display: 'inline', marginLeft: '4px', color: '#999' }} />}</label>
                {editMode.bankDetails ? (
                  <div>
                    <input
                      type="text"
                      value={formData.bank_details.account_holder_name}
                      onChange={(e) => handleInputChange('bank_details', 'account_holder_name', e.target.value)}
                      disabled={isFieldLocked('bank_details')}
                      className={isFieldLocked('bank_details') ? 'disabled-input' : ''}
                    />
                    {isFieldLocked('bank_details') && (
                      <small style={{ color: '#999', display: 'block', marginTop: '4px', fontSize: '12px' }}>
                        This field is locked after KYC verification. Contact admin to make changes.
                      </small>
                    )}
                  </div>
                ) : (
                  <span>{user?.bank_details?.account_holder_name || 'Not set'}</span>
                )}
              </div>
            </div>
            {editMode.bankDetails && (
              <button
                className="save-btn"
                onClick={() => handleSave('bankDetails')}
                disabled={loading || isKycVerified}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Documents Card */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Documents</h3>
          </div>
          <div className="card-body">
            <table className="documents-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { type: 'gst_certificate', label: 'GST Certificate / Company Incorporated Document' },
                  { type: 'photo', label: 'Photo / Selfie' },
                  { type: 'pan', label: 'PAN Card' },
                  { type: 'aadhar', label: 'Aadhar Card' },
                  { type: 'bank_statement', label: 'Cheque / Bank Statement' }
                ].map((doc) => {
                  const docStatus = getDocumentStatus(doc.type);
                  return (
                    <tr key={doc.type}>
                      <td>{doc.label}</td>
                      <td>
                        <span className={`status-badge ${docStatus ? getStatusColor(docStatus.document_status) : 'status-pending'}`}>
                          {docStatus ? docStatus.document_status : 'Pending'}
                        </span>
                      </td>
                      <td className="action-btns">
                        <label className="upload-btn">
                          {uploadingDoc === doc.type ? 'Uploading...' : 'Update'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/jpg,application/pdf"
                            onChange={(e) => e.target.files && handleDocumentUpload(doc.type, e.target.files[0])}
                            disabled={uploadingDoc === doc.type}
                            style={{ display: 'none' }}
                          />
                        </label>
                        {docStatus && (
                          <button
                            onClick={() => handleViewDocument(docStatus.file_url, doc.type)}
                            className="view-btn"
                            type="button"
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* KYC Status Card */}
        <div className={`settings-card kyc-status-card ${user?.kyc_status?.status || 'pending'}`}>
          <div className="card-header">
            <h3>
              {user?.kyc_status?.status === 'verified' ? 'KYC Verified' :
               user?.kyc_status?.status === 'rejected' ? 'KYC Rejected' :
               'KYC Pending Verification'}
            </h3>
            {user?.kyc_status?.status === 'verified' && (
              <div className="kyc-verified-badge">
                <span className="verified-icon">✓</span>
                <span>Verified</span>
              </div>
            )}
          </div>
          <div className="card-body">
            <div className="kyc-status">
              <div className="kyc-info">
                <label>KYC Status:</label>
                <span className={`status-badge ${user?.kyc_status?.status || 'pending'}`}>
                  {user?.kyc_status?.status === 'verified' ? 'Verified' :
                   user?.kyc_status?.status === 'rejected' ? 'Rejected' :
                   'Pending'}
                </span>
              </div>
              {user?.kyc_status?.verified_date && (
                <div className="kyc-info">
                  <label>Verified At:</label>
                  <span>{formatDateTime(user.kyc_status.verified_date)}</span>
                </div>
              )}
              {user?.kyc_status?.status === 'pending' && (
                <div className="kyc-pending-notice">
                  <p>Your KYC documents are under review. Our admin team will verify your documents and update your status soon.</p>
                </div>
              )}
              {user?.kyc_status?.status === 'rejected' && (
                <div className="kyc-rejected-notice">
                  <p>Your KYC verification was rejected. Please check your documents and re-upload if necessary.</p>
                </div>
              )}
              {user?.kyc_status?.status === 'verified' && (
                <div className="kyc-verified-notice">
                  <p>Congratulations! Your KYC has been successfully verified. You now have full access to all platform features.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* API Details Card */}
        <div className="settings-card">
          <div className="card-header">
            <h3>API Details</h3>
          </div>
          <div className="card-body">
            <div className="api-info">
              <div className="api-item">
                <label>Check latest version of API documentation:</label>
                <button className="api-btn">View Docs</button>
              </div>
              <div className="api-item">
                <label>PDF version of API documentation:</label>
                <button className="api-btn">Download</button>
              </div>
              <div className="api-item">
                <label>Private Key:</label>
                <span className="api-key">{user?.api_details?.private_key ? maskPrivateKey(user.api_details.private_key) : 'Not set'}</span>
              </div>
              <div className="api-item">
                <label>Public Key:</label>
                <span className="api-key">{user?.api_details?.public_key || 'Not set'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reset Password Card */}
        <div className="settings-card">
          <div className="card-header">
            <h3>Reset Password</h3>
          </div>
          <div className="card-body">
            {!showPasswordReset ? (
              <button
                className="reset-password-trigger"
                onClick={() => setShowPasswordReset(true)}
              >
                Change Password
              </button>
            ) : (
              <form className="password-reset-form" onSubmit={handlePasswordReset}>
                <div className="form-group">
                  <label>Current Password:</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.current_password}
                    onChange={(e) => handlePasswordChange('current_password', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>New password:</label>
                  <div className="password-input">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordData.new_password}
                      onChange={(e) => handlePasswordChange('new_password', e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm Password:</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.confirm_password}
                    onChange={(e) => handlePasswordChange('confirm_password', e.target.value)}
                    required
                  />
                </div>
                <div className="password-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setShowPasswordReset(false);
                      setPasswordData({
                        current_password: '',
                        new_password: '',
                        confirm_password: ''
                      });
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="update-btn"
                    disabled={loading}
                  >
                    {loading ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AccountSettings;
