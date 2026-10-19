import React from 'react';
import type { FilterSpec } from '../../lib/dashboard/types.js';

interface FilterBarProps {
  filters: FilterSpec[];
  selectedFilters: Record<string, string>;
  onFilterChange: (column: string, value: string) => void;
  onReset: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  selectedFilters,
  onFilterChange,
  onReset,
}) => {
  if (filters.length === 0) return null;

  const hasActiveFilters = Object.values(selectedFilters).some(v => v !== 'All');

  return (
    <div className="filter-bar" id="dashboard-filter-bar">
      <div className="filter-label">
        <span>⚡ Interactive Slicers <small style={{ opacity: 0.8, fontWeight: 'normal' }}>(filters displayed table rows below)</small>:</span>
      </div>

      {filters.map(f => (
        <div key={f.id} className="filter-group">
          <label htmlFor={`select-${f.id}`} className="filter-select-label">
            {f.label}:
          </label>
          <select
            id={`select-${f.id}`}
            className="filter-select"
            value={selectedFilters[f.column] || 'All'}
            onChange={e => onFilterChange(f.column, e.target.value)}
          >
            {f.options.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      ))}

      {hasActiveFilters && (
        <button className="reset-filter-btn" onClick={onReset} id="reset-filters-btn">
          ↺ Reset Slicers
        </button>
      )}
    </div>
  );
};
