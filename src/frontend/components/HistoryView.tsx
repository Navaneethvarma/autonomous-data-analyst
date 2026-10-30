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
      <section id="history-view" className="workbench-page-container">
        {/* 1. Page Heading with proper spacing and separator */}
        <div className="page-header-block">
          <div className="page-title-row">
            <h1 className="page-heading">Authorized Analysis History</h1>
            <span className="heading-separator">·</span>
            <span className="heading-badge">{analysisHistory.length} Runs</span>
          </div>
          <p className="page-heading-sub">
            Historical audit trail of all DuckDB analytical jobs, query inputs, execution stages, and generated dashboard specs.
          </p>
        </div>

        {analysisHistory.length === 0 ? (
            <div className="empty-state-notice" style={{ marginTop: 20 }}>
              <p>No historical analyses recorded yet. Run your first analysis from the "Run STATA Agent" view.</p>
            </div>
            ) : (
              <div className="history-list-container">
                {analysisHistory.map(item => (
                          <div key={item.id} className="workbench-card history-item-card">
                            <div className="history-card-top">
                              <div className="history-query-info">
                                <div className="history-query-text">"{item.userQuery}"</div>
                                <div className="history-meta-row">
                                  <span className={`status-pill ${item.status === 'completed' ? 'status-healthy' : 'status-warning'}`}>
                                    {item.status.toUpperCase()}
                                  </span>
                                  <span>•</span>
                                  <span className="history-stage">Stage: <strong>{item.stage}</strong></span>
                                  <span>•</span>
                                  <span className="history-time">{new Date(item.createdAt).toLocaleString()}</span>
                                  <span>•</span>
                                  <span className="history-id">ID: <code>{item.id.slice(0, 8)}</code></span>
                                </div>
                              </div>

                              {item.dashboardSpec && (
                                <button
                                  className="btn-header-secondary"
                                  onClick={() => onViewDashboard(item.dashboardSpec!)}
                                >
                                  📊 View Results
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
