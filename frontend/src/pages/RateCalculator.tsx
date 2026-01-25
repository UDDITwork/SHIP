import React, { useState } from 'react';
import Layout from '../components/Layout';
import { shippingService, ShippingCalculationRequest } from '../services/shippingService';
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
  const [shipmentType, setShipmentType] = useState<'forward' | 'return'>('forward');
  const [paymentType, setPaymentType] = useState<'prepaid' | 'cod'>('prepaid');
  const [pickupPincode, setPickupPincode] = useState('');
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [breadth, setBreadth] = useState('');
  const [height, setHeight] = useState('');
  const [codAmount, setCodAmount] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<ShippingCalculationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculate = async () => {
    if (!pickupPincode || !deliveryPincode || !weight) {
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
          length: length ? parseFloat(length) : 0,
          breadth: breadth ? parseFloat(breadth) : 0,
          height: height ? parseFloat(height) : 0
        },
        payment_mode: paymentType === 'cod' ? 'COD' : 'Prepaid',
        cod_amount: paymentType === 'cod' && codAmount ? parseFloat(codAmount) : undefined
      };

      const response = await shippingService.calculateShippingCharges(request);
      setResult({
        user_category: '',
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
    setResult(null);
    setError(null);
  };

  return (
    <Layout>
      <div className="rate-calculator-page">
        <div className="rate-calculator-header">
          <h1>Rate Calculator</h1>
          <p>Calculate shipping rates for your shipments</p>
        </div>

        <div className="rate-calculator-content">
          <div className="calculator-form">
            {/* Shipment Type */}
            <div className="form-section">
              <label className="form-label">Shipment Type</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="shipmentType"
                    checked={shipmentType === 'forward'}
                    onChange={() => setShipmentType('forward')}
                  />
                  <span>Forward</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="shipmentType"
                    checked={shipmentType === 'return'}
                    onChange={() => setShipmentType('return')}
                  />
                  <span>Return</span>
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
              <label className="form-label">Actual Weight (kg)</label>
              <input
                type="number"
                className="form-input"
                placeholder="0.00"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                step="0.01"
                min="0"
              />
            </div>

            {/* Payment Type */}
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

            {/* COD Amount */}
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

            {/* Dimensions */}
            <div className="form-section">
              <label className="form-label">Dimensions (cm) - Optional</label>
              <div className="dimensions-row">
                <input
                  type="number"
                  className="form-input dimension-input"
                  placeholder="Length"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  min="0"
                />
                <input
                  type="number"
                  className="form-input dimension-input"
                  placeholder="Breadth"
                  value={breadth}
                  onChange={(e) => setBreadth(e.target.value)}
                  min="0"
                />
                <input
                  type="number"
                  className="form-input dimension-input"
                  placeholder="Height"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  min="0"
                />
              </div>
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
              <div className="results-grid">
                <div className="result-item">
                  <span className="result-label">Zone</span>
                  <span className="result-value">{result.zone}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Chargeable Weight</span>
                  <span className="result-value">{result.chargeable_weight} kg</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Forward Charges</span>
                  <span className="result-value">₹{result.forward_charges.toFixed(2)}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">RTO Charges</span>
                  <span className="result-value">₹{result.rto_charges.toFixed(2)}</span>
                </div>
                {result.cod_charges > 0 && (
                  <div className="result-item">
                    <span className="result-label">COD Charges</span>
                    <span className="result-value">₹{result.cod_charges.toFixed(2)}</span>
                  </div>
                )}
                <div className="result-item total">
                  <span className="result-label">Total Charges</span>
                  <span className="result-value">₹{result.total_charges.toFixed(2)}</span>
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
