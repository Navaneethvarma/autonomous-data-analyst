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
    <section id="analyze-view">
      <h2 className="section-title">
        <span>Submit Analytical Query</span>
        <span className="section-badge">Autonomous Workflow Pipeline</span>
      </h2>

      <div className="kpi-card" style={{ padding: 24, marginTop: 20 }}>
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label">Target Dataset</label>
            <select
              className="form-input"
              value={selectedDatasetId}
              onChange={e => onDatasetChange(e.target.value)}
              required
            >
              <option value="">-- Select Dataset --</option>
              {datasets.map(d => (
                <option key={d.id} value={d.id}>
                  {d.originalFilename} ({d.rowCount} rows)
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Business Question</label>
            <input
              className="form-input"
              value={queryInput}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="e.g. What is the total gross revenue grouped by product category?"
              required
            />
          </div>

          <button
            className="btn-primary"
            type="submit"
            disabled={isSubmittingAnalysis || !selectedDatasetId}
            id="run-analysis-btn"
          >
            {isSubmittingAnalysis ? 'Executing Background Workflow...' : 'Execute Analysis'}
          </button>
        </form>
      </div>

      {/* Live Progress Bar */}
      {activeAnalysis && (
        <div className="progress-box" id="analysis-progress-panel">
          <div className="progress-header">
            <div>
              <strong>Analysis Stage: </strong>
              <code style={{ color: 'var(--accent-cyan)' }}>{activeAnalysis.stage}</code>
            </div>
            <div>
              <span>{activeAnalysis.progressPercent}%</span>
            </div>
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${activeAnalysis.progressPercent}%` }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Query: "{activeAnalysis.userQuery}"
            </span>

            {isSubmittingAnalysis && (
              <button className="btn-secondary" onClick={onCancel}>
                Cancel Analysis
              </button>
            )}
          </div>

          {/* Clarification Alert if ambiguous metric */}
          {activeAnalysis.clarificationQuestion && (
            <div className="clarification-card" style={{ marginTop: 16 }}>
              <h4>⚠️ Business Metric Ambiguity Detected</h4>
              <p style={{ marginTop: 6, fontSize: '0.9rem' }}>
                {activeAnalysis.clarificationQuestion}
              </p>
              <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Please re-submit your question clarifying which metric variant you want computed.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
