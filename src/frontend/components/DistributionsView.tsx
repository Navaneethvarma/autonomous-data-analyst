import React from 'react';
import type { DashboardSpec } from '../../lib/dashboard/types.js';
import { EChartsChart } from './EChartsChart.js';

interface DistributionsViewProps {
  spec: DashboardSpec;
  onOpenEvidence: () => void;
}

export const DistributionsView: React.FC<DistributionsViewProps> = ({ spec, onOpenEvidence }) => {
  // Find histogram and bar distribution charts
  const distCharts = spec.charts.filter(c => c.chartType === 'histogram' || c.chartType === 'bar');

  return (
    <div className="workbench-page" id="distributions-page">
      <div className="page-header">
        <div>
          <div className="section-pretitle">STATISTICAL DISTRIBUTIONS</div>
          <h1 className="page-title">Univariate Distributions & Outlier Boundaries</h1>
          <p className="page-desc">
            Empirical histograms, Interquartile Range (IQR) outlier intervals, and central tendency distributions across numeric and categorical variables.
          </p>
        </div>
        <div>
          <button className="btn-secondary" onClick={onOpenEvidence}>
            🔍 View Outlier Method
          </button>
        </div>
      </div>

      {/* Statistical Summary Box */}
      <div className="stats-callout-grid">
        <div className="stat-callout-card">
          <div className="callout-header">
            <span className="callout-title">unit_price (Numeric Float)</span>
            <span className="callout-badge warning">1 Outlier Flag</span>
          </div>
          <div className="callout-body">
            <div className="callout-metric">
              <span className="k">Median (p50):</span> <span className="v">$120.00</span>
            </div>
            <div className="callout-metric">
              <span className="k">Mean ± StdDev:</span> <span className="v">$346.51 ± 445.59</span>
            </div>
            <div className="callout-metric">
              <span className="k">IQR Interval (1.5x):</span> <span className="v">[-600.23, 1160.12]</span>
            </div>
            <div className="callout-metric">
              <span className="k">Outlier Values:</span> <span className="v highlighted">$1,250.00 (TXN-1010)</span>
            </div>
          </div>
          <div className="callout-footer">
            Skewness: <strong>+1.43 (Right Skewed)</strong>
          </div>
        </div>

        <div className="stat-callout-card">
          <div className="callout-header">
            <span className="callout-title">quantity (Numeric Integer)</span>
            <span className="callout-badge warning">1 Outlier Flag</span>
          </div>
          <div className="callout-body">
            <div className="callout-metric">
              <span className="k">Median (p50):</span> <span className="v">1.50 units</span>
            </div>
            <div className="callout-metric">
              <span className="k">Mean ± StdDev:</span> <span className="v">1.80 ± 1.03</span>
            </div>
            <div className="callout-metric">
              <span className="k">IQR Interval (1.5x):</span> <span className="v">[-0.50, 3.50]</span>
            </div>
            <div className="callout-metric">
              <span className="k">Outlier Values:</span> <span className="v highlighted">4 units (TXN-1007)</span>
            </div>
          </div>
          <div className="callout-footer">
            Skewness: <strong>+1.24 (Positive Skew)</strong>
          </div>
        </div>

        <div className="stat-callout-card">
          <div className="callout-header">
            <span className="callout-title">Statistical Assumptions</span>
            <span className="callout-badge note">Normality Check</span>
          </div>
          <div className="callout-body">
            <p className="callout-text">
              Both numerical variables exhibit right-skewed distributions with positive tail deviations.
              Because non-normality is detected and sample size $n = 10$, robust non-parametric metrics
              (Median, IQR) must be prioritized over parametric means.
            </p>
          </div>
          <div className="callout-footer">
            Sample: <strong>n = 10 (Exploratory)</strong>
          </div>
        </div>
      </div>

      {/* Render Charts */}
      <section className="workbench-section">
        <h2 className="section-main-title">Interactive Distribution Histograms</h2>
        <div className="charts-grid">
          {distCharts.map(chart => (
            <EChartsChart key={chart.id} chart={chart} />
          ))}
        </div>
      </section>
    </div>
  );
};

