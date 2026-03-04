import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { shippingService, ShippingCalculationRequest } from '../services/shippingService';
import { useAuth } from '../contexts/AuthContext';
import './RateCalculator.css';

interface ShippingCalculationResult {
  user_category: string;
  weight: number;
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  zone: string;
  volumetric_weight: number;
  chargeable_weight: number;
  forward_charges: number;
  rto_charges: number;
  cod_charges: number;
  total_charges: number;
  carrier: string;
}

const RateCalculator: React.FC = () => {
  // FIX A: renamed 'return' → 'reverse' in type and state
  const [shipmentType, setShipmentType] = useState<'forward' | 'reverse'>('forward');
  const [paymentType, setPaymentType] = useState<'prepaid' | 'cod'>('prepaid');
  const [pickupPincode, setPickupPincode] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [breadth, setBreadth] = useState('');
  const [height, setHeight] = useState('');
  const [codAmount, setCodAmount] = useState('');
  // FIX C: new shipment value field
  const [shipmentValue, setShipmentValue] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<ShippingCalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // FIX D: pull user from AuthContext and force-refresh on mount
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    // Force a fresh user profile fetch on component mount so user_category is never stale
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX B: when switching to reverse, silently reset payment type to prepaid
  const handleShipmentTypeChange = (type: 'forward' | 'reverse') => {
    setShipmentType(type);
    if (type === 'reverse') {
      setPaymentType('prepaid');
      setCodAmount('');
    }
  };

  const handleCalculate = async () => {
    // FIX C: include shipmentValue in validation
    if (!pickupPincode || !deliveryPincode || !weight || !shipmentValue) {
      setError('Please fill in all required fields');
      return;
    }

    setIsCalculating(true);
    setError(null);
    setResult(null);

    try {
      const request: ShippingCalculationRequest = {
        pickup_pincode: pickupPincode,
        delivery_pincode: deliveryPincode,
        weight: parseFloat(weight),
        dimensions: {
          length: length ? parseFloat(length) : 1,
          breadth: breadth ? parseFloat(breadth) : 1,
          height: height ? parseFloat(height) : 1
        },
        // FIX B: reverse orders always send Prepaid; COD only applies for forward
        payment_mode: (shipmentType === 'forward' && paymentType === 'cod') ? 'COD' : 'Prepaid',
        cod_amount: (shipmentType === 'forward' && paymentType === 'cod' && codAmount)
          ? parseFloat(codAmount)
          : undefined,
        // FIX A: map 'reverse' → 'rto' for the API
        order_type: shipmentType === 'reverse' ? 'rto' : 'forward',
        declared_value: parseFloat(shipmentValue)
      };

      const response = await shippingService.calculateShippingCharges(request);
      setResult({
        // FIX D: populate user_category from fresh user context
        user_category: user?.user_category || '',
        weight: parseFloat(weight),
        dimensions: request.dimensions,
        zone: response.zone || '',
        volumetric_weight: response.volumetricWeight,
        chargeable_weight: response.chargeableWeight,
        forward_charges: response.forwardCharges,
        rto_charges: response.rtoCharges,
        cod_charges: response.codCharges,
        total_charges: response.totalCharges,
        carrier: ''
      });
    } catch (err: any) {
      setError(err.message || 'Failed to calculate shipping rate');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleReset = () => {
    setPickupPincode('');
    setDeliveryPincode('');
    setWeight('');
    setLength('');
    setBreadth('');
    setHeight('');
    setCodAmount('');
    setShipmentValue('');
    setResult(null);
    setError(null);
  };

  return (
    <Layout>
      <div className="rate-calculator-page">
        <div className="rate-calculator-header">
          <h1>Rate Calculator</h1>
          <p>Calculate shipping rates for your shipments</p>
          {/* FIX D: display current rate card category prominently */}
          {user?.user_category && (
            <div className="user-category-badge">
              Rate Card: <strong>{user.user_category}</strong>
            </div>
          )}
        </div>

        <div className="rate-calculator-content">
          <div className="calculator-form">
            {/* Shipment Type — FIX A: label changed to "Reverse", handler updated */}
            <div className="form-section">
              <label className="form-label">Shipment Type</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="shipmentType"
                    checked={shipmentType === 'forward'}
                    onChange={() => handleShipmentTypeChange('forward')}
                  />
                  <span>Forward</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="shipmentType"
                    checked={shipmentType === 'reverse'}
                    onChange={() => handleShipmentTypeChange('reverse')}
                  />
                  {/* FIX A: was "Return", now "Reverse" */}
                  <span>Reverse</span>
                </label>
              </div>
            </div>

            {/* Pincodes */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Pickup Pincode</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter 6 digit pickup pincode"
                  value={pickupPincode}
                  onChange={(e) => setPickupPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Delivery Pincode</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter 6 digit delivery pincode"
                  value={deliveryPincode}
                  onChange={(e) => setDeliveryPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </div>
            </div>

            {/* Weight */}
            <div className="form-group">
              <label className="form-label">Actual Weight</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0.00"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  step="any"
                  min="0"
                />
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>kg</span>
              </div>
            </div>

            {/* FIX B: Payment Type section — only shown for forward shipments */}
            {shipmentType === 'forward' && (
              <>
                <div className="form-section">
                  <label className="form-label">Payment Type</label>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="paymentType"
                        checked={paymentType === 'prepaid'}
                        onChange={() => setPaymentType('prepaid')}
                      />
                      <span>Prepaid</span>
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="paymentType"
                        checked={paymentType === 'cod'}
                        onChange={() => setPaymentType('cod')}
                      />
                      <span>Cash on Delivery</span>
                    </label>
                  </div>
                </div>

                {/* COD Amount — only shown for forward + COD */}
                {paymentType === 'cod' && (
                  <div className="form-group">
                    <label className="form-label">COD Amount</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Enter COD amount"
                      value={codAmount}
                      onChange={(e) => setCodAmount(e.target.value)}
                      min="0"
                    />
                  </div>
                )}
              </>
            )}

            {/* Dimensions */}
            <div className="form-section">
              <label className="form-label">Dimensions - Optional</label>
              <div className="dimensions-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    className="form-input dimension-input"
                    placeholder="L"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>cm</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    className="form-input dimension-input"
                    placeholder="B"
                    value={breadth}
                    onChange={(e) => setBreadth(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>cm</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    className="form-input dimension-input"
                    placeholder="H"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>cm</span>
                </div>
              </div>
            </div>

            {/* FIX C: Shipment Value — mandatory field */}
            <div className="form-group">
              <label className="form-label">
                Shipment Value (&#8377;) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                className="form-input"
                placeholder="Enter shipment value"
                value={shipmentValue}
                onChange={(e) => setShipmentValue(e.target.value)}
                min="0"
                step="any"
              />
            </div>

            {/* Error */}
            {error && <div className="error-message">{error}</div>}

            {/* Buttons */}
            <div className="button-row">
              <button
                className="calculate-btn"
                onClick={handleCalculate}
                disabled={isCalculating}
              >
                {isCalculating ? 'Calculating...' : 'Calculate'}
              </button>
              <button className="reset-btn" onClick={handleReset}>
                Reset
              </button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="results-section">
              <h3>Calculation Results</h3>
              {/* FIX D: show rate category in results as well */}
              {result.user_category && (
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '12px' }}>
                  Rate card applied: <strong>{result.user_category}</strong>
                </p>
              )}
              <div className="results-grid">
                <div className="result-item">
                  <span className="result-label">Zone</span>
                  <span className="result-value">{result.zone}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Chargeable Weight</span>
                  <span className="result-value">{result.chargeable_weight} kg</span>
                </div>
                {/* FIX A: was checking shipmentType === 'forward' / 'return', now uses 'reverse' */}
                {shipmentType === 'forward' && (
                  <div className="result-item">
                    <span className="result-label">Forward Charges</span>
                    <span className="result-value">&#8377;{result.forward_charges.toFixed(2)}</span>
                  </div>
                )}
                {shipmentType === 'reverse' && (
                  <div className="result-item">
                    <span className="result-label">RTO Charges</span>
                    <span className="result-value">&#8377;{result.rto_charges.toFixed(2)}</span>
                  </div>
                )}
                {result.cod_charges > 0 && (
                  <div className="result-item">
                    <span className="result-label">COD Charges</span>
                    <span className="result-value">&#8377;{result.cod_charges.toFixed(2)}</span>
                  </div>
                )}
                <div className="result-item total">
                  <span className="result-label">Total Charges</span>
                  <span className="result-value">&#8377;{result.total_charges.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default RateCalculator;
