import React, { useState } from 'react';
import { adminService } from '../services/adminService';
import '../styles/AdminManualMapping.css';

interface UploadResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{
    row: number;
    awb: string;
    error: string;
  }>;
}

export const AdminManualMapping: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!validTypes.includes(selectedFile.type) &&
          !selectedFile.name.endsWith('.xlsx') &&
          !selectedFile.name.endsWith('.xls')) {
        setError('Please select a valid Excel file (.xlsx or .xls)');
        return;
      }

      setFile(selectedFile);
      setError(null);
      setResults(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await adminService.uploadManualMapping(formData);

      setResults(response.data);
      setFile(null);

      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    // Link to the template file in root
    const link = document.createElement('a');
    link.href = '/MANUAL MAPPING.xlsx';
    link.download = 'MANUAL_MAPPING_TEMPLATE.xlsx';
    link.click();
  };

  return (
    <div className="admin-manual-mapping">
      <div className="page-header">
        <h1>Manual AWB Mapping</h1>
        <p className="subtitle">
          Map externally-generated AWBs (from direct Delhivery bookings) to client accounts
        </p>
      </div>

      <div className="instructions-card">
        <h3>📋 Instructions</h3>
        <ol>
          <li>Download the template and fill in all mandatory fields (marked with *)</li>
          <li><strong>Service Type</strong> column is optional - valid values: "Surface" or "Air" (defaults to Surface if blank)</li>
          <li>Client email must match an existing account in the system</li>
          <li>AWB numbers must be unique (not already in system)</li>
          <li>Upload the completed Excel file below</li>
        </ol>
        <button className="btn-download-template" onClick={downloadTemplate}>
          📥 Download Excel Template
        </button>
      </div>

      <div className="upload-section card">
        <h3>Upload Excel File</h3>

        <div className="file-input-wrapper">
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
          />
          <label htmlFor="file-input" className="file-label">
            {file ? file.name : 'Choose Excel file...'}
          </label>
        </div>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        <button
          className="btn-upload"
          onClick={handleUpload}
          disabled={!file || loading}
        >
          {loading ? 'Processing...' : 'Upload & Process'}
        </button>

        {loading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>Processing Excel file... This may take a moment.</p>
          </div>
        )}
      </div>

      {results && (
        <div className="results-section card">
          <h3>📊 Upload Results</h3>

          <div className="results-summary">
            <div className="stat-card">
              <div className="stat-label">Total Rows</div>
              <div className="stat-value">{results.total}</div>
            </div>
            <div className="stat-card success">
              <div className="stat-label">Successful</div>
              <div className="stat-value">{results.successful}</div>
            </div>
            <div className="stat-card error">
              <div className="stat-label">Failed</div>
              <div className="stat-value">{results.failed}</div>
            </div>
          </div>

          {results.errors.length > 0 && (
            <div className="errors-table">
              <h4>❌ Errors ({results.errors.length})</h4>
              <table>
                <thead>
                  <tr>
                    <th>Row #</th>
                    <th>AWB</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.errors.map((err, idx) => (
                    <tr key={idx}>
                      <td>{err.row}</td>
                      <td className="awb-cell">{err.awb}</td>
                      <td className="error-cell">{err.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results.successful > 0 && (
            <div className="success-message">
              ✅ Successfully mapped {results.successful} order(s).
              Clients can now track these orders in their portal.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
