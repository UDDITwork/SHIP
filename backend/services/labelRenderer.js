const logger = require('../utils/logger');

/**
 * Label Renderer Service
 * Converts Delhivery JSON response to printable HTML/PDF format
 *
 * SHIPPING LABEL DIMENSIONS (Industry Standard):
 * - Thermal (1-in-1): 4" x 6" (100mm x 150mm) - Direct thermal printer
 * - Standard (1-in-1): 4" x 6" (100mm x 150mm) - Single label per sheet
 * - 2-in-1: Two 4"x6" labels on A4 portrait (210mm x 297mm)
 * - 4-in-1: Four 4"x6" labels on A4 (210mm x 297mm)
 *
 * A4 Layout Specifications:
 * - Paper: 210mm x 297mm
 * - Label: 100mm x 148mm (fits 2 columns x 2 rows)
 * - Margins: 5mm left/right
 * - Gap: 0mm horizontal, 1mm vertical
 */

// Label format constants
const LABEL_FORMATS = {
  THERMAL: {
    name: 'Thermal',
    width: '100mm',    // 4 inches
    height: '150mm',   // 6 inches
    labelsPerSheet: 1,
    paperType: 'thermal'
  },
  STANDARD: {
    name: 'Standard',
    width: '100mm',
    height: '150mm',
    labelsPerSheet: 1,
    paperType: 'standard'
  },
  TWO_IN_ONE: {
    name: '2 In One',
    width: '137mm',
    height: '200mm',
    labelsPerSheet: 2,
    paperType: 'A4',
    paperWidth: '210mm',
    paperHeight: '297mm'
  },
  FOUR_IN_ONE: {
    name: '4 In One',
    width: '98mm',
    height: '137mm',
    labelsPerSheet: 4,
    paperType: 'A4',
    paperWidth: '210mm',
    paperHeight: '297mm'
  }
};

class LabelRenderer {

  /**
   * Get label format configuration
   * @param {string} format - Label format type
   * @returns {Object} Format configuration
   */
  static getLabelFormat(format) {
    const formatMap = {
      // API formats (lowercase, from frontend)
      'thermal': LABEL_FORMATS.THERMAL,
      'standard': LABEL_FORMATS.STANDARD,
      '2in1': LABEL_FORMATS.TWO_IN_ONE,
      '4in1': LABEL_FORMATS.FOUR_IN_ONE,
      // Display formats (capitalized, from user settings)
      'Thermal': LABEL_FORMATS.THERMAL,
      'Standard': LABEL_FORMATS.STANDARD,
      '2 In One': LABEL_FORMATS.TWO_IN_ONE,
      '4 In One': LABEL_FORMATS.FOUR_IN_ONE
    };
    return formatMap[format] || LABEL_FORMATS.STANDARD;
  }
  /**
   * Convert Delhivery JSON response to printable HTML label
   * @param {Object} labelData - Label data from Delhivery API
   * @param {string} waybill - Waybill number as fallback
   * @param {Object} order - Order object as fallback for missing data
   * @param {Object} labelSettings - User's label settings for visibility control
   * @param {string} format - Label format type (Thermal, Standard, 2 In One, 4 In One)
   * @returns {string} HTML string for the label
   */
  static generateLabelHTML(labelData, waybill = null, order = null, labelSettings = {}, format = 'Thermal') {
    try {
      logger.info('🎨 Generating label HTML from Delhivery data');

      // Log the entire structure to understand the response
      logger.info('🔍 Label data structure:', {
        topLevelKeys: Object.keys(labelData),
        isArray: Array.isArray(labelData),
        hasPackages: !!labelData.packages,
        packagesLength: labelData.packages?.length || 0,
        packagesFound: labelData.packages_found,
        fullData: JSON.stringify(labelData, null, 2).substring(0, 1000)
      });

      // Parse the packages array from Delhivery response
      // Delhivery can return data in different formats:
      // 1. { packages: [...] } - array format
      // 2. { [waybill]: {...} } - object format with waybill as key
      // 3. Direct object with package data

      let packages = [];
      let pkg = null;

      // Try array format first
      if (Array.isArray(labelData)) {
        packages = labelData;
      } else if (labelData.packages && Array.isArray(labelData.packages)) {
        packages = labelData.packages;
        // Check if packages array is empty but packages_found indicates packages exist
        if (packages.length === 0 && labelData.packages_found && labelData.packages_found > 0) {
          logger.warn('⚠️ Packages array is empty but packages_found > 0', {
            packages_found: labelData.packages_found,
            allKeys: Object.keys(labelData)
          });
          // Try to find package data in other keys (Delhivery might nest it differently)
          const allKeys = Object.keys(labelData);
          for (const key of allKeys) {
            if (key !== 'packages' && key !== 'packages_found' &&
                typeof labelData[key] === 'object' && labelData[key] !== null) {
              // Check if this looks like package data
              const candidate = labelData[key];
              if (Array.isArray(candidate) && candidate.length > 0) {
                packages = candidate;
                break;
              } else if (candidate.Wbn || candidate.waybill || candidate.WBN ||
                        candidate.Name || candidate.Address) {
                // This looks like a package object
                pkg = candidate;
                break;
              }
            }
          }
        }
      } else if (labelData.packagesData && Array.isArray(labelData.packagesData)) {
        packages = labelData.packagesData;
      } else if (labelData.waybills && Array.isArray(labelData.waybills)) {
        packages = labelData.waybills;
      } else if (labelData.data && Array.isArray(labelData.data)) {
        packages = labelData.data;
      } else if (typeof labelData === 'object' && !Array.isArray(labelData)) {
        // Try object format where waybill is the key
        const keys = Object.keys(labelData);
        if (keys.length > 0) {
          // Check if keys look like waybill numbers (long numeric strings)
          const waybillKey = keys.find(k => /^\d{10,}$/.test(k));
          if (waybillKey) {
            pkg = labelData[waybillKey];
          } else {
            // Check if any key contains package data (not metadata like packages_found)
            const dataKeys = keys.filter(k =>
              k !== 'packages_found' &&
              k !== 'packages' &&
              typeof labelData[k] === 'object' &&
              labelData[k] !== null
            );
            if (dataKeys.length > 0) {
              // Use first data key
              pkg = labelData[dataKeys[0]];
            } else {
              // Use first key's value if it's an object
              const firstKey = keys[0];
              if (typeof labelData[firstKey] === 'object' && labelData[firstKey] !== null) {
                pkg = labelData[firstKey];
              }
            }
          }
        }

        // If still no package, try to use labelData itself as the package
        if (!pkg && (labelData.Wbn || labelData.waybill || labelData.WBN || waybill)) {
          pkg = labelData;
        }
      }

      // If we have packages array, get first one
      if (packages.length > 0 && !pkg) {
        pkg = packages[0];
      }

      // If still no package data, try to construct from available data
      if (!pkg) {
        logger.warn('⚠️ No package array found, attempting to use labelData directly', {
          labelDataKeys: Object.keys(labelData),
          labelDataType: typeof labelData,
          hasPackages: !!labelData.packages,
          packagesLength: labelData.packages?.length || 0,
          packagesFound: labelData.packages_found
        });

        // Try using labelData as package if it has required fields
        if (labelData && typeof labelData === 'object' && (labelData.Wbn || labelData.waybill || labelData.WBN || waybill)) {
          pkg = labelData;
        } else if (labelData && typeof labelData === 'object' && Object.keys(labelData).length > 0) {
          // Last resort: if labelData has any keys, try to use it (might be a single package object)
          // But only if it doesn't look like a metadata wrapper
          const metadataKeys = ['packages', 'packages_found', 'status', 'message', 'error'];
          const hasOnlyMetadata = Object.keys(labelData).every(k => metadataKeys.includes(k));
          if (!hasOnlyMetadata) {
            pkg = labelData;
          } else {
            throw new Error(`No package data found in label response. Available keys: ${Object.keys(labelData).join(', ')}. Packages found: ${labelData.packages_found || 0}`);
          }
        } else {
          throw new Error(`No package data found in label response. Available keys: ${Object.keys(labelData || {}).join(', ')}`);
        }
      }

      // Log package structure
      logger.info('📦 Package keys:', Object.keys(pkg));

      // Extract barcode image (base64 or URL)
      const barcodeImage = pkg.Barcode ||
                          pkg.barcode ||
                          pkg.barcode_image ||
                          pkg.barcodeImage ||
                          '';

      const delhiveryLogo = pkg['Delhivery logo'] ||
                           pkg.logo ||
                           pkg.delhiveryLogo ||
                           pkg.delhivery_logo ||
                           '';

      // Get AWB with all possible field names
      const awb = pkg.Wbn ||
                 pkg.waybill ||
                 pkg.Waybill ||
                 pkg.AWB ||
                 pkg.wbn ||
                 pkg.waybill_number ||
                 waybill ||
                 'N/A';

      logger.info('📦 Package data extracted', {
        hasBarcode: !!barcodeImage,
        hasLogo: !!delhiveryLogo,
        awb: awb,
        allKeys: Object.keys(pkg)
      });

      // Extract all data with Delhivery priority, then order fallback
      const customerName = pkg.Name || pkg.customerName || order?.customer_info?.buyer_name || 'N/A';
      const customerPhone = pkg.Cnph || pkg.phone || order?.customer_info?.phone || 'N/A';
      const deliveryAddress = pkg.Address || pkg.address || order?.delivery_address?.full_address || 'N/A';
      const deliveryCity = pkg['Destination city'] || pkg.destinationCity || order?.delivery_address?.city || 'N/A';
      const deliveryState = pkg['Customer state'] || pkg.customerState || order?.delivery_address?.state || 'N/A';
      const deliveryPincode = pkg.Pin || pkg.pincode || order?.delivery_address?.pincode || 'N/A';

      const orderId = pkg.Oid || pkg.orderId || order?.order_id || 'N/A';
      const referenceId = order?.reference_id || `REF-${awb.slice(-10)}`;
      const invoiceRef = pkg['Invoice reference'] || pkg.invoiceReference || order?.invoice_number || 'N/A';
      const invoiceDate = order?.order_date || order?.createdAt || new Date();

      const weight = pkg.Weight || pkg.weight || order?.package_info?.weight || '0.5';
      const dimensions = order?.package_info?.dimensions ?
        `${order.package_info.dimensions.length}x${order.package_info.dimensions.width}x${order.package_info.dimensions.height} CM` :
        '10x10x10 CM';

      const paymentMode = pkg.Pt || order?.payment_info?.payment_mode || 'Prepaid';
      const codAmount = pkg.Cod || (order?.payment_info?.payment_mode === 'COD' ? order?.payment_info?.cod_amount : 0);
      const orderValue = order?.payment_info?.order_value || 0;
      const shippingCharges = order?.payment_info?.shipping_charges || 0;
      const totalAmount = order?.payment_info?.total_amount || (orderValue + shippingCharges);

      // Origin/Seller info
      const originName = pkg.Origin || order?.pickup_address?.name || 'N/A';
      const originAddress = pkg.Sadd || order?.pickup_address?.full_address || 'N/A';
      const originCity = pkg['Origin city'] || order?.pickup_address?.city || 'N/A';
      const originState = pkg['Origin state'] || order?.pickup_address?.state || 'N/A';
      const originPincode = pkg.Rpin || order?.pickup_address?.pincode || 'N/A';

      const companyName = order?.seller_info?.name || order?.user_id?.company_name || originName;
      const companyGstin = order?.seller_info?.gst_number || order?.user_id?.gst_number || '';
      const sellerName = order?.seller_info?.reseller_name || order?.user_id?.your_name || originName;
      const companyPhone = order?.pickup_address?.phone || order?.user_id?.phone_number || '';

      // Products
      const products = Array.isArray(order?.products) ? order.products : [
        { product_name: pkg.Prd || 'Product 1', sku: 'SKU001', quantity: pkg.Qty || 1, unit_price: orderValue || 100 }
      ];

      const specialInstructions = order?.special_instructions || order?.internal_notes || '';

      // Get label settings visibility (default to true if not set)
      const visibility = labelSettings?.component_visibility || {};
      const showComponent = (component) => visibility[component] !== false;

      // Get logo URL from settings
      const useOrderChannelLogo = labelSettings?.use_order_channel_logo || false;
      const labelLogoUrl = labelSettings?.logo_url || '';
      const companyLogoUrl = useOrderChannelLogo
        ? (order?.seller_info?.logo_url || order?.user_id?.company_logo_url || '')
        : (labelLogoUrl || order?.user_id?.company_logo_url || '');

      // Courier name
      const courierName = 'Delhivery';

      // Brand info (for company branding section)
      const brandName = order?.user_id?.company_name || companyName || 'SHIPPING COMPANY';
      const brandMobile = companyPhone || '';

      // Get label format configuration
      const labelFormat = this.getLabelFormat(format);
      const labelWidth = labelFormat.width;

      const formatCurrency = (amount) => {
        if (!amount) return '₹0';
        return `₹${parseFloat(amount).toFixed(0)}`;
      };

      const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      };

      // Build HTML for shipping label with new horizontal layout
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Shipping Label - ${orderId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      padding: 0;
      margin: 0;
      font-size: 8px;
      line-height: 1.2;
      background: white;
    }
    @page {
      size: ${labelWidth} auto;
      margin: 0;
    }

    /* Label Container - Dynamic size based on format */
    .label-container {
      width: ${labelWidth};
      min-height: auto;
      border: 1px solid #000;
      display: flex;
      flex-direction: column;
      background: white;
      margin: 0;
    }

    /* Section 1: Header - Ship To (left) + Company Branding (right) */
    .label-section-header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      min-height: 70px;
    }
    .ship-to-section {
      padding: 6px 8px;
    }
    .ship-to-label {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 2px;
    }
    .ship-to-name {
      font-weight: bold;
      font-size: 9px;
      margin-bottom: 1px;
    }
    .ship-to-address {
      font-size: 7.5px;
      line-height: 1.3;
      margin-bottom: 1px;
    }
    .ship-to-city {
      font-size: 7.5px;
      color: #0066cc;
    }
    .ship-to-phone {
      font-size: 7.5px;
      margin-top: 2px;
    }
    .company-branding-section {
      padding: 6px 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .company-logo-preview {
      max-width: 100px;
      max-height: 35px;
      object-fit: contain;
      margin-bottom: 2px;
    }
    .company-brand-name {
      font-weight: bold;
      font-size: 10px;
      font-style: italic;
      margin-bottom: 1px;
    }
    .company-mob {
      font-size: 7px;
      font-weight: bold;
    }

    /* Section 2: Courier & Payment Info Row */
    .label-section-courier {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      min-height: 60px;
    }
    .courier-section {
      padding: 6px 8px;
    }
    .courier-name {
      font-weight: bold;
      font-size: 8px;
      margin-bottom: 4px;
    }
    .courier-name span {
      font-weight: normal;
    }
    .awb-barcode {
      height: 22mm;
      width: 47.625mm;
      max-width: 100%;
      margin-bottom: 2px;
    }
    .awb-barcode img {
      height: 22mm;
      width: 100%;
      max-width: 47.625mm;
      object-fit: contain;
    }
    .awb-number {
      font-weight: bold;
      font-size: 8px;
    }
    .awb-number span {
      font-weight: normal;
    }
    .payment-info-section {
      padding: 6px 8px;
      font-size: 7.5px;
    }
    .payment-info-row {
      margin-bottom: 1px;
      display: flex;
    }
    .payment-info-label {
      color: #0066cc;
      min-width: 70px;
    }
    .payment-info-value {
      font-weight: normal;
    }

    /* Section 3: Shipped By & Order Info Row */
    .label-section-shipped {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      min-height: 80px;
    }
    .shipped-by-section {
      padding: 6px 8px;
    }
    .shipped-by-label {
      font-weight: bold;
      font-size: 8px;
      margin-bottom: 2px;
    }
    .shipped-by-label span {
      font-weight: normal;
      color: #0066cc;
      font-size: 7px;
    }
    .shipped-by-company {
      font-weight: bold;
      font-size: 8px;
      margin-bottom: 1px;
    }
    .shipped-by-gstin {
      font-size: 7px;
      margin-bottom: 1px;
    }
    .shipped-by-gstin span {
      font-weight: bold;
    }
    .shipped-by-name {
      font-size: 7.5px;
      margin-bottom: 1px;
    }
    .shipped-by-address {
      font-size: 7px;
      line-height: 1.2;
      margin-bottom: 1px;
    }
    .shipped-by-city {
      font-size: 7px;
      color: #0066cc;
    }
    .shipped-by-phone {
      font-size: 7.5px;
      margin-top: 2px;
    }
    .order-info-section {
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .order-id-row {
      font-size: 8px;
      margin-bottom: 4px;
      text-align: center;
    }
    .order-id-label {
      font-weight: bold;
    }
    .order-barcode {
      width: 47.625mm;
      max-width: 100%;
      height: 10.583mm;
      margin-bottom: 2px;
    }
    .order-barcode img {
      height: 10.583mm;
      width: 100%;
      max-width: 47.625mm;
      object-fit: contain;
    }
    .reference-id {
      font-size: 7px;
      margin-bottom: 4px;
    }
    .reference-id span {
      font-weight: bold;
    }
    .payment-badge {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      letter-spacing: 2px;
    }
    .payment-badge.prepaid {
      color: #0066cc;
    }
    .payment-badge.cod {
      color: #cc0000;
    }

    /* Section 4: Product Table */
    .label-section-products {
      padding: 4px 8px;
      border-bottom: 1px solid #000;
    }
    .products-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.5px;
    }
    .products-table th {
      background: #1a3a5c;
      color: white;
      padding: 3px 4px;
      text-align: left;
      font-weight: 600;
      font-size: 7px;
    }
    .products-table td {
      padding: 3px 4px;
      border-bottom: 1px solid #ddd;
    }
    .products-table .amount-col {
      text-align: right;
    }
    .products-table .qty-col {
      text-align: center;
    }
    .shipping-charge-row {
      font-size: 7px;
      text-align: right;
      padding: 2px 4px;
      margin-top: 2px;
    }
    .total-row {
      font-size: 8px;
      font-weight: bold;
      text-align: right;
      padding: 2px 4px;
    }

    /* Section 5: Footer */
    .label-section-footer {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 4px 8px;
      font-size: 6px;
      align-items: center;
      background: #f5f5f5;
    }
    .footer-disclaimer {
      font-size: 5.5px;
      line-height: 1.3;
      color: #333;
    }
    .footer-disclaimer p {
      margin: 0 0 1px 0;
    }
    .footer-branding {
      text-align: right;
      font-size: 6px;
    }
    .footer-branding-label {
      font-style: italic;
      color: #666;
    }
    .footer-branding-logo {
      max-height: 20px;
      max-width: 60px;
      object-fit: contain;
    }

    @media print {
      body { padding: 0; margin: 0; }
      .label-container { border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <div class="label-container">
    <!-- Section 1: Header - Ship To (left) + Company Branding (right) -->
    <div class="label-section-header">
      <div class="ship-to-section">
        <div class="ship-to-label">Ship To:</div>
        <div class="ship-to-name">${customerName}</div>
        <div class="ship-to-address">${deliveryAddress}</div>
        <div class="ship-to-city">${deliveryCity}, ${deliveryPincode}, India</div>
        ${showComponent('customer_phone') ? `<div class="ship-to-phone"><strong>Mobile Number:</strong> ${customerPhone}</div>` : ''}
      </div>
      <div class="company-branding-section">
        ${showComponent('logo') && companyLogoUrl ? `<img src="${companyLogoUrl}" class="company-logo-preview" alt="Company Logo">` : ''}
        <div class="company-brand-name">${brandName}</div>
        ${brandMobile ? `<div class="company-mob">Mob. : ${brandMobile}</div>` : ''}
      </div>
    </div>

    <!-- Section 2: Payment Info (left) & Courier/AWB Barcode (right) -->
    <div class="label-section-courier">
      <div class="payment-info-section">
        ${showComponent('dimensions') ? `<div class="payment-info-row"><span class="payment-info-label">Dimensions:</span><span class="payment-info-value">${dimensions}</span></div>` : ''}
        ${showComponent('weight') ? `<div class="payment-info-row"><span class="payment-info-label">Weight:</span><span class="payment-info-value">${weight}Kg</span></div>` : ''}
        ${showComponent('payment_type') ? `<div class="payment-info-row"><span class="payment-info-label">Payment:</span><span class="payment-info-value">${paymentMode}</span></div>` : ''}
        ${showComponent('invoice_number') ? `<div class="payment-info-row"><span class="payment-info-label">Invoice No:</span><span class="payment-info-value">${invoiceRef}</span></div>` : ''}
        ${showComponent('invoice_date') ? `<div class="payment-info-row"><span class="payment-info-label">Invoice Date:</span><span class="payment-info-value">${formatDate(invoiceDate)}</span></div>` : ''}
      </div>
      <div class="courier-section">
        <div class="courier-name">Courier: <span>${courierName}</span></div>
        <div class="awb-barcode">
          ${barcodeImage ? `<img src="${barcodeImage}" alt="AWB Barcode">` : '<div style="height:22mm;width:47.625mm;max-width:100%;background:repeating-linear-gradient(90deg,#000,#000 2px,#fff 2px,#fff 4px);"></div>'}
        </div>
        <div class="awb-number">AWB: <span>${awb}</span></div>
      </div>
    </div>

    <!-- Section 3: Shipped By & Order Info Row -->
    <div class="label-section-shipped">
      <div class="shipped-by-section">
        <div class="shipped-by-label">Shipped By: <span>(if undelivered, return to)</span></div>
        ${showComponent('company_name') ? `<div class="shipped-by-company">${companyName}</div>` : ''}
        ${showComponent('company_gstin') && companyGstin ? `<div class="shipped-by-gstin"><span>GSTIN:</span> ${companyGstin}</div>` : ''}
        <div class="shipped-by-name">${sellerName}</div>
        ${showComponent('pickup_address') ? `
          <div class="shipped-by-address">${originAddress}</div>
          <div class="shipped-by-city">${originState}, ${originPincode}, India</div>
        ` : ''}
        ${showComponent('company_phone') && companyPhone ? `<div class="shipped-by-phone"><strong>Mobile Number:</strong><br/>${companyPhone}</div>` : ''}
      </div>
      <div class="order-info-section">
        <div class="order-id-row"><span class="order-id-label">Order ID:</span> ${orderId}</div>
        <div class="order-barcode">
          ${barcodeImage ? `<img src="${barcodeImage}" alt="Order Barcode">` : '<div style="height:10.583mm;width:47.625mm;background:repeating-linear-gradient(90deg,#000,#000 2px,#fff 2px,#fff 4px);"></div>'}
        </div>
        <div class="reference-id"><span>Reference ID:</span> ${referenceId}</div>
        <div class="payment-badge ${paymentMode.toLowerCase()}">${paymentMode.toUpperCase()}</div>
      </div>
    </div>

    <!-- Section 4: Product Table -->
    <div class="label-section-products">
      <table class="products-table">
        <thead>
          <tr>
            ${showComponent('sku') ? '<th>SKU</th>' : ''}
            <th>Item</th>
            <th class="qty-col">Qty</th>
            <th class="amount-col">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((item, index) => `
            <tr>
              ${showComponent('sku') ? `<td>${item.sku || item.hsn_code || '-'}</td>` : ''}
              <td>${showComponent('product_name') ? (item.product_name || '-') : `Item ${index + 1}`}</td>
              <td class="qty-col">${item.quantity || 1}</td>
              <td class="amount-col">${(showComponent('amount_prepaid') || showComponent('amount_cod')) ? formatCurrency((item.unit_price || 0) * (item.quantity || 1)) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${showComponent('shipping_charges') && shippingCharges > 0 ? `<div class="shipping-charge-row">Shipping Charge: ${formatCurrency(shippingCharges)}</div>` : ''}
      ${(showComponent('amount_prepaid') || showComponent('amount_cod')) ? `<div class="total-row">Total: ${formatCurrency(totalAmount)}</div>` : ''}
    </div>

    <!-- Section 5: Footer -->
    <div class="label-section-footer">
      <div class="footer-disclaimer">
        <p>1) Shipsarthi is not liable for product issues, delays, loss, or damage, and all claims are governed by the carrier's policies and decisions.</p>
        <p>2) Goods once sold will only be taken back as per the store's exchange/return policy.</p>
        <p>3) Please refer to www.shipsarthi.com for Terms & Conditions.</p>
      </div>
      <div class="footer-branding">
        <div class="footer-branding-label">Powered by:</div>
        <img src="https://shipsarthi.com/shipsarthi-logo.png" class="footer-branding-logo" alt="Shipsarthi" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span style="display:none;font-weight:bold;font-size:9px;color:#1a3a5c;">Shipsarthi</span>
      </div>
    </div>

  </div>

  <!-- Auto-print script -->
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 1000);
    };
  </script>
</body>
</html>
      `;

      return html;

    } catch (error) {
      logger.error('❌ Error generating label HTML', error);
      throw error;
    }
  }

  /**
   * Render label with specified format
   * @param {Object} order - Order object
   * @param {Object} labelData - Label data from Delhivery API
   * @param {string} format - Format type: 'Thermal', 'Standard', '2 In One', '4 In One'
   * @param {Object} labelSettings - User's label settings for visibility control
   * @returns {string} HTML string for the label
   */
  static renderLabel(order, labelData, format = 'Thermal', labelSettings = {}) {
    // Use generateLabelHTML for consistent output with format
    return this.generateLabelHTML(labelData, order?.delhivery_data?.waybill, order, labelSettings, format);
  }

  /**
   * Combine multiple labels into a single HTML document
   * @param {Array<string>} labelsHtml - Array of individual label HTML strings
   * @param {string} format - Format type for page breaks
   * @returns {string} Combined HTML document
   */
  static combineLabels(labelsHtml, format = 'thermal') {
    if (!labelsHtml || labelsHtml.length === 0) {
      return '<html><body><h1>No labels to print</h1></body></html>';
    }

    // Extract CSS styles from the first label (all labels have same styles)
    let labelStyles = '';
    if (labelsHtml.length > 0) {
      const styleMatch = labelsHtml[0].match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        labelStyles = styleMatch[1];
      }
    }

    // Extract just the label content from each HTML
    const labelContents = labelsHtml.map(html => {
      // Extract body content
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        // Remove auto-print scripts from individual labels
        return bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '');
      }
      return html;
    });

    // Format mapping for page sizing
    const formatConfig = {
      'thermal': { width: '100mm', height: '150mm', perRow: 1 },
      'Thermal': { width: '100mm', height: '150mm', perRow: 1 },
      'standard': { width: '100mm', height: '150mm', perRow: 1 },
      'Standard': { width: '100mm', height: '150mm', perRow: 1 },
      '2in1': { width: '100mm', height: '150mm', perRow: 2 },
      '2 In One': { width: '100mm', height: '150mm', perRow: 2 },
      '4in1': { width: '100mm', height: '150mm', perRow: 2, rows: 2 },
      '4 In One': { width: '100mm', height: '150mm', perRow: 2, rows: 2 }
    };

    const config = formatConfig[format] || formatConfig['thermal'];

    let combinedContent = '';

    if (format === '2in1' || format === '2 In One') {
      // 2 labels per page on A4
      for (let i = 0; i < labelContents.length; i += 2) {
        const labelPair = labelContents.slice(i, i + 2);
        const needsPageBreak = i + 2 < labelContents.length;
        combinedContent += `
          <div class="page-container ${needsPageBreak ? 'page-break' : ''}">
            <div class="labels-row">
              ${labelPair.map(label => `<div class="label-slot">${label}</div>`).join('')}
            </div>
          </div>
        `;
      }
    } else if (format === '4in1' || format === '4 In One') {
      // 4 labels per page on A4 (2x2 grid)
      for (let i = 0; i < labelContents.length; i += 4) {
        const labelQuad = labelContents.slice(i, i + 4);
        const needsPageBreak = i + 4 < labelContents.length;
        combinedContent += `
          <div class="page-container ${needsPageBreak ? 'page-break' : ''}">
            <div class="labels-grid">
              ${labelQuad.map(label => `<div class="label-slot">${label}</div>`).join('')}
            </div>
          </div>
        `;
      }
    } else {
      // Single label per page (thermal/standard)
      combinedContent = labelContents.map((label, index) => `
        <div class="page-container ${index < labelContents.length - 1 ? 'page-break' : ''}">
          ${label}
        </div>
      `).join('');
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bulk Shipping Labels - Shipsarthi</title>
  <style>
    /* Include original label styles */
    ${labelStyles}

    /* Bulk print specific styles */
    @page {
      size: ${format === '2in1' || format === '2 In One' || format === '4in1' || format === '4 In One' ? 'A4' : '100mm 150mm'};
      margin: 3mm;
    }

    body {
      margin: 0;
      padding: 5mm;
      font-family: Arial, sans-serif;
      background: white;
    }

    .print-header {
      text-align: center;
      margin-bottom: 10px;
      padding: 10px;
    }

    .print-header h2 {
      margin: 0 0 10px 0;
      font-size: 18px;
    }

    .print-header button {
      padding: 10px 20px;
      cursor: pointer;
      font-size: 14px;
      border: 1px solid #000;
      background: #fff;
      border-radius: 4px;
    }

    .print-header button:hover {
      background: #f0f0f0;
    }

    .page-container {
      margin-bottom: 5mm;
    }

    .page-break {
      page-break-after: always;
    }

    .labels-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 3mm;
    }

    .labels-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 3mm;
      justify-items: center;
    }

    .label-slot {
      width: ${config.width};
      overflow: hidden;
      border: 1px solid #ccc;
      background: white;
    }

    /* Ensure label container fits within slot */
    .label-slot .label-container {
      width: 100% !important;
      max-width: ${config.width} !important;
      transform-origin: top left;
    }

    /* Constrain non-barcode images within labels */
    .label-slot img {
      max-width: 100% !important;
    }

    .label-slot .company-logo-preview {
      max-width: 80px !important;
      max-height: 30px !important;
      height: auto !important;
      object-fit: contain !important;
    }

    .label-slot .footer-branding-logo {
      max-width: 50px !important;
      max-height: 18px !important;
      height: auto !important;
      object-fit: contain !important;
    }

    .label-slot .awb-barcode img {
      height: 22mm !important;
      width: 100% !important;
      max-width: 47.625mm !important;
      object-fit: contain !important;
    }

    .label-slot .order-barcode img {
      height: 10.583mm !important;
      width: 100% !important;
      max-width: 47.625mm !important;
      object-fit: contain !important;
    }

    @media print {
      .print-header {
        display: none;
      }
      body {
        padding: 0;
        margin: 0;
      }
      .page-container {
        margin-bottom: 0;
      }
    }

    @media screen {
      .label-slot {
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 5mm;
      }
    }
  </style>
</head>
<body>
  <div class="print-header">
    <h2>Bulk Shipping Labels (${labelsHtml.length} labels)</h2>
    <button onclick="window.print()">Print All Labels</button>
  </div>
  ${combinedContent}
  <script>
    // Auto-print after 2 seconds
    setTimeout(function() {
      window.print();
    }, 2000);
  </script>
</body>
</html>
    `;
  }
}

module.exports = LabelRenderer;
module.exports.LABEL_FORMATS = LABEL_FORMATS;

