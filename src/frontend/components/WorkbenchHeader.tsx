import React from 'react';
import type { DashboardMetadata } from '../../lib/dashboard/types.js';

interface WorkbenchHeaderProps {
  metadata?: DashboardMetadata;
  onRunAnalysisClick: () => void;
  onUploadClick: () => void;
  onOpenEvidence: () => void;
  onExportReport: () => void;
  onResetFilters: () => void;
  activeFiltersCount: number;
}

export const WorkbenchHeader: React.FC<WorkbenchHeaderProps> = ({
  metadata,
  onRunAnalysisClick,
  onUploadClick,
  onOpenEvidence,
  onExportReport,
  onResetFilters,
  activeFiltersCount,
}) => {
  const datasetName = metadata?.datasetName || 'sample_sales.csv';
  const rowCount = metadata?.datasetRowCount ?? 10;
  const colCount = metadata?.datasetColumnCount ?? 8;
  const completeness = metadata?.completenessScore ?? 98.75;
  const engine = metadata?.engine || 'DuckDB in-memory analytical engine v1.4.4';

  return (
    <header className="workbench-header">
      <div className="header-left">
        <div className="dataset-badge-container">
          <span className="dataset-icon">🗄️</span>
          <span className="dataset-label">Active Dataset:</span>
          <span className="dataset-filename">{datasetName}</span>
          <span className="status-pill status-healthy">Verified</span>
        </div>

        <div className="dataset-meta-specs">
          <span className="meta-spec-item">
            <strong>{rowCount.toLocaleString()}</strong> Rows
          </span>
          <span className="meta-divider">•</span>
          <span className="meta-spec-item">
            <strong>{colCount}</strong> Columns
          </span>
          <span className="meta-divider">•</span>
          <span className="meta-spec-item" title="Data completeness across all cells">
            <strong>{completeness}%</strong> Completeness
          </span>
          <span className="meta-divider">•</span>
          <span className="engine-badge" title={engine}>
            <span className="engine-dot" />
            DuckDB Vectorized
          </span>
        </div>
      </div>

      <div className="header-actions">
        {activeFiltersCount > 0 && (
          <button className="btn-header-secondary" onClick={onResetFilters}>
            Clear Filters ({activeFiltersCount})
          </button>
        )}

        <button className="btn-header-secondary" onClick={onOpenEvidence} title="Open Analytical Evidence & Audit Inspector">
          🔍 Evidence Inspector
        </button>

        <button className="btn-header-secondary" onClick={onExportReport} title="Export publication-ready Executive Report">
          📥 Export Report
        </button>

        <button className="btn-header-primary" onClick={onRunAnalysisClick}>
          ⚡ Run STATA Agent
        </button>
      </div>
    </header>
  );
};
