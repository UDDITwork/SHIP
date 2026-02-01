import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';

interface LocationGateProps {
  children: React.ReactNode;
}

const LocationGate: React.FC<LocationGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'granted' | 'denied' | 'requesting'>('checking');

  const saveLocation = useCallback(async (position: GeolocationPosition) => {
    try {
      await apiService.post('/user/location', {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
    } catch (err) {
      console.error('Failed to save location:', err);
    }
    sessionStorage.setItem('location_verified', 'true');
    setStatus('granted');
  }, []);

  const requestLocation = useCallback(() => {
    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveLocation(position);
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [saveLocation]);

  useEffect(() => {
    if (sessionStorage.getItem('location_verified') === 'true') {
      setStatus('granted');
      return;
    }

    if (!navigator.geolocation) {
      setStatus('denied');
      return;
    }

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
          requestLocation();
        } else if (result.state === 'denied') {
          setStatus('denied');
        } else {
          requestLocation();
        }

        result.onchange = () => {
          if (result.state === 'granted') requestLocation();
          else if (result.state === 'denied') setStatus('denied');
        };
      }).catch(() => {
        requestLocation();
      });
    } else {
      requestLocation();
    }
  }, [requestLocation]);

  if (status === 'checking' || status === 'requesting') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: 'inherit'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '40px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📍</div>
          <h2 style={{ color: '#002B59', marginBottom: '8px', fontSize: '18px' }}>Requesting Location Access</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>
            Please allow location access in your browser to continue.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: 'inherit'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '40px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '450px'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ color: '#002B59', marginBottom: '12px', fontSize: '18px' }}>Location Permission Required</h2>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px', lineHeight: '1.6' }}>
            Location permission is required to use services. Please enable location access in your browser settings and try again.
          </p>
          <button
            onClick={requestLocation}
            style={{
              backgroundColor: '#F68723',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default LocationGate;
