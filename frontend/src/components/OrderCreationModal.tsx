import React, { useState, useEffect, useRef, useCallback } from 'react';
import './OrderCreationModal.css';
import { generateOrderId } from '../utils/orderIdGenerator';
import { environmentConfig } from '../config/environment';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { shippingService, ShippingCalculationRequest } from '../services/shippingService';
import { walletService } from '../services/walletService';

interface OrderCreationModalProps {
  onOrderCreated: (order: any) => void;
  orderType?: 'forward' | 'reverse'; // Optional: defaults to 'forward'
  onBack?: () => void; // Optional: callback for back navigation
}

interface Warehouse {
  _id: string;
  name: string;
  address: {
    full_address: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  contact_person: {
    phone: string;
  };
}

interface Package {
  _id: string;
  name: string;
  package_type: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  weight: number;
  product_name: string;
  hsn_code?: string;
  unit_price?: number;
  discount?: number;
  tax?: number;
  number_of_boxes?: number;
  weight_per_box?: number;
}

interface SavedProduct {
  _id: string;
  name: string;
  product_name: string;
  unit_price: number;
  tax: number;
  discount: number;
  hsn_code?: string;
  category?: string;
  sku?: string;
}

// Box entry for Multi-Package B2C
interface BoxEntry {
  id: number;
  quantity: number;
  weight_per_box: number;
  length: number;
  width: number;
  height: number;
}

const OrderCreationModal: React.FC<OrderCreationModalProps> = ({
  onOrderCreated,
  orderType = 'forward', // Default to forward orders
  onBack
}) => {
  const { user } = useAuth(); // Get user for category
  const userCategory = user?.user_category || 'Basic User';
  
  // Form State
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedSavedProduct, setSelectedSavedProduct] = useState<SavedProduct | null>(null);
  const [orderId, setOrderId] = useState<string>(generateOrderId());
  const [showManualAddress, setShowManualAddress] = useState(false);
  const [warehouseError, setWarehouseError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredWarehouses, setFilteredWarehouses] = useState<Warehouse[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Inline notification state (replaces browser alerts)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration = 5000) => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => setNotification(null), duration);
  }, []);

  // Pincode validation states
  const [validatingDeliveryPincode, setValidatingDeliveryPincode] = useState(false);
  const [validatingPickupPincode, setValidatingPickupPincode] = useState(false);
  
  // Final shipping calculation state (mandatory before buttons appear)
  const [finalShippingCalculation, setFinalShippingCalculation] = useState<{
    calculating: boolean;
    completed: boolean;
    error: string | null;
    zone: string | null;
    walletBalance: number | null;
    insufficientBalance: boolean;
  }>({
    calculating: false,
    completed: false,
    error: null,
    zone: null,
    walletBalance: null,
    insufficientBalance: false
  });

  // Multi-Package B2C: Box entries state
  const [boxEntries, setBoxEntries] = useState<BoxEntry[]>([
    { id: 1, quantity: 1, weight_per_box: 0, length: 0, width: 0, height: 0 }
  ]);

  // Form Data
  const [formData, setFormData] = useState({
    // Order Details
    order_date: new Date().toISOString().split('T')[0],
    reference_id: '',
    invoice_number: '',
    
    // Customer Information
    customer_info: {
      buyer_name: '',
      phone: '',
      alternate_phone: '',
      email: '',
      gstin: ''
    },
    
    // Delivery Address
    delivery_address: {
      address_line_1: '',
      address_line_2: '',
      pincode: '',
      city: '',
      state: '',
      country: 'India'
    },
    
    // Warehouse/Pickup Address
    pickup_address: {
      warehouse_id: '',
      name: '',
      full_address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      country: 'India'
    },
    
    // Products
    products: [{
      product_name: '',
      quantity: 1,
      unit_price: 0,
      hsn_code: '',
      category: '',
      sku: '',
      discount: 0,
      tax: 0
    }],
    
    // Package Information
    package_info: {
      package_type: 'Single Package (B2C)',
      weight: 0,
      dimensions: {
        length: 0,
        width: 0,
        height: 0
      },
      number_of_boxes: 1,
      weight_per_box: 0,
      rov_type: '',
      rov_owner: '',
      weight_photo_url: '',
      dimensions_photo_url: '',
      save_dimensions: false
    },
    
    // Payment Information
    payment_info: {
      payment_mode: 'Prepaid',
      order_value: 0,
      total_amount: 0,
      shipping_charges: 0,
      grand_total: 0,
      cod_amount: 0
    },
    
    // Seller Information
    seller_info: {
      name: '',
      gst_number: '',
      reseller_name: ''
    },
    
    shipping_mode: 'Surface'
  });

  // Fetch warehouses, packages, and saved products on component mount
  useEffect(() => {
    fetchWarehouses();
    fetchPackages();
    fetchSavedProducts();
  }, []);

  // Filter warehouses based on search query
  useEffect(() => {
    const normalize = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      return String(value).toLowerCase();
    };

    const q = normalize(searchQuery).trim();
    if (!q) {
      setFilteredWarehouses(warehouses);
      return;
    }

    const filtered = warehouses.filter((warehouse) => {
      const name = normalize(warehouse.name);
      const title = normalize((warehouse as any).title);
      const city = normalize(warehouse.address?.city);
      const state = normalize(warehouse.address?.state);
      const pincode = normalize(warehouse.address?.pincode);
      const fullAddress = normalize(warehouse.address?.full_address);

      return (
        name.includes(q) ||
        title.includes(q) ||
        city.includes(q) ||
        state.includes(q) ||
        pincode.includes(q) ||
        fullAddress.includes(q)
      );
    });

    setFilteredWarehouses(filtered);
  }, [warehouses, searchQuery]);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.warehouse-autocomplete-container')) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSuggestions]);

  // Auto-set payment_mode to 'Pickup' for reverse orders
  useEffect(() => {
    if (orderType === 'reverse') {
      setFormData(prev => ({
        ...prev,
        payment_info: {
          ...prev.payment_info,
          payment_mode: 'Pickup',
          cod_amount: 0
        }
      }));
    }
  }, [orderType]);

  const fetchWarehouses = async () => {
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/warehouses`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const warehousesList = data.data?.warehouses || data.warehouses || [];
        console.log('Fetched warehouses:', warehousesList.length, warehousesList);
        setWarehouses(warehousesList);
        // Initialize filtered warehouses
        setFilteredWarehouses(warehousesList);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Error] Failed to fetch warehouses:', response.status, errorData);
        setWarehouses([]);
        setFilteredWarehouses([]);
      }
    } catch (error) {
      console.error('[Error] Error fetching warehouses:', error);
      setWarehouses([]);
      setFilteredWarehouses([]);
    }
  };

  const fetchPackages = async () => {
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/packages`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPackages(data.data.packages || []);
      }
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchSavedProducts = async () => {
    try {
      const response = await fetch(`${environmentConfig.apiUrl}/products`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSavedProducts(data.data.products || []);
      }
    } catch (error) {
      console.error('Error fetching saved products:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRefreshOrderId = () => {
    setOrderId(generateOrderId());
  };

  const handleAddAddress = () => {
    setShowManualAddress(true);
    setWarehouseError('');
    // Clear warehouse selection when switching to manual entry
    setFormData(prev => ({
      ...prev,
      pickup_address: {
        ...prev.pickup_address,
        warehouse_id: '',
        name: '',
        full_address: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        country: 'India'
      }
    }));
  };

  const handleNestedInputChange = (parent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent as keyof typeof prev] as any),
        [field]: value
      }
    }));
  };

  // Pincode validation function using Delhivery API
  const validatePincode = async (pincode: string) => {
    if (pincode.length !== 6) return null;
    
    try {
      const response = await apiService.get<{ city: string; state: string; serviceable: boolean }>(`/tools/pincode-info/${pincode}`);
      return response;
    } catch (error) {
      console.error('Pincode validation error:', error);
      return null;
    }
  };

  // Handle delivery pincode change
  const handleDeliveryPincodeChange = async (pincode: string) => {
    // Update pincode in form data
    handleNestedInputChange('delivery_address', 'pincode', pincode);
    
    // If pincode is 6 digits, validate it
    if (pincode.length === 6) {
      setValidatingDeliveryPincode(true);
      
      try {
        const locationInfo = await validatePincode(pincode);
        if (locationInfo && locationInfo.city && locationInfo.state &&
            locationInfo.city !== 'Unknown' && locationInfo.state !== 'Unknown' &&
            locationInfo.city !== 'Not Serviceable' && locationInfo.state !== 'Not Serviceable') {
          // Auto-fill city and state in single update to preserve other fields
          setFormData(prev => ({
            ...prev,
            delivery_address: {
              ...prev.delivery_address,
              city: locationInfo.city,
              state: locationInfo.state
            }
          }));
        } else {
          // Invalid pincode - clear city/state but preserve other fields
          setFormData(prev => ({
            ...prev,
            delivery_address: {
              ...prev.delivery_address,
              city: '',
              state: ''
            }
          }));
        }
      } catch (error) {
        console.error('Pincode validation error:', error);
        // On error, clear city/state but preserve other fields
        setFormData(prev => ({
          ...prev,
          delivery_address: {
            ...prev.delivery_address,
            city: '',
            state: ''
          }
        }));
      } finally {
        setValidatingDeliveryPincode(false);
      }
    } else {
      // Clear city and state if pincode is incomplete but preserve other fields
      setFormData(prev => ({
        ...prev,
        delivery_address: {
          ...prev.delivery_address,
          city: '',
          state: ''
        }
      }));
    }
  };

  // Handle pickup pincode change (for manual warehouse entry)
  const handlePickupPincodeChange = async (pincode: string) => {
    // Update pincode in form data - single update preserves other fields
    setFormData(prev => ({
      ...prev,
      pickup_address: {
        ...prev.pickup_address,
        pincode
      }
    }));

    // If pincode is 6 digits, validate it
    if (pincode.length === 6) {
      setValidatingPickupPincode(true);

      try {
        const locationInfo = await validatePincode(pincode);
        if (locationInfo && locationInfo.city && locationInfo.state &&
            locationInfo.city !== 'Unknown' && locationInfo.state !== 'Unknown' &&
            locationInfo.city !== 'Not Serviceable' && locationInfo.state !== 'Not Serviceable') {
          // Auto-fill city and state in single update to preserve other fields
          setFormData(prev => ({
            ...prev,
            pickup_address: {
              ...prev.pickup_address,
              city: locationInfo.city,
              state: locationInfo.state
            }
          }));
        } else {
          // Invalid pincode - clear city/state but preserve other fields
          setFormData(prev => ({
            ...prev,
            pickup_address: {
              ...prev.pickup_address,
              city: '',
              state: ''
            }
          }));
        }
      } catch (error) {
        console.error('Pincode validation error:', error);
        // On error, clear city/state but preserve other fields
        setFormData(prev => ({
          ...prev,
          pickup_address: {
            ...prev.pickup_address,
            city: '',
            state: ''
          }
        }));
      } finally {
        setValidatingPickupPincode(false);
      }
    } else {
      // Clear city and state if pincode is incomplete but preserve other fields
      setFormData(prev => ({
        ...prev,
        pickup_address: {
          ...prev.pickup_address,
          city: '',
          state: ''
        }
      }));
    }
  };

  const handleWarehouseChange = (warehouseId: string) => {
    try {
      setWarehouseError('');
      
      if (!warehouseId) {
        setFormData(prev => ({
          ...prev,
          pickup_address: {
            ...prev.pickup_address,
            warehouse_id: '',
            name: '',
            full_address: '',
            city: '',
            state: '',
            pincode: '',
            phone: '',
            country: 'India'
          }
        }));
        setShowManualAddress(false);
        return;
      }

      const warehouse = warehouses.find(w => w._id === warehouseId);
      if (!warehouse) {
        setWarehouseError('Warehouse not found');
        return;
      }

      // Validate warehouse data completeness
      if (!warehouse.address?.full_address || !warehouse.contact_person?.phone) {
        setWarehouseError('Warehouse data is incomplete');
        return;
      }

      setFormData(prev => ({
        ...prev,
        pickup_address: {
          warehouse_id: warehouseId,
          name: warehouse.name,
          full_address: warehouse.address.full_address,
          city: warehouse.address.city,
          state: warehouse.address.state,
          pincode: warehouse.address.pincode,
          phone: warehouse.contact_person.phone,
          country: warehouse.address.country || 'India'
        }
      }));
      setShowManualAddress(false);
    } catch (error) {
      setWarehouseError('Error selecting warehouse');
      console.error('Warehouse selection error:', error);
    }
  };

  const handlePackageSelect = (packageId: string) => {
    const packageItem = packages.find(p => p._id === packageId);
    if (packageItem) {
      setSelectedPackage(packageItem);
      setFormData(prev => ({
        ...prev,
        package_info: {
          ...prev.package_info,
          package_type: packageItem.package_type,
          weight: packageItem.weight,
          dimensions: packageItem.dimensions,
          number_of_boxes: packageItem.number_of_boxes || 1,
          weight_per_box: packageItem.weight_per_box || packageItem.weight,
        }
      }));
    }
  };

  const handleSavedProductSelect = (productId: string) => {
    const product = savedProducts.find(p => p._id === productId);
    if (product) {
      setSelectedSavedProduct(product);
      setFormData(prev => ({
        ...prev,
        products: [{
          ...prev.products[0],
          product_name: product.product_name,
          hsn_code: product.hsn_code || '',
          unit_price: product.unit_price || 0,
          discount: product.discount || 0,
          tax: product.tax || 0,
          category: product.category || '',
          sku: product.sku || '',
        }]
      }));
    }
  };

  const handleAddProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, {
        product_name: '',
        quantity: 1,
        unit_price: 0,
        hsn_code: '',
        category: '',
        sku: '',
        discount: 0,
        tax: 0
      }]
    }));
  };

  const handleRemoveProduct = (index: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index)
    }));
  };

  const handleProductChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, i) =>
        i === index ? { ...product, [field]: value } : product
      )
    }));
  };

  // ============================================
  // MULTI-PACKAGE B2C: Box Entry Handlers
  // ============================================

  // Handle package type change - initialize/clear boxes
  const handlePackageTypeChange = (packageType: string) => {
    handleNestedInputChange('package_info', 'package_type', packageType);

    if (packageType === 'Multiple Package (B2C)') {
      // Initialize with one empty box entry
      setBoxEntries([
        { id: 1, quantity: 1, weight_per_box: 0, length: 0, width: 0, height: 0 }
      ]);
      // Reset weight to 0 (will be auto-calculated)
      handleNestedInputChange('package_info', 'weight', 0);
    } else {
      // Clear boxes for single package
      setBoxEntries([]);
    }
  };

  // Add new box entry
  const handleAddBoxEntry = () => {
    const newId = boxEntries.length > 0 ? Math.max(...boxEntries.map(b => b.id)) + 1 : 1;
    setBoxEntries(prev => [
      ...prev,
      { id: newId, quantity: 1, weight_per_box: 0, length: 0, width: 0, height: 0 }
    ]);
  };

  // Remove box entry
  const handleRemoveBoxEntry = (id: number) => {
    if (boxEntries.length <= 1) return; // Keep at least one entry
    setBoxEntries(prev => prev.filter(box => box.id !== id));
  };

  // Update box entry field
  const handleBoxEntryChange = (id: number, field: keyof BoxEntry, value: number) => {
    setBoxEntries(prev => prev.map(box =>
      box.id === id ? { ...box, [field]: value } : box
    ));
  };

  // Auto-calculate total weight when box entries change (Multi-Package B2C)
  useEffect(() => {
    if (formData.package_info.package_type === 'Multiple Package (B2C)' && boxEntries.length > 0) {
      // Calculate total weight: sum of (quantity x weight_per_box) for all entries
      const totalWeight = boxEntries.reduce(
        (sum, box) => sum + (box.quantity * box.weight_per_box),
        0
      );

      // Update weight using functional update to avoid stale closure issues
      setFormData(prev => {
        // Only update if weight actually changed to avoid infinite loop
        if (prev.package_info.weight !== totalWeight) {
          return {
            ...prev,
            package_info: {
              ...prev.package_info,
              weight: totalWeight
            }
          };
        }
        return prev;
      });
    }
    // Only depend on boxEntries and package_type - weight is derived, not a dependency
  }, [boxEntries, formData.package_info.package_type]);

  // Calculate order value and grand total when products or shipping charges change
  useEffect(() => {
    const orderValue = formData.products.reduce(
      (sum, product) => sum + product.unit_price * product.quantity,
      0
    );
    const shippingCharges = formData.payment_info.shipping_charges || 0;
    const grandTotal = orderValue + shippingCharges;

    // Use functional update to avoid stale closure issues and check inside
    setFormData(prev => {
      // Only update if values actually changed to avoid infinite loop
      if (
        prev.payment_info.order_value === orderValue &&
        prev.payment_info.total_amount === orderValue &&
        prev.payment_info.grand_total === grandTotal
      ) {
        return prev;
      }
      return {
        ...prev,
        payment_info: {
          ...prev.payment_info,
          order_value: orderValue,
          total_amount: orderValue,
          grand_total: grandTotal
        }
      };
    });
    // Only depend on inputs (products, shipping_charges) - outputs are derived
  }, [formData.products, formData.payment_info.shipping_charges]);

  // MANDATORY: Calculate shipping charges when form is ready (all required fields filled)
  useEffect(() => {
    // Auto-calculate when all required fields are filled
    const timer = setTimeout(() => {
      const isMultiPackage = formData.package_info.package_type === 'Multiple Package (B2C)';

      // Check dimensions based on package type
      let hasDimensions = false;
      if (isMultiPackage) {
        // For multi-package, check if box entries have dimensions
        hasDimensions = boxEntries.length > 0 && boxEntries.every(box =>
          box.length > 0 && box.width > 0 && box.height > 0
        );
      } else {
        // For single package, check package_info dimensions
        hasDimensions = formData.package_info.dimensions.length > 0 &&
          formData.package_info.dimensions.width > 0 &&
          formData.package_info.dimensions.height > 0;
      }

      if (
        formData.delivery_address.pincode?.length === 6 &&
        formData.pickup_address.pincode?.length === 6 &&
        formData.package_info.weight > 0 &&
        hasDimensions
      ) {
        calculateFinalShippingCharges();
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.delivery_address.pincode,
    formData.pickup_address.pincode,
    formData.package_info.weight,
    formData.package_info.dimensions.length,
    formData.package_info.dimensions.width,
    formData.package_info.dimensions.height,
    formData.package_info.package_type,
    boxEntries
  ]);

  // Mandatory shipping charges calculation before final buttons appear
  const calculateFinalShippingCharges = async () => {
    // Validate required fields
    if (
      !formData.delivery_address.pincode || formData.delivery_address.pincode.length !== 6 ||
      !formData.pickup_address.pincode || formData.pickup_address.pincode.length !== 6 ||
      !formData.package_info.weight || formData.package_info.weight <= 0
    ) {
      setFinalShippingCalculation({
        calculating: false,
        completed: false,
        error: 'Please fill all required fields: Delivery pincode, Pickup pincode, and Weight',
        zone: null,
        walletBalance: null,
        insufficientBalance: false
      });
      return;
    }

    // Validate dimensions - check box entries for Multiple Package (B2C), otherwise check package_info dimensions
    const isMultiPackageB2C = formData.package_info.package_type === 'Multiple Package (B2C)';

    if (isMultiPackageB2C) {
      // For Multiple Package (B2C), validate box entry dimensions
      const hasValidBoxDimensions = boxEntries.length > 0 && boxEntries.every(box =>
        box.length > 0 && box.width > 0 && box.height > 0
      );
      if (!hasValidBoxDimensions) {
        setFinalShippingCalculation({
          calculating: false,
          completed: false,
          error: 'Please fill all required dimensions for each box: Length, Width, and Height',
          zone: null,
          walletBalance: null,
          insufficientBalance: false
        });
        return;
      }
    } else {
      // For Single Package, validate package_info dimensions
      if (
        !formData.package_info.dimensions.length || formData.package_info.dimensions.length <= 0 ||
        !formData.package_info.dimensions.width || formData.package_info.dimensions.width <= 0 ||
        !formData.package_info.dimensions.height || formData.package_info.dimensions.height <= 0
      ) {
        setFinalShippingCalculation({
          calculating: false,
          completed: false,
          error: 'Please fill all required dimensions: Length, Width, and Height',
          zone: null,
          walletBalance: null,
          insufficientBalance: false
        });
        return;
      }
    }

    try {
      setFinalShippingCalculation(prev => ({ ...prev, calculating: true, error: null }));

      const weightInGrams = formData.package_info.weight * 1000; // Convert kg to grams

      // Get dimensions - for Multiple Package (B2C), use the largest box dimensions
      let dimensions = {
        length: formData.package_info.dimensions.length,
        breadth: formData.package_info.dimensions.width,
        height: formData.package_info.dimensions.height
      };

      if (isMultiPackageB2C && boxEntries.length > 0) {
        // For multi-package, use the largest dimension values from box entries
        dimensions = {
          length: Math.max(...boxEntries.map(box => box.length || 0)),
          breadth: Math.max(...boxEntries.map(box => box.width || 0)),
          height: Math.max(...boxEntries.map(box => box.height || 0))
        };
      }

      // Call backend API with pincodes - backend will get zone from Delhivery API
      const calculationRequest: ShippingCalculationRequest = {
        weight: weightInGrams, // Weight in grams
        dimensions,
        // Don't provide zone - let backend get it from Delhivery API using pincodes
        pickup_pincode: formData.pickup_address.pincode,
        delivery_pincode: formData.delivery_address.pincode,
        shipping_mode: (formData.shipping_mode || 'Surface') as 'Surface' | 'Express' | 'S' | 'E',
        payment_mode: formData.payment_info.payment_mode as 'Prepaid' | 'COD' | 'Pre-paid',
        cod_amount: formData.payment_info.payment_mode === 'COD' ? formData.payment_info.cod_amount : 0,
        order_type: orderType === 'reverse' ? 'rto' : 'forward' // Use 'rto' for reverse orders, 'forward' for forward orders
      };

      const response = await shippingService.calculateShippingCharges(calculationRequest);
      
      // Fetch wallet balance to validate
      let walletBalance: number | null = null;
      let insufficientBalance = false;
      try {
        const walletData = await walletService.getWalletBalance(false); // Force fresh fetch
        walletBalance = walletData.balance || 0;
        
        // Check if wallet balance is sufficient
        if (walletBalance < response.totalCharges) {
          insufficientBalance = true;
          console.warn('[Warning] Insufficient wallet balance:', {
            walletBalance,
            shippingCharges: response.totalCharges,
            shortfall: response.totalCharges - walletBalance
          });
        }
      } catch (walletError) {
        console.error('Failed to fetch wallet balance:', walletError);
        // If wallet fetch fails, we can't verify balance - set to null and show warning
        walletBalance = null;
        insufficientBalance = true; // Show warning to be safe
      }
      
      // Update shipping charges in form data
      setFormData(prev => ({
        ...prev,
        payment_info: {
          ...prev.payment_info,
          shipping_charges: response.totalCharges
        }
      }));
      
      console.log('[Success] Final shipping charges calculated (mandatory before buttons):', {
        userCategory,
        zone: response.zone || 'unknown',
        pickup_pincode: formData.pickup_address.pincode,
        delivery_pincode: formData.delivery_address.pincode,
        weight: formData.package_info.weight,
        charges: response.totalCharges,
        walletBalance,
        insufficientBalance
      });

      setFinalShippingCalculation({
        calculating: false,
        completed: !insufficientBalance, // Only mark as completed if balance is sufficient
        error: null, // Error will be shown in UI if insufficientBalance is true
        zone: response.zone || null,
        walletBalance,
        insufficientBalance
      });
      
    } catch (error: any) {
      console.error('[Error] Final shipping charges calculation failed:', error);
      setFinalShippingCalculation({
        calculating: false,
        completed: false,
        error: error.message || 'Failed to calculate shipping charges. Please check your pincodes and try again.',
        zone: null,
        walletBalance: null,
        insufficientBalance: false
      });
    }
  };

  // Handle Save button (no AWB generation)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure shipping charges are calculated before proceeding
    if (!finalShippingCalculation.completed || formData.payment_info.shipping_charges === 0) {
      showNotification('Please wait for shipping charges to be calculated before saving.', 'error');
      await calculateFinalShippingCharges();
      return;
    }
    // Check wallet balance before proceeding
    if (finalShippingCalculation.insufficientBalance) {
      showNotification(`Insufficient Wallet Balance. Your balance (₹${finalShippingCalculation.walletBalance?.toFixed(2) || '0.00'}) is less than shipping charges (₹${formData.payment_info.shipping_charges.toFixed(2)}). Please ask admin to recharge your wallet.`, 'error', 8000);
      return;
    }
    await handleOrderSubmission(false); // generate_awb = false
  };

  // Handle Save & Assign Order button (with AWB generation)
  const handleSaveAndAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure shipping charges are calculated before proceeding
    if (!finalShippingCalculation.completed || formData.payment_info.shipping_charges === 0) {
      showNotification('Please wait for shipping charges to be calculated before saving.', 'error');
      await calculateFinalShippingCharges();
      return;
    }
    // Check wallet balance before proceeding
    if (finalShippingCalculation.insufficientBalance) {
      showNotification(`Insufficient Wallet Balance. Your balance (₹${finalShippingCalculation.walletBalance?.toFixed(2) || '0.00'}) is less than shipping charges (₹${formData.payment_info.shipping_charges.toFixed(2)}). Please ask admin to recharge your wallet.`, 'error', 8000);
      return;
    }
    await handleOrderSubmission(true); // generate_awb = true
  };

  const handleOrderSubmission = async (generateAWB: boolean) => {
    setLoading(true);

    // Validate required fields before sending
    const validationErrors = [];
    
    // Check required customer fields
    if (!formData.customer_info.buyer_name.trim()) {
      validationErrors.push('Buyer name is required');
    }
    if (!formData.customer_info.phone.trim()) {
      validationErrors.push('Phone number is required');
    } else if (!/^[6-9]\d{9}$/.test(formData.customer_info.phone)) {
      validationErrors.push('Phone number must be 10 digits starting with 6-9');
    }
    
    // Check required delivery address fields
    if (!formData.delivery_address.address_line_1.trim()) {
      validationErrors.push('Address line 1 is required');
    }
    if (!formData.delivery_address.pincode.trim()) {
      validationErrors.push('Pincode is required');
    } else if (!/^[1-9][0-9]{5}$/.test(formData.delivery_address.pincode)) {
      validationErrors.push('Pincode must be 6 digits starting with 1-9');
    }
    if (!formData.delivery_address.city.trim()) {
      validationErrors.push('City is required');
    }
    if (!formData.delivery_address.state.trim()) {
      validationErrors.push('State is required');
    }
    
    // Check required pickup address fields
    if (!formData.pickup_address.name.trim()) {
      validationErrors.push('Warehouse name is required');
    }
    if (!formData.pickup_address.full_address.trim()) {
      validationErrors.push('Warehouse address is required');
    }
    if (!formData.pickup_address.city.trim()) {
      validationErrors.push('Warehouse city is required');
    }
    if (!formData.pickup_address.state.trim()) {
      validationErrors.push('Warehouse state is required');
    }
    if (!formData.pickup_address.pincode.trim()) {
      validationErrors.push('Warehouse pincode is required');
    } else if (!/^[1-9][0-9]{5}$/.test(formData.pickup_address.pincode)) {
      validationErrors.push('Warehouse pincode must be 6 digits starting with 1-9');
    }
    if (!formData.pickup_address.phone.trim()) {
      validationErrors.push('Warehouse phone is required');
    } else if (!/^[6-9]\d{9}$/.test(formData.pickup_address.phone)) {
      validationErrors.push('Warehouse phone must be 10 digits starting with 6-9');
    }
    
    // Check required product fields
    if (formData.products.length === 0) {
      validationErrors.push('At least one product is required');
    }
    for (let i = 0; i < formData.products.length; i++) {
      const product = formData.products[i];
      if (!product.product_name.trim()) {
        validationErrors.push(`Product ${i + 1} name is required`);
      }
      if (product.quantity < 1) {
        validationErrors.push(`Product ${i + 1} quantity must be at least 1`);
      }
      if (product.unit_price < 0) {
        validationErrors.push(`Product ${i + 1} unit price cannot be negative`);
      }
    }
    
    // Check required package fields
    if (formData.package_info.weight <= 0) {
      validationErrors.push('Package weight must be greater than 0');
    }

    // Multi-Package B2C: Validate box entries
    if (formData.package_info.package_type === 'Multiple Package (B2C)') {
      if (boxEntries.length === 0) {
        validationErrors.push('At least one box entry is required for Multi-Package shipment');
      } else {
        boxEntries.forEach((box, index) => {
          if (box.quantity < 1) {
            validationErrors.push(`Box ${index + 1}: Number of boxes must be at least 1`);
          }
          if (box.weight_per_box <= 0) {
            validationErrors.push(`Box ${index + 1}: Weight per box must be greater than 0`);
          }
          if (box.length <= 0) {
            validationErrors.push(`Box ${index + 1}: Length must be greater than 0`);
          }
          if (box.width <= 0) {
            validationErrors.push(`Box ${index + 1}: Width must be greater than 0`);
          }
          if (box.height <= 0) {
            validationErrors.push(`Box ${index + 1}: Height must be greater than 0`);
          }
          // Check max dimension limit (243.84cm)
          if (box.length > 243.84 || box.width > 243.84 || box.height > 243.84) {
            validationErrors.push(`Box ${index + 1}: Dimensions cannot exceed 243.84cm`);
          }
        });
      }
    } else {
      // Single Package: Original validation
      if (formData.package_info.dimensions.length <= 0) {
        validationErrors.push('Package length must be greater than 0');
      }
      if (formData.package_info.dimensions.width <= 0) {
        validationErrors.push('Package width must be greater than 0');
      }
      if (formData.package_info.dimensions.height <= 0) {
        validationErrors.push('Package height must be greater than 0');
      }
    }
    
    // Check payment fields
    if (formData.payment_info.payment_mode === 'COD' && formData.payment_info.cod_amount <= 0) {
      validationErrors.push('COD amount is required when payment mode is COD');
    }

    if (validationErrors.length > 0) {
      showNotification(validationErrors.join(' | '), 'error', 8000);
      setLoading(false);
      return;
    }

    console.log('FRONTEND: Order creation started', {
      formData,
      timestamp: new Date().toISOString()
    });

    try {
      console.log(' FRONTEND: Sending request to backend', {
        url: '/api/orders',
        method: 'POST',
        timestamp: new Date().toISOString()
      });

      // Prepare data with proper types
      const isMultiPackage = formData.package_info.package_type === 'Multiple Package (B2C)';

      // For multi-package, expand box entries into individual boxes
      let expandedBoxes: Array<{
        weight: number;
        length: number;
        width: number;
        height: number;
      }> = [];

      if (isMultiPackage && boxEntries.length > 0) {
        // Expand quantity into individual boxes
        boxEntries.forEach(box => {
          for (let i = 0; i < box.quantity; i++) {
            expandedBoxes.push({
              weight: box.weight_per_box, // kg - backend will convert to grams
              length: box.length,
              width: box.width,
              height: box.height
            });
          }
        });
      }

      const orderData = {
        order_date: formData.order_date,
        reference_id: formData.reference_id,
        invoice_number: formData.invoice_number,
        customer_info: formData.customer_info,
        delivery_address: formData.delivery_address,
        pickup_address: formData.pickup_address,
        products: formData.products.map(product => ({
          product_name: product.product_name,
          quantity: parseInt(String(product.quantity)) || 1,
          unit_price: parseFloat(String(product.unit_price)) || 0,
          hsn_code: product.hsn_code,
          category: product.category,
          sku: product.sku,
          discount: parseFloat(String(product.discount)) || 0,
          tax: parseFloat(String(product.tax)) || 0
        })),
        package_info: {
          package_type: formData.package_info.package_type,
          weight: parseFloat(String(formData.package_info.weight)) || 0,
          dimensions: isMultiPackage && expandedBoxes.length > 0
            ? {
                // For multi-package, use first box dimensions (or largest)
                length: expandedBoxes[0].length,
                width: expandedBoxes[0].width,
                height: expandedBoxes[0].height
              }
            : {
                length: parseFloat(String(formData.package_info.dimensions.length)) || 0,
                width: parseFloat(String(formData.package_info.dimensions.width)) || 0,
                height: parseFloat(String(formData.package_info.dimensions.height)) || 0
              },
          number_of_boxes: isMultiPackage ? expandedBoxes.length : (parseInt(String(formData.package_info.number_of_boxes)) || 1),
          weight_per_box: (parseFloat(String(formData.package_info.weight)) || 0) / (isMultiPackage ? expandedBoxes.length : (parseInt(String(formData.package_info.number_of_boxes)) || 1)),
          // Include expanded boxes for backend to create multiple orders
          boxes: isMultiPackage ? expandedBoxes : undefined,
          // Include original box entries for reference
          box_entries: isMultiPackage ? boxEntries.map(b => ({
            quantity: b.quantity,
            weight_per_box: b.weight_per_box,
            length: b.length,
            width: b.width,
            height: b.height
          })) : undefined,
          rov_type: formData.package_info.rov_type,
          rov_owner: formData.package_info.rov_owner,
          weight_photo_url: formData.package_info.weight_photo_url,
          dimensions_photo_url: formData.package_info.dimensions_photo_url,
          save_dimensions: formData.package_info.save_dimensions
        },
        payment_info: {
          payment_mode: formData.payment_info.payment_mode,
          order_value: parseFloat(String(formData.payment_info.order_value)) || 0,
          total_amount: parseFloat(String(formData.payment_info.total_amount)) || 0,
          shipping_charges: parseFloat(String(formData.payment_info.shipping_charges)) || 0,
          grand_total: parseFloat(String(formData.payment_info.grand_total)) || 0,
          cod_amount: parseFloat(String(formData.payment_info.cod_amount)) || 0
        },
        seller_info: formData.seller_info,
        shipping_mode: formData.shipping_mode,
        order_type: orderType === 'reverse' ? 'reverse' : 'forward', // Send order type to backend
        order_id: orderId
      };

      // Add generate_awb flag to order data
      const requestData = {
        ...orderData,
        generate_awb: generateAWB
      };

      console.log('FRONTEND: Sending order with generate_awb flag', {
        generate_awb: generateAWB,
        generate_awb_type: typeof generateAWB,
        will_call_delhivery: generateAWB,
        timestamp: new Date().toISOString()
      });

      // Use the environment configuration for API URL
      const response = await fetch(`${environmentConfig.apiUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestData)
      });

      console.log('FRONTEND: Response received', {
        status: response.status,
        ok: response.ok,
        timestamp: new Date().toISOString()
      });

      if (!response.ok) {
        // Handle error response
        const errorData = await response.json().catch(() => ({ message: 'Unknown error occurred' }));
        let errorMessage = errorData.message || errorData.error || `Failed to create order (${response.status})`;
        const msg = (errorData?.message || errorData?.error || '').toString().toLowerCase();
        if (errorData?.error_code === 'PINCODE_NOT_SERVICEABLE' || msg.includes('not serviceable')) {
          errorMessage = 'PINCODE IS NOT SERVICEABLE';
        }
        console.error('[Error] FRONTEND: Order creation failed', {
          status: response.status,
          error: errorMessage,
          errorData: errorData,
          timestamp: new Date().toISOString()
        });
        showNotification(`Order creation failed: ${errorMessage}`, 'error', 8000);
        setLoading(false);
        return;
      }

      if (response.ok) {
        const data = await response.json();

        // Clear any previous validation errors
        setValidationErrors([]);

        console.log('[Success] FRONTEND: Order created successfully', {
          order: data.data.order,
          awb: data.data.awb_number,
          shipment_info: data.data.shipment_info,
          auto_pickup: data.data.auto_pickup,
          timestamp: new Date().toISOString()
        });

        // Show success message with order details
        const orderStatus = data.data.order?.status || 'new';
        let successMessage = '';

        if (generateAWB && data.data.awb_number) {
          successMessage = `Order created — AWB ${data.data.awb_number} assigned. Check "Ready to Ship" tab.`;
        } else if (generateAWB) {
          successMessage = `Order ${data.data.order.order_id} created. AWB processing...`;
        } else {
          successMessage = `Order ${data.data.order.order_id} saved. Check "NEW" tab.`;
        }

        showNotification(successMessage, 'success', 6000);
        
        // Transform order data to include AWB for parent component
        const orderWithAWB = {
          ...data.data.order,
          awb: data.data.awb_number,
          delhivery_data: {
            waybill: data.data.awb_number,
            ...data.data.shipment_info
          }
        };
        
        onOrderCreated(orderWithAWB);
        if (onBack) {
          onBack();
        }
        // Reset form
        setFormData({
          order_date: new Date().toISOString().split('T')[0],
          reference_id: '',
          invoice_number: '',
          customer_info: {
            buyer_name: '',
            phone: '',
            alternate_phone: '',
            email: '',
            gstin: ''
          },
          delivery_address: {
            address_line_1: '',
            address_line_2: '',
            pincode: '',
            city: '',
            state: '',
            country: 'India'
          },
          pickup_address: {
            warehouse_id: '',
            name: '',
            full_address: '',
            city: '',
            state: '',
            pincode: '',
            phone: '',
            country: 'India'
          },
          products: [{
            product_name: '',
            quantity: 1,
            unit_price: 0,
            hsn_code: '',
            category: '',
            sku: '',
            discount: 0,
            tax: 0
          }],
          package_info: {
            package_type: 'Single Package (B2C)',
            weight: 0,
            dimensions: {
              length: 0,
              width: 0,
              height: 0
            },
            number_of_boxes: 1,
            weight_per_box: 0,
            rov_type: '',
            rov_owner: '',
            weight_photo_url: '',
            dimensions_photo_url: '',
            save_dimensions: false
          },
          payment_info: {
            payment_mode: 'Prepaid',
            order_value: 0,
            total_amount: 0,
            shipping_charges: 0,
            grand_total: 0,
            cod_amount: 0
          },
          seller_info: {
            name: '',
            gst_number: '',
            reseller_name: ''
          },
          shipping_mode: 'Surface'
        });
      } else {
        try {
          const error = await response.json();
          console.log('[Error] FRONTEND: Order creation failed', {
            error: error.message,
            errors: error.errors,
            status: response.status,
            timestamp: new Date().toISOString()
          });

          if (error.errors && Array.isArray(error.errors)) {
            // Extract detailed validation error messages
            const errorMessages = error.errors.map((err: any) => {
              const field = err.path || err.param || 'Unknown field';
              const message = err.msg || err.message || 'Validation error';
              return `${field}: ${message}`;
            });
            setValidationErrors(errorMessages);
          } else if (error.message) {
            setValidationErrors([error.message]);
          } else {
            setValidationErrors(['Failed to create order. Please check all fields and try again.']);
          }
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          setValidationErrors([`Server error (${response.status}): ${response.statusText}`]);
        }
      }
    } catch (error) {
      console.log(' FRONTEND: Network error', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error('Error creating order:', error);
      setValidationErrors(['Network error: Failed to connect to server. Please check your connection and try again.']);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="order-creation-page">
      <div className="page-header">
        <h2>Create New Order</h2>
        {onBack && (
          <button className="back-btn" onClick={onBack}>← Back</button>
        )}
      </div>

        {/* Inline Notification Banner */}
        {notification && (
          <div className={`ocm-notification ocm-notification-${notification.type}`}>
            <span>{notification.message}</span>
            <button className="ocm-notification-close" onClick={() => setNotification(null)}>×</button>
          </div>
        )}

        {/* Validation Errors Display */}
        {validationErrors.length > 0 && (
          <div className="validation-errors-container">
            <div className="validation-errors-header">
              <strong>[Error] Order Creation Failed</strong>
              <button
                className="close-errors-btn"
                onClick={() => setValidationErrors([])}
                aria-label="Close errors"
              >
                ×
              </button>
            </div>
            <div className="validation-errors-list">
              {validationErrors.map((error, index) => (
                <div key={index} className="validation-error-item">
                  • {error}
                </div>
              ))}
            </div>
          </div>
        )}

      <div className="page-body">
        <form className="single-page-form">
            {/* Buyer Information Section */}
            <div className="form-section buyer-section">
                <div className="section-header">
                  <h3> Buyer/Receiver Details</h3>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Phone *</label>
                    <input
                      type="tel"
                      value={formData.customer_info.phone}
                      onChange={(e) => {
                        // Only allow digits and limit to 10 characters
                        const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                        handleNestedInputChange('customer_info', 'phone', value);
                      }}
                      placeholder="Enter 10-digit phone number"
                      maxLength={10}
                      required
                    />
                    <small className="form-note">Enter 10-digit phone number starting with 6-9</small>
                  </div>
                  <div className="form-group">
                    <label>Buyer Name *</label>
                    <input
                      type="text"
                      value={formData.customer_info.buyer_name}
                      onChange={(e) => handleNestedInputChange('customer_info', 'buyer_name', e.target.value)}
                      placeholder="Enter name or search"
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Alternative phone <span className="optional-text">(Optional)</span></label>
                    <div className="phone-input-group">
                      <span className="phone-prefix">+91</span>
                      <input
                        type="tel"
                        value={formData.customer_info.alternate_phone}
                        onChange={(e) => handleNestedInputChange('customer_info', 'alternate_phone', e.target.value)}
                        placeholder="Phone"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Email ID <span className="optional-text">(Optional)</span></label>
                    <input
                      type="email"
                      value={formData.customer_info.email}
                      onChange={(e) => handleNestedInputChange('customer_info', 'email', e.target.value)}
                      placeholder="Email"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>GSTIN</label>
                    <input
                      type="text"
                      value={formData.customer_info.gstin}
                      onChange={(e) => handleNestedInputChange('customer_info', 'gstin', e.target.value)}
                      placeholder="GSTIN"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Address Line 1 *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.address_line_1}
                      onChange={(e) => handleNestedInputChange('delivery_address', 'address_line_1', e.target.value)}
                      placeholder="Flat, House No. Building, Apartment"
                      required
                    />
                    <small className="form-note">Only these special characters are allowed .,-/#</small>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Address Line 2</label>
                    <input
                      type="text"
                      value={formData.delivery_address.address_line_2}
                      onChange={(e) => handleNestedInputChange('delivery_address', 'address_line_2', e.target.value)}
                      placeholder="Area, Colony, Street No., Sector"
                    />
                    <small className="form-note">Only these special characters are allowed .,-/#</small>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Pincode *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={formData.delivery_address.pincode}
                        onChange={(e) => {
                          // Only allow digits and limit to 6 characters
                          const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                          handleDeliveryPincodeChange(value);
                        }}
                        placeholder="Enter 6-digit pincode"
                        maxLength={6}
                        required
                        disabled={validatingDeliveryPincode}
                      />
                      {validatingDeliveryPincode && (
                        <span style={{ 
                          position: 'absolute', 
                          right: '10px', 
                          top: '50%', 
                          transform: 'translateY(-50%)',
                          fontSize: '12px',
                          color: '#2C4563'
                        }}>
                          Loading...
                        </span>
                      )}
                    </div>
                    <small className="form-note">Enter 6-digit pincode</small>
                  </div>
                  <div className="form-group">
                    <label>City *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.city}
                      onChange={(e) => handleNestedInputChange('delivery_address', 'city', e.target.value)}
                      placeholder="City"
                      required
                      readOnly={formData.delivery_address.pincode.length === 6}
                      style={{ backgroundColor: formData.delivery_address.pincode.length === 6 ? '#f5f5f5' : 'white' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>State *</label>
                    <input
                      type="text"
                      value={formData.delivery_address.state}
                      onChange={(e) => handleNestedInputChange('delivery_address', 'state', e.target.value)}
                      placeholder="State"
                      required
                      readOnly={formData.delivery_address.pincode.length === 6}
                      style={{ backgroundColor: formData.delivery_address.pincode.length === 6 ? '#f5f5f5' : 'white' }}
                    />
                  </div>
                </div>
            </div>

            {/* Order Information Section */}
            <div className="form-section order-section">
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Order ID *</label>
                    <div className="order-id-display">
                      <span className="order-id-prefix">ORD</span>
                      <span className="order-id-number">{orderId.replace('ORD', '')}</span>
                      <button type="button" className="refresh-btn" onClick={handleRefreshOrderId}>Refresh</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Order Date *</label>
                    <input
                      type="date"
                      value={formData.order_date}
                      onChange={(e) => handleInputChange('order_date', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Reference ID</label>
                    <input
                      type="text"
                      value={formData.reference_id}
                      onChange={(e) => handleInputChange('reference_id', e.target.value)}
                      placeholder="Reference ID"
                    />
                  </div>
                  <div className="form-group">
                    <label>Invoice Number</label>
                    <input
                      type="text"
                      value={formData.invoice_number}
                      onChange={(e) => handleInputChange('invoice_number', e.target.value)}
                      placeholder="Enter Invoice Number"
                    />
                  </div>
                </div>
            </div>

            {/* Product Details Section */}
            <div className="form-section product-section">
                
                {formData.products.map((product, index) => (
                  <div key={index} className="product-item">
                    <div className="product-header">
                      <span className="product-number">Product {index + 1}</span>
                      {formData.products.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(index)}
                          className="remove-product-btn"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Product Name *</label>
                        <input
                          type="text"
                          value={product.product_name}
                          onChange={(e) => handleProductChange(index, 'product_name', e.target.value)}
                          placeholder="Enter name or search"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>HSN</label>
                        <input
                          type="text"
                          value={product.hsn_code}
                          onChange={(e) => handleProductChange(index, 'hsn_code', e.target.value)}
                          placeholder="HSN"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Quantity *</label>
                        <div className="quantity-input">
                          <button type="button" onClick={() => handleProductChange(index, 'quantity', Math.max(1, product.quantity - 1))}>-</button>
                          <input
                            type="number"
                            value={product.quantity}
                            onChange={(e) => handleProductChange(index, 'quantity', parseInt(e.target.value) || 1)}
                            min="1"
                          />
                          <button type="button" onClick={() => handleProductChange(index, 'quantity', product.quantity + 1)}>+</button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Unit Price *</label>
                        <div className="price-input">
                          <span className="currency-symbol">₹</span>
                          <input
                            type="number"
                            value={product.unit_price}
                            onChange={(e) => handleProductChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            placeholder="Unit Price"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="expandable-section">
                      <button type="button" className="expand-btn">
                        + Add Category, SKU, Discount and Tax (optional)                       </button>
                      
                      <div className="expanded-fields">
                        <div className="form-row">
                          <div className="form-group">
                            <label>Product Category</label>
                            <input
                              type="text"
                              value={product.category}
                              onChange={(e) => handleProductChange(index, 'category', e.target.value)}
                              placeholder="Product Category"
                            />
                          </div>
                          <div className="form-group">
                            <label>SKU</label>
                            <input
                              type="text"
                              value={product.sku}
                              onChange={(e) => handleProductChange(index, 'sku', e.target.value)}
                              placeholder="Enter sku"
                            />
                          </div>
                        </div>
                        
                        <div className="form-row">
                          <div className="form-group">
                            <label>Discount</label>
                            <div className="price-input">
                              <span className="currency-symbol">₹</span>
                              <input
                                type="number"
                                value={product.discount}
                                onChange={(e) => handleProductChange(index, 'discount', parseFloat(e.target.value) || 0)}
                                placeholder="Discount"
                                min="0"
                                step="0.01"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Tax</label>
                            <div className="price-input">
                              <span className="currency-symbol">₹</span>
                              <input
                                type="number"
                                value={product.tax}
                                onChange={(e) => handleProductChange(index, 'tax', parseFloat(e.target.value) || 0)}
                                placeholder="Tax"
                                min="0"
                                step="0.01"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', alignItems: 'center' }}>
                  <button type="button" onClick={handleAddProduct} className="add-product-btn">
                    + Add Product
                  </button>
                </div>

                {savedProducts.length > 0 && (
                  <div className="autofill-section">
                    <div className="or-separator">OR</div>
                    <div className="form-group">
                      <label>Select saved product to autofill</label>
                      <select
                        value={selectedSavedProduct?._id || ''}
                        onChange={(e) => handleSavedProductSelect(e.target.value)}
                      >
                        <option value="">Select</option>
                        {savedProducts.map(prod => (
                          <option key={prod._id} value={prod._id}>
                            {prod.name} - {prod.product_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
            </div>

            {/* Payment & Shipping Section */}
            <div className="form-section payment-section">
                
                <div className="payment-summary">
                  <div className="grand-total">
                    <span>Grand Total:</span>
                    <span>₹ {formData.payment_info.grand_total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Type *</label>
                    {orderType === 'reverse' ? (
                      <div className="radio-group">
                        <label className="radio-label" style={{ opacity: 1, cursor: 'default' }}>
                          <input
                            type="radio"
                            name="payment_mode"
                            value="Pickup"
                            checked={true}
                            readOnly
                          />
                          Pickup (Reverse Order)
                        </label>
                      </div>
                    ) : (
                      <div className="radio-group">
                        <label className="radio-label">
                          <input
                            type="radio"
                            name="payment_mode"
                            value="Prepaid"
                            checked={formData.payment_info.payment_mode === 'Prepaid'}
                            onChange={(e) => handleNestedInputChange('payment_info', 'payment_mode', e.target.value)}
                          />
                          Prepaid
                        </label>
                        <label className="radio-label">
                          <input
                            type="radio"
                            name="payment_mode"
                            value="COD"
                            checked={formData.payment_info.payment_mode === 'COD'}
                            onChange={(e) => handleNestedInputChange('payment_info', 'payment_mode', e.target.value)}
                          />
                          COD
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {formData.payment_info.payment_mode === 'COD' && orderType !== 'reverse' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>COD Amount *</label>
                      <div className="price-input">
                        <span className="currency-symbol">₹</span>
                        <input
                          type="number"
                          value={formData.payment_info.cod_amount}
                          onChange={(e) => handleNestedInputChange('payment_info', 'cod_amount', parseFloat(e.target.value) || 0)}
                          placeholder="COD Amount"
                          min="0"
                          step="0.01"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Shipping Charges *
                    </label>
                    <div className="price-input">
                      <span className="currency-symbol">₹</span>
                      <input
                        type="number"
                        value={formData.payment_info.shipping_charges || 0}
                        onChange={(e) => handleNestedInputChange('payment_info', 'shipping_charges', parseFloat(e.target.value) || 0)}
                        placeholder="Enter shipping charges manually"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <small className="form-note">Enter shipping charges manually. Charges will be calculated automatically in the final step before saving.</small>
                  </div>
                </div>
            </div>

            {/* Package Type & Dimensions Section */}
            <div className="form-section package-section">

                <div className="tip-box">
                  <span className="tip-icon">Tip:</span>
                  <span>Tip: Add correct values to avoid weight discrepancy.</span>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Package Type *</label>
                    <select
                      value={formData.package_info.package_type}
                      onChange={(e) => handlePackageTypeChange(e.target.value)}
                      required
                    >
                      <option value="Single Package (B2C)">Single Package (B2C)</option>
                      <option value="Multiple Package (B2C)">Multiple Package (B2C)</option>
                      <option value="Multiple Package (B2B)">Multiple Package (B2B)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Total Weight of Order *</label>
                    <div className="weight-input">
                      <input
                        type="number"
                        value={formData.package_info.weight || ''}
                        onChange={(e) => handleNestedInputChange('package_info', 'weight', parseFloat(e.target.value) || 0)}
                        placeholder="Enter your weight"
                        min="0.1"
                        step="0.1"
                        required
                        readOnly={formData.package_info.package_type === 'Multiple Package (B2C)'}
                        style={{
                          backgroundColor: formData.package_info.package_type === 'Multiple Package (B2C)' ? '#f0f0f0' : 'white',
                          cursor: formData.package_info.package_type === 'Multiple Package (B2C)' ? 'not-allowed' : 'text'
                        }}
                      />
                      <span className="unit">Kg</span>
                    </div>
                    <small className="form-note">
                      {formData.package_info.package_type === 'Multiple Package (B2C)'
                        ? 'Auto-calculated from box entries below'
                        : 'Note: The minimum chargeable weight is 0.50 kg'}
                    </small>
                  </div>
                </div>

                {/* Multi-Package B2C: Box Entries */}
                {formData.package_info.package_type === 'Multiple Package (B2C)' && (
                  <div className="multi-package-section">
                    {boxEntries.map((box, index) => (
                      <div key={box.id} className="box-entry">
                        <div className="box-entry-header">
                          <span className="box-number-badge">{index + 1}</span>
                          {boxEntries.length > 1 && (
                            <button
                              type="button"
                              className="remove-box-btn"
                              onClick={() => handleRemoveBoxEntry(box.id)}
                              title="Remove this box"
                            >
                              X
                            </button>
                          )}
                        </div>
                        <div className="box-entry-fields">
                          <div className="form-group">
                            <label>No. of box *</label>
                            <input
                              type="number"
                              value={box.quantity || ''}
                              onChange={(e) => handleBoxEntryChange(box.id, 'quantity', parseInt(e.target.value) || 0)}
                              placeholder="No. of box"
                              min="1"
                              step="1"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label>Weight Per Box *</label>
                            <div className="dimension-input">
                              <input
                                type="number"
                                value={box.weight_per_box || ''}
                                onChange={(e) => handleBoxEntryChange(box.id, 'weight_per_box', parseFloat(e.target.value) || 0)}
                                placeholder="Enter weight per box"
                                min="0.1"
                                step="0.1"
                                required
                              />
                              <span className="unit">Kg</span>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Length *</label>
                            <div className="dimension-input">
                              <input
                                type="number"
                                value={box.length || ''}
                                onChange={(e) => handleBoxEntryChange(box.id, 'length', parseFloat(e.target.value) || 0)}
                                placeholder="Enter length"
                                min="1"
                                step="0.1"
                                required
                              />
                              <span className="unit">CM</span>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Width *</label>
                            <div className="dimension-input">
                              <input
                                type="number"
                                value={box.width || ''}
                                onChange={(e) => handleBoxEntryChange(box.id, 'width', parseFloat(e.target.value) || 0)}
                                placeholder="Enter width"
                                min="1"
                                step="0.1"
                                required
                              />
                              <span className="unit">CM</span>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Height *</label>
                            <div className="dimension-input">
                              <input
                                type="number"
                                value={box.height || ''}
                                onChange={(e) => handleBoxEntryChange(box.id, 'height', parseFloat(e.target.value) || 0)}
                                placeholder="Enter height"
                                min="1"
                                step="0.1"
                                required
                              />
                              <span className="unit">CM</span>
                            </div>
                          </div>
                        </div>
                        <small className="box-dimension-note">
                          Length, width or height can't be greater than 243.84cm for each B2C package
                        </small>
                      </div>
                    ))}

                    {/* Add Box Button */}
                    <div className="add-box-container">
                      <button
                        type="button"
                        className="add-box-btn"
                        onClick={handleAddBoxEntry}
                        title="Add another box"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Single Package: Original Dimensions Fields */}
                {formData.package_info.package_type === 'Single Package (B2C)' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Length *</label>
                        <div className="dimension-input">
                          <input
                            type="number"
                            value={formData.package_info.dimensions.length}
                            onChange={(e) => handleNestedInputChange('package_info', 'dimensions', {
                              ...formData.package_info.dimensions,
                              length: parseFloat(e.target.value) || 0
                            })}
                            placeholder="Enter length"
                            min="1"
                            step="0.1"
                            required
                          />
                          <span className="unit">CM</span>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Width *</label>
                        <div className="dimension-input">
                          <input
                            type="number"
                            value={formData.package_info.dimensions.width}
                            onChange={(e) => handleNestedInputChange('package_info', 'dimensions', {
                              ...formData.package_info.dimensions,
                              width: parseFloat(e.target.value) || 0
                            })}
                            placeholder="Enter width"
                            min="1"
                            step="0.1"
                            required
                          />
                          <span className="unit">CM</span>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Height *</label>
                        <div className="dimension-input">
                          <input
                            type="number"
                            value={formData.package_info.dimensions.height}
                            onChange={(e) => handleNestedInputChange('package_info', 'dimensions', {
                              ...formData.package_info.dimensions,
                              height: parseFloat(e.target.value) || 0
                            })}
                            placeholder="Enter height"
                            min="1"
                            step="0.1"
                            required
                          />
                          <span className="unit">CM</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.package_info.save_dimensions}
                        onChange={(e) => handleNestedInputChange('package_info', 'save_dimensions', e.target.checked)}
                      />
                      Save package dimensions for future use?
                    </label>
                  </div>
                </div>

                <div className="autofill-section">
                  <div className="or-separator">OR</div>
                  <div className="form-group">
                    <label>Select saved package to autofill dimensions</label>
                    <select
                      value={selectedPackage?._id || ''}
                      onChange={(e) => handlePackageSelect(e.target.value)}
                    >
                      <option value="">Select</option>
                      {packages.map(pkg => (
                        <option key={pkg._id} value={pkg._id}>
                          {pkg.name} - {pkg.package_type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
            </div>

            {/* Warehouse Address Section */}
            <div className="form-section warehouse-section">
              <div className="section-header">
                <h3> Warehouse Address</h3>
              </div>
              
              {!showManualAddress ? (
                <div>
                  <div className="form-group">
                    <label>Select Warehouse *</label>
                    <div className="warehouse-autocomplete-container">
                      <input
                        type="text"
                        placeholder="Search or select warehouse..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        className="warehouse-search-input"
                      />
                      {showSuggestions && filteredWarehouses.length > 0 && (
                        <div className="warehouse-suggestions">
                          {filteredWarehouses.map((warehouse) => (
                            <div
                              key={warehouse._id}
                              className="warehouse-suggestion-item"
                              onClick={() => {
                                handleWarehouseChange(warehouse._id);
                                setSearchQuery('');
                                setShowSuggestions(false);
                              }}
                            >
                              <div className="warehouse-suggestion-name">{warehouse.name}</div>
                              <div className="warehouse-suggestion-location">
                                {warehouse.address?.city} - {warehouse.address?.pincode}, {warehouse.address?.state}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {warehouseError && <div className="error-message">{warehouseError}</div>}
                    {warehouses.length === 0 && (
                      <div className="no-warehouses">
                        No warehouses found. Please add a warehouse first.
                      </div>
                    )}
                    {filteredWarehouses.length === 0 && searchQuery && warehouses.length > 0 && (
                      <div className="no-results">No warehouses found matching "{searchQuery}"</div>
                    )}
                  </div>
                  
                  {formData.pickup_address.warehouse_id && (
                    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #4caf50' }}>
                      <div style={{ fontSize: '12px', color: '#2e7d32', marginBottom: '4px' }}>Selected Warehouse:</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1b5e20' }}>
                        {warehouses.find(w => w._id === formData.pickup_address.warehouse_id)?.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#388e3c', marginTop: '4px' }}>
                        {formData.pickup_address.full_address}, {formData.pickup_address.city} - {formData.pickup_address.pincode}, {formData.pickup_address.state}
                      </div>
                    </div>
                  )}
                  
                  <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleAddAddress}
                      className="add-address-btn"
                    >
                      + Add Warehouse
                    </button>
                    {formData.pickup_address.warehouse_id && (
                      <button
                        type="button"
                        onClick={() => {
                          handleWarehouseChange('');
                          setSearchQuery('');
                        }}
                        style={{
                          padding: '8px 16px',
                          fontSize: '12px',
                          backgroundColor: '#f5f5f5',
                          color: '#666',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="manual-address-section">
                  <div className="section-header">
                    <h4>Enter Warehouse Address Manually</h4>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualAddress(false);
                        setFormData(prev => ({
                          ...prev,
                          pickup_address: {
                            ...prev.pickup_address,
                            warehouse_id: '',
                            name: '',
                            full_address: '',
                            city: '',
                            state: '',
                            pincode: '',
                            phone: '',
                            country: 'India'
                          }
                        }));
                      }}
                      className="back-to-warehouse-btn"
                    >
                      ← Back to Warehouse Selection
                    </button>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Warehouse Name *</label>
                      <input
                        type="text"
                        value={formData.pickup_address.name}
                        onChange={(e) => handleNestedInputChange('pickup_address', 'name', e.target.value)}
                        placeholder="Enter warehouse name"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone *</label>
                      <input
                        type="tel"
                        value={formData.pickup_address.phone}
                        onChange={(e) => handleNestedInputChange('pickup_address', 'phone', e.target.value)}
                        placeholder="Enter phone number"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="form-group full-width">
                    <label>Full Address *</label>
                    <textarea
                      value={formData.pickup_address.full_address}
                      onChange={(e) => handleNestedInputChange('pickup_address', 'full_address', e.target.value)}
                      placeholder="Enter complete address"
                      rows={3}
                      required
                    />
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Pincode *</label>
                      <input
                        type="text"
                        value={formData.pickup_address.pincode}
                        onChange={(e) => {
                          const pincode = e.target.value.replace(/\D/g, '').slice(0, 6);
                          handlePickupPincodeChange(pincode);
                        }}
                        placeholder="Enter 6-digit pincode"
                        maxLength={6}
                        required
                      />
                      {validatingPickupPincode && (
                        <small style={{ color: '#666', fontSize: '11px' }}>Validating pincode...</small>
                      )}
                    </div>
                    <div className="form-group">
                      <label>City *</label>
                      <input
                        type="text"
                        value={formData.pickup_address.city}
                        onChange={(e) => handleNestedInputChange('pickup_address', 'city', e.target.value)}
                        placeholder="Enter city"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>State *</label>
                      <input
                        type="text"
                        value={formData.pickup_address.state}
                        onChange={(e) => handleNestedInputChange('pickup_address', 'state', e.target.value)}
                        placeholder="Enter state"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Shipping Charges Calculation Section */}
              {formData.pickup_address.pincode && formData.delivery_address.pincode && formData.package_info.weight > 0 && (
                <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                  <div className="section-header" style={{ marginBottom: '12px' }}>
                    <h4> Shipping Charges Calculation</h4>
                  </div>
                  
                  {finalShippingCalculation.calculating ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <div style={{ fontSize: '16px', color: '#666', marginBottom: '10px' }}>
                        Refresh Calculating shipping charges...
                      </div>
                      <div style={{ fontSize: '14px', color: '#999' }}>
                        Fetching zone from Delhivery API and calculating {orderType === 'reverse' ? 'RTO' : 'forward'} charges based on your rate card...
                      </div>
                    </div>
                  ) : finalShippingCalculation.completed && !finalShippingCalculation.insufficientBalance ? (
                    <div style={{ padding: '15px', backgroundColor: '#d4edda', borderRadius: '6px', border: '1px solid #c3e6cb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <strong style={{ color: '#155724', fontSize: '16px' }}>[Success] Shipping Charges Calculated</strong>
                        </div>
                        <button
                          type="button"
                          onClick={calculateFinalShippingCharges}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#2C4563',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Refresh Recalculate
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                        <div>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Zone</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#155724' }}>
                            {finalShippingCalculation.zone || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Shipping Charges</div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#155724' }}>
                            ₹{formData.payment_info.shipping_charges.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                        <div>Pickup: {formData.pickup_address.pincode} | Delivery: {formData.delivery_address.pincode}</div>
                        <div>Weight: {formData.package_info.weight} kg | User Category: {userCategory}</div>
                        <div>Order Type: <strong>{orderType === 'reverse' ? 'Reverse (RTO)' : 'Forward'}</strong> | Charges: <strong>{orderType === 'reverse' ? 'RTO Charges' : 'Forward Charges'}</strong></div>
                        {finalShippingCalculation.walletBalance !== null && (
                          <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0f8ff', borderRadius: '4px' }}>
                            Wallet Balance: <strong>Rs.{finalShippingCalculation.walletBalance.toFixed(2)}</strong> |
                            After Deduction: <strong>Rs.{(finalShippingCalculation.walletBalance - formData.payment_info.shipping_charges).toFixed(2)}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : finalShippingCalculation.insufficientBalance ? (
                    <div style={{ padding: '15px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '2px solid #ffc107' }}>
                      <div style={{ color: '#856404', marginBottom: '15px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                          [Warning] Insufficient Wallet Balance
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: '1.6', marginBottom: '12px' }}>
                          <div><strong>Wallet Balance:</strong> ₹{finalShippingCalculation.walletBalance?.toFixed(2) || '0.00'}</div>
                          <div><strong>Shipping Charges Required:</strong> ₹{formData.payment_info.shipping_charges.toFixed(2)}</div>
                          <div style={{ marginTop: '8px', color: '#dc3545', fontWeight: 'bold' }}>
                            <strong>Shortfall:</strong> ₹{(formData.payment_info.shipping_charges - (finalShippingCalculation.walletBalance || 0)).toFixed(2)}
                          </div>
                        </div>
                        <div style={{ 
                          padding: '12px', 
                          backgroundColor: '#fff', 
                          borderRadius: '6px', 
                          border: '1px solid #ffc107',
                          fontSize: '14px',
                          color: '#856404',
                          marginTop: '12px'
                        }}>
                          <strong>[Error] Order cannot proceed.</strong><br/>
                          Your wallet balance is less than the shipping charges calculated.<br/>
                          <strong>Please ask admin to recharge your wallet</strong> before creating this order.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                        <button
                          type="button"
                          onClick={calculateFinalShippingCharges}
                          style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            backgroundColor: '#2C4563',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Refresh Recalculate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Refresh wallet balance
                            walletService.getWalletBalance(false).then(walletData => {
                              calculateFinalShippingCharges();
                            });
                          }}
                          style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Refresh Refresh Balance
                        </button>
                      </div>
                    </div>
                  ) : finalShippingCalculation.error ? (
                    <div style={{ padding: '15px', backgroundColor: '#f8d7da', borderRadius: '6px', border: '1px solid #f5c6cb' }}>
                      <div style={{ color: '#721c24', marginBottom: '10px' }}>
                        <strong>[Error] Calculation Failed</strong>
                      </div>
                      <div style={{ color: '#721c24', fontSize: '14px', marginBottom: '15px' }}>
                        {finalShippingCalculation.error}
                      </div>
                      <button
                        type="button"
                        onClick={calculateFinalShippingCharges}
                        style={{
                          padding: '8px 16px',
                          fontSize: '14px',
                          backgroundColor: '#2C4563',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Refresh Try Again
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <div style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                        Click the button below to calculate shipping charges before proceeding
                      </div>
                      <button
                        type="button"
                        onClick={calculateFinalShippingCharges}
                        style={{
                          padding: '12px 24px',
                          fontSize: '16px',
                          backgroundColor: '#2C4563',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                         Calculate Shipping Charges
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          {/* Action Buttons */}
          <div className="page-footer">
            <div className="button-group">
              {/* Show warning if shipping charges not calculated */}
              {!finalShippingCalculation.completed && !finalShippingCalculation.insufficientBalance && !finalShippingCalculation.error && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '6px',
                  color: '#856404',
                  fontSize: '11px',
                  textAlign: 'center'
                }}>
                  [Warning] Please calculate shipping charges above before proceeding
                </div>
              )}
              {finalShippingCalculation.insufficientBalance && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fff3cd',
                  border: '2px solid #ffc107',
                  borderRadius: '6px',
                  color: '#856404',
                  fontSize: '11px',
                  textAlign: 'center',
                  fontWeight: 'bold'
                }}>
                  [Warning] Insufficient wallet balance detected above. Please recharge your wallet before proceeding.
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                {onBack && (
                  <button 
                    type="button" 
                    onClick={onBack}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={handleSave} 
                  className="btn btn-secondary" 
                  disabled={loading || !finalShippingCalculation.completed || formData.payment_info.shipping_charges === 0 || finalShippingCalculation.insufficientBalance}
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveAndAssign} 
                  className="btn btn-success" 
                  disabled={loading || !finalShippingCalculation.completed || formData.payment_info.shipping_charges === 0 || finalShippingCalculation.insufficientBalance}
                >
                  {loading ? 'Creating Order...' : 'Assign Courier'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OrderCreationModal;










