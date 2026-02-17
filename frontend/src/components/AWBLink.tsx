import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './AWBLink.css';

interface AWBLinkProps {
  awb: string;
  orderId?: string;
  className?: string;
  showPrefix?: boolean;
}

const AWBLink: React.FC<AWBLinkProps> = ({ awb, orderId, className = '', showPrefix = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  if (!awb || awb === 'N/A' || awb === '—') {
    return <span className={className}>{awb || '—'}</span>;
  }

  const isAdminContext = location.pathname.startsWith('/admin');

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdminContext) {
      navigate(`/admin/tracking/${encodeURIComponent(awb.trim())}`);
    } else {
      const url = `/tracking/detail?awb=${encodeURIComponent(awb.trim())}${orderId ? `&orderId=${encodeURIComponent(orderId.trim())}` : ''}`;
      navigate(url);
    }
  };

  return (
    <button
      className={`awb-link-btn ${className}`}
      onClick={handleClick}
      title={`Track shipment ${awb}`}
    >
      {showPrefix && <span className="awb-link-prefix">AWB: </span>}
      {awb}
    </button>
  );
};

export default AWBLink;
