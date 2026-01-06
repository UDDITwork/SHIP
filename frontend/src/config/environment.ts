// Environment Configuration
// This file handles automatic environment detection and API URL configuration

interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  apiUrl: string;
  wsUrl: string;
  environment: 'development' | 'production';
}

// Auto-detect environment based on hostname and port
const detectEnvironment = (): EnvironmentConfig => {
  // Check if running on localhost
  const isLocalhost = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' || 
                     window.location.hostname === '0.0.0.0';
  
  // Check if running on development port
  const isDevPort = window.location.port === '3000' || window.location.port === '3001';
  
  // Auto-detect environment
  const isDevelopment = isLocalhost && isDevPort;
  
  // Override with manual environment if set
  const manualEnv = process.env.REACT_APP_ENVIRONMENT;
  const finalIsDevelopment = manualEnv === 'development' ? true : 
                            manualEnv === 'production' ? false : 
                            isDevelopment;
  
  const finalEnvironment = finalIsDevelopment ? 'development' : 'production';
  
  // Determine API URL
  let apiUrl: string;
  let wsUrl: string;
  
  if (finalEnvironment === 'production' || process.env.NODE_ENV === 'production') {
    // Production API URL priority: REACT_APP_PRODUCTION_API_URL > REACT_APP_API_URL > default
    apiUrl = process.env.REACT_APP_PRODUCTION_API_URL ||
             process.env.REACT_APP_API_URL ||
             'https://ship-389896580103.asia-south1.run.app/api';
    // Production WebSocket URL
    wsUrl = process.env.REACT_APP_WS_URL || 'wss://ship-389896580103.asia-south1.run.app';
  } else {
    // Development API URL priority: REACT_APP_API_URL > default
    apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    // Development WebSocket URL
    wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
  }
  
  console.log('🔧 ENVIRONMENT CONFIGURATION:', {
    hostname: window.location.hostname,
    port: window.location.port,
    protocol: window.location.protocol,
    fullUrl: window.location.href,
    autoDetected: isDevelopment ? 'development' : 'production',
    manualOverride: manualEnv,
    finalEnvironment,
    NODE_ENV: process.env.NODE_ENV,
    apiUrl,
    envVars: {
      REACT_APP_ENVIRONMENT: process.env.REACT_APP_ENVIRONMENT,
      REACT_APP_API_URL: process.env.REACT_APP_API_URL,
      REACT_APP_PRODUCTION_API_URL: process.env.REACT_APP_PRODUCTION_API_URL
    }
  });
  
  return {
    isDevelopment: finalIsDevelopment,
    isProduction: !finalIsDevelopment,
    apiUrl,
    wsUrl,
    environment: finalEnvironment
  };
};

export const environmentConfig = detectEnvironment();
export default environmentConfig;
