import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { shippingService, ShippingCalculationRequest } from '../services/shippingService';
import { apiService } from '../services/api';
import { formatDateTime } from '../utils/dateFormat';
import './Tools.css';
import RateCalculatorIcon from '../ratecalculator/RATECALCULATOR.svg';
import ListIcon from '../ratecalculator/List.svg';
import TruckIcon from '../ratecalculator/truck.svg';
import MapFillIcon from '../ratecalculator/Map-Fill.svg';

interface ShippingCalculationResult {
  user_category: string;
  weight: number;
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  zone: string;
  cod_amount: number;
  calculation_result: {
    forwardCharges: number;
    rtoCharges: number;
    codCharges: number;
    totalCharges: number;
    volumetricWeight: number;
    chargeableWeight: number;
  };
  rate_card_info: {
    userCategory: string;
    carrier: string;
    applied_rates: any;
  };
}

interface ShippingCalculationResponse {
  forwardCharges: number;
  rtoCharges: number;
  codCharges: number;
  totalCharges: number;
  volumetricWeight: number;
  chargeableWeight: number;
  zone?: string;
}

type ZoneDefinitionMap = { [key: string]: string[] };
type ZoneDefinitionEntry = { zone: string; definition: string };

interface RateCardData {
  userCategory: string;
  carrier: string;
  forwardCharges: Array<{
    condition: string;
    zones: { [key: string]: number };
  }>;
  rtoCharges: Array<{
    condition: string;
    zones: { [key: string]: number };
  }>;
  codCharges: {
    percentage: number;
    minimumAmount: number;
    gstAdditional: boolean;
  };
  zoneDefinitions: ZoneDefinitionMap | ZoneDefinitionEntry[];
  termsAndConditions: string[];
}

type RateCardCacheEntry = {
  timestamp: number;
  data: RateCardData;
};

const RATE_CARD_CACHE_PREFIX = 'rateCardCache_';
const RATE_CARD_CACHE_DURATION = 1000 * 60 * 15; // 15 minutes

// Price List Tab Component
const PriceListTab: React.FC<{ userCategory: string; onRefreshUserData: () => void }> = ({ userCategory, onRefreshUserData }) => {
  const [rateCardData, setRateCardData] = useState<RateCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'warning'>('info');

  const isBrowser = typeof window !== 'undefined';

  const getCacheKey = () => `${RATE_CARD_CACHE_PREFIX}${userCategory}`;

  const readCache = (): RateCardCacheEntry | null => {
    if (!isBrowser) return null;
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (!parsed?.data || !parsed?.timestamp) return null;
      return parsed as RateCardCacheEntry;
    } catch (err) {
      console.warn('Failed to read rate card cache:', err);
      return null;
    }
  };

  const writeCache = (data: RateCardData, timestamp: number) => {
    if (!isBrowser) return;
    try {
      localStorage.setItem(getCacheKey(), JSON.stringify({ timestamp, data }));
    } catch (err) {
      console.warn('Failed to write rate card cache:', err);
    }
  };

  const clearCache = () => {
    if (!isBrowser) return;
    try {
      localStorage.removeItem(getCacheKey());
    } catch (err) {
      console.warn('Failed to clear rate card cache:', err);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDateTime(new Date(timestamp));
    } catch (err) {
      return '';
    }
  };

  const updateStatusMessage = (
    timestamp: number,
    options: { source: 'cache' | 'network'; reason?: 'stale-cache' | 'rate-limit' }
  ) => {
    const formatted = formatTimestamp(timestamp);
    if (!formatted) {
      setStatusMessage(null);
      return;
    }

    if (options.source === 'cache') {
      if (options.reason === 'rate-limit') {
        setStatusType('warning');
        setStatusMessage(`Rate limit reached. Showing cached rate card data from ${formatted}.`);
      } else if (options.reason === 'stale-cache') {
        setStatusType('warning');
        setStatusMessage(`Using cached rate card data from ${formatted}. Refreshing in the background...`);
      } else {
        setStatusType('info');
        setStatusMessage(`Loaded cached rate card data. Last updated: ${formatted}.`);
      }
    } else {
      setStatusType('info');
      setStatusMessage(`Last updated: ${formatted}.`);
    }
  };

  const fetchRateCard = async ({ background = false }: { background?: boolean } = {}) => {
    try {
      if (!background) {
        setLoading(true);
      }
      setError(null);

      const response = await apiService.get<{ success: boolean; data: RateCardData }>(`/shipping/rate-card/${userCategory}`);

      if (response.success && response.data) {
        console.log('Rate card data received:', response.data);
        setRateCardData(response.data);
        const timestamp = Date.now();
        updateStatusMessage(timestamp, { source: 'network' });
        writeCache(response.data, timestamp);
      } else {
        console.error('Invalid rate card response:', response);
        setError('Invalid rate card data received');
      }
    } catch (err: any) {
      if (err?.response?.status === 429) {
        const cachedEntry = readCache();
        if (cachedEntry) {
          setRateCardData(prev => prev ?? cachedEntry.data);
          updateStatusMessage(cachedEntry.timestamp, { source: 'cache', reason: 'rate-limit' });
          setError(null);
        } else {
          setError('Rate limit exceeded. Please wait a moment and try again.');
        }
      } else {
        setError(err.message || 'Failed to fetch rate card');
      }
      console.error('Rate card fetch error:', err);
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const cachedEntry = readCache();

    if (cachedEntry) {
      setRateCardData(cachedEntry.data);
      setLoading(false);
      const isStale = Date.now() - cachedEntry.timestamp > RATE_CARD_CACHE_DURATION;
      updateStatusMessage(cachedEntry.timestamp, {
        source: 'cache',
        reason: isStale ? 'stale-cache' : undefined,
      });

      if (isStale) {
        fetchRateCard({ background: true });
      }
    } else {
      fetchRateCard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCategory]);

  const zones = ['A', 'B', 'C', 'D', 'E', 'F'];

  const handleRetry = () => {
    fetchRateCard();
  };

  const handleRefreshUserData = () => {
    clearCache();
    onRefreshUserData();
    fetchRateCard();
  };

  if (loading) {
    return (
      <div className="price-list-section">
        <div className="price-list-header">
          <h2>Price List - {userCategory}</h2>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading rate card...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="price-list-section">
        <div className="price-list-header">
          <h2>Price List - {userCategory}</h2>
        </div>
        <div className="error-container">
          <div className="error-icon">❌</div>
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={handleRetry} className="retry-btn">
              Retry
            </button>
            <button onClick={handleRefreshUserData} className="retry-btn" style={{ backgroundColor: '#007bff' }}>
              Refresh User Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!rateCardData) {
    return (
      <div className="price-list-section">
        <div className="price-list-header">
          <h2>Price List - {userCategory}</h2>
        </div>
        <div className="no-data-container">
          <div className="no-data-icon">📋</div>
          <p>No rate card data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="price-list-section">
      <div className="price-list-header">
        <h2>Price List - {userCategory}</h2>
        <div className="rate-card-info">
          <span className="carrier-badge">{rateCardData.carrier}</span>
          <span className="category-badge">{rateCardData.userCategory}</span>
        </div>
      </div>

      {statusMessage && (
        <div className={`rate-card-status ${statusType === 'warning' ? 'warning' : ''}`}>
          {statusMessage}
        </div>
      )}

      <div className="price-tables">
        {/* Forward Charges Table */}
        <div className="price-table-container">
          <h3>Forward Charges (₹)</h3>
          <div className="table-wrapper">
            <table className="price-table">
              <thead>
                <tr>
                  <th>Weight Slab</th>
                  {zones.map(zone => (
                    <th key={zone}>Zone {zone}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rateCardData.forwardCharges && rateCardData.forwardCharges.length > 0 ? (
                  rateCardData.forwardCharges.map((charge, index) => (
                    <tr key={index}>
                      <td className="weight-slab">{charge.condition}</td>
                      {zones.map(zone => (
                        <td key={zone} className="price-cell">
                          ₹{charge.zones && charge.zones[zone] ? charge.zones[zone] : '-'}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={zones.length + 1} className="text-center text-gray-500">
                      No forward charges data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RTO Charges Table */}
        <div className="price-table-container">
          <h3>RTO Charges (₹)</h3>
          <div className="table-wrapper">
            <table className="price-table">
              <thead>
                <tr>
                  <th>Weight Slab</th>
                  {zones.map(zone => (
                    <th key={zone}>Zone {zone}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rateCardData.rtoCharges && rateCardData.rtoCharges.length > 0 ? (
                  rateCardData.rtoCharges.map((charge, index) => (
                    <tr key={index}>
                      <td className="weight-slab">{charge.condition}</td>
                      {zones.map(zone => (
                        <td key={zone} className="price-cell">
                          ₹{charge.zones && charge.zones[zone] ? charge.zones[zone] : '-'}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={zones.length + 1} className="text-center text-gray-500">
                      No RTO charges data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* COD Charges */}
        <div className="cod-charges-container">
          <h3>COD Charges</h3>
          <div className="cod-details">
            <div className="cod-item">
              <span className="cod-label">Percentage:</span>
              <span className="cod-value">{rateCardData.codCharges?.percentage || 'N/A'}%</span>
            </div>
            <div className="cod-item">
              <span className="cod-label">Minimum Amount:</span>
              <span className="cod-value">₹{rateCardData.codCharges?.minimumAmount || 'N/A'}</span>
            </div>
            <div className="cod-item">
              <span className="cod-label">GST Additional:</span>
              <span className="cod-value">{rateCardData.codCharges?.gstAdditional ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>

        {/* Zone Definitions */}
        <div className="zone-definitions-container">
          <h3>Zone Definitions</h3>
          <div className="zone-grid">
            {Array.isArray(rateCardData.zoneDefinitions) ? (
              rateCardData.zoneDefinitions.length > 0 ? (
                rateCardData.zoneDefinitions.map((zoneDef: ZoneDefinitionEntry) => (
                  <div key={zoneDef.zone} className="zone-item">
                    <div className="zone-name">{zoneDef.zone}</div>
                    <div className="zone-states">{zoneDef.definition}</div>
                  </div>
                ))
              ) : (
                <div className="zone-item">
                  <div className="zone-name">No Zone Data</div>
                  <div className="zone-states">Zone definitions not available</div>
                </div>
              )
            ) : rateCardData.zoneDefinitions && Object.keys(rateCardData.zoneDefinitions).length > 0 ? (
              Object.entries(rateCardData.zoneDefinitions).map(([zone, states]) => (
                <div key={zone} className="zone-item">
                  <div className="zone-name">Zone {zone}</div>
                  <div className="zone-states">
                    {Array.isArray(states) && states.length > 0 ? states.join(', ') : 'No states defined'}
                  </div>
                </div>
              ))
            ) : (
              <div className="zone-item">
                <div className="zone-name">No Zone Data</div>
                <div className="zone-states">Zone definitions not available</div>
              </div>
            )}
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="terms-container">
          <h3>Terms & Conditions</h3>
          <ul className="terms-list">
            {rateCardData.termsAndConditions && rateCardData.termsAndConditions.length > 0 ? (
              rateCardData.termsAndConditions.map((term, index) => (
                <li key={index} className="term-item">
                  {term}
                </li>
              ))
            ) : (
              <li className="term-item">No terms and conditions available</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

const Tools: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'calculator' | 'price-list' | 'manage-courier'>('calculator');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShippingCalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    shipmentType: 'forward',
    pickupPincode: '',
    deliveryPincode: '',
    actualWeight: '',
    packageType: 'single',
    dimensions: {
      length: '',
      breadth: '',
      height: ''
    },
    shipmentValue: '',
    codValue: '',
    paymentType: 'prepaid'
  });

  const [pickupLocation, setPickupLocation] = useState<{city: string, state: string} | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<{city: string, state: string} | null>(null);
  const [validatingPincode, setValidatingPincode] = useState<{pickup: boolean, delivery: boolean}>({pickup: false, delivery: false});

  // Get user category for rate card selection
  // This value comes directly from MongoDB via AuthContext
  // When admin assigns a label, MongoDB is updated and WebSocket notification triggers refresh
  const userCategory = user?.user_category || 'Basic User';

  // Force refresh user data if there's a mismatch
  const handleRefreshUserData = async () => {
    try {
      await refreshUser();
      console.log('User data refreshed, current category:', user?.user_category);
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev as any)[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

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

  const handlePincodeChange = async (type: 'pickup' | 'delivery', pincode: string) => {
    handleInputChange(type === 'pickup' ? 'pickupPincode' : 'deliveryPincode', pincode);
    
    if (pincode.length === 6) {
      setValidatingPincode(prev => ({ ...prev, [type]: true }));
      
      try {
        const locationInfo = await validatePincode(pincode);
        if (locationInfo && locationInfo.city && locationInfo.state) {
          if (type === 'pickup') {
            setPickupLocation({ 
              city: locationInfo.city, 
              state: locationInfo.state 
            });
          } else {
            setDeliveryLocation({ 
              city: locationInfo.city, 
              state: locationInfo.state 
            });
          }
        } else {
          // Handle invalid pincode
          if (type === 'pickup') {
            setPickupLocation({ city: 'Invalid Pincode', state: 'Please check' });
          } else {
            setDeliveryLocation({ city: 'Invalid Pincode', state: 'Please check' });
          }
        }
      } catch (error) {
        console.error('Pincode validation error:', error);
        if (type === 'pickup') {
          setPickupLocation({ city: 'Error', state: 'Try again' });
        } else {
          setDeliveryLocation({ city: 'Error', state: 'Try again' });
        }
      } finally {
        setValidatingPincode(prev => ({ ...prev, [type]: false }));
      }
    } else {
      if (type === 'pickup') {
        setPickupLocation(null);
      } else {
        setDeliveryLocation(null);
      }
    }
  };

  const calculateShipping = async () => {
    if (!formData.pickupPincode || !formData.deliveryPincode || !formData.actualWeight) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const weight = parseFloat(formData.actualWeight) * 1000; // Convert kg to grams
      const dimensions = {
        length: parseFloat(formData.dimensions.length) || 0,
        breadth: parseFloat(formData.dimensions.breadth) || 0,
        height: parseFloat(formData.dimensions.height) || 0
      };

      const codAmount = formData.paymentType === 'cod' ? parseFloat(formData.codValue) || 0 : 0;

      const calculationRequest: ShippingCalculationRequest = {
        weight, // Now in grams
        dimensions,
        pickup_pincode: formData.pickupPincode,
        delivery_pincode: formData.deliveryPincode,
        payment_mode: formData.paymentType === 'cod' ? 'COD' : 'Prepaid',
        cod_amount: codAmount,
        order_type: formData.shipmentType as 'forward' | 'rto'
      };

      // Use the intelligent rate card calculation
      const response: ShippingCalculationResponse = await shippingService.calculateShippingCharges(calculationRequest);
      
      setResult({
        user_category: userCategory,
        weight,
        dimensions,
        zone: response.zone || 'N/A',
        cod_amount: codAmount,
        calculation_result: response,
        rate_card_info: {
          userCategory,
          carrier: 'DELHIVERY',
          applied_rates: 'Applied based on your user category'
        }
      });

    } catch (err: any) {
      setError(err.message || 'Failed to calculate shipping charges');
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setFormData({
      shipmentType: 'forward',
      pickupPincode: '',
      deliveryPincode: '',
      actualWeight: '',
      packageType: 'single',
      dimensions: {
        length: '',
        breadth: '',
        height: ''
      },
      shipmentValue: '',
      codValue: '',
      paymentType: 'prepaid'
    });
    setPickupLocation(null);
    setDeliveryLocation(null);
    setValidatingPincode({pickup: false, delivery: false});
    setResult(null);
    setError(null);
  };

  return (
    <Layout>
      <div className="tools-page">
        <div className="tools-content">
          {/* Main Tabs */}
          <div className="main-tabs">
            <button 
              className={`main-tab ${activeTab === 'calculator' ? 'active' : ''}`}
              onClick={() => setActiveTab('calculator')}
            >
              <img src={RateCalculatorIcon} alt="Rate Calculator" className="tab-icon" />
              <span>Rate Calculator</span>
            </button>
            <button 
              className={`main-tab ${activeTab === 'price-list' ? 'active' : ''}`}
              onClick={() => setActiveTab('price-list')}
            >
              <img src={ListIcon} alt="Price List" className="tab-icon" />
              <span>Price List</span>
            </button>
            <button 
              className={`main-tab ${activeTab === 'manage-courier' ? 'active' : ''}`}
              onClick={() => setActiveTab('manage-courier')}
            >
              <img src={TruckIcon} alt="Manage Courier" className="tab-icon" />
              <span>Manage Courier</span>
            </button>
          </div>

          {/* Calculator Tab */}
          {activeTab === 'calculator' && (
            <div className="calculator-section">
              <div className="calculator-wrapper">
                {/* Left Side - Form */}
                <div className="calculator-form-container">
                  <div className="calculator-tabs">
                    <button className={`mode-tab active`}>Domestic</button>
                    <button className="mode-tab disabled" type="button">
                      International
                      <span className="coming-soon-badge">Coming Soon</span>
                    </button>
                  </div>

                  <div className="calculator-form">
                    <div className="form-group">
                      <label>Shipment Type</label>
                      <div className="radio-group">
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name="shipmentType" 
                            value="forward"
                            checked={formData.shipmentType === 'forward'}
                            onChange={(e) => handleInputChange('shipmentType', e.target.value)}
                          />
                          Forward
                        </label>
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name="shipmentType" 
                            value="return"
                            checked={formData.shipmentType === 'return'}
                            onChange={(e) => handleInputChange('shipmentType', e.target.value)}
                          />
                          Return
                        </label>
                      </div>
                    </div>

                    <div className="inline-field-row">
                      <div className="form-group">
                        <label>Pickup Pincode</label>
                        <input
                          type="text"
                          placeholder="Enter 6 digit pickup pincode."
                          value={formData.pickupPincode}
                          onChange={(e) => handlePincodeChange('pickup', e.target.value)}
                          maxLength={6}
                          className="pincode-input"
                        />
                      </div>

                      <div className="form-group">
                        <label>Delivery Pincode</label>
                        <input
                          type="text"
                          placeholder="Enter 6 digit delivery pincode."
                          value={formData.deliveryPincode}
                          onChange={(e) => handlePincodeChange('delivery', e.target.value)}
                          maxLength={6}
                          className="pincode-input"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Actual Weight</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={formData.actualWeight || ''}
                        onChange={(e) => handleInputChange('actualWeight', e.target.value)}
                        step="0.01"
                        min="0"
                        className="weight-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Payment Type</label>
                      <div className="radio-group">
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name="paymentType" 
                            value="prepaid"
                            checked={formData.paymentType === 'prepaid'}
                            onChange={(e) => handleInputChange('paymentType', e.target.value)}
                          />
                          Prepaid
                        </label>
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name="paymentType" 
                            value="cod"
                            checked={formData.paymentType === 'cod'}
                            onChange={(e) => handleInputChange('paymentType', e.target.value)}
                          />
                          Cash on Delivery
                        </label>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Package Type</label>
                      <select 
                        value={formData.packageType}
                        onChange={(e) => handleInputChange('packageType', e.target.value)}
                        className="package-select"
                      >
                        <option value="single">Single Package (B2C)</option>
                        <option value="bulk">Bulk Package (B2B)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Dimensions</label>
                      <div className="dimensions-input">
                        <input
                          type="number"
                          placeholder=""
                          value={formData.dimensions.length}
                          onChange={(e) => handleInputChange('dimensions.length', e.target.value)}
                          step="0.1"
                          min="0"
                        />
                        <input
                          type="number"
                          placeholder=""
                          value={formData.dimensions.breadth}
                          onChange={(e) => handleInputChange('dimensions.breadth', e.target.value)}
                          step="0.1"
                          min="0"
                        />
                        <input
                          type="number"
                          placeholder=""
                          value={formData.dimensions.height}
                          onChange={(e) => handleInputChange('dimensions.height', e.target.value)}
                          step="0.1"
                          min="0"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Shipment Value</label>
                      <input
                        type="number"
                        placeholder="Enter Shipment Value"
                        value={formData.shipmentValue}
                        onChange={(e) => handleInputChange('shipmentValue', e.target.value)}
                        min="0"
                        step="0.01"
                      />
                    </div>

                    <div className="form-group">
                      <label>Cash on Delivery Value</label>
                      <input
                        type="number"
                        placeholder="Enter Cash on Delivery Value"
                        value={formData.codValue}
                        onChange={(e) => handleInputChange('codValue', e.target.value)}
                        min="0"
                        step="0.01"
                      />
                    </div>

                    <div className="form-actions">
                      <button 
                        type="button" 
                        onClick={clearForm}
                        className="clear-btn"
                      >
                        Clear
                      </button>
                      <button 
                        type="button" 
                        onClick={calculateShipping}
                        disabled={loading}
                        className="calculate-btn"
                      >
                        {loading ? 'Calculating...' : 'Calculate'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Side - Location Display */}
                <div className="location-section">
                  <div className="location-card">
                    <div className="location-header">
                      <img src={MapFillIcon} alt="Location" className="location-icon-img" />
                      <span className="location-label">Pickup Location</span>
                    </div>
                    <div className="location-box">
                      {validatingPincode.pickup ? (
                        <div className="location-loading">Validating...</div>
                      ) : pickupLocation ? (
                        <>
                          <div className={`location-city ${pickupLocation.city.includes('Invalid') || pickupLocation.city.includes('Error') ? 'error' : ''}`}>
                            {pickupLocation.city}
                          </div>
                          <div className={`location-state ${pickupLocation.state.includes('Please check') || pickupLocation.state.includes('Try again') ? 'error' : ''}`}>
                            {pickupLocation.state}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="location-city">City</div>
                          <div className="location-state">State</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="location-connector">
                    <div className="connector-line"></div>
                  </div>

                  <div className="location-card">
                    <div className="location-header">
                      <img src={MapFillIcon} alt="Location" className="location-icon-img" />
                      <span className="location-label">Delivery Location</span>
                    </div>
                    <div className="location-box">
                      {validatingPincode.delivery ? (
                        <div className="location-loading">Validating...</div>
                      ) : deliveryLocation ? (
                        <>
                          <div className={`location-city ${deliveryLocation.city.includes('Invalid') || deliveryLocation.city.includes('Error') ? 'error' : ''}`}>
                            {deliveryLocation.city}
                          </div>
                          <div className={`location-state ${deliveryLocation.state.includes('Please check') || deliveryLocation.state.includes('Try again') ? 'error' : ''}`}>
                            {deliveryLocation.state}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="location-city">City</div>
                          <div className="location-state">State</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Results */}
              {error && (
                <div className="error-message">
                  <span>❌ {error}</span>
                </div>
              )}

              {result && (
                <div className="results-section">
                  <h3>Shipping Calculation Results</h3>
                  <div className="results-card">
                    <div className="result-header">
                      <div className="user-category-badge">
                        Rate Card: {result.user_category}
                      </div>
                      <div className="zone-badge">
                        Zone: {result.zone}
                      </div>
                    </div>
                    
                    <div className="result-details">
                      <div className="result-row">
                        <span className="result-label">Weight:</span>
                        <span className="result-value">{(result.weight / 1000).toFixed(2)} kg</span>
                      </div>
                      <div className="result-row">
                        <span className="result-label">Chargeable Weight:</span>
                        <span className="result-value">{result.calculation_result.chargeableWeight.toFixed(2)} kg</span>
                      </div>
                      <div className="result-row">
                        <span className="result-label">Volumetric Weight:</span>
                        <span className="result-value">{result.calculation_result.volumetricWeight.toFixed(2)} kg</span>
                      </div>
                      {formData.shipmentType === 'forward' && (
                        <div className="result-row">
                          <span className="result-label">Forward Charges:</span>
                          <span className="result-value">₹{result.calculation_result.forwardCharges.toFixed(2)}</span>
                        </div>
                      )}
                      {formData.shipmentType === 'rto' && (
                        <div className="result-row">
                          <span className="result-label">RTO Charges:</span>
                          <span className="result-value">₹{result.calculation_result.rtoCharges.toFixed(2)}</span>
                        </div>
                      )}
                      {result.cod_amount > 0 && (
                        <div className="result-row">
                          <span className="result-label">COD Charges:</span>
                          <span className="result-value">₹{result.calculation_result.codCharges.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="result-row total-row">
                        <span className="result-label">Total Charges:</span>
                        <span className="result-value total-value">₹{result.calculation_result.totalCharges.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manage Courier Tab */}
          {activeTab === 'manage-courier' && (
            <div className="manage-courier-section">
              <p>Manage Courier functionality coming soon...</p>
            </div>
          )}

          {/* Price List Tab */}
          {activeTab === 'price-list' && (
            <PriceListTab userCategory={userCategory} onRefreshUserData={handleRefreshUserData} />
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Tools;