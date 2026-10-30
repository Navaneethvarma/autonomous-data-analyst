import React from 'react';

export type WorkbenchTab =
  | 'overview'
  | 'quality'
  | 'distributions'
  | 'relationships'
  | 'trends'
  | 'explorer'
  | 'datasets'
  | 'analyze'
  | 'history'
  | 'schedules';

interface SidebarProps {
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  datasetName?: string;
  historyCount: number;
  schedulesCount: number;
  user: { id: string; email: string; name: string } | null;
  role: string;
  onLogout: () => void;
  onSignInClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  datasetName,
  historyCount,
  schedulesCount,
  user,
  role,
  onLogout,
  onSignInClick,
}) => {
  return (
    <aside className="stata-sidebar">
      {/* Brand Header with Official Logo & Navaneeth Attribution */}
      <div className="sidebar-brand">
        <div className="brand-badge">
          <img
            src="/stata-logo.png"
            alt="STATA Logo"
            className="brand-logo-img"
            style={{ width: '36px', height: '36px', minWidth: '36px', objectFit: 'contain', borderRadius: '8px', backgroundColor: '#0f172a', padding: '3px', flexShrink: 0 }}
          />
          <div className="brand-text-block">
            <div className="brand-name">STATA</div>
            <div className="brand-sub">Analytical Workbench</div>
            <div className="brand-author">by Navaneeth</div>
          </div>
        </div>
      </div>

      <div className="workspace-selector">
        <div className="workspace-label">ACTIVE WORKSPACE</div>
        <div className="workspace-select-box">
          <span className="workspace-dot" />
          <span className="workspace-name">Enterprise Analytics</span>
          <span className="workspace-chevron">▾</span>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        <div className="nav-group-title">ANALYTICS</div>

        <button
          className={`sidebar-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => onTabChange('overview')}
          title="Dataset summary and top agent findings"
        >
          <span className="nav-icon">📊</span>
          <span className="nav-text">Overview</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => onTabChange('quality')}
          title="Data health, null rates, and column profiles"
        >
          <span className="nav-icon">🛡️</span>
          <span className="nav-text">Data Quality</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'distributions' ? 'active' : ''}`}
          onClick={() => onTabChange('distributions')}
          title="Distributions, histograms, and IQR outliers"
        >
          <span className="nav-icon">📈</span>
          <span className="nav-text">Distributions</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'relationships' ? 'active' : ''}`}
          onClick={() => onTabChange('relationships')}
          title="Correlations, scatter plots, and statistical tests"
        >
          <span className="nav-icon">🔄</span>
          <span className="nav-text">Relationships</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'trends' ? 'active' : ''}`}
          onClick={() => onTabChange('trends')}
          title="Time-series and trajectory analysis"
        >
          <span className="nav-icon">📅</span>
          <span className="nav-text">Trends</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'explorer' ? 'active' : ''}`}
          onClick={() => onTabChange('explorer')}
          title="Filterable and sortable raw data table"
        >
          <span className="nav-icon">📑</span>
          <span className="nav-text">Data Explorer</span>
        </button>

        <div className="nav-group-title">AGENT & OPERATIONS</div>

        <button
          className={`sidebar-nav-item ${activeTab === 'analyze' ? 'active' : ''}`}
          onClick={() => onTabChange('analyze')}
          title="Run natural language analytical queries"
        >
          <span className="nav-icon">⚡</span>
          <span className="nav-text">Run STATA Agent</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'datasets' ? 'active' : ''}`}
          onClick={() => onTabChange('datasets')}
          title="Manage and upload datasets"
        >
          <span className="nav-icon">📁</span>
          <span className="nav-text">Datasets & Schema</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
          title="Execution history and audit logs"
        >
          <span className="nav-icon">⏱️</span>
          <span className="nav-text">Run History</span>
          {historyCount > 0 && <span className="nav-count">{historyCount}</span>}
        </button>

        <button
          className={`sidebar-nav-item ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => onTabChange('schedules')}
          title="Scheduled analyses and BI connections"
        >
          <span className="nav-icon">🔔</span>
          <span className="nav-text">Schedules & BI</span>
          {schedulesCount > 0 && <span className="nav-count">{schedulesCount}</span>}
        </button>
      </nav>

      {/* User / Auth Footer with STATA · Built by Navaneeth Attribution */}
      <div className="sidebar-footer">
        {user ? (
          <div className="user-profile-card">
            <div className="user-avatar">{user.name.charAt(0)}</div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role-badge">{role}</div>
            </div>
            <button className="btn-icon-logout" onClick={onLogout} title="Log Out">
              ✕
            </button>
          </div>
        ) : (
          <div className="demo-mode-card">
            <div className="demo-status">
              <span className="status-indicator live" />
              <span>STATA Demo Mode</span>
            </div>
            <button className="btn-signin-small" onClick={onSignInClick}>
              Sign In / Auth
            </button>
          </div>
        )}

        <div className="sidebar-brand-attribution">
          <span>STATA · Built by Navaneeth</span>
        </div>
      </div>
    </aside>
  );
};
