import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';
import './DateRangeFilter.css';

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

interface DateRangeFilterProps {
  onApply: (startDate: string, endDate: string) => void;
  onReset?: () => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
  defaultPreset?: DatePreset;
}

const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
};

const getDateRangeForPreset = (preset: DatePreset): { startDate: string; endDate: string } => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  switch (preset) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: yesterday.toISOString().split('T')[0], endDate: yesterday.toISOString().split('T')[0] };
    }
    case 'thisWeek': {
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - diffToMonday);
      return { startDate: monday.toISOString().split('T')[0], endDate: todayStr };
    }
    case 'lastWeek': {
      const dayOfWeek = today.getDay();
      const diffToLastMonday = dayOfWeek === 0 ? 6 + 7 : dayOfWeek - 1 + 7;
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - diffToLastMonday);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { startDate: lastMonday.toISOString().split('T')[0], endDate: lastSunday.toISOString().split('T')[0] };
    }
    case 'thisMonth': {
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: firstDayOfMonth.toISOString().split('T')[0], endDate: todayStr };
    }
    case 'lastMonth': {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: firstDayLastMonth.toISOString().split('T')[0],
        endDate: lastDayLastMonth.toISOString().split('T')[0]
      };
    }
    case 'custom':
    default:
      return getDefaultDateRange();
  }
};

const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}-${month}-${year}`;
};

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  onApply,
  onReset,
  defaultStartDate,
  defaultEndDate,
  defaultPreset = 'custom'
}) => {
  const defaultRange = getDefaultDateRange();
  const [dateFilter, setDateFilter] = useState({
    startDate: defaultStartDate || defaultRange.startDate,
    endDate: defaultEndDate || defaultRange.endDate
  });
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>(defaultPreset);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDatePicker]);

  const handlePresetSelect = (preset: DatePreset) => {
    if (preset === 'custom') {
      setSelectedPreset('custom');
      return;
    }
    const range = getDateRangeForPreset(preset);
    setDateFilter(range);
    setSelectedPreset(preset);
  };

  const handleApply = () => {
    onApply(dateFilter.startDate, dateFilter.endDate);
    setShowDatePicker(false);
  };

  const handleReset = () => {
    const range = getDefaultDateRange();
    setDateFilter(range);
    setSelectedPreset('custom');
    if (onReset) {
      onReset();
    } else {
      onApply(range.startDate, range.endDate);
    }
    setShowDatePicker(false);
  };

  const formatDateRange = () => {
    return `${formatDisplayDate(dateFilter.startDate)} to ${formatDisplayDate(dateFilter.endDate)}`;
  };

  return (
    <div className="drf-container" ref={datePickerRef} style={{ position: 'relative' }}>
      <button
        className="drf-trigger"
        onClick={() => setShowDatePicker(!showDatePicker)}
      >
        <Calendar size={16} className="drf-calendar-icon" />
        <span className="drf-date-text">{formatDateRange()}</span>
      </button>

      {showDatePicker && (
        <div className="drf-dropdown">
          <div className="drf-header">
            <h3>Select Date Range</h3>
            <button
              className="drf-close"
              onClick={() => setShowDatePicker(false)}
            >
              ×
            </button>
          </div>
          <div className="drf-presets">
            <button
              className={`drf-preset-btn ${selectedPreset === 'today' ? 'active' : ''}`}
              onClick={() => handlePresetSelect('today')}
            >
              Today
            </button>
            <button
              className={`drf-preset-btn ${selectedPreset === 'yesterday' ? 'active' : ''}`}
              onClick={() => handlePresetSelect('yesterday')}
            >
              Yesterday
            </button>
            <button
              className={`drf-preset-btn ${selectedPreset === 'thisWeek' ? 'active' : ''}`}
              onClick={() => handlePresetSelect('thisWeek')}
            >
              This Week
            </button>
            <button
              className={`drf-preset-btn ${selectedPreset === 'lastWeek' ? 'active' : ''}`}
              onClick={() => handlePresetSelect('lastWeek')}
            >
              Last Week
            </button>
            <button
              className={`drf-preset-btn ${selectedPreset === 'thisMonth' ? 'active' : ''}`}
              onClick={() => handlePresetSelect('thisMonth')}
            >
              This Month
            </button>
            <button
              className={`drf-preset-btn ${selectedPreset === 'lastMonth' ? 'active' : ''}`}
              onClick={() => handlePresetSelect('lastMonth')}
            >
              Last Month
            </button>
          </div>
          <div className="drf-body">
            <div className="drf-input-group">
              <label>From Date</label>
              <input
                type="date"
                value={dateFilter.startDate}
                max={dateFilter.endDate}
                onChange={(e) => {
                  setDateFilter({ ...dateFilter, startDate: e.target.value });
                  setSelectedPreset('custom');
                }}
              />
            </div>
            <div className="drf-input-group">
              <label>To Date</label>
              <input
                type="date"
                value={dateFilter.endDate}
                min={dateFilter.startDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  setDateFilter({ ...dateFilter, endDate: e.target.value });
                  setSelectedPreset('custom');
                }}
              />
            </div>
          </div>
          <div className="drf-footer">
            <button className="drf-reset-btn" onClick={handleReset}>
              Reset
            </button>
            <button className="drf-cancel-btn" onClick={() => setShowDatePicker(false)}>
              Cancel
            </button>
            <button className="drf-apply-btn" onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;
