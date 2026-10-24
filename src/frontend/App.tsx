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
import { AuthView } from './components/AuthView.js';
import { TopNavBar, type TabType } from './components/TopNavBar.js';

const DatasetsView = React.lazy(() => import('./components/DatasetsView.js').then(m => ({ default: m.DatasetsView })));
const AnalyzeView = React.lazy(() => import('./components/AnalyzeView.js').then(m => ({ default: m.AnalyzeView })));
const HistoryView = React.lazy(() => import('./components/HistoryView.js').then(m => ({ default: m.HistoryView })));
const SchedulesBiView = React.lazy(() => import('./components/SchedulesBiView.js').then(m => ({ default: m.SchedulesBiView })));
const DashboardView = React.lazy(() => import('./components/DashboardView.js').then(m => ({ default: m.DashboardView })));

interface AppProps {
  initialSpec?: DashboardSpec;
}

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

  const handleCreateSchedule = async (e: React.FormEvent) => {
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
  };

  const handleTriggerSchedule = async (id: string, name: string) => {
    await api.triggerSchedule(id);
    loadSchedules();
    alert(`Schedule '${name}' triggered!`);
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

  return (
    <div>
      <TopNavBar
        activeTab={activeTab}
        historyCount={analysisHistory.length}
        schedulesCount={schedules.length}
        user={user}
        role={role}
        onTabChange={tab => {
          setActiveTab(tab);
          if (tab === 'schedules') {
            loadSchedules();
            loadDeliveryDestinations();
            loadBiConnections();
          }
        }}
        onLogout={handleLogout}
        onSignInClick={() => setIsDemoMode(false)}
      />

      <div className="dashboard-container">
        <React.Suspense fallback={<div className="loading-state" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading view...</div>}>
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

        {activeTab === 'history' && (
          <HistoryView
            analysisHistory={analysisHistory}
            onViewDashboard={itemSpec => {
              setSpec(itemSpec);
              setActiveTab('dashboard');
            }}
          />
        )}

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

        {activeTab === 'dashboard' && spec && (
          <DashboardView
            spec={spec}
            selectedFilters={selectedFilters}
            filteredTable={filteredTable}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
          />
        )}
        </React.Suspense>
      </div>
    </div>
  );
};
