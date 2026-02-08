import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProductCreationModal from '../components/ProductCreationModal';
import { environmentConfig } from '../config/environment';
import { formatDate } from '../utils/dateFormat';
import './Packages.css';

interface Product {
  _id: string;
  name: string;
  product_name: string;
  unit_price: number;
  tax: number;
  discount: number;
  hsn_code?: string;
  category?: string;
  sku?: string;
  is_default: boolean;
  usage_count: number;
  last_used?: Date;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface ProductFilters {
  category: string;
  search: string;
}

const AutofillProduct: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [filters, setFilters] = useState<ProductFilters>({
    category: '',
    search: ''
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`${environmentConfig.apiUrl}/products?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setProducts(data.data.products);
      } else {
        console.error('Failed to fetch products');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDeleteProduct = async (productId: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        const response = await fetch(`${environmentConfig.apiUrl}/products/${productId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (response.ok) {
          fetchProducts();
        } else {
          console.error('Failed to delete product');
        }
      } catch (error) {
        console.error('Error deleting product:', error);
      }
    }
  };

  const handleSetDefault = async (productId: string) => {
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/products/${productId}/set-default`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        fetchProducts();
      } else {
        console.error('Failed to set default product');
      }
    } catch (error) {
      console.error('Error setting default product:', error);
    }
  };

  const handleSelectProduct = (productId: string) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    } else {
      setSelectedProducts([...selectedProducts, productId]);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts();
  };

  return (
    <Layout>
      <div className="packages-container">
        {/* Top Action Bar */}
        <div className="packages-top-bar">
          <div className="package-type-toggle">
            <h3 style={{ margin: 0, color: '#002B59', fontSize: '16px' }}>Saved Products</h3>
          </div>

          <div className="top-actions">
            <button className="action-btn add-btn" onClick={() => setIsAddModalOpen(true)}>
              Add Product
            </button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="filters-section">
          <form onSubmit={handleSearch} className="search-filter">
            <input
              type="text"
              className="search-input"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
            <button type="submit" className="search-btn">Search</button>
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
        </div>

        {/* Products Grid */}
        <div className="packages-grid">
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading products...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="no-packages">
              <h3>No products found</h3>
              <p>Create your first product template to get started</p>
              <button className="create-package-btn" onClick={() => setIsAddModalOpen(true)}>
                + Create Product
              </button>
            </div>
          ) : (
            products.map((product) => (
              <div key={product._id} className="package-card">
                <div className="package-header">
                  <div className="package-type">
                    <span className="package-type-text">{product.category || 'Uncategorized'}</span>
                  </div>
                  <div className="package-actions">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product._id)}
                      onChange={() => handleSelectProduct(product._id)}
                    />
                  </div>
                </div>

                <div className="package-content">
                  <h3 className="package-name">{product.name}</h3>

                  <div className="package-details">
                    <div className="detail-row">
                      <span className="detail-label">Product:</span>
                      <span className="detail-value">{product.product_name}</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Unit Price:</span>
                      <span className="detail-value">INR {product.unit_price?.toFixed(2) || '0.00'}</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Tax:</span>
                      <span className="detail-value">{product.tax || 0}%</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Discount:</span>
                      <span className="detail-value">{product.discount || 0}%</span>
                    </div>

                    {product.hsn_code && (
                      <div className="detail-row">
                        <span className="detail-label">HSN:</span>
                        <span className="detail-value">{product.hsn_code}</span>
                      </div>
                    )}

                    {product.sku && (
                      <div className="detail-row">
                        <span className="detail-label">SKU:</span>
                        <span className="detail-value">{product.sku}</span>
                      </div>
                    )}
                  </div>

                  {product.tags && product.tags.length > 0 && (
                    <div className="package-tags">
                      {product.tags.map((tag, index) => (
                        <span key={index} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="package-stats">
                    <div className="stat">
                      <span className="stat-label">Used:</span>
                      <span className="stat-value">{product.usage_count} times</span>
                    </div>
                    {product.last_used && (
                      <div className="stat">
                        <span className="stat-label">Last used:</span>
                        <span className="stat-value">
                          {formatDate(product.last_used)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="package-footer">
                  {product.is_default && (
                    <span className="default-badge">Default</span>
                  )}

                  <div className="package-buttons">
                    <button
                      className="btn btn-sm btn-edit"
                      onClick={() => {
                        setEditingProduct(product);
                        setIsEditModalOpen(true);
                      }}
                    >
                      Edit
                    </button>

                    {!product.is_default && (
                      <button
                        className="btn btn-sm btn-default"
                        onClick={() => handleSetDefault(product._id)}
                      >
                        Set Default
                      </button>
                    )}

                    <button
                      className="btn btn-sm btn-delete"
                      onClick={() => handleDeleteProduct(product._id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Product Creation Modal */}
        <ProductCreationModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onProductCreated={() => {
            fetchProducts();
            setIsAddModalOpen(false);
          }}
        />

        {/* Product Edit Modal */}
        <ProductCreationModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingProduct(null);
          }}
          onProductCreated={() => {
            fetchProducts();
            setIsEditModalOpen(false);
            setEditingProduct(null);
          }}
          editingProduct={editingProduct}
        />
      </div>
    </Layout>
  );
};

export default AutofillProduct;
