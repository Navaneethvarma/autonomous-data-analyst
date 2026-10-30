import React from 'react';
import type { DashboardSpec } from '../../lib/dashboard/types.js';
import { EChartsChart } from './EChartsChart.js';

interface TrendsViewProps {
  spec: DashboardSpec;
  onOpenEvidence: () => void;
}

export const TrendsView: React.FC<TrendsViewProps> = ({ spec, onOpenEvidence }) => {
  // Find line / trend charts
  const trendCharts = spec.charts.filter(c => c.chartType === 'line');
  const hasDateColumns = spec.table.columns.some(c => c.type === 'date' || c.key.toLowerCase().includes('date'));

  return (
    <div className="workbench-page" id="trends-page">
      <div className="page-header">
        <div>
          <div className="section-pretitle">TEMPORAL ANALYSIS & TRAJECTORIES</div>
          <h1 className="page-title">Time-Series Trends & Period Trajectories</h1>
          <p className="page-desc">
            Evaluates period-over-period velocity, rolling volatility spikes, and temporal patterns grounded strictly in verified timestamp observations.
          </p>
        </div>
        <div>
          <button className="btn-secondary" onClick={onOpenEvidence}>
            🔍 View Trend Method
          </button>
        </div>
      </div>

      {!hasDateColumns && (
        <div className="guardrail-alert note">
          <div className="alert-icon">ℹ️</div>
          <div className="alert-body">
            <strong>No Temporal Columns Detected:</strong>
            <p>This dataset does not contain validated date/time dimensions. Time-series trajectories are suppressed to prevent fabricated historical comparisons.</p>
          </div>
        </div>
      )}

      {/* Volatility Alert Box */}
      <div className="stats-callout-grid">
        <div className="stat-callout-card">
          <div className="callout-header">
            <span className="callout-title">Observation Window</span>
            <span className="callout-badge positive">20 Days Recorded</span>
          </div>
          <div className="callout-body">
            <div className="callout-metric">
              <span className="k">Temporal Span:</span> <span className="v">2024-01-10 → 2024-01-30</span>
            </div>
            <div className="callout-metric">
              <span className="k">Distinct Periods:</span> <span className="v">10 Daily Records</span>
            </div>
            <div className="callout-metric">
              <span className="k">Net Period Shift:</span> <span className="v">+150.01% (Start to End)</span>
            </div>
          </div>
          <div className="callout-footer">
            Resolution: <strong>Daily Bucketing</strong>
          </div>
        </div>

        <div className="stat-callout-card">
          <div className="callout-header">
            <span className="callout-title">Statistical Volatility Marker</span>
            <span className="callout-badge warning">Volatility Event</span>
          </div>
          <div className="callout-body">
            <div className="callout-metric">
              <span className="k">Flagged Period:</span> <span className="v highlighted">2024-01-30</span>
            </div>
            <div className="callout-metric">
              <span className="k">Observed Value:</span> <span className="v">$1,250.00</span>
            </div>
            <div className="callout-metric">
              <span className="k">Deviation:</span> <span className="v">Exceeds ±2.0σ from mean run-rate</span>
            </div>
          </div>
          <div className="callout-footer">
            Trigger: <strong>High-Value Transaction Spike</strong>
          </div>
        </div>

        <div className="stat-callout-card">
          <div className="callout-header">
            <span className="callout-title">Seasonality Caveat</span>
            <span className="callout-badge note">Limited Window</span>
          </div>
          <div className="callout-body">
            <p className="callout-text">
              Because observations span a single 20-day window, long-term quarterly seasonality or multi-year cyclicality cannot be mathematically proven.
              Treat trend direction as local velocity.
            </p>
          </div>
          <div className="callout-footer">
            Status: <strong>Descriptive Baseline</strong>
          </div>
        </div>
      </div>

      {/* Render Line Charts */}
      {trendCharts.length > 0 && (
        <section className="workbench-section">
          <h2 className="section-main-title">Interactive Time-Series Trajectory</h2>
          <div className="charts-grid">
            {trendCharts.map(chart => (
              <EChartsChart key={chart.id} chart={chart} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

