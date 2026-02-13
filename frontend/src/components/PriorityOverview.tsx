import React from 'react';
import { PrioritySummary } from '../services/adminService';
import './PriorityOverview.css';

interface PriorityOverviewProps {
  prioritySummary: PrioritySummary;
  onPriorityClick?: (priority: 'urgent' | 'high' | 'medium' | 'low') => void;
  activePriority?: string;
}

const PriorityOverview: React.FC<PriorityOverviewProps> = ({
  prioritySummary,
  onPriorityClick,
  activePriority
}) => {
  const priorities: Array<{
    key: 'urgent' | 'high' | 'medium' | 'low';
    label: string;
    icon: string;
    description: string;
    color: string;
  }> = [
    {
      key: 'urgent',
      label: 'Urgent',
      icon: 'U',
      description: 'Immediate attention required',
      color: '#ef4444'
    },
    {
      key: 'high',
      label: 'High',
      icon: 'H',
      description: 'Action needed soon',
      color: '#f97316'
    },
    {
      key: 'medium',
      label: 'Medium',
      icon: 'M',
      description: 'Normal attention level',
      color: '#f59e0b'
    },
    {
      key: 'low',
      label: 'Low',
      icon: 'L',
      description: 'Can be scheduled later',
      color: '#10b981'
    }
  ];

  const handleCardClick = (priority: 'urgent' | 'high' | 'medium' | 'low') => {
    if (onPriorityClick) {
      onPriorityClick(priority);
    }
  };

  return (
    <div className="priority-overview">
      <div className="priority-overview-header">
        <h2>Priority Overview</h2>
        <p className="priority-overview-subtitle">Monitor ticket urgency and SLA status</p>
      </div>
      <div className="priority-cards-grid">
        {priorities.map((priority) => {
          const data = prioritySummary[priority.key];
          const slaBreachPercentage = data.count > 0
            ? Math.round((data.sla_breached / data.count) * 100)
            : 0;
          const isActive = activePriority === priority.key;

          return (
            <div
              key={priority.key}
              className={`priority-card ${priority.key} ${isActive ? 'active' : ''}`}
              onClick={() => handleCardClick(priority.key)}
              style={{ borderColor: priority.color }}
            >
              <div className="priority-card-header">
                <span className="priority-icon" style={{ backgroundColor: priority.color }}>
                  {priority.icon}
                </span>
                <span className="priority-label">{priority.label}</span>
              </div>
              <div className="priority-card-body">
                <div className="priority-count">{data.count}</div>
                <div className="priority-description">{priority.description}</div>
                {data.sla_breached > 0 && (
                  <div className="sla-breach-info">
                    <span className="sla-breach-badge">
                      {data.sla_breached} SLA Breached ({slaBreachPercentage}%)
                    </span>
                  </div>
                )}
              </div>
              {onPriorityClick && (
                <button
                  className="priority-filter-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick(priority.key);
                  }}
                >
                  {isActive ? 'Clear Filter' : 'Filter'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PriorityOverview;
