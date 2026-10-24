import React from 'react';
import type { ScheduleItem, DeliveryDestinationItem, BiConnectionItem } from '../api.js';

interface SchedulesBiViewProps {
  schedules: ScheduleItem[];
  deliveryDestinations: DeliveryDestinationItem[];
  biConnections: BiConnectionItem[];
  scheduleName: string;
  scheduleQuery: string;
  scheduleType: 'recurring' | 'one_time';
  scheduleCron: string;
  scheduleTimezone: string;
  scheduleOneTimeAt: string;
  destName: string;
  destType: 'email' | 'webhook';
  destEmail: string;
  destWebhook: string;
  biHost: string;
  biUser: string;
  biPass: string;
  biTestMsg: string;
  onScheduleNameChange: (v: string) => void;
  onScheduleQueryChange: (v: string) => void;
  onScheduleTypeChange: (v: 'recurring' | 'one_time') => void;
  onScheduleCronChange: (v: string) => void;
  onScheduleTimezoneChange: (v: string) => void;
  onScheduleOneTimeAtChange: (v: string) => void;
  onDestNameChange: (v: string) => void;
  onDestTypeChange: (v: 'email' | 'webhook') => void;
  onDestEmailChange: (v: string) => void;
  onDestWebhookChange: (v: string) => void;
  onBiHostChange: (v: string) => void;
  onBiUserChange: (v: string) => void;
  onBiPassChange: (v: string) => void;
  onCreateSchedule: (e: React.FormEvent) => void;
  onTriggerSchedule: (id: string, name: string) => void;
  onDeleteSchedule: (id: string) => void;
  onCreateDeliveryDestination: (e: React.FormEvent) => void;
  onDeleteDeliveryDestination: (id: string) => void;
  onCreateBiConnection: (e: React.FormEvent) => void;
  onTestBiConnection: (id: string) => void;
  onDeleteBiConnection: (id: string) => void;
}

export const SchedulesBiView: React.FC<SchedulesBiViewProps> = ({
  schedules,
  deliveryDestinations,
  biConnections,
  scheduleName,
  scheduleQuery,
  scheduleType,
  scheduleCron,
  scheduleTimezone,
  scheduleOneTimeAt,
  destName,
  destType,
  destEmail,
  destWebhook,
  biHost,
  biUser,
  biPass,
  biTestMsg,
  onScheduleNameChange,
  onScheduleQueryChange,
  onScheduleTypeChange,
  onScheduleCronChange,
  onScheduleTimezoneChange,
  onScheduleOneTimeAtChange,
  onDestNameChange,
  onDestTypeChange,
  onDestEmailChange,
  onDestWebhookChange,
  onBiHostChange,
  onBiUserChange,
  onBiPassChange,
  onCreateSchedule,
  onTriggerSchedule,
  onDeleteSchedule,
  onCreateDeliveryDestination,
  onDeleteDeliveryDestination,
  onCreateBiConnection,
  onTestBiConnection,
  onDeleteBiConnection,
}) => {
  return (
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
                        onClick={() => onTriggerSchedule(s.id, s.name)}
                      >
                        ⚡ Run Now
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.85rem', color: '#ff6b6b' }}
                        onClick={() => onDeleteSchedule(s.id)}
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
            <form onSubmit={onCreateSchedule}>
              <div className="form-group">
                <label className="form-label">Schedule Name</label>
                <input
                  className="form-input"
                  value={scheduleName}
                  onChange={e => onScheduleNameChange(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Analytical Business Question</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={scheduleQuery}
                  onChange={e => onScheduleQueryChange(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Schedule Type</label>
                  <select
                    className="form-input"
                    value={scheduleType}
                    onChange={e => onScheduleTypeChange(e.target.value as any)}
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
                    onChange={e => onScheduleTimezoneChange(e.target.value)}
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
                    onChange={e => onScheduleCronChange(e.target.value)}
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
                    onChange={e => onScheduleOneTimeAtChange(new Date(e.target.value).toISOString())}
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
                      onClick={() => onDeleteDeliveryDestination(d.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={onCreateDeliveryDestination}>
              <div className="form-group">
                <input
                  className="form-input"
                  placeholder="Destination Name"
                  value={destName}
                  onChange={e => onDestNameChange(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <label style={{ fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="destType"
                    checked={destType === 'email'}
                    onChange={() => onDestTypeChange('email')}
                  /> Email
                </label>
                <label style={{ fontSize: '0.85rem' }}>
                  <input
                    type="radio"
                    name="destType"
                    checked={destType === 'webhook'}
                    onChange={() => onDestTypeChange('webhook')}
                  /> Webhook
                </label>
              </div>

              {destType === 'email' ? (
                <div className="form-group">
                  <input
                    className="form-input"
                    placeholder="recipients@company.com"
                    value={destEmail}
                    onChange={e => onDestEmailChange(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <input
                    className="form-input"
                    placeholder="https://hooks.slack.com/..."
                    value={destWebhook}
                    onChange={e => onDestWebhookChange(e.target.value)}
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
                        onClick={() => onTestBiConnection(c.id)}
                      >
                        Test Connection
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ff6b6b' }}
                        onClick={() => onDeleteBiConnection(c.id)}
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

            <form onSubmit={onCreateBiConnection}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Superset Host URL</label>
                <input
                  className="form-input"
                  value={biHost}
                  onChange={e => onBiHostChange(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Username</label>
                  <input
                    className="form-input"
                    value={biUser}
                    onChange={e => onBiUserChange(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Password</label>
                  <input
                    className="form-input"
                    type="password"
                    value={biPass}
                    onChange={e => onBiPassChange(e.target.value)}
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
  );
};
