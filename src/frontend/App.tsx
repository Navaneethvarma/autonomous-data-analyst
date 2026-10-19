import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { DashboardSpec } from '../lib/dashboard/types.js';
import {
  api,
  DatasetItem,
  DatasetProfile,
  AnalysisItem,
  ScheduleItem,
  DeliveryDestinationItem,
  BiConnectionItem,
} from './api.js';
import { SAMPLE_SALES_SPEC } from './sample-spec.js';
import { KpiCard } from './components/KpiCard.js';
import { EChartsChart } from './components/EChartsChart.js';
import { FilterBar } from './components/FilterBar.js';
import { InsightsPanel } from './components/InsightsPanel.js';
import { CorrelationView } from './components/CorrelationView.js';
import { DataTable } from './components/DataTable.js';

interface AppProps {
  initialSpec?: DashboardSpec;
}

type TabType = 'dashboard' | 'datasets' | 'analyze' | 'history' | 'schedules';

export const App: React.FC<AppProps> = ({ initialSpec }) => {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [role, setRole] = useState<string>('viewer');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(!api.getToken() && !!initialSpec);
  const [authError, setAuthError] = useState<string>('');

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('analyst@example.com');
  const [authPassword, setAuthPassword] = useState('Password123!');
  const [authName, setAuthName] = useState('Alex Mercer');

  // Datasets State
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<DatasetProfile | null>(null);
  const [uploadText, setUploadText] = useState('');
  const [uploadFilename, setUploadFilename] = useState('sales_data.csv');
  const [uploading, setUploading] = useState(false);

  // Analysis / Workflow State
  const [queryInput, setQueryInput] = useState('');
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisItem | null>(null);
  const [isSubmittingAnalysis, setIsSubmittingAnalysis] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisItem[]>([]);
  const pollIntervalRef = useRef<any>(null);

  // Dashboard Spec State
  const [spec, setSpec] = useState<DashboardSpec | null>(initialSpec || SAMPLE_SALES_SPEC || null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});

  // Schedules & BI State (Milestone 12)
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [deliveryDestinations, setDeliveryDestinations] = useState<DeliveryDestinationItem[]>([]);
  const [biConnections, setBiConnections] = useState<BiConnectionItem[]>([]);
  const [scheduleName, setScheduleName] = useState('Weekly Revenue & Margin Review');
  const [scheduleQuery, setScheduleQuery] = useState('Analyze revenue, profit margins, and anomalies across regions');
  const [scheduleCron, setScheduleCron] = useState('0 9 * * 1');
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York');
  const [scheduleType, setScheduleType] = useState<'recurring' | 'one_time'>('recurring');
  const [scheduleOneTimeAt, setScheduleOneTimeAt] = useState('');
  const [destName, setDestName] = useState('');
  const [destType, setDestType] = useState<'email' | 'webhook'>('email');
  const [destEmail, setDestEmail] = useState('');
  const [destWebhook, setDestWebhook] = useState('');
  const [biHost, setBiHost] = useState('http://localhost:8088');
  const [biUser, setBiUser] = useState('admin');
  const [biPass, setBiPass] = useState('admin');
  const [biTestMsg, setBiTestMsg] = useState('');

  const loadSchedules = async () => {
    try {
      const list = await api.listSchedules();
      setSchedules(list);
    } catch {
      // offline
    }
  };

  const loadDeliveryDestinations = async () => {
    try {
      const list = await api.listDeliveryDestinations();
      setDeliveryDestinations(list);
    } catch {
      // offline
    }
  };

  const loadBiConnections = async () => {
    try {
      const list = await api.listBiConnections();
      setBiConnections(list);
    } catch {
      // offline
    }
  };

  // Verify auth on mount
  useEffect(() => {
    if (api.getToken()) {
      api.me()
        .then(res => {
          setUser(res.user);
          setRole(res.role);
          setIsDemoMode(false);
          loadDatasets();
          loadHistory();
          loadSchedules();
          loadDeliveryDestinations();
          loadBiConnections();
        })
        .catch(() => {
          api.setToken(null);
          setIsDemoMode(true);
        });
    }
  }, []);

  // Cleanup polling timer
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const loadDatasets = async () => {
    try {
      const list = await api.listDatasets();
      setDatasets(list);
      if (list.length > 0 && !selectedDatasetId && list[0]) {
        setSelectedDatasetId(list[0].id);
        loadProfile(list[0].id);
      }
    } catch {
      // offline or error
    }
  };

  const loadProfile = async (id: string) => {
    try {
      const prof = await api.getDatasetProfile(id);
      setSelectedProfile(prof);
    } catch {
      setSelectedProfile(null);
    }
  };

  const loadHistory = async () => {
    try {
      const items = await api.listAnalyses();
      setAnalysisHistory(items);
    } catch {
      // ignore
    }
  };

  // Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'login') {
        const res = await api.login({ email: authEmail, password: authPassword });
        setUser(res.user);
        setRole(res.role);
        setIsDemoMode(false);
      } else {
        const res = await api.register({ email: authEmail, password: authPassword, name: authName });
        setUser(res.user);
        setRole(res.role);
        setIsDemoMode(false);
      }
      loadDatasets();
      loadHistory();
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setIsDemoMode(true);
    setSpec(initialSpec || SAMPLE_SALES_SPEC);
  };

  // Dataset Upload Handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadText.trim()) return;
    setUploading(true);
    try {
      const res = await api.uploadDataset(uploadFilename, uploadText);
      await loadDatasets();
      setSelectedDatasetId(res.dataset.id);
      setSelectedProfile(res.profile);
      setUploadText('');
      alert(`Dataset '${res.dataset.originalFilename}' uploaded and profiled successfully! (${res.dataset.rowCount} rows)`);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Analysis Submission & Polling
  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDatasetId || !queryInput.trim()) return;
    setIsSubmittingAnalysis(true);

    try {
      const { analysisId } = await api.createAnalysis(selectedDatasetId, queryInput.trim());
      
      // Start live polling
      const poll = async () => {
        try {
          const item = await api.getAnalysis(analysisId);
          setActiveAnalysis(item);

          if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled' || item.status === 'partial_success') {
            clearInterval(pollIntervalRef.current);
            setIsSubmittingAnalysis(false);
            loadHistory();

            if (item.dashboardSpec) {
              setSpec(item.dashboardSpec);
              setActiveTab('dashboard');
            }
          }
        } catch {
          // keep polling
        }
      };

      await poll();
      pollIntervalRef.current = setInterval(poll, 800);
    } catch (err: any) {
      alert(`Submission failed: ${err.message}`);
      setIsSubmittingAnalysis(false);
    }
  };

  const handleCancelAnalysis = async () => {
    if (!activeAnalysis) return;
    try {
      await api.cancelAnalysis(activeAnalysis.id);
      alert('Analysis cancellation requested.');
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  };

  // Slicer Filters
  const handleFilterChange = (column: string, value: string) => {
    setSelectedFilters(prev => ({
      ...prev,
      [column]: value,
    }));
  };

  const handleResetFilters = () => {
    setSelectedFilters({});
  };

  // Filter table rows based on active slicers
  const filteredTable = useMemo(() => {
    if (!spec?.table) return undefined;
    const hasActive = Object.values(selectedFilters).some(v => v !== 'All');
    if (!hasActive) return spec.table;

    const filteredRows = spec.table.rows.filter(row => {
      for (const [col, val] of Object.entries(selectedFilters)) {
        if (val !== 'All' && String(row[col]) !== val) {
          return false;
        }
      }
      return true;
    });

    return {
      ...spec.table,
      rows: filteredRows,
      totalRows: filteredRows.length,
    };
  }, [spec?.table, selectedFilters]);

  // Auth Gate
  if (!user && !isDemoMode) {
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

        <form onSubmit={handleAuthSubmit}>
          {authMode === 'register' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                type="text"
                value={authName}
                onChange={e => setAuthName(e.target.value)}
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
              onChange={e => setAuthEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
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
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          >
            {authMode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign In'}
          </button>

          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            onClick={() => setIsDemoMode(true)}
          >
            Explore Demo Mode ➔
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Top Navigation Bar */}
      <nav className="top-nav">
        <div className="brand-section">
          <span style={{ fontSize: '1.4rem' }}>⚡</span>
          <span className="brand-title">Autonomous Data Analyst</span>
        </div>

        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
            id="tab-dashboard"
          >
            📊 Live Dashboard
          </button>

          <button
            className={`nav-tab ${activeTab === 'datasets' ? 'active' : ''}`}
            onClick={() => setActiveTab('datasets')}
            id="tab-datasets"
          >
            📁 Datasets & Schema
          </button>

          <button
            className={`nav-tab ${activeTab === 'analyze' ? 'active' : ''}`}
            onClick={() => setActiveTab('analyze')}
            id="tab-analyze"
          >
            🚀 Run Analysis
          </button>

          <button
            className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            id="tab-history"
          >
            ⏱️ History ({analysisHistory.length})
          </button>

          <button
            className={`nav-tab ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('schedules');
              loadSchedules();
              loadDeliveryDestinations();
              loadBiConnections();
            }}
            id="tab-schedules"
          >
            📅 Schedules & BI ({schedules.length})
          </button>
        </div>

        <div className="user-badge">
          {user ? (
            <>
              <span className={`role-pill role-${role}`}>{role}</span>
              <span style={{ fontSize: '0.85rem' }}>{user.email}</span>
              <button className="btn-secondary" onClick={handleLogout} style={{ padding: '4px 10px' }}>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <span className="role-pill role-viewer">Demo Mode</span>
              <button className="btn-secondary" onClick={() => setIsDemoMode(false)} style={{ padding: '4px 10px' }}>
                Sign In
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="dashboard-container">
        {/* ================================================================= */}
        {/* TAB 1: DATASETS & SCHEMA */}
        {/* ================================================================= */}
        {activeTab === 'datasets' && (
          <section id="datasets-view">
            <h2 className="section-title">
              <span>Tenant Datasets & Schemas</span>
              <span className="section-badge">{datasets.length} Registered</span>
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
              {/* Upload Card */}
              <div className="kpi-card" style={{ padding: 24 }}>
                <h3 style={{ marginBottom: 12, fontSize: '1.1rem' }}>Upload New Dataset</h3>
                <form onSubmit={handleUploadSubmit}>
                  <div className="form-group">
                    <label className="form-label">Filename (.csv or .parquet)</label>
                    <input
                      className="form-input"
                      value={uploadFilename}
                      onChange={e => setUploadFilename(e.target.value)}
                      placeholder="transactions.csv"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Paste CSV Content or Sample Data</label>
                    <textarea
                      className="form-input"
                      rows={8}
                      value={uploadText}
                      onChange={e => setUploadText(e.target.value)}
                      placeholder="product_category,revenue,units_sold&#10;Electronics,14200.50,45&#10;Apparel,8920.00,120&#10;Home Goods,5400.75,34"
                      required
                    />
                  </div>

                  <button className="btn-primary" type="submit" disabled={uploading}>
                    {uploading ? 'Validating & Profiling...' : 'Upload & Profile Dataset'}
                  </button>
                </form>
              </div>

              {/* Registered Datasets List */}
              <div className="kpi-card" style={{ padding: 24 }}>
                <h3 style={{ marginBottom: 12, fontSize: '1.1rem' }}>Available Datasets</h3>
                {datasets.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No datasets uploaded yet in this organization.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {datasets.map(d => (
                      <div
                        key={d.id}
                        onClick={() => {
                          setSelectedDatasetId(d.id);
                          loadProfile(d.id);
                        }}
                        style={{
                          padding: 12,
                          background: d.id === selectedDatasetId ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-secondary)',
                          border: `1px solid ${d.id === selectedDatasetId ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{d.originalFilename}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {d.rowCount} rows • {d.columnCount} columns • {(d.fileSizeBytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Profile Inspector */}
            {selectedProfile && (
              <div className="kpi-card" style={{ marginTop: 24, padding: 24 }}>
                <h3 style={{ marginBottom: 12 }}>Schema & Column Profile</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Column Name</th>
                        <th>Inferred Type</th>
                        <th>Null Count</th>
                        <th>Distinct Values</th>
                        <th>Sample Values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProfile.columns.map(col => (
                        <tr key={col.name}>
                          <td style={{ fontWeight: 600 }}>{col.name}</td>
                          <td><code>{col.inferredType}</code></td>
                          <td>{col.nullCount}</td>
                          <td>{col.distinctCount}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            {col.sampleValues.slice(0, 3).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 2: RUN ANALYSIS */}
        {/* ================================================================= */}
        {activeTab === 'analyze' && (
          <section id="analyze-view">
            <h2 className="section-title">
              <span>Submit Analytical Query</span>
              <span className="section-badge">Autonomous Workflow Pipeline</span>
            </h2>

            <div className="kpi-card" style={{ padding: 24, marginTop: 20 }}>
              <form onSubmit={handleStartAnalysis}>
                <div className="form-group">
                  <label className="form-label">Target Dataset</label>
                  <select
                    className="form-input"
                    value={selectedDatasetId}
                    onChange={e => setSelectedDatasetId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Dataset --</option>
                    {datasets.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.originalFilename} ({d.rowCount} rows)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Business Question</label>
                  <input
                    className="form-input"
                    value={queryInput}
                    onChange={e => setQueryInput(e.target.value)}
                    placeholder="e.g. What is the total gross revenue grouped by product category?"
                    required
                  />
                </div>

                <button
                  className="btn-primary"
                  type="submit"
                  disabled={isSubmittingAnalysis || !selectedDatasetId}
                  id="run-analysis-btn"
                >
                  {isSubmittingAnalysis ? 'Executing Background Workflow...' : 'Execute Analysis'}
                </button>
              </form>
            </div>

            {/* Live Progress Bar */}
            {activeAnalysis && (
              <div className="progress-box" id="analysis-progress-panel">
                <div className="progress-header">
                  <div>
                    <strong>Analysis Stage: </strong>
                    <code style={{ color: 'var(--accent-cyan)' }}>{activeAnalysis.stage}</code>
                  </div>
                  <div>
                    <span>{activeAnalysis.progressPercent}%</span>
                  </div>
                </div>

                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${activeAnalysis.progressPercent}%` }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Query: "{activeAnalysis.userQuery}"
                  </span>

                  {isSubmittingAnalysis && (
                    <button className="btn-secondary" onClick={handleCancelAnalysis}>
                      Cancel Analysis
                    </button>
                  )}
                </div>

                {/* Clarification Alert if ambiguous metric */}
                {activeAnalysis.clarificationQuestion && (
                  <div className="clarification-card" style={{ marginTop: 16 }}>
                    <h4>⚠️ Business Metric Ambiguity Detected</h4>
                    <p style={{ marginTop: 6, fontSize: '0.9rem' }}>
                      {activeAnalysis.clarificationQuestion}
                    </p>
                    <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Please re-submit your question clarifying which metric variant you want computed.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ANALYSIS HISTORY */}
        {/* ================================================================= */}
        {activeTab === 'history' && (
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
                          onClick={() => {
                            setSpec(item.dashboardSpec);
                            setActiveTab('dashboard');
                          }}
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
        )}

        {/* ================================================================= */}
        {/* TAB 4: SCHEDULES & BI INTEGRATIONS (Milestone 12) */}
        {/* ================================================================= */}
        {activeTab === 'schedules' && (
          <section id="schedules-view">
            <h2 className="section-title">
              <span>Scheduled Autonomous Analyses & BI Integrations</span>
              <span className="section-badge">{schedules.length} Active Schedules</span>
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, marginTop: 20 }}>
              {/* Left Column: Schedules List & Creation */}
              <div>
                <div className="kpi-card" style={{ padding: 24, marginBottom: 24 }}>
                  <h3 style={{ marginBottom: 16, fontSize: '1.1rem' }}>📅 Recurring & One-Time Schedules</h3>

                  {schedules.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      No schedules configured yet. Create a recurring schedule below to automate recurring BI analyses.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {schedules.map(s => (
                        <div
                          key={s.id}
                          style={{
                            padding: 16,
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{s.name}</span>
                              <span className={`role-pill role-${s.status === 'active' ? 'admin' : 'viewer'}`}>
                                {s.status}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {s.timezone}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                              Query: "{s.userQuery}"
                            </div>
                            <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                              Cron: <code>{s.cronExpression || 'One-Time'}</code> • Next Run: <strong>{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : 'N/A'}</strong>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                              onClick={async () => {
                                await api.triggerSchedule(s.id);
                                loadSchedules();
                                alert(`Schedule '${s.name}' triggered!`);
                              }}
                            >
                              ⚡ Run Now
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '0.85rem', color: '#ff6b6b' }}
                              onClick={async () => {
                                await api.deleteSchedule(s.id);
                                loadSchedules();
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Create Schedule Form */}
                <div className="kpi-card" style={{ padding: 24 }}>
                  <h3 style={{ marginBottom: 16, fontSize: '1.1rem' }}>➕ New Scheduled Autonomous Analysis</h3>
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      if (!selectedDatasetId) {
                        alert('Please upload or select a dataset first.');
                        return;
                      }
                      try {
                        await api.createSchedule({
                          datasetId: selectedDatasetId,
                          name: scheduleName,
                          userQuery: scheduleQuery,
                          scheduleType,
                          cronExpression: scheduleType === 'recurring' ? scheduleCron : undefined,
                          timezone: scheduleTimezone,
                          oneTimeRunAt: scheduleType === 'one_time' ? scheduleOneTimeAt : undefined,
                        });
                        loadSchedules();
                        alert('Schedule created successfully!');
                      } catch (err: any) {
                        alert(`Failed to create schedule: ${err.message}`);
                      }
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label">Schedule Name</label>
                      <input
                        className="form-input"
                        value={scheduleName}
                        onChange={e => setScheduleName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Analytical Business Question</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        value={scheduleQuery}
                        onChange={e => setScheduleQuery(e.target.value)}
                        required
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="form-group">
                        <label className="form-label">Schedule Type</label>
                        <select
                          className="form-input"
                          value={scheduleType}
                          onChange={e => setScheduleType(e.target.value as any)}
                        >
                          <option value="recurring">Recurring (Cron)</option>
                          <option value="one_time">One-Time</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">IANA Timezone</label>
                        <input
                          className="form-input"
                          value={scheduleTimezone}
                          onChange={e => setScheduleTimezone(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {scheduleType === 'recurring' ? (
                      <div className="form-group">
                        <label className="form-label">5-Field Cron Expression</label>
                        <input
                          className="form-input"
                          value={scheduleCron}
                          onChange={e => setScheduleCron(e.target.value)}
                          placeholder="0 9 * * 1 (Every Monday at 9am)"
                          required
                        />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label className="form-label">Run Timestamp (ISO)</label>
                        <input
                          className="form-input"
                          type="datetime-local"
                          value={scheduleOneTimeAt}
                          onChange={e => setScheduleOneTimeAt(new Date(e.target.value).toISOString())}
                          required
                        />
                      </div>
                    )}

                    <button className="btn-primary" type="submit" style={{ marginTop: 8 }}>
                      Create Schedule
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Delivery Destinations & BI Connections */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Delivery Destinations */}
                <div className="kpi-card" style={{ padding: 24 }}>
                  <h3 style={{ marginBottom: 12, fontSize: '1.1rem' }}>📬 Report Delivery Channels</h3>
                  {deliveryDestinations.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No delivery destinations yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {deliveryDestinations.map(d => (
                        <div
                          key={d.id}
                          style={{
                            padding: 10,
                            borderRadius: 6,
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.85rem',
                          }}
                        >
                          <div>
                            <strong>{d.name}</strong> ({d.destinationType})
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                              {d.recipientEmails || d.webhookUrl}
                            </div>
                          </div>
                          <button
                            className="btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#ff6b6b' }}
                            onClick={async () => {
                              await api.deleteDeliveryDestination(d.id);
                              loadDeliveryDestinations();
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      try {
                        await api.createDeliveryDestination({
                          name: destName,
                          destinationType: destType,
                          recipientEmails: destType === 'email' ? destEmail : undefined,
                          webhookUrl: destType === 'webhook' ? destWebhook : undefined,
                        });
                        setDestName('');
                        setDestEmail('');
                        setDestWebhook('');
                        loadDeliveryDestinations();
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                  >
                    <div className="form-group">
                      <input
                        className="form-input"
                        placeholder="Destination Name"
                        value={destName}
                        onChange={e => setDestName(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <label style={{ fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="destType"
                          checked={destType === 'email'}
                          onChange={() => setDestType('email')}
                        /> Email
                      </label>
                      <label style={{ fontSize: '0.85rem' }}>
                        <input
                          type="radio"
                          name="destType"
                          checked={destType === 'webhook'}
                          onChange={() => setDestType('webhook')}
                        /> Webhook
                      </label>
                    </div>

                    {destType === 'email' ? (
                      <div className="form-group">
                        <input
                          className="form-input"
                          placeholder="recipients@company.com"
                          value={destEmail}
                          onChange={e => setDestEmail(e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <div className="form-group">
                        <input
                          className="form-input"
                          placeholder="https://hooks.slack.com/..."
                          value={destWebhook}
                          onChange={e => setDestWebhook(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    <button className="btn-secondary" type="submit" style={{ width: '100%' }}>
                      + Add Delivery Destination
                    </button>
                  </form>
                </div>

                {/* BI Platform Integrations */}
                <div className="kpi-card" style={{ padding: 24 }}>
                  <h3 style={{ marginBottom: 12, fontSize: '1.1rem' }}>📊 Apache Superset BI Connection</h3>
                  {biConnections.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No BI connections configured yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {biConnections.map(c => (
                        <div
                          key={c.id}
                          style={{
                            padding: 10,
                            borderRadius: 6,
                            background: 'var(--bg-secondary)',
                            fontSize: '0.85rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong>{c.name}</strong>
                            <span className={`role-pill role-${c.status === 'connected' ? 'admin' : 'viewer'}`}>
                              {c.status}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>
                            {c.hostUrl}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={async () => {
                                setBiTestMsg('Testing connection...');
                                try {
                                  const res = await api.testBiConnection(c.id);
                                  setBiTestMsg(`Connected in ${res.latencyMs}ms!`);
                                  loadBiConnections();
                                } catch (err: any) {
                                  setBiTestMsg(`Test failed: ${err.message}`);
                                }
                              }}
                            >
                              Test Connection
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ff6b6b' }}
                              onClick={async () => {
                                await api.deleteBiConnection(c.id);
                                loadBiConnections();
                              }}
                            >
                              Delete
                            </button>
                          </div>
                          {biTestMsg && (
                            <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--accent-color)' }}>
                              {biTestMsg}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      try {
                        await api.createBiConnection({
                          name: 'Corporate Apache Superset',
                          platformType: 'superset',
                          hostUrl: biHost,
                          username: biUser,
                          password: biPass,
                        });
                        loadBiConnections();
                        alert('Superset BI Connection registered!');
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                  >
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Superset Host URL</label>
                      <input
                        className="form-input"
                        value={biHost}
                        onChange={e => setBiHost(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Username</label>
                        <input
                          className="form-input"
                          value={biUser}
                          onChange={e => setBiUser(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Password</label>
                        <input
                          className="form-input"
                          type="password"
                          value={biPass}
                          onChange={e => setBiPass(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <button className="btn-secondary" type="submit" style={{ width: '100%' }}>
                      + Connect Apache Superset
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 4: LIVE DASHBOARD */}
        {/* ================================================================= */}
        {activeTab === 'dashboard' && spec && (
          <section id="dashboard-view">
            {/* Top Header */}
            <header className="dashboard-header">
              <div>
                <div className="header-badge">
                  <span className="pulse-dot" />
                  <span>Autonomous Data Analyst • Live Analytical Execution</span>
                </div>
                <h1 className="dashboard-title">{spec.metadata.title}</h1>
                <p className="dashboard-desc">{spec.metadata.description}</p>
              </div>

              <div className="header-meta">
                <div className="meta-pill verified" title="Calculated across 100% of rows">
                  <span>✓</span>
                  <span>Dataset: <strong>{spec.metadata.datasetName}</strong></span>
                </div>

                <div className="meta-pill">
                  <span>Rows: <strong>{spec.metadata.datasetRowCount}</strong></span>
                  <span>•</span>
                  <span>Columns: <strong>{spec.metadata.datasetColumnCount}</strong></span>
                </div>

                <div className="meta-pill">
                  <span>Completeness: <strong>{spec.metadata.completenessScore}%</strong></span>
                </div>

                <div className="meta-pill" style={{ fontSize: '0.75rem' }}>
                  <span>Engine: <strong>{spec.metadata.engine}</strong></span>
                </div>
              </div>
            </header>

            {/* Slicers */}
            <FilterBar
              filters={spec.filters}
              selectedFilters={selectedFilters}
              onFilterChange={handleFilterChange}
              onReset={handleResetFilters}
            />

            {/* Headline KPI Cards */}
            <section aria-label="Key Performance Indicators">
              <div className="kpi-grid">
                {spec.kpis.map(kpi => (
                  <KpiCard key={kpi.id} kpi={kpi} />
                ))}
              </div>
            </section>

            {/* Evidence-Backed Strategic Insights */}
            <InsightsPanel insights={spec.insights} />

            {/* Visualizations Grid */}
            <section aria-label="Visualizations">
              <h2 className="section-title">
                <span>Multidimensional Visualizations</span>
                <span className="section-badge">{spec.charts.length} Views</span>
              </h2>

              <div className="charts-grid">
                {spec.charts.map(chart => (
                  <EChartsChart key={chart.id} chart={chart} />
                ))}
              </div>
            </section>

            {/* Correlation Matrix */}
            {spec.correlationMatrix && (
              <section aria-label="Statistical Correlation">
                <CorrelationView correlationMatrix={spec.correlationMatrix} />
              </section>
            )}

            {/* Data Table */}
            {filteredTable && (
              <section aria-label="Detailed Records">
                <DataTable table={filteredTable} activeFilters={selectedFilters} />
              </section>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
