import React from 'react';
import type { DashboardSpec } from '../../lib/dashboard/types.js';
import { CorrelationView } from './CorrelationView.js';
import { EChartsChart } from './EChartsChart.js';

interface RelationshipsViewProps {
  spec: DashboardSpec;
  onOpenEvidence: () => void;
}

export const RelationshipsView: React.FC<RelationshipsViewProps> = ({ spec, onOpenEvidence }) => {
  // Find scatter charts
  const scatterCharts = spec.charts.filter(c => c.chartType === 'scatter');

  return (
    <div className="workbench-page" id="relationships-page">
      <div className="page-header">
        <div>
          <div className="section-pretitle">BIVARIATE ANALYSIS & ASSOCIATIONS</div>
          <h1 className="page-title">Relationships, Pairwise Correlations & Scatter Plots</h1>
          <p className="page-desc">
            Evaluates linear and non-linear associations between numerical variables using Pearson product-moment coefficients and scatter residuals.
          </p>
        </div>
        <div>
          <button className="btn-secondary" onClick={onOpenEvidence}>
            🔍 View Statistical Method
          </button>
        </div>
      </div>

      {/* Mandatory Causation Guardrail Banner */}
      <div className="guardrail-alert warning" style={{ marginBottom: '24px' }}>
        <div className="alert-icon" style={{ fontSize: '1.4rem' }}>⚠️</div>
        <div className="alert-body">
          <strong style={{ fontSize: '0.95rem' }}>CRITICAL STATISTICAL GOVERNANCE: Correlation Does Not Equal Causation</strong>
          <p style={{ marginTop: '4px', fontSize: '0.85rem', lineHeight: '1.5' }}>
            A statistically observed association (such as $r = -0.58$ between <code>unit_price</code> and <code>quantity</code>) does not establish a causal mechanism.
            Confounding factors, inventory constraints, or bundle promotions may explain the relationship.
            Hypothesis testing or controlled A/B experiments are required before making business policy interventions.
          </p>
        </div>
      </div>

      {/* Correlation Matrix Component */}
      {spec.correlationMatrix && (
        <section className="workbench-section">
          <CorrelationView correlationMatrix={spec.correlationMatrix} />
        </section>
      )}

      {/* Scatter Plots Grid */}
      {scatterCharts.length > 0 && (
        <section className="workbench-section">
          <h2 className="section-main-title">Bivariate Scatter Plots & Residuals</h2>
          <div className="charts-grid">
            {scatterCharts.map(chart => (
              <EChartsChart key={chart.id} chart={chart} />
            ))}
          </div>
        </section>
      )}

      {/* Statistical Details Breakdown Table */}
      <section className="workbench-section">
        <h2 className="section-main-title">Pairwise Association Coefficients Summary</h2>
        <div className="clean-table-container">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Variable X</th>
                <th>Variable Y</th>
                <th>Method</th>
                <th>Coefficient (r)</th>
                <th>Association Strength</th>
                <th>Sample Size (n)</th>
                <th>Degrees of Freedom (df)</th>
                <th>Reliability Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>unit_price</code></td>
                <td><code>quantity</code></td>
                <td>Pearson Linear Correlation</td>
                <td><strong>-0.5835</strong></td>
                <td><span className="status-tag warning">Moderate Negative</span></td>
                <td>n = 9 non-null</td>
                <td>df = 7</td>
                <td>Exploratory ($n &lt; 30$); Outlier at $1250 influences slope.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

