import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import PackageCreationModal from '../components/PackageCreationModal';
import { environmentConfig } from '../config/environment';
import { formatDate } from '../utils/dateFormat';
import './Packages.css';

// Package Types
type PackageType = 'Single Package (B2C)' | 'Multiple Package (B2C)' | 'Multiple Package (B2B)';

interface Package {
  _id: string;
  name: string;
  description?: string;
  package_type: PackageType;
  category?: string;
  sku?: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  weight: number;
  volumetric_weight?: number;
  number_of_boxes?: number;
  weight_per_box?: number;
  rov_type?: string;
  rov_owner?: string;
  product_name: string;
  hsn_code?: string;
  unit_price?: number;
  discount?: number;
  tax?: number;
  weight_photo_url?: string;
  dimensions_photo_url?: string;
  is_default: boolean;
  usage_count: number;
  last_used?: Date;
  tags?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PackageFilters {
  package_type: PackageType | 'all';
  category: string;
  search: string;
}

const Packages: React.FC = () => {
  // State Management
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<PackageType | 'all'>('all');
  
  // Filter States
  const [filters, setFilters] = useState<PackageFilters>({
    package_type: 'all',
    category: '',
    search: ''
  });

  // Modal States
  const [isAddPackageModalOpen, setIsAddPackageModalOpen] = useState(false);
  const [isEditPackageModalOpen, setIsEditPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);

  // Fetch Packages on component mount and when filters change
  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.append('package_type', activeTab);
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`${environmentConfig.apiUrl}/packages?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPackages(data.data.packages);
      } else {
        console.error('Failed to fetch packages');
      }
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const handleAddPackage = () => {
    setIsAddPackageModalOpen(true);
  };

  const handleEditPackage = (packageItem: Package) => {
    setEditingPackage(packageItem);
    setIsEditPackageModalOpen(true);
  };

  const handleDeletePackage = async (packageId: string) => {
    if (window.confirm('Are you sure you want to delete this package?')) {
      try {
        const response = await fetch(`${environmentConfig.apiUrl}/packages/${packageId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          fetchPackages();
        } else {
          console.error('Failed to delete package');
        }
      } catch (error) {
        console.error('Error deleting package:', error);
      }
    }
  };

  const handleSetDefault = async (packageId: string) => {
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/packages/${packageId}/set-default`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        fetchPackages();
      } else {
        console.error('Failed to set default package');
      }
    } catch (error) {
      console.error('Error setting default package:', error);
    }
  };

  const handleSelectPackage = (packageId: string) => {
    if (selectedPackages.includes(packageId)) {
      setSelectedPackages(selectedPackages.filter(id => id !== packageId));
    } else {
      setSelectedPackages([...selectedPackages, packageId]);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPackages();
  };

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    // Export logic
    console.log('Exporting as:', format);
  };

  const getPackageTypeIcon = (type: PackageType) => {
    switch (type) {
      case 'Single Package (B2C)': return '📦';
      case 'Multiple Package (B2C)': return '📦📦';
      case 'Multiple Package (B2B)': return '🏢';
      default: return '📦';
    }
  };

  return (
    <Layout>
      <div className="packages-container">
        {/* Top Action Bar */}
        <div className="packages-top-bar">
          <div className="package-type-toggle">
            <button
              className={`toggle-btn ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Packages
            </button>
            <button
              className={`toggle-btn ${activeTab === 'Single Package (B2C)' ? 'active' : ''}`}
              onClick={() => setActiveTab('Single Package (B2C)')}
            >
              Single B2C
            </button>
            <button
              className={`toggle-btn ${activeTab === 'Multiple Package (B2C)' ? 'active' : ''}`}
              onClick={() => setActiveTab('Multiple Package (B2C)')}
            >
              Multi B2C
            </button>
            <button
              className={`toggle-btn ${activeTab === 'Multiple Package (B2B)' ? 'active' : ''}`}
              onClick={() => setActiveTab('Multiple Package (B2B)')}
            >
              Multi B2B
            </button>
          </div>

          <div className="top-actions">
            <button className="action-btn add-btn" onClick={handleAddPackage}>
              Add Package
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="filters-section">
          <form onSubmit={handleSearch} className="search-filter">
            <input
              type="text"
              className="search-input"
              placeholder="Search packages..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
            <button type="submit" className="search-btn"></button>
          </form>

          <select
            className="category-filter"
            value={filters.category}
            onChange={(e) => setFilters({...filters, category: e.target.value})}
          >
            <option value="">All Categories</option>
            <option value="Electronics">Electronics</option>
            <option value="Clothing">Clothing</option>
            <option value="Books">Books</option>
            <option value="Home">Home</option>
            <option value="Sports">Sports</option>
            <option value="General">General</option>
          </select>

          <div className="export-btns">
            <button className="export-btn" onClick={() => handleExport('csv')}>
              CSV
            </button>
            <button className="export-btn" onClick={() => handleExport('excel')}>
              Excel
            </button>
            <button className="export-btn" onClick={() => handleExport('pdf')}>
              PDF
            </button>
          </div>
        </div>

        {/* Packages Grid */}
        <div className="packages-grid">
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading packages...</p>
            </div>
          ) : packages.length === 0 ? (
            <div className="no-packages">
              <div className="no-packages-icon">📦</div>
              <h3>No packages found</h3>
              <p>Create your first package template to get started</p>
              <button className="create-package-btn" onClick={handleAddPackage}>
                ➕ Create Package
              </button>
            </div>
          ) : (
            packages.map((packageItem) => (
              <div key={packageItem._id} className="package-card">
                <div className="package-header">
                  <div className="package-type">
                    <span className="package-icon">
                      {getPackageTypeIcon(packageItem.package_type)}
                    </span>
                    <span className="package-type-text">{packageItem.package_type}</span>
                  </div>
                  <div className="package-actions">
                    <input
                      type="checkbox"
                      checked={selectedPackages.includes(packageItem._id)}
                      onChange={() => handleSelectPackage(packageItem._id)}
                    />
                  </div>
                </div>

                <div className="package-content">
                  <h3 className="package-name">{packageItem.name}</h3>
                  {packageItem.description && (
                    <p className="package-description">{packageItem.description}</p>
                  )}
                  
                  <div className="package-details">
                    <div className="detail-row">
                      <span className="detail-label">Product:</span>
                      <span className="detail-value">{packageItem.product_name}</span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Dimensions:</span>
                      <span className="detail-value">
                        {packageItem.dimensions.length} × {packageItem.dimensions.width} × {packageItem.dimensions.height} cm
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Weight:</span>
                      <span className="detail-value">{packageItem.weight} kg</span>
                    </div>

                    {packageItem.number_of_boxes && (
                      <div className="detail-row">
                        <span className="detail-label">Boxes:</span>
                        <span className="detail-value">{packageItem.number_of_boxes}</span>
                      </div>
                    )}

                    {packageItem.category && (
                      <div className="detail-row">
                        <span className="detail-label">Category:</span>
                        <span className="detail-value">{packageItem.category}</span>
                      </div>
                    )}

                    {packageItem.sku && (
                      <div className="detail-row">
                        <span className="detail-label">SKU:</span>
                        <span className="detail-value">{packageItem.sku}</span>
                      </div>
                    )}
                  </div>

                  {packageItem.tags && packageItem.tags.length > 0 && (
                    <div className="package-tags">
                      {packageItem.tags.map((tag, index) => (
                        <span key={index} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="package-stats">
                    <div className="stat">
                      <span className="stat-label">Used:</span>
                      <span className="stat-value">{packageItem.usage_count} times</span>
                    </div>
                    {packageItem.last_used && (
                      <div className="stat">
                        <span className="stat-label">Last used:</span>
                        <span className="stat-value">
                          {formatDate(packageItem.last_used)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="package-footer">
                  {packageItem.is_default && (
                    <span className="default-badge">Default</span>
                  )}
                  
                  <div className="package-buttons">
                    <button
                      className="btn btn-sm btn-edit"
                      onClick={() => handleEditPackage(packageItem)}
                    >
                      Edit
                    </button>
                    
                    {!packageItem.is_default && (
                      <button
                        className="btn btn-sm btn-default"
                        onClick={() => handleSetDefault(packageItem._id)}
                      >
                        Set Default
                      </button>
                    )}
                    
                    <button
                      className="btn btn-sm btn-delete"
                      onClick={() => handleDeletePackage(packageItem._id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Package Creation Modal */}
        <PackageCreationModal
          isOpen={isAddPackageModalOpen}
          onClose={() => setIsAddPackageModalOpen(false)}
          onPackageCreated={(packageData) => {
            fetchPackages();
            setIsAddPackageModalOpen(false);
          }}
        />

        {/* Package Edit Modal */}
        <PackageCreationModal
          isOpen={isEditPackageModalOpen}
          onClose={() => {
            setIsEditPackageModalOpen(false);
            setEditingPackage(null);
          }}
          onPackageCreated={(packageData) => {
            fetchPackages();
            setIsEditPackageModalOpen(false);
            setEditingPackage(null);
          }}
          editingPackage={editingPackage}
        />
      </div>
    </Layout>
  );
};

export default Packages;

