const logger = require('../utils/logger');

/**
 * Label Renderer Service
 * Converts Delhivery JSON response to printable HTML/PDF format
 *
 * SHIPPING LABEL DIMENSIONS (Industry Standard):
 * - Thermal (1-in-1): 4" x 6" (100mm x 150mm) - Direct thermal printer
 * - Standard (1-in-1): 4" x 6" (100mm x 150mm) - Single label per sheet
 * - 2-in-1: Two labels on A4 portrait (210mm x 297mm)
 * - 4-in-1: Four labels on A4 (210mm x 297mm) — 2x2 grid
 *
 * A4 4-in-1 Layout (from dimension diagram):
 * - Paper: 210mm x 297mm
 * - Label: 95mm x 140mm
 * - Margins: 7.5mm left/right, 5mm top
 * - Gap: 5mm horizontal, 5mm vertical
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
    width: '95mm',
    height: '140mm',
    labelsPerSheet: 2,
    paperType: 'A4',
    paperWidth: '210mm',
    paperHeight: '297mm'
  },
  FOUR_IN_ONE: {
    name: '4 In One',
    width: '95mm',
    height: '140mm',
    labelsPerSheet: 4,
    paperType: 'A4',
    paperWidth: '210mm',
    paperHeight: '297mm'
  }
};

class LabelRenderer {

  /**
   * Get label format configuration
   */
  static getLabelFormat(format) {
    const formatMap = {
      'thermal': LABEL_FORMATS.THERMAL,
      'standard': LABEL_FORMATS.STANDARD,
      '2in1': LABEL_FORMATS.TWO_IN_ONE,
      '4in1': LABEL_FORMATS.FOUR_IN_ONE,
      'Thermal': LABEL_FORMATS.THERMAL,
      'Standard': LABEL_FORMATS.STANDARD,
      '2 In One': LABEL_FORMATS.TWO_IN_ONE,
      '4 In One': LABEL_FORMATS.FOUR_IN_ONE
    };
    return formatMap[format] || LABEL_FORMATS.STANDARD;
  }

  /**
   * Convert Delhivery JSON response to printable HTML label
   * Layout matches reference: Header → COD/Payment → Courier/AWB → AWB Number → Routing → Products → Shipped By → Footer
   */
  static generateLabelHTML(labelData, waybill = null, order = null, labelSettings = {}, format = 'Thermal') {
    try {
      logger.info('Generating label HTML from Delhivery data');

      // --- Parse package data from Delhivery response (unchanged logic) ---
      let packages = [];
      let pkg = null;

      if (Array.isArray(labelData)) {
        packages = labelData;
      } else if (labelData.packages && Array.isArray(labelData.packages)) {
        packages = labelData.packages;
        if (packages.length === 0 && labelData.packages_found && labelData.packages_found > 0) {
          const allKeys = Object.keys(labelData);
          for (const key of allKeys) {
            if (key !== 'packages' && key !== 'packages_found' &&
                typeof labelData[key] === 'object' && labelData[key] !== null) {
              const candidate = labelData[key];
              if (Array.isArray(candidate) && candidate.length > 0) {
                packages = candidate;
                break;
              } else if (candidate.Wbn || candidate.waybill || candidate.WBN ||
                        candidate.Name || candidate.Address) {
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
        const keys = Object.keys(labelData);
        if (keys.length > 0) {
          const waybillKey = keys.find(k => /^\d{10,}$/.test(k));
          if (waybillKey) {
            pkg = labelData[waybillKey];
          } else {
            const dataKeys = keys.filter(k =>
              k !== 'packages_found' && k !== 'packages' &&
              typeof labelData[k] === 'object' && labelData[k] !== null
            );
            if (dataKeys.length > 0) {
              pkg = labelData[dataKeys[0]];
            } else {
              const firstKey = keys[0];
              if (typeof labelData[firstKey] === 'object' && labelData[firstKey] !== null) {
                pkg = labelData[firstKey];
              }
            }
          }
        }
        if (!pkg && (labelData.Wbn || labelData.waybill || labelData.WBN || waybill)) {
          pkg = labelData;
        }
      }

      if (packages.length > 0 && !pkg) {
        pkg = packages[0];
      }

      if (!pkg) {
        if (labelData && typeof labelData === 'object' && (labelData.Wbn || labelData.waybill || labelData.WBN || waybill)) {
          pkg = labelData;
        } else if (labelData && typeof labelData === 'object' && Object.keys(labelData).length > 0) {
          const metadataKeys = ['packages', 'packages_found', 'status', 'message', 'error'];
          const hasOnlyMetadata = Object.keys(labelData).every(k => metadataKeys.includes(k));
          if (!hasOnlyMetadata) {
            pkg = labelData;
          } else {
            throw new Error(`No package data found. Keys: ${Object.keys(labelData).join(', ')}`);
          }
        } else {
          throw new Error(`No package data found. Keys: ${Object.keys(labelData || {}).join(', ')}`);
        }
      }

      // --- Extract data fields ---
      const barcodeImage = pkg.Barcode || pkg.barcode || pkg.barcode_image || pkg.barcodeImage || '';

      const awb = pkg.Wbn || pkg.waybill || pkg.Waybill || pkg.AWB || pkg.wbn || pkg.waybill_number || waybill || 'N/A';

      const customerName = pkg.Name || pkg.customerName || order?.customer_info?.buyer_name || 'N/A';
      const customerPhone = pkg.Cnph || pkg.phone || order?.customer_info?.phone || 'N/A';
      const deliveryAddress = pkg.Address || pkg.address || order?.delivery_address?.full_address || 'N/A';
      const deliveryCity = pkg['Destination city'] || pkg.destinationCity || order?.delivery_address?.city || 'N/A';
      const deliveryState = pkg['Customer state'] || pkg.customerState || order?.delivery_address?.state || 'N/A';
      const deliveryPincode = pkg.Pin || pkg.pincode || order?.delivery_address?.pincode || 'N/A';

      const orderId = pkg.Oid || pkg.orderId || order?.order_id || 'N/A';
      const referenceId = order?.reference_id || `REF-${awb.slice(-10)}`;
      const invoiceRef = pkg['Invoice reference'] || pkg.invoiceReference || order?.invoice_number || '';
      const invoiceDate = order?.order_date || order?.createdAt || new Date();

      const weight = pkg.Weight || pkg.weight || order?.package_info?.weight || '';
      const dimensions = order?.package_info?.dimensions ?
        `${order.package_info.dimensions.length}x${order.package_info.dimensions.width}x${order.package_info.dimensions.height} CM` : '';
      const ewaybillNo = order?.ewaybill_number || '';

      const paymentMode = pkg.Pt || order?.payment_info?.payment_mode || 'Prepaid';
      const isCOD = paymentMode.toUpperCase() === 'COD';
      const codAmount = pkg.Cod || (isCOD ? order?.payment_info?.cod_amount : 0);
      const orderValue = order?.payment_info?.order_value || 0;
      const invoiceValue = order?.payment_info?.invoice_value || orderValue || 0;
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

      const products = Array.isArray(order?.products) ? order.products : [
        { product_name: pkg.Prd || 'Product 1', sku: 'SKU001', quantity: pkg.Qty || 1, unit_price: orderValue || 100 }
      ];

      // Label settings visibility
      const visibility = labelSettings?.component_visibility || {};
      const showComponent = (component) => visibility[component] !== false;

      // Logo
      const useOrderChannelLogo = labelSettings?.use_order_channel_logo || false;
      const labelLogoUrl = labelSettings?.logo_url || '';
      const companyLogoUrl = useOrderChannelLogo
        ? (order?.seller_info?.logo_url || order?.user_id?.company_logo_url || '')
        : (labelLogoUrl || order?.user_id?.company_logo_url || '');

      const courierName = order?.courier_name || 'Delhivery';
      const courierMode = order?.courier_mode || 'Air';
      const brandName = order?.user_id?.company_name || companyName || 'SHIPPING COMPANY';
      const brandMobile = companyPhone || '';

      // Routing code
      const routingCode = pkg.RoutingCode || pkg.routing_code || order?.routing_code || '';

      // Get label format
      const labelFormat = this.getLabelFormat(format);
      const labelWidth = labelFormat.width;
      const labelHeight = labelFormat.height;
      const isThermal = format === 'thermal' || format === 'Thermal';
      const isStandard = format === 'standard' || format === 'Standard';

      const formatCurrency = (amount) => {
        if (!amount) return '₹0';
        return `₹${parseFloat(amount).toFixed(0)}`;
      };

      const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      };

      // Barcode fallback (CSS pattern)
      const barcodeFallback = '<div style="height:50px;background:repeating-linear-gradient(90deg,#000,#000 2px,#fff 2px,#fff 4px);width:100%;"></div>';

      // Build HTML matching reference screenshot layout
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Shipping Label - ${orderId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      padding: 0; margin: 0;
      font-size: 9px;
      line-height: 1.3;
      background: white;
    }
    @page {
      size: ${isThermal || isStandard ? '100mm 150mm' : labelWidth + ' ' + labelHeight};
      margin: 0;
    }

    .label-container {
      width: ${labelWidth};
      ${isThermal || isStandard ? 'height: 150mm;' : `height: ${labelHeight};`}
      border: 1.5px solid #333;
      display: flex;
      flex-direction: column;
      background: white;
      margin: 0;
      overflow: hidden;
    }

    /* ===== Section 1: Header — Ship To + Logo ===== */
    .section-header {
      display: grid;
      grid-template-columns: 1fr auto;
      border-bottom: 1.5px solid #333;
      padding: 6px 10px;
      min-height: 65px;
    }
    .ship-to { }
    .ship-to-label { font-size: 9px; font-weight: bold; margin-bottom: 2px; }
    .ship-to-name { font-size: 11px; font-weight: bold; margin-bottom: 2px; }
    .ship-to-address { font-size: 8.5px; line-height: 1.3; margin-bottom: 2px; }
    .ship-to-city { font-size: 8.5px; color: #1565C0; font-weight: 500; }
    .company-logo-area {
      display: flex; align-items: center; justify-content: center;
      padding-left: 10px;
    }
    .company-logo-area img {
      max-width: 90px; max-height: 50px; object-fit: contain;
    }

    /* ===== Section 2: Payment/COD Block ===== */
    .section-payment {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1.5px solid #333;
    }
    .payment-left {
      padding: 6px 10px;
      border-right: 1px solid #ccc;
    }
    .payment-badge-box {
      background: #1565C0;
      color: white;
      display: inline-block;
      padding: 3px 12px;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .payment-badge-box.prepaid { background: #1565C0; }
    .payment-badge-box.cod { background: #1565C0; }
    .cod-value { font-size: 12px; font-weight: bold; margin-bottom: 3px; }
    .payment-detail { font-size: 8px; margin-bottom: 1px; }
    .payment-detail .lbl { color: #1565C0; font-weight: 600; }

    .payment-right {
      padding: 6px 10px;
      display: flex; flex-direction: column; align-items: flex-end;
    }
    .order-id-text { font-size: 8px; margin-bottom: 4px; }
    .order-id-text span { font-weight: bold; }
    .order-barcode {
      width: 100%; max-width: 160px; margin-bottom: 4px;
    }
    .order-barcode img { width: 100%; height: 50px; object-fit: contain; }
    .ref-id { font-size: 8px; }
    .ref-id span { font-weight: bold; }

    /* ===== Section 3: Courier & Details ===== */
    .section-courier {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1.5px solid #333;
      padding: 6px 10px;
    }
    .courier-details { }
    .detail-row { font-size: 8.5px; margin-bottom: 2px; }
    .detail-row .lbl { color: #1565C0; font-weight: bold; }
    .courier-barcode-area { display: flex; flex-direction: column; align-items: flex-end; }
    .courier-label { font-size: 8.5px; margin-bottom: 4px; }
    .courier-label .lbl { color: #1565C0; font-weight: bold; }
    .courier-label span { font-weight: normal; }
    .awb-barcode-img {
      width: 100%; max-width: 160px; margin-bottom: 2px;
    }
    .awb-barcode-img img { width: 100%; height: 50px; object-fit: contain; }

    /* ===== Section 4: AWB Number ===== */
    .section-awb {
      text-align: center;
      padding: 5px 10px;
      border-bottom: 1.5px solid #333;
    }
    .awb-display { font-size: 12px; font-weight: bold; letter-spacing: 0.5px; }

    /* ===== Section 5: Routing Code ===== */
    .section-routing {
      padding: 4px 10px;
      border-bottom: 1px solid #333;
    }
    .routing-text { font-size: 9px; color: #1565C0; font-weight: bold; }

    /* ===== Section 6: Products Table ===== */
    .section-products {
      padding: 0;
      border-bottom: 1.5px solid #333;
    }
    .products-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .products-table th {
      background: #1a3a5c; color: white; padding: 4px 8px;
      text-align: left; font-weight: 600; font-size: 8px;
    }
    .products-table th.amount-col { text-align: right; }
    .products-table th.qty-col { text-align: center; }
    .products-table td { padding: 4px 8px; border-bottom: 1px solid #ddd; }
    .products-table td.amount-col { text-align: right; }
    .products-table td.qty-col { text-align: center; }
    .total-row { font-size: 9px; font-weight: bold; text-align: right; padding: 3px 8px; }

    /* ===== Section 7: Shipped By ===== */
    .section-shipped {
      padding: 6px 10px;
      border-bottom: 1px solid #333;
      flex-grow: 1;
    }
    .shipped-label { font-size: 9px; font-weight: bold; margin-bottom: 3px; }
    .shipped-label span { font-weight: normal; color: #1565C0; font-size: 8px; }
    .shipped-name { font-size: 9px; font-weight: bold; margin-bottom: 1px; }
    .shipped-address { font-size: 8px; line-height: 1.3; margin-bottom: 1px; }
    .shipped-city { font-size: 8px; color: #1565C0; margin-bottom: 2px; }
    .shipped-detail { font-size: 8px; margin-bottom: 1px; }
    .shipped-detail .lbl { font-weight: bold; }

    /* ===== Section 8: Footer ===== */
    .section-footer {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 4px 8px;
      font-size: 6px;
      align-items: end;
    }
    .footer-disclaimer { font-size: 6px; line-height: 1.4; color: #333; }
    .footer-disclaimer p { margin: 0 0 1px 0; }
    .footer-branding { text-align: right; }
    .footer-branding-label { font-style: italic; color: #666; font-size: 7px; }
    .footer-branding-logo { max-height: 22px; max-width: 70px; object-fit: contain; }

    @media print {
      body { padding: 0; margin: 0; }
      .label-container { border: 1.5px solid #333; }
    }
  </style>
</head>
<body>
  <div class="label-container">

    <!-- Section 1: Header — Ship To + Company Logo -->
    <div class="section-header">
      <div class="ship-to">
        <div class="ship-to-label">Ship To:</div>
        <div class="ship-to-name">${customerName}</div>
        <div class="ship-to-address">${deliveryAddress}</div>
        <div class="ship-to-city">${deliveryCity}, ${deliveryPincode}, India</div>
      </div>
      <div class="company-logo-area">
        ${showComponent('logo') && companyLogoUrl ? `<img src="${companyLogoUrl}" alt="Logo">` : `<div style="font-weight:bold;font-size:14px;font-style:italic;">${brandName}</div>`}
      </div>
    </div>

    <!-- Section 2: Payment/COD Block -->
    <div class="section-payment">
      <div class="payment-left">
        <div class="payment-badge-box ${isCOD ? 'cod' : 'prepaid'}">${paymentMode.toUpperCase()}</div>
        ${isCOD ? `<div class="cod-value">COD Value: ${formatCurrency(codAmount)}</div>` : ''}
        <div class="payment-detail"><span class="lbl">Order Date:</span> ${formatDate(invoiceDate)}</div>
        ${showComponent('invoice_number') ? `<div class="payment-detail"><span class="lbl">Invoice No.:</span> ${invoiceRef || ''}</div>` : ''}
        <div class="payment-detail"><span class="lbl">Invoice Value:</span> ${formatCurrency(invoiceValue)}</div>
      </div>
      <div class="payment-right">
        <div class="order-id-text"><span>Order ID:</span> #${orderId}</div>
        <div class="order-barcode">
          ${barcodeImage ? `<img src="${barcodeImage}" alt="Barcode">` : barcodeFallback}
        </div>
        <div class="ref-id"><span>Ref ID:</span> ${referenceId}</div>
      </div>
    </div>

    <!-- Section 3: Courier & AWB Details -->
    <div class="section-courier">
      <div class="courier-details">
        ${showComponent('dimensions') && dimensions ? `<div class="detail-row"><span class="lbl">Dimensions:</span> ${dimensions}</div>` : '<div class="detail-row"><span class="lbl">Dimensions:</span></div>'}
        ${showComponent('weight') ? `<div class="detail-row"><span class="lbl">Weight:</span> ${weight ? weight + 'Kg' : ''}</div>` : '<div class="detail-row"><span class="lbl">Weight:</span></div>'}
        <div class="detail-row"><span class="lbl">eWaybill No.:</span> ${ewaybillNo}</div>
      </div>
      <div class="courier-barcode-area">
        <div class="courier-label"><span class="lbl">Courier:</span> ${courierName} ${courierMode}</div>
        <div class="awb-barcode-img">
          ${barcodeImage ? `<img src="${barcodeImage}" alt="AWB Barcode">` : barcodeFallback}
        </div>
      </div>
    </div>

    <!-- Section 4: AWB Number -->
    <div class="section-awb">
      <div class="awb-display">AWB: ${awb}</div>
    </div>

    <!-- Section 5: Routing Code -->
    ${routingCode ? `
    <div class="section-routing">
      <div class="routing-text">Routing Code - ${routingCode}</div>
    </div>
    ` : ''}

    <!-- Section 6: Products Table -->
    <div class="section-products">
      <table class="products-table">
        <thead>
          <tr>
            <th>Item</th>
            <th class="qty-col">Qty</th>
            <th class="amount-col">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((item, index) => `
            <tr>
              <td>${showComponent('product_name') ? (item.product_name || '-') : `Item ${index + 1}`}</td>
              <td class="qty-col">${item.quantity || 1}</td>
              <td class="amount-col">${(showComponent('amount_prepaid') || showComponent('amount_cod')) ? formatCurrency((item.unit_price || 0) * (item.quantity || 1)) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${(showComponent('amount_prepaid') || showComponent('amount_cod')) ? `<div class="total-row">Total: ${formatCurrency(totalAmount)}</div>` : ''}
    </div>

    <!-- Section 7: Shipped By (return address) -->
    <div class="section-shipped">
      <div class="shipped-label">Shipped By: <span>(if undelivered, return to)</span></div>
      ${showComponent('company_name') ? `<div class="shipped-name">${sellerName}</div>` : ''}
      ${showComponent('pickup_address') ? `
        <div class="shipped-address">${originAddress}</div>
        <div class="shipped-city">${originState}, ${originPincode}, India</div>
      ` : ''}
      <div class="shipped-detail"><span class="lbl">GST No.:</span> ${companyGstin || ''}</div>
      <div class="shipped-detail"><span class="lbl">Phone No.:</span> ${companyPhone || ''}</div>
    </div>

    <!-- Section 8: Footer -->
    <div class="section-footer">
      <div class="footer-disclaimer">
        <p>1) Shipsarthi is not liable for product issues, delay, loss, or damage, and all claims are governed bythe carrier's policies and decisions.</p>
        <p>2) Goods once sold will only be taken back as per the store's exchange/return policy .</p>
        <p>3) Please refer to www.shipsarthi.com for Terms & Conditions.</p>
      </div>
      <div class="footer-branding">
        <div class="footer-branding-label">Powered by:</div>
        <img src="https://shipsarthi.com/shipsarthi-logo.png" class="footer-branding-logo" alt="Shipsarthi" onerror="this.style.display='none';this.nextElementSibling.style.display='block';" /><span style="display:none;font-weight:bold;font-size:10px;color:#1a3a5c;">Shipsarthi</span>
      </div>
    </div>

  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 1000);
    };
  </script>
</body>
</html>
      `;

      return html;

    } catch (error) {
      logger.error('Error generating label HTML', error);
      throw error;
    }
  }

  /**
   * Render label with specified format
   */
  static renderLabel(order, labelData, format = 'Thermal', labelSettings = {}) {
    return this.generateLabelHTML(labelData, order?.delhivery_data?.waybill, order, labelSettings, format);
  }

  /**
   * Combine multiple labels into a single HTML document for bulk printing
   */
  static combineLabels(labelsHtml, format = 'thermal') {
    if (!labelsHtml || labelsHtml.length === 0) {
      return '<html><body><h1>No labels to print</h1></body></html>';
    }

    // Extract CSS from first label
    let labelStyles = '';
    if (labelsHtml.length > 0) {
      const styleMatch = labelsHtml[0].match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        labelStyles = styleMatch[1];
      }
    }

    // Extract body content from each label
    const labelContents = labelsHtml.map(html => {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        return bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '');
      }
      return html;
    });

    const isA4 = format === '2in1' || format === '2 In One' || format === '4in1' || format === '4 In One';
    const is4in1 = format === '4in1' || format === '4 In One';
    const is2in1 = format === '2in1' || format === '2 In One';

    let combinedContent = '';

    if (is4in1) {
      // 4-in-1: 2x2 grid on A4
      for (let i = 0; i < labelContents.length; i += 4) {
        const labelQuad = labelContents.slice(i, i + 4);
        const needsPageBreak = i + 4 < labelContents.length;
        combinedContent += `
          <div class="page-container ${needsPageBreak ? 'page-break' : ''}">
            <div class="labels-grid-4in1">
              ${labelQuad.map(label => `<div class="label-slot-4in1">${label}</div>`).join('')}
            </div>
          </div>
        `;
      }
    } else if (is2in1) {
      // 2-in-1: 2 labels side by side on A4
      for (let i = 0; i < labelContents.length; i += 2) {
        const labelPair = labelContents.slice(i, i + 2);
        const needsPageBreak = i + 2 < labelContents.length;
        combinedContent += `
          <div class="page-container ${needsPageBreak ? 'page-break' : ''}">
            <div class="labels-row-2in1">
              ${labelPair.map(label => `<div class="label-slot-2in1">${label}</div>`).join('')}
            </div>
          </div>
        `;
      }
    } else {
      // Thermal / Standard: one label per page
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
    /* Individual label styles */
    ${labelStyles}

    /* Bulk print overrides */
    @page {
      size: ${isA4 ? 'A4' : '100mm 150mm'};
      margin: ${isA4 ? '0' : '0'};
    }

    body {
      margin: 0;
      padding: ${isA4 ? '0' : '0'};
      font-family: Arial, Helvetica, sans-serif;
      background: white;
    }

    .print-header {
      text-align: center;
      margin-bottom: 10px;
      padding: 10px;
    }
    .print-header h2 { margin: 0 0 10px 0; font-size: 18px; }
    .print-header button {
      padding: 10px 20px; cursor: pointer; font-size: 14px;
      border: 1px solid #000; background: #fff; border-radius: 4px;
    }
    .print-header button:hover { background: #f0f0f0; }

    .page-container { margin: 0; }
    .page-break { page-break-after: always; }

    /* === 4-in-1 Grid (A4) === */
    /* From dimension diagram: 7.5mm left/right margins, 5mm top, 5mm gaps, 95mm x 140mm labels */
    .labels-grid-4in1 {
      display: grid;
      grid-template-columns: 95mm 95mm;
      grid-template-rows: 140mm 140mm;
      gap: 5mm;
      padding: 5mm 7.5mm;
      width: 210mm;
      height: 297mm;
      justify-content: center;
    }
    .label-slot-4in1 {
      width: 95mm;
      height: 140mm;
      overflow: hidden;
      border: 1px solid #999;
      background: white;
    }
    .label-slot-4in1 .label-container {
      width: 95mm !important;
      height: 140mm !important;
    }

    /* === 2-in-1 Row (A4) === */
    .labels-row-2in1 {
      display: flex;
      justify-content: center;
      gap: 5mm;
      padding: 10mm 7.5mm;
      width: 210mm;
      height: 297mm;
      align-items: flex-start;
    }
    .label-slot-2in1 {
      width: 95mm;
      height: 140mm;
      overflow: hidden;
      border: 1px solid #999;
      background: white;
    }
    .label-slot-2in1 .label-container {
      width: 95mm !important;
      height: 140mm !important;
    }

    /* === Thermal / Standard single label === */
    .page-container > .label-container {
      /* Already sized correctly from individual label styles */
    }

    /* Scale images inside slots */
    .label-slot-4in1 img,
    .label-slot-2in1 img {
      max-width: 100% !important;
    }
    .label-slot-4in1 .company-logo-area img,
    .label-slot-2in1 .company-logo-area img {
      max-width: 70px !important;
      max-height: 40px !important;
    }
    .label-slot-4in1 .awb-barcode-img img,
    .label-slot-4in1 .order-barcode img,
    .label-slot-2in1 .awb-barcode-img img,
    .label-slot-2in1 .order-barcode img {
      height: 40px !important;
    }
    .label-slot-4in1 .footer-branding-logo,
    .label-slot-2in1 .footer-branding-logo {
      max-width: 50px !important;
      max-height: 18px !important;
    }

    /* Reduce font sizes in multi-label formats */
    .label-slot-4in1 .section-header { min-height: 50px; padding: 4px 6px; }
    .label-slot-4in1 .ship-to-name { font-size: 9px; }
    .label-slot-4in1 .ship-to-address { font-size: 7px; }
    .label-slot-4in1 .payment-badge-box { font-size: 14px; padding: 2px 8px; }
    .label-slot-4in1 .cod-value { font-size: 10px; }
    .label-slot-4in1 .awb-display { font-size: 10px; }
    .label-slot-4in1 .section-footer { font-size: 5px; }
    .label-slot-4in1 .footer-disclaimer { font-size: 5px; }

    @media print {
      .print-header { display: none; }
      body { padding: 0; margin: 0; }
      .page-container { margin: 0; }
    }

    @media screen {
      .page-container { margin-bottom: 10mm; }
      .label-slot-4in1, .label-slot-2in1 {
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
    setTimeout(function() { window.print(); }, 2000);
  </script>
</body>
</html>
    `;
  }
}

module.exports = LabelRenderer;
module.exports.LABEL_FORMATS = LABEL_FORMATS;
