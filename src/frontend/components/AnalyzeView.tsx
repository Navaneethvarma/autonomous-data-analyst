import React from 'react';
import type { DatasetItem, AnalysisItem } from '../api.js';

interface AnalyzeViewProps {
  datasets: DatasetItem[];
  selectedDatasetId: string;
  queryInput: string;
  isSubmittingAnalysis: boolean;
  activeAnalysis: AnalysisItem | null;
  onDatasetChange: (id: string) => void;
  onQueryChange: (q: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export const AnalyzeView: React.FC<AnalyzeViewProps> = ({
  datasets,
  selectedDatasetId,
  queryInput,
  isSubmittingAnalysis,
  activeAnalysis,
  onDatasetChange,
  onQueryChange,
  onSubmit,
  onCancel,
}) => {
  return (
      <section id="analyze-view" className="workbench-page-container">
        {/* 1. Page Heading with proper spacing and separator */}
        <div className="page-header-block">
          <div className="page-title-row">
            <h1 className="page-heading">Submit Analytical Query</h1>
            <span className="heading-separator">·</span>
            <span className="heading-badge">Autonomous Workflow Pipeline</span>
          </div>
          <p className="page-heading-sub">
            Ask conversational business questions mapped to governed metrics (ASC 606), executed against DuckDB with zero hallucinations.
          </p>
        </div>

              <div className="analyze-main-layout">
                {/* Query Input Card */}
                <div className="workbench-card">
                  <div className="card-header-row">
                    <h3 className="card-title">
                      <span className="card-title-icon">⚡</span>
                      <span>Ask STATA Agent</span>
                    </h3>
                    <span className="card-badge">DuckDB + Python Sandbox</span>
                  </div>

                  <form onSubmit={onSubmit} className="clean-vertical-form">
                    <div className="form-field-block">
                      <label className="field-label" htmlFor="analyze-dataset-select">
                        Target Dataset
                      </label>
                      <select
                        id="analyze-dataset-select"
                        className="field-select"
                        value={selectedDatasetId}
                        onChange={e => onDatasetChange(e.target.value)}
                        required
                      >
                        <option value="">-- Select Dataset --</option>
                        {datasets.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.originalFilename} ({d.rowCount.toLocaleString()} rows)
                          </option>
                        ))}
                      </select>
                    </div>

                <div className="form-field-block">
                  <label className="field-label" htmlFor="analyze-query-input">
                    Conversational Business Question / Hypothesis
                  </label>
                  <textarea
                    id="analyze-query-input"
                    className="field-textarea"
                    rows={3}
                    value={queryInput}
                    onChange={e => onQueryChange(e.target.value)}
                    placeholder="e.g. What is our gross revenue across product categories, and what factors correlate with discounts?"
                    required
                  />
                  <span className="field-hint">STATA will automatically inspect columns, resolve semantic metrics, and run statistical tests</span>
                </div>

                        <div className="form-actions-row">
                          <button
                            className="btn-primary"
                            type="submit"
                            disabled={isSubmittingAnalysis || !selectedDatasetId}
                          >
                            {isSubmittingAnalysis ? '⚡ Running 8-Stage Pipeline...' : 'Run STATA Analysis'}
                          </button>
                        </div>
                        </form>
                      </div>

                      {/* Real-time Execution Tracking Card */}
                      {activeAnalysis && (
          <div className="workbench-card" style={{ marginTop: 24 }}>
            <div className="card-header-row">
              <h3 className="card-title">
                <span className="card-title-icon">⏱️</span>
                <span>Live Execution Progress (ID: {activeAnalysis.id.slice(0, 8)})</span>
              </h3>
              <span className={`status-pill ${activeAnalysis.status === 'completed' ? 'status-healthy' : 'status-warning'}`}>
                {activeAnalysis.status.toUpperCase()}
              </span>
            </div>

            <div className="execution-progress-container">
              <div className="progress-labels-row">
                <span className="progress-stage-name">Stage: <strong>{activeAnalysis.stage}</strong></span>
                <span className="progress-percentage"><strong>{activeAnalysis.progressPercent}%</strong></span>
              </div>
              <div className="full-progress-bar">
                <div
                  className="full-progress-fill"
                  style={{ width: `${Math.max(5, activeAnalysis.progressPercent)}%` }}
                />
              </div>
            </div>

            {isSubmittingAnalysis && (
              <div style={{ marginTop: 16 }}>
                <button className="btn-secondary" onClick={onCancel} style={{ color: 'var(--status-negative)' }}>
                  Cancel Execution
                </button>
              </div>
            )}
          </div>
        )}
                  </div>
    </section>
              );
};
