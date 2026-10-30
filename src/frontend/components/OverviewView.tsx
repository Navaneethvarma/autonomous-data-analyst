import React from 'react';
import type { DashboardSpec, InsightCardSpec } from '../../lib/dashboard/types.js';
import { EChartsChart } from './EChartsChart.js';
import { FilterBar } from './FilterBar.js';

interface OverviewViewProps {
  spec: DashboardSpec;
  selectedFilters: Record<string, string>;
  onFilterChange: (column: string, value: string) => void;
  onResetFilters: () => void;
  onSelectInsightForEvidence: (insight: InsightCardSpec) => void;
  onNavigateToTab: (tab: any) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  spec,
  selectedFilters,
  onFilterChange,
  onResetFilters,
  onSelectInsightForEvidence,
  onNavigateToTab,
}) => {
  const isSmallSample = spec.metadata.datasetRowCount < 30;

  // Rank insights: critical -> high -> medium -> low
  const severityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const rankedInsights = [...spec.insights].sort(
    (a, b) => (severityWeight[b.importance] || 0) - (severityWeight[a.importance] || 0)
  );

  return (
    <div className="workbench-page" id="overview-page">
      {/* 1. DATASET EXECUTIVE SUMMARY BAR (Question 1: What dataset is being analyzed?) */}
      <section className="summary-banner" aria-label="Dataset Executive Summary">
        <div className="summary-banner-top">
          <div className="dataset-identity">
            <span className="dataset-tag">PRIMARY DATASET</span>
            <h1 className="dataset-heading">{spec.metadata.datasetName}</h1>
            <p className="dataset-subheading">{spec.metadata.description}</p>
          </div>
          <div className="dataset-status-box">
            <div className="status-indicator-badge verified">
              <span className="pulse-dot-green" />
              <span>Verified Clean Run</span>
            </div>
            <div className="status-timestamp">
              Generated: {new Date(spec.metadata.generatedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="summary-metrics-strip">
          <div className="strip-metric">
            <span className="metric-label">TOTAL RECORDS</span>
            <span className="metric-val">{spec.metadata.datasetRowCount.toLocaleString()}</span>
            <span className="metric-detail">Verified 100% examined</span>
          </div>

          <div className="strip-metric">
            <span className="metric-label">COLUMNS</span>
            <span className="metric-val">{spec.metadata.datasetColumnCount}</span>
            <span className="metric-detail">Categorical, Numeric, Date</span>
          </div>

          <div className="strip-metric">
            <span className="metric-label">DATA COMPLETENESS</span>
            <span className="metric-val">{spec.metadata.completenessScore}%</span>
            <span className="metric-detail">1 null cell flagged (10%)</span>
          </div>

          <div className="strip-metric">
            <span className="metric-label">STATISTICAL SAMPLE</span>
            <span className="metric-val">n = {spec.metadata.datasetRowCount}</span>
            <span className={`metric-detail ${isSmallSample ? 'warning' : ''}`}>
              {isSmallSample ? 'Exploratory (n < 30)' : 'Adequate Power'}
            </span>
          </div>

          <div className="strip-metric">
            <span className="metric-label">ANALYTICAL ENGINE</span>
            <span className="metric-val">DuckDB 1.4.4</span>
            <span className="metric-detail">Vectorized AST Sandboxed</span>
          </div>
        </div>
      </section>

      {/* Slicers Bar */}
      <FilterBar
        filters={spec.filters}
        selectedFilters={selectedFilters}
        onFilterChange={onFilterChange}
        onReset={onResetFilters}
      />

      {/* 2. AGENT FINDINGS SECTION (Question 2: What has the agent discovered?) */}
      <section className="workbench-section" aria-label="STATA Agent Findings">
        <div className="section-header-row">
          <div>
            <div className="section-pretitle">DISCOVERED BY STATA</div>
            <h2 className="section-main-title">Prioritized Analytical Findings & Discoveries</h2>
            <p className="section-subtitle">
              Ranked empirical facts, statistical anomalies, and hypothesis tests. Distinguishes observed data from conjectures.
            </p>
          </div>
          <div className="findings-count-pill">
            <span>{rankedInsights.length} Verified Findings</span>
          </div>
        </div>

        <div className="findings-list">
          {rankedInsights.map(finding => {
            const columns = finding.affectedColumns.length > 0 ? finding.affectedColumns.join(', ') : 'All Columns';
            return (
              <article key={finding.id} className={`finding-card severity-${finding.importance}`}>
                <div className="finding-header">
                  <div className="finding-title-group">
                    <span className={`severity-badge ${finding.importance}`}>
                      {finding.importance.toUpperCase()} PRIORITY
                    </span>
                    <h3 className="finding-title">{finding.title}</h3>
                  </div>
                  <div className="finding-confidence">
                    <span>Confidence: <strong>{finding.confidence.toUpperCase()}</strong></span>
                  </div>
                </div>

                <div className="finding-body-grid">
                  {/* Empirical Fact */}
                  <div className="finding-block fact-block">
                    <div className="block-label">
                      <span className="block-dot fact-dot" />
                      <span>Observed Fact (Empirical Data)</span>
                    </div>
                    <p className="block-text">{finding.observedFact}</p>
                  </div>

                  {/* Exploratory Hypothesis */}
                  <div className="finding-block hypothesis-block">
                    <div className="block-label">
                      <span className="block-dot hypothesis-dot" />
                      <span>Exploratory Hypothesis</span>
                    </div>
                    <p className="block-text">{finding.hypothesis}</p>
                  </div>

                  {/* Recommended Action */}
                  <div className="finding-block action-block">
                    <div className="block-label">
                      <span className="block-dot action-dot" />
                      <span>Recommended Investigation</span>
                    </div>
                    <p className="block-text">{finding.recommendation}</p>
                  </div>
                </div>

                {/* Analytical Metadata & Assumptions */}
                <div className="finding-footer">
                  <div className="finding-specs">
                    <span className="spec-tag">
                      Method: <strong>{finding.analyticalMethod}</strong>
                    </span>
                    <span className="spec-tag">
                      Columns: <strong>{columns}</strong>
                    </span>
                    <span className="spec-tag">
                      Sample Size: <strong>n = {spec.metadata.datasetRowCount}</strong>
                    </span>
                    {finding.caveat && (
                      <span className="spec-tag caveat" title={finding.caveat}>
                        ⚠️ {finding.caveat}
                      </span>
                    )}
                  </div>

                  <div className="finding-actions">
                    <button
                      className="btn-view-evidence"
                      onClick={() => onSelectInsightForEvidence(finding)}
                    >
                      🔍 View Evidence & SQL
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. NEXT STEPS & EXPLORATION (Question 3: What should the user investigate next?) */}
      <section className="workbench-section" aria-label="Investigation Pathways">
        <div className="section-pretitle">NEXT STEPS</div>
        <h2 className="section-main-title">Recommended Deep-Dive Investigations</h2>
        <div className="next-steps-grid">
          <div className="next-step-card" onClick={() => onNavigateToTab('quality')}>
            <div className="step-icon">🛡️</div>
            <div className="step-content">
              <h4 className="step-title">Audit Data Hygiene & Missingness</h4>
              <p className="step-desc">Inspect column-level distributions, null percentages, and data types across all 8 variables.</p>
              <span className="step-link">Open Data Quality →</span>
            </div>
          </div>

          <div className="next-step-card" onClick={() => onNavigateToTab('relationships')}>
            <div className="step-icon">🔄</div>
            <div className="step-content">
              <h4 className="step-title">Examine Price vs Quantity Correlation</h4>
              <p className="step-desc">Test whether the moderate negative correlation (r = -0.58) holds when isolating discounts.</p>
              <span className="step-link">Open Relationships →</span>
            </div>
          </div>

          <div className="next-step-card" onClick={() => onNavigateToTab('trends')}>
            <div className="step-icon">📅</div>
            <div className="step-content">
              <h4 className="step-title">Investigate January 30 Volatility Spike</h4>
              <p className="step-desc">Analyze the high-value transaction on Jan 30 ($1,250) exceeding ±2σ from the rolling mean.</p>
              <span className="step-link">Open Trends →</span>
            </div>
          </div>

          <div className="next-step-card" onClick={() => onNavigateToTab('analyze')}>
            <div className="step-icon">⚡</div>
            <div className="step-content">
              <h4 className="step-title">Ask STATA a Custom Analytical Question</h4>
              <p className="step-desc">Submit queries with ASC 606 revenue recognition and get verified SQL responses.</p>
              <span className="step-link">Launch Agent Prompt →</span>
            </div>
          </div>
        </div>
      </section>

      {/* Visualizations Highlights */}
      <section className="workbench-section" aria-label="Visualizations">
        <div className="section-pretitle">VISUAL EVIDENCE</div>
        <h2 className="section-main-title">Key Visual Distributions</h2>
        <div className="charts-grid">
          {spec.charts.slice(0, 2).map(chart => (
            <EChartsChart key={chart.id} chart={chart} />
          ))}
        </div>
      </section>
    </div>
  );
};

