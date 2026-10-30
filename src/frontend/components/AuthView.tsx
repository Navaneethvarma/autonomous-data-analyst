import React from 'react';

interface AuthViewProps {
  authMode: 'login' | 'register';
  authEmail: string;
  authPassword: string;
  authName: string;
  authError: string;
  onModeChange: (mode: 'login' | 'register') => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onNameChange: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDemoMode: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  authMode,
  authEmail,
  authPassword,
  authName,
  authError,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onSubmit,
  onDemoMode,
}) => {
  return (
      <div className="auth-overlay-container">
        <div className="auth-card" id="auth-view">
          <div className="auth-brand-header">
            <img
              src="/stata-logo.png"
              alt="STATA Analytical Workbench"
              className="auth-logo-img"
              style={{ width: '56px', height: '56px', objectFit: 'contain', borderRadius: '12px', backgroundColor: '#0f172a', padding: '6px', margin: '0 auto 10px auto', display: 'block' }}
            />
            <h1 className="auth-brand-title">STATA</h1>
            <p className="auth-brand-subtitle">Analytical Workbench</p>
            <p className="auth-brand-author">by Navaneeth</p>
          </div>

              <div className="auth-mode-switch">
                <button
                  type="button"
                  className={`auth-mode-btn ${authMode === 'login' ? 'active' : ''}`}
                  onClick={() => onModeChange('login')}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`auth-mode-btn ${authMode === 'register' ? 'active' : ''}`}
                  onClick={() => onModeChange('register')}
                >
                  Create Account
                </button>
              </div>

        <h2 className="auth-title">
          {authMode === 'login' ? 'Sign In to Workspace' : 'Create Organization Account'}
        </h2>
        <p className="auth-desc">
          Secure Multi-Tenant Analytical Intelligence with DuckDB AST Sandboxing.
        </p>

        {authError && (
          <div className="auth-error-banner">
            ⚠️ {authError}
          </div>
        )}

        <form onSubmit={onSubmit} className="clean-vertical-form">
          {authMode === 'register' && (
            <div className="form-field-block">
              <label className="field-label">Full Name</label>
              <input
                className="field-input"
                type="text"
                value={authName}
                onChange={e => onNameChange(e.target.value)}
                placeholder="Alex Mercer"
                required
              />
            </div>
          )}

          <div className="form-field-block">
            <label className="field-label">Work Email</label>
            <input
              className="field-input"
              type="email"
              value={authEmail}
              onChange={e => onEmailChange(e.target.value)}
              placeholder="analyst@enterprise.com"
              required
            />
          </div>

          <div className="form-field-block">
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              value={authPassword}
              onChange={e => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="form-actions-row" style={{ marginTop: 8 }}>
            <button className="btn-primary" type="submit" style={{ width: '100%' }}>
              {authMode === 'login' ? 'Sign In to STATA' : 'Register Workspace'}
            </button>
          </div>
        </form>

        <div className="auth-footer-divider">
          <span>OR</span>
        </div>

        <button
          className="btn-secondary"
          onClick={onDemoMode}
          style={{ width: '100%' }}
        >
          🚀 Explore in Live Demo Mode (Sample Data)
        </button>

        <div className="auth-attribution-note">
          STATA · Built by Navaneeth
        </div>
      </div>
    </div>
          );
};
