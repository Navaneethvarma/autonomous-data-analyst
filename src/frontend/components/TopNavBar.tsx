import React from 'react';

export type TabType = 'dashboard' | 'datasets' | 'analyze' | 'history' | 'schedules';

interface TopNavBarProps {
  activeTab: TabType;
  historyCount: number;
  schedulesCount: number;
  user: { id: string; email: string; name: string } | null;
  role: string;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
  onSignInClick: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  activeTab,
  historyCount,
  schedulesCount,
  user,
  role,
  onTabChange,
  onLogout,
  onSignInClick,
}) => {
  return (
    <nav className="top-nav">
      <div className="brand-section">
        <span style={{ fontSize: '1.4rem' }}>⚡</span>
        <span className="brand-title">Autonomous Data Analyst</span>
      </div>

      <div className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => onTabChange('dashboard')}
          id="tab-dashboard"
        >
          📊 Live Dashboard
        </button>

        <button
          className={`nav-tab ${activeTab === 'datasets' ? 'active' : ''}`}
          onClick={() => onTabChange('datasets')}
          id="tab-datasets"
        >
          📁 Datasets & Schema
        </button>

        <button
          className={`nav-tab ${activeTab === 'analyze' ? 'active' : ''}`}
          onClick={() => onTabChange('analyze')}
          id="tab-analyze"
        >
          🚀 Run Analysis
        </button>

        <button
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
          id="tab-history"
        >
          ⏱️ History ({historyCount})
        </button>

        <button
          className={`nav-tab ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => onTabChange('schedules')}
          id="tab-schedules"
        >
          📅 Schedules & BI ({schedulesCount})
        </button>
      </div>

      <div className="user-badge">
        {user ? (
          <>
            <span className={`role-pill role-${role}`}>{role}</span>
            <span style={{ fontSize: '0.85rem' }}>{user.email}</span>
            <button className="btn-secondary" onClick={onLogout} style={{ padding: '4px 10px' }}>
              Sign Out
            </button>
          </>
        ) : (
          <>
            <span className="role-pill role-viewer">Demo Mode</span>
            <button className="btn-secondary" onClick={onSignInClick} style={{ padding: '4px 10px' }}>
              Sign In
            </button>
          </>
        )}
      </div>
    </nav>
  );
};
