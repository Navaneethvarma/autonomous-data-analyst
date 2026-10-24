import React from 'react';
import type { DashboardSpec } from '../../lib/dashboard/types.js';
import type { AnalysisItem } from '../api.js';

interface HistoryViewProps {
  analysisHistory: AnalysisItem[];
  onViewDashboard: (spec: DashboardSpec) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  analysisHistory,
  onViewDashboard,
}) => {
  return (
    <section id="history-view">
      <h2 className="section-title">
        <span>Authorized Analysis History</span>
        <span className="section-badge">{analysisHistory.length} Runs</span>
      </h2>

      {analysisHistory.length === 0 ? (
        <div className="state-container">
          <p className="state-message">No historical analyses recorded yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {analysisHistory.map(item => (
            <div key={item.id} className="kpi-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>
                    "{item.userQuery}"
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Status: <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{item.status}</span> •
                    Stage: {item.stage} •
                    Created: {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>

                {item.dashboardSpec && (
                  <button
                    className="btn-secondary"
                    onClick={() => onViewDashboard(item.dashboardSpec!)}
                  >
                    View Dashboard
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
