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
    <div className="auth-card" id="auth-view">
      <h2 className="auth-title">
        {authMode === 'login' ? 'Sign In to Workspace' : 'Create Organization Account'}
      </h2>
      <p className="auth-desc">
        Autonomous Data Analyst • Secure Multi-Tenant Analytical Intelligence
      </p>

      {authError && (
        <div style={{ color: 'var(--accent-rose)', marginBottom: 16, fontSize: '0.85rem' }}>
          ⚠️ {authError}
        </div>
      )}

      <form onSubmit={onSubmit}>
        {authMode === 'register' && (
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-input"
              type="text"
              value={authName}
              onChange={e => onNameChange(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Work Email</label>
          <input
            className="form-input"
            type="email"
            value={authEmail}
            onChange={e => onEmailChange(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            value={authPassword}
            onChange={e => onPasswordChange(e.target.value)}
            required
          />
        </div>

        <button className="btn-primary" type="submit" id="auth-submit-btn">
          {authMode === 'login' ? 'Sign In' : 'Register Organization'}
        </button>
      </form>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer' }}
          onClick={() => onModeChange(authMode === 'login' ? 'register' : 'login')}
        >
          {authMode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign In'}
        </button>

        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          onClick={onDemoMode}
        >
          Explore Demo Mode ➔
        </button>
      </div>
    </div>
  );
};
