// Location: backend/services/excelService.js
const XLSX = require('xlsx');
const cloudinaryService = require('./cloudinaryService');

class ExcelService {
  /**
   * Generate Excel file for invoice shipment list
   * @param {Object} invoice - Invoice document with shipment_charges array
   * @returns {Promise<String>} - Cloudinary URL of uploaded Excel file
   */
  async generateInvoiceShipmentExcel(invoice) {
    try {
      if (!invoice || !invoice.shipment_charges || invoice.shipment_charges.length === 0) {
        throw new Error('Invoice has no shipment charges to export');
      }

      // Prepare data rows
      const rows = invoice.shipment_charges.map(shipment => ({
        'AWB Number': shipment.awb_number || 'N/A',
        'Charged Weight (kg)': shipment.weight?.charged_weight
          ? (shipment.weight.charged_weight / 1000).toFixed(2)
          : '0.00',
        'Pickup Pincode': shipment.pickup_pincode || '',
        'Delivery Pincode': shipment.delivery_pincode || '',
        'Payment Type': shipment.payment_mode || 'Prepaid',
        'Shipment Type': shipment.shipment_status || 'unknown',
        'Courier': 'Delhivery', // Default courier
        'Status': shipment.shipment_status || 'unknown',
        'Zone': shipment.zone || 'N/A',
        'Total Charge': `₹${(shipment.total_charge || 0).toFixed(2)}`
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Set column widths
      const wscols = [
        { wch: 15 }, // AWB Number
        { wch: 18 }, // Charged Weight
        { wch: 15 }, // Pickup Pincode
        { wch: 15 }, // Delivery Pincode
        { wch: 15 }, // Payment Type
        { wch: 15 }, // Shipment Type
        { wch: 12 }, // Courier
        { wch: 15 }, // Status
        { wch: 8 },  // Zone
        { wch: 15 }  // Total Charge
      ];
      ws['!cols'] = wscols;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Shipments');

      // Generate buffer
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Generate filename
      const filename = `invoice_${invoice.invoice_number}_shipments.xlsx`;

      // Upload to Cloudinary
      const uploadResult = await cloudinaryService.uploadFile(excelBuffer, {
        folder: 'shipsarthi/invoices/excel',
        resource_type: 'raw',
        public_id: `invoice_${invoice.invoice_number}_${Date.now()}`,
        format: 'xlsx'
      });

      if (!uploadResult.success) {
        throw new Error('Failed to upload Excel file to Cloudinary');
      }

      return uploadResult.url;
    } catch (error) {
      console.error('Error generating invoice Excel:', error);
      throw new Error(`Failed to generate invoice Excel: ${error.message}`);
    }
  }

  /**
   * Parse client Excel file for bulk operations
   * Expected columns: Client ID, Name, Mobile
   * @param {Buffer} fileBuffer - Excel file buffer from multer
   * @returns {Promise<Array>} - Array of parsed client objects
   */
  async parseClientExcel(fileBuffer) {
    try {
      if (!fileBuffer) {
        throw new Error('No file buffer provided');
      }

      // Read workbook from buffer
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('Excel file has no sheets');
      }

      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false, // Convert dates and numbers to strings
        defval: '' // Default value for empty cells
      });

      if (!jsonData || jsonData.length === 0) {
        throw new Error('Excel file is empty');
      }

      // Parse and validate rows
      const parsedClients = jsonData.map((row, index) => {
        // Support multiple column name variations
        const clientId = row['Client ID'] || row['client_id'] || row['ClientID'] || row['ID'] || '';
        const name = row['Name'] || row['name'] || row['Company Name'] || row['company_name'] || '';
        const mobile = row['Mobile'] || row['mobile'] || row['Phone'] || row['phone'] || row['phone_number'] || '';

        // Validate required fields
        if (!clientId) {
          throw new Error(`Row ${index + 2}: Client ID is required`);
        }

        return {
          client_id: String(clientId).trim(),
          name: String(name).trim(),
          mobile: String(mobile).trim()
        };
      });

      return parsedClients;
    } catch (error) {
      console.error('Error parsing client Excel:', error);
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  /**
   * Generate sample template for client bulk upload
   * @returns {Buffer} - Excel file buffer
   */
  generateClientTemplateExcel() {
    try {
      const sampleData = [
        {
          'Client ID': 'CL12345',
          'Name': 'ABC Company',
          'Mobile': '9876543210'
        },
        {
          'Client ID': 'CL12346',
          'Name': 'XYZ Enterprises',
          'Mobile': '9876543211'
        }
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sampleData);

      // Set column widths
      const wscols = [
        { wch: 15 }, // Client ID
        { wch: 25 }, // Name
        { wch: 15 }  // Mobile
      ];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, 'Clients');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return buffer;
    } catch (error) {
      console.error('Error generating template Excel:', error);
      throw new Error('Failed to generate template Excel');
    }
  }
}

module.exports = new ExcelService();
