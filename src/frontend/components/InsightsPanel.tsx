import React from 'react';
import type { InsightCardSpec } from '../../lib/dashboard/types.js';

interface InsightsPanelProps {
  insights: InsightCardSpec[];
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ insights }) => {
  if (insights.length === 0) return null;

  return (
    <section className="insights-section" id="dashboard-insights-section">
      <h2 className="section-title">
        <span>Strategic Business Insights & Recommendations</span>
        <span className="section-badge">{insights.length} Evidence-Backed</span>
      </h2>

      <div className="insights-grid">
        {insights.map(ins => (
          <div key={ins.id} className="insight-card" id={`insight-${ins.id}`}>
            <div className="insight-card-header">
              <h3 className="insight-card-title">{ins.title}</h3>
              <span className={`importance-badge ${ins.importance}`}>
                {ins.importance}
              </span>
            </div>

            <div className="insight-block fact">
              <span className="label">Observed Fact (Empirical)</span>
              <p>{ins.observedFact}</p>
            </div>

            <div className="insight-block hypothesis">
              <span className="label">Exploratory Hypothesis</span>
              <p>{ins.hypothesis}</p>
            </div>

            <div className="insight-block action">
              <span className="label">Recommended Action</span>
              <p>{ins.recommendation}</p>
            </div>

            <div className="insight-footer">
              <span>Method: {ins.analyticalMethod}</span>
              <span>Confidence: {ins.confidence.toUpperCase()}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
