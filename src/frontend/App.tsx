import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { DashboardSpec, InsightCardSpec } from '../lib/dashboard/types.js';
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
import { AuthView } from './components/AuthView.js';
import { Sidebar, type WorkbenchTab } from './components/Sidebar.js';
import { WorkbenchHeader } from './components/WorkbenchHeader.js';
import { EvidenceInspector } from './components/EvidenceInspector.js';
import { OverviewView } from './components/OverviewView.js';
import { DataQualityView } from './components/DataQualityView.js';
import { DistributionsView } from './components/DistributionsView.js';
import { RelationshipsView } from './components/RelationshipsView.js';
import { TrendsView } from './components/TrendsView.js';
import { DataTable } from './components/DataTable.js';

const DatasetsView = React.lazy(() => import('./components/DatasetsView.js').then(m => ({ default: m.DatasetsView })));
const AnalyzeView = React.lazy(() => import('./components/AnalyzeView.js').then(m => ({ default: m.AnalyzeView })));
const HistoryView = React.lazy(() => import('./components/HistoryView.js').then(m => ({ default: m.HistoryView })));
const SchedulesBiView = React.lazy(() => import('./components/SchedulesBiView.js').then(m => ({ default: m.SchedulesBiView })));

interface AppProps {
  initialSpec?: DashboardSpec;
}

export const App: React.FC<AppProps> = ({ initialSpec }) => {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('overview');
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

  // Dashboard Spec State & Filters
  const [spec, setSpec] = useState<DashboardSpec | null>(initialSpec || SAMPLE_SALES_SPEC || null);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});

  // Evidence Inspector State
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [selectedInsightForEvidence, setSelectedInsightForEvidence] = useState<InsightCardSpec | null>(null);

  // Schedules & BI State
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

  // Check auth session on load
  useEffect(() => {
          const initSession = async () => {
            try {
              const currentUser = await api.getCurrentUser();
              setUser(currentUser);
              setRole(currentUser.role);
              setIsDemoMode(false);
              loadDatasets();
              loadHistory();
            } catch {
              if (!initialSpec) {
                setIsDemoMode(false);
    }
  }
    };
initSession();
  }, []);

const loadDatasets = async () => {
  try {
    const list = await api.listDatasets();
    setDatasets(list);
      if (list.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(list[0].id);
        loadProfile(list[0].id);
      }
    } catch {
      // offline
    }
  };

  const loadProfile = async (id: string) => {
    try {
      const profile = await api.getDatasetProfile(id);
      setSelectedProfile(profile);
    } catch {
      setSelectedProfile(null);
    }
  };

  const loadHistory = async () => {
    try {
      const history = await api.listAnalyses();
      setAnalysisHistory(history);
    } catch {
      // offline
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'login') {
        const res = await api.login(authEmail, authPassword);
        setUser(res.user);
        setRole(res.user.role);
      } else {
        const res = await api.register(authEmail, authPassword, authName);
        setUser(res.user);
        setRole(res.user.role);
      }
      setIsDemoMode(false);
      loadDatasets();
      loadHistory();
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setRole('viewer');
    setIsDemoMode(true);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadText.trim()) return;
    setUploading(true);
    try {
      const ds = await api.uploadDataset(uploadFilename, uploadText);
      await loadDatasets();
      setSelectedDatasetId(ds.id);
      await loadProfile(ds.id);
      setUploadText('');
      alert(`Dataset "${ds.name}" uploaded successfully! (${ds.rowCount} rows)`);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || !selectedDatasetId) return;
    setIsSubmittingAnalysis(true);
    try {
      const res = await api.createAnalysis(selectedDatasetId, queryInput);
      setActiveAnalysis(res.analysis);
      pollAnalysis(res.analysis.id);
    } catch (err: any) {
      alert(`Failed to start STATA analysis: ${err.message}`);
      setIsSubmittingAnalysis(false);
    }
  };

  const pollAnalysis = (analysisId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const item = await api.getAnalysis(analysisId);
        setActiveAnalysis(item);
        if (item.status === 'completed') {
          clearInterval(pollIntervalRef.current);
          setIsSubmittingAnalysis(false);
          loadHistory();
          if (item.dashboardSpec) {
            setSpec(item.dashboardSpec);
            setActiveTab('overview');
          }
        } else if (item.status === 'failed' || item.status === 'cancelled') {
          clearInterval(pollIntervalRef.current);
          setIsSubmittingAnalysis(false);
          loadHistory();
        }
      } catch {
        clearInterval(pollIntervalRef.current);
        setIsSubmittingAnalysis(false);
      }
    }, 1500);
  };

  const handleCancelAnalysis = async () => {
    if (!activeAnalysis) return;
    try {
      await api.cancelAnalysis(activeAnalysis.id);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setIsSubmittingAnalysis(false);
      setActiveAnalysis(prev => (prev ? { ...prev, status: 'cancelled' } : null));
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  };

  const handleFilterChange = (column: string, value: string) => {
    setSelectedFilters(prev => ({
      ...prev,
      [column]: value,
    }));
  };

  const handleResetFilters = () => {
    setSelectedFilters({});
  };

  // Filter Table Spec dynamically based on slicers
  const filteredTable = useMemo(() => {
    if (!spec?.table) return undefined;
    const activeEntries = Object.entries(selectedFilters).filter(([_, v]) => v !== 'All');
    if (activeEntries.length === 0) return spec.table;

    const filteredRows = spec.table.rows.filter(row => {
      return activeEntries.every(([col, val]) => String(row[col] ?? '') === val);
    });

    return {
      ...spec.table,
      rows: filteredRows,
      displayRowCount: filteredRows.length,
    };
  }, [spec?.table, selectedFilters]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createSchedule({
        name: scheduleName,
        query: scheduleQuery,
        datasetId: selectedDatasetId || datasets[0]?.id || 'default',
        type: scheduleType,
        cronExpression: scheduleType === 'recurring' ? scheduleCron : undefined,
        oneTimeAt: scheduleType === 'one_time' ? scheduleOneTimeAt : undefined,
        timezone: scheduleTimezone,
        deliveryDestinationIds: deliveryDestinations.map(d => d.id),
      });
      loadSchedules();
      alert('STATA Scheduled analysis saved!');
    } catch (err: any) {
      alert(err.message);
    }
  };

    const handleTriggerSchedule = async (id: string) => {
      try {
        await api.triggerSchedule(id);
        alert('Schedule triggered immediately! Job added to queue.');
      } catch (err: any) {
        alert(err.message);
      }
    };

    const handleDeleteSchedule = async (id: string) => {
      await api.deleteSchedule(id);
      loadSchedules();
    };

    const handleCreateDeliveryDestination = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await api.createDeliveryDestination({
          name: destName,
          type: destType,
          config: destType === 'email' ? { recipients: [destEmail] } : { webhookUrl: destWebhook },
        });
        setDestName('');
        loadDeliveryDestinations();
        alert('Destination configured!');
      } catch (err: any) {
        alert(err.message);
      }
    };

    const handleDeleteDeliveryDestination = async (id: string) => {
      await api.deleteDeliveryDestination(id);
      loadDeliveryDestinations();
    };

    const handleCreateBiConnection = async (e: React.FormEvent) => {
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
    };

    const handleTestBiConnection = async (id: string) => {
      setBiTestMsg('Testing connection...');
      try {
        const res = await api.testBiConnection(id);
        setBiTestMsg(`Connected in ${res.latencyMs}ms!`);
        loadBiConnections();
      } catch (err: any) {
        setBiTestMsg(`Test failed: ${err.message}`);
      }
    };

    const handleDeleteBiConnection = async (id: string) => {
      await api.deleteBiConnection(id);
      loadBiConnections();
    };

    const handleExportReport = () => {
      const reportPath = 'reports/wf_report_02511aed.html';
      window.open(`/${reportPath}`, '_blank');
    };

    const handleOpenEvidenceForInsight = (insight: InsightCardSpec) => {
      setSelectedInsightForEvidence(insight);
      setIsEvidenceOpen(true);
    };

    // Auth Gate
    if (!user && !isDemoMode) {
      return (
        <AuthView
          authMode={authMode}
          authEmail={authEmail}
          authPassword={authPassword}
          authName={authName}
          authError={authError}
          onModeChange={setAuthMode}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onNameChange={setAuthName}
          onSubmit={handleAuthSubmit}
          onDemoMode={() => setIsDemoMode(true)}
        />
      );
    }

    const activeFiltersCount = Object.keys(selectedFilters).filter(k => selectedFilters[k] !== 'All').length;

    return (
          <div className="stata-app-container">
          {/* 1. Left Sidebar Navigation with STATA branding */}
          <Sidebar
            activeTab={activeTab}
            onTabChange={tab => {
              setActiveTab(tab);
              if (tab === 'schedules') {
                loadSchedules();
                loadDeliveryDestinations();
                loadBiConnections();
              }
            }}
            datasetName={spec?.metadata.datasetName}
            historyCount={analysisHistory.length}
            schedulesCount={schedules.length}
            user={user}
            role={role}
            onLogout={handleLogout}
            onSignInClick={() => setIsDemoMode(false)}
          />

              {/* 2. Main Workbench Area */}
              <div className="stata-main-workspace">
                <WorkbenchHeader
                  metadata={spec?.metadata}
                  onRunAnalysisClick={() => setActiveTab('analyze')}
                  onUploadClick={() => setActiveTab('datasets')}
                  onOpenEvidence={() => {
                    setSelectedInsightForEvidence(null);
                    setIsEvidenceOpen(true);
                  }}
                  onExportReport={handleExportReport}
                  onResetFilters={handleResetFilters}
                  activeFiltersCount={activeFiltersCount}
                />

                <main className="workbench-content-scroll">
                  <React.Suspense fallback={<div className="loading-state" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading STATA View...</div>}>
                    {/* Overview View (Summary, prioritized agent findings, next steps) */}
                    {activeTab === 'overview' && spec && (
                      <OverviewView
                        spec={spec}
                        selectedFilters={selectedFilters}
                        onFilterChange={handleFilterChange}
                        onResetFilters={handleResetFilters}
                        onSelectInsightForEvidence={handleOpenEvidenceForInsight}
                        onNavigateToTab={tab => setActiveTab(tab)}
                      />
                    )}

                    {/* Data Quality & Profiling (Image 2 style column cards) */}
                    {activeTab === 'quality' && spec && (
                      <DataQualityView
                        spec={spec}
                        onOpenEvidence={() => {
                          setSelectedInsightForEvidence(null);
                          setIsEvidenceOpen(true);
                        }}
                      />
                    )}

                    {/* Distributions View (Histograms, box plots, skewness) */}
                    {activeTab === 'distributions' && spec && (
                      <DistributionsView
                        spec={spec}
                        onOpenEvidence={() => {
                          setSelectedInsightForEvidence(null);
                          setIsEvidenceOpen(true);
                        }}
                      />
                    )}

                  {/* Relationships & Correlations View (Pearson r, causation disclaimers) */}
                  {activeTab === 'relationships' && spec && (
                    <RelationshipsView
                      spec={spec}
                      onOpenEvidence={() => {
                        setSelectedInsightForEvidence(null);
                        setIsEvidenceOpen(true);
                      }}
                    />
                  )}

                  {/* Trends View (Time-series trajectory along verified dates) */}
                  {activeTab === 'trends' && spec && (
                    <TrendsView
                      spec={spec}
                      onOpenEvidence={() => {
                        setSelectedInsightForEvidence(null);
                        setIsEvidenceOpen(true);
                      }}
                    />
                  )}

                  {/* Data Explorer Table (Image 4 style readable table) */}
                  {activeTab === 'explorer' && spec && (
                    <div className="workbench-page-container">
                      <DataTable
                        table={filteredTable || spec.table}
                        activeFilters={selectedFilters}
                      />
                    </div>
                  )}

                  {/* Datasets View */}
                  {activeTab === 'datasets' && (
                    <DatasetsView
                      datasets={datasets}
                      selectedDatasetId={selectedDatasetId}
                      selectedProfile={selectedProfile}
                      uploadFilename={uploadFilename}
                      uploadText={uploadText}
                      uploading={uploading}
                      onFilenameChange={setUploadFilename}
                      onTextChange={setUploadText}
                      onSelectDataset={id => {
                        setSelectedDatasetId(id);
                        loadProfile(id);
                      }}
                      onUploadSubmit={handleUploadSubmit}
                    />
                  )}

                  {/* Run STATA Agent View */}
                  {activeTab === 'analyze' && (
                    <AnalyzeView
                      datasets={datasets}
                      selectedDatasetId={selectedDatasetId}
                      queryInput={queryInput}
                      isSubmittingAnalysis={isSubmittingAnalysis}
                      activeAnalysis={activeAnalysis}
                      onDatasetChange={setSelectedDatasetId}
                      onQueryChange={setQueryInput}
                      onSubmit={handleStartAnalysis}
                      onCancel={handleCancelAnalysis}
                    />
                  )}

                  {/* History View */}
                  {activeTab === 'history' && (
                    <HistoryView
                      analysisHistory={analysisHistory}
                      onViewDashboard={itemSpec => {
                        setSpec(itemSpec);
                        setActiveTab('overview');
                      }}
                    />
                  )}

                  {/* Schedules & BI View */}
                  {activeTab === 'schedules' && (
                    <SchedulesBiView
                      schedules={schedules}
                      deliveryDestinations={deliveryDestinations}
                      biConnections={biConnections}
                      scheduleName={scheduleName}
                      scheduleQuery={scheduleQuery}
                      scheduleType={scheduleType}
                      scheduleCron={scheduleCron}
                      scheduleTimezone={scheduleTimezone}
                      scheduleOneTimeAt={scheduleOneTimeAt}
                      destName={destName}
                      destType={destType}
                      destEmail={destEmail}
                      destWebhook={destWebhook}
                      biHost={biHost}
                      biUser={biUser}
                      biPass={biPass}
                      biTestMsg={biTestMsg}
                      onScheduleNameChange={setScheduleName}
                      onScheduleQueryChange={setScheduleQuery}
                      onScheduleTypeChange={setScheduleType}
                      onScheduleCronChange={setScheduleCron}
                      onScheduleTimezoneChange={setScheduleTimezone}
                      onScheduleOneTimeAtChange={setScheduleOneTimeAt}
                      onDestNameChange={setDestName}
                      onDestTypeChange={setDestType}
                      onDestEmailChange={setDestEmail}
                      onDestWebhookChange={setDestWebhook}
                      onBiHostChange={setBiHost}
                      onBiUserChange={setBiUser}
                      onBiPassChange={setBiPass}
                      onCreateSchedule={handleCreateSchedule}
                      onTriggerSchedule={handleTriggerSchedule}
                      onDeleteSchedule={handleDeleteSchedule}
                      onCreateDeliveryDestination={handleCreateDeliveryDestination}
                      onDeleteDeliveryDestination={handleDeleteDeliveryDestination}
                      onCreateBiConnection={handleCreateBiConnection}
                      onTestBiConnection={handleTestBiConnection}
                      onDeleteBiConnection={handleDeleteBiConnection}
                    />
                  )}
                </React.Suspense>
              </main>
          </div>

          {/* 3. Slide-Out Evidence Inspector Drawer */}
          {spec && (
            <EvidenceInspector
              isOpen={isEvidenceOpen}
              onClose={() => setIsEvidenceOpen(false)}
              spec={spec}
              selectedInsight={selectedInsightForEvidence}
              activeFilters={selectedFilters}
            />
          )}
      </div>
    );
  };
