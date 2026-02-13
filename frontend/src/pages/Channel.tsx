import React from 'react';
import Layout from '../components/Layout';

const Channel: React.FC = () => {
  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-12 text-center">
          {/* SVG Graphic - Integration Hub Icon */}
          <div className="mb-8 flex justify-center">
            <svg className="w-32 h-32" viewBox="0 0 200 200" fill="none">
              {/* Central Hub */}
              <circle cx="100" cy="100" r="20" fill="#002B59" />
              {/* Connection Nodes */}
              <circle cx="50" cy="50" r="12" fill="#F68723" opacity="0.8" />
              <circle cx="150" cy="50" r="12" fill="#21B5B5" opacity="0.8" />
              <circle cx="50" cy="150" r="12" fill="#21B5B5" opacity="0.8" />
              <circle cx="150" cy="150" r="12" fill="#F68723" opacity="0.8" />
              {/* Connection Lines */}
              <line x1="100" y1="100" x2="50" y2="50" stroke="#002B59" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
              <line x1="100" y1="100" x2="150" y2="50" stroke="#002B59" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
              <line x1="100" y1="100" x2="50" y2="150" stroke="#002B59" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
              <line x1="100" y1="100" x2="150" y2="150" stroke="#002B59" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
              {/* Orbital Ring */}
              <circle cx="100" cy="100" r="70" stroke="#21B5B5" strokeWidth="2" fill="none" opacity="0.3" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Channel Integration Coming Soon
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            One-click channel integration will be available soon.
            We apologize for the inconvenience.
          </p>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="p-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">One-Click Setup</h3>
              <p className="text-sm text-gray-600">Quick integration with your platforms</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Auto-Sync Orders</h3>
              <p className="text-sm text-gray-600">Automatic order synchronization</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Secure & Reliable</h3>
              <p className="text-sm text-gray-600">Enterprise-grade security</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Channel;
