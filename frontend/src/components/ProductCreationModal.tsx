import React, { useState } from 'react';
import { environmentConfig } from '../config/environment';
import './PackageCreationModal.css';

interface ProductCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (productData: any) => void;
  editingProduct?: any;
}

const ProductCreationModal: React.FC<ProductCreationModalProps> = ({
  isOpen,
  onClose,
  onProductCreated,
  editingProduct
}) => {
  const [formData, setFormData] = useState({
    name: editingProduct?.name || '',
    product_name: editingProduct?.product_name || '',
    unit_price: editingProduct?.unit_price?.toString() || '',
    tax: editingProduct?.tax?.toString() || '',
    discount: editingProduct?.discount?.toString() || '',
    hsn_code: editingProduct?.hsn_code || '',
    category: editingProduct?.category || '',
    sku: editingProduct?.sku || '',
    tags: editingProduct?.tags?.join(', ') || ''
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.name.trim()) {
        alert('Template name is required');
        return;
      }
      if (!formData.product_name.trim()) {
        alert('Product name is required');
        return;
      }

      const productData: any = {
        name: formData.name.trim(),
        product_name: formData.product_name.trim()
      };

      if (formData.unit_price && formData.unit_price.trim() !== '') {
        const val = parseFloat(formData.unit_price);
        if (!isNaN(val) && val >= 0) productData.unit_price = val;
      }
      if (formData.tax && formData.tax.trim() !== '') {
        const val = parseFloat(formData.tax);
        if (!isNaN(val) && val >= 0) productData.tax = val;
      }
      if (formData.discount && formData.discount.trim() !== '') {
        const val = parseFloat(formData.discount);
        if (!isNaN(val) && val >= 0) productData.discount = val;
      }
      if (formData.hsn_code.trim()) {
        productData.hsn_code = formData.hsn_code.trim();
      }
      if (formData.category.trim()) {
        productData.category = formData.category.trim();
      }
      if (formData.sku.trim()) {
        productData.sku = formData.sku.trim();
      }
      if (formData.tags.trim()) {
        productData.tags = formData.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
      }

      const url = editingProduct
        ? `${environmentConfig.apiUrl}/products/${editingProduct._id}`
        : `${environmentConfig.apiUrl}/products`;
      const method = editingProduct ? 'PUT' : 'POST';

      const token = localStorage.getItem('token');
      if (!token) {
        alert('Authentication token not found. Please login again.');
        return;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(productData)
      });

      if (response.ok) {
        const data = await response.json();
        onProductCreated(data.data);
        onClose();
        setFormData({
          name: '',
          product_name: '',
          unit_price: '',
          tax: '',
          discount: '',
          hsn_code: '',
          category: '',
          sku: '',
          tags: ''
        });
      } else {
        const responseText = await response.text();
        let errorMessage = 'Failed to save product';
        try {
          const error = JSON.parse(responseText);
          if (error.errors && Array.isArray(error.errors)) {
            errorMessage = error.errors.map((err: any) => err.msg).join(', ');
          } else if (error.message) {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = `Server error (${response.status})`;
        }
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Error saving product: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="package-modal">
        <div className="modal-header">
          <h2>{editingProduct ? 'Edit Product' : 'Create New Product'}</h2>
          <div className="header-actions">
            <button className="close-btn" onClick={onClose}>x</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="package-form">
          <div className="form-section">
            <h3>Product Information</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Template Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g., Standard T-Shirt"
                />
              </div>

              <div className="form-group">
                <label htmlFor="product_name">Product Name *</label>
                <input
                  type="text"
                  id="product_name"
                  name="product_name"
                  value={formData.product_name}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g., Cotton T-Shirt"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="category">Category</label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                >
                  <option value="">Select Category</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Clothing">Clothing</option>
                  <option value="Books">Books</option>
                  <option value="Home">Home</option>
                  <option value="Sports">Sports</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="hsn_code">HSN Code</label>
                <input
                  type="text"
                  id="hsn_code"
                  name="hsn_code"
                  value={formData.hsn_code}
                  onChange={handleInputChange}
                  placeholder="e.g., 8517"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sku">SKU</label>
                <input
                  type="text"
                  id="sku"
                  name="sku"
                  value={formData.sku}
                  onChange={handleInputChange}
                  placeholder="e.g., SKU-001"
                />
              </div>

              <div className="form-group">
                <label htmlFor="tags">Tags (comma separated)</label>
                <input
                  type="text"
                  id="tags"
                  name="tags"
                  value={formData.tags}
                  onChange={handleInputChange}
                  placeholder="e.g., fragile, electronics"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Pricing</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="unit_price">Unit Price (INR)</label>
                <input
                  type="number"
                  id="unit_price"
                  name="unit_price"
                  value={formData.unit_price}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label htmlFor="discount">Discount (%)</label>
                <input
                  type="number"
                  id="discount"
                  name="discount"
                  value={formData.discount}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label htmlFor="tax">Tax (%)</label>
                <input
                  type="number"
                  id="tax"
                  name="tax"
                  value={formData.tax}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Create Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductCreationModal;
