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
      <section id="schedules-view" className="workbench-page-container">
        {/* 1. Page Heading with proper spacing and separator */}
        <div className="page-header-block">
          <div className="page-title-row">
            <h1 className="page-heading">Scheduled Analyses &amp; BI Integrations</h1>
            <span className="heading-separator">·</span>
            <span className="heading-badge">{schedules.length} Active Schedules</span>
          </div>
          <p className="page-heading-sub">
            Automate recurring DuckDB analytical queries, trigger scheduled reports, and sync datasets with Apache Superset.
          </p>
        </div>

              <div className="schedules-bi-layout">
                {/* Left Column: Schedules Management */}
                <div className="schedules-left-column">
                  {/* Active Schedules List Card */}
                  <div className="workbench-card">
                    <div className="card-header-row">
                      <h3 className="card-title">
                        <span className="card-title-icon">📅</span>
                        <span>Recurring &amp; One-Time Schedules</span>
                      </h3>
                      <span className="card-badge">{schedules.length} Configured</span>
                    </div>

                    {schedules.length === 0 ? (
              <div className="empty-state-notice">
                <p>No schedules configured yet. Create a schedule below to automate recurring analytical deliveries.</p>
              </div>
                    ) : (
                        <div className="schedules-list">
                          {schedules.map(s => (
                                    <div key={s.id} className="schedule-item-card">
                                      <div className="schedule-item-main">
                                        <div className="schedule-item-header">
                                          <span className="schedule-name">{s.name}</span>
                                          <span className={`status-pill ${s.status === 'active' ? 'status-healthy' : 'status-neutral'}`}>
                                            {s.status.toUpperCase()}
                                          </span>
                                            <span className="schedule-type-tag">
                                              {s.scheduleType === 'recurring' ? '⏱️ Cron' : '📌 One-time'}
                                            </span>
                                        </div>
                                          <div className="schedule-query-text">{s.query}</div>
                                          <div className="schedule-cron-meta">
                                            <span>Expression: <code>{s.cronExpression || s.oneTimeAt}</code></span>
                                            <span>•</span>
                                            <span>Timezone: <code>{s.timezone}</code></span>
                                          </div>
                                        </div>
                                          <div className="schedule-item-actions">
                                            <button
                                              className="btn-action-primary"
                                              onClick={() => onTriggerSchedule(s.id, s.name)}
                                              title="Trigger immediate execution"
                                            >
                                              ▶ Run Now
                                            </button>
                                            <button
                                              className="btn-action-danger"
                                              onClick={() => onDeleteSchedule(s.id)}
                                              title="Delete schedule"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        </div>
                ))}
                                      </div>
            )}
                                    </div>

                                          {/* Create Schedule Form Card */}
                                          <div className="workbench-card">
                                            <div className="card-header-row">
                                              <h3 className="card-title">
                                                <span className="card-title-icon">➕</span>
                                                <span>New Scheduled Autonomous Analysis</span>
                                              </h3>
                                            </div>

                                            <form onSubmit={onCreateSchedule} className="clean-vertical-form">
                                              <div className="form-field-block">
                                                <label className="field-label" htmlFor="schedule-name-input">
                                                  Schedule Name
                                                </label>
                                                <input
                                                  id="schedule-name-input"
                                                  className="field-input"
                                                  value={scheduleName}
                                                  onChange={e => onScheduleNameChange(e.target.value)}
                                                  placeholder="e.g. Weekly Category Revenue Review"
                                                  required
                                                />
                                              </div>

                                                <div className="form-field-block">
                                                  <label className="field-label" htmlFor="schedule-query-input">
                                                    Analytical Business Question / Prompt
                                                  </label>
                                                  <textarea
                                                    id="schedule-query-input"
                                                    className="field-textarea"
                                                    rows={3}
                                                    value={scheduleQuery}
                                                    onChange={e => onScheduleQueryChange(e.target.value)}
                                                    placeholder="e.g. Analyze gross revenue, payment statuses, and identify discount anomalies across regions"
                                                    required
                                                  />
                                                </div>

                                                    <div className="form-grid-row">
                                                      <div className="form-field-block">
                                                        <label className="field-label" htmlFor="schedule-type-select">
                                                          Schedule Type
                                                        </label>
                                                        <select
                                                          id="schedule-type-select"
                                                          className="field-select"
                                                          value={scheduleType}
                                                          onChange={e => onScheduleTypeChange(e.target.value as any)}
                                                        >
                                                          <option value="recurring">Recurring (Cron Schedule)</option>
                                                          <option value="one_time">One-Time Future Execution</option>
                                                        </select>
                                                      </div>

                                                        <div className="form-field-block">
                                                          <label className="field-label" htmlFor="schedule-tz-input">
                                                            IANA Timezone
                                                          </label>
                                                          <input
                                                            id="schedule-tz-input"
                                                            className="field-input"
                                                            value={scheduleTimezone}
                                                            onChange={e => onScheduleTimezoneChange(e.target.value)}
                                                            placeholder="America/New_York or UTC"
                                                            required
                                                          />
                                                        </div>
                                                      </div>

                                                      {scheduleType === 'recurring' ? (
                                                          <div className="form-field-block">
                                                            <label className="field-label" htmlFor="schedule-cron-input">
                                                              5-Field Cron Expression
                                                            </label>
                                                            <input
                                                              id="schedule-cron-input"
                                                              className="field-input"
                                                              value={scheduleCron}
                                                              onChange={e => onScheduleCronChange(e.target.value)}
                                                              placeholder="0 9 * * 1 (Every Monday at 9:00 AM)"
                                                              required
                                                            />
                                                            <span className="field-hint">Standard cron format: minute hour day-of-month month day-of-week</span>
                                                          </div>
                                                          ) : (
                                                            <div className="form-field-block">
                                                              <label className="field-label" htmlFor="schedule-onetime-input">
                                                                Run Timestamp
                                                              </label>
                                                              <input
                                                                id="schedule-onetime-input"
                                                                className="field-input"
                                                                type="datetime-local"
                                                                value={scheduleOneTimeAt}
                                                                onChange={e => onScheduleOneTimeAtChange(new Date(e.target.value).toISOString())}
                                                                required
                                                              />
                                                            </div>
              )}

                                                            <div className="form-actions-row">
                                                              <button className="btn-primary" type="submit">
                                                                Create Schedule
                                                              </button>
                                                            </div>
                                                          </form>
                                                        </div>
        </div>

                                                        {/* Right Column: Delivery Channels & Superset BI */}
                                                        <div className="schedules-right-column">
                                                          {/* Delivery Channels Card */}
                                                          <div className="workbench-card">
                                                            <div className="card-header-row">
                                                              <h3 className="card-title">
                                                                <span className="card-title-icon">📬</span>
                                                                <span>Report Delivery Channels</span>
                                                              </h3>
                                                            </div>

                                                            {deliveryDestinations.length === 0 ? (
              <div className="empty-state-notice">
                <p>No delivery destinations yet. Add an email or webhook destination below.</p>
              </div>
                                                            ) : (
                                                                <div className="destinations-list">
                                                                  {deliveryDestinations.map(d => (
                                                                          <div key={d.id} className="destination-item-card">
                                                                            <div className="dest-item-info">
                                                                              <div className="dest-name-row">
                                                                                <strong className="dest-name">{d.name}</strong>
                                                                                <span className="dest-type-badge">{d.destinationType}</span>
                                                                              </div>
                                                                              <div className="dest-target-text">
                                                                                {d.recipientEmails || d.webhookUrl}
                                                                              </div>
                                                                            </div>
                                                                            <button
                                                                              className="btn-action-danger"
                                                                              onClick={() => onDeleteDeliveryDestination(d.id)}
                                                                              title="Remove destination"
                                                                            >
                                                                              ✕
                                                                            </button>
                                                                          </div>
                ))}
                                                                        </div>
            )}

                                                                            <form onSubmit={onCreateDeliveryDestination} className="clean-vertical-form" style={{ marginTop: 16 }}>
                                                                              <div className="form-field-block">
                                                                                <label className="field-label">Channel Name</label>
                                                                                <input
                                                                                  className="field-input"
                                                                                  placeholder="e.g. Executive Leadership List"
                                                                                  value={destName}
                                                                                  onChange={e => onDestNameChange(e.target.value)}
                                                                                  required
                                                                                />
                                                                              </div>

                                                                                <div className="form-field-block">
                                                                                  <label className="field-label">Channel Type</label>
                                                                                  <div className="radio-options-row">
                                                                                    <label className={`radio-pill ${destType === 'email' ? 'active' : ''}`}>
                                                                                      <input
                                                                                        type="radio"
                                                                                        name="destType"
                                                                                        checked={destType === 'email'}
                                                                                        onChange={() => onDestTypeChange('email')}
                                                                                      />
                                                                                      <span>✉️ Email</span>
                                                                                    </label>
                                                                                    <label className={`radio-pill ${destType === 'webhook' ? 'active' : ''}`}>
                                                                                      <input
                                                                                        type="radio"
                                                                                        name="destType"
                                                                                        checked={destType === 'webhook'}
                                                                                        onChange={() => onDestTypeChange('webhook')}
                                                                                      />
                                                                                      <span>🔗 Webhook</span>
                                                                                    </label>
                                                                                  </div>
                                                                                </div>

                                                                                {destType === 'email' ? (
                                                                                    <div className="form-field-block">
                                                                                      <label className="field-label">Recipient Emails</label>
                                                                                      <input
                                                                                        className="field-input"
                                                                                        placeholder="executive@company.com, analyst@company.com"
                                                                                        value={destEmail}
                                                                                        onChange={e => onDestEmailChange(e.target.value)}
                                                                                        required
                                                                                      />
                                                                                    </div>
                                                                                    ) : (
                                                                                      <div className="form-field-block">
                                                                                        <label className="field-label">Webhook URL</label>
                                                                                        <input
                                                                                          className="field-input"
                                                                                          placeholder="https://hooks.slack.com/services/..."
                                                                                          value={destWebhook}
                                                                                          onChange={e => onDestWebhookChange(e.target.value)}
                                                                                          required
                                                                                        />
                                                                                      </div>
              )}

                                                                                        <button className="btn-secondary" type="submit" style={{ width: '100%', marginTop: 4 }}>
                                                                                          + Add Delivery Channel
                                                                                        </button>
                                                                                      </form>
                                                                                    </div>

                                                                                      {/* Apache Superset BI Connection Card */}
                                                                                      <div className="workbench-card">
                                                                                        <div className="card-header-row">
                                                                                          <h3 className="card-title">
                                                                                            <span className="card-title-icon">📊</span>
                                                                                            <span>Apache Superset BI Connection</span>
                                                                                          </h3>
                                                                                        </div>

                                                                                        {biConnections.length === 0 ? (
              <div className="empty-state-notice">
                <p>No BI connections configured yet. Connect your Apache Superset cluster below.</p>
              </div>
                                                                                        ) : (
                                                                                            <div className="bi-connections-list">
                                                                                              {biConnections.map(c => (
                                                                                                    <div key={c.id} className="bi-connection-card">
                                                                                                      <div className="bi-conn-header">
                                                                                                        <strong>{c.name}</strong>
                                                                                                          <span className={`status-pill ${c.status === 'connected' ? 'status-healthy' : 'status-warning'}`}>
                                                                                                            {c.status.toUpperCase()}
                                                                                                          </span>
                                                                                                      </div>
                                                                                                        <div className="bi-conn-host">{c.hostUrl}</div>
                                                                                                        <div className="bi-conn-actions">
                                                                                                          <button
                                                                                                            className="btn-action-primary"
                                                                                                            onClick={() => onTestBiConnection(c.id)}
                                                                                                          >
                                                                                                            Test Connection
                                                                                                          </button>
                                                                                                          <button
                                                                                                            className="btn-action-danger"
                                                                                                            onClick={() => onDeleteBiConnection(c.id)}
                                                                                                          >
                                                                                                            Delete
                                                                                                          </button>
                                                                                                        </div>
                                                                                                        {biTestMsg && (
                                                                                                            <div className="bi-test-status-msg">
                                                                                                              {biTestMsg}
                                                                                                            </div>
                    )}
                                                                                                          </div>
                                                                                                        ))}
                                                                                                      </div>
            )}

                                                                                                          <form onSubmit={onCreateBiConnection} className="clean-vertical-form" style={{ marginTop: 16 }}>
                                                                                                            <div className="form-field-block">
                                                                                                              <label className="field-label">Superset Host URL</label>
                                                                                                              <input
                                                                                                                className="field-input"
                                                                                                                value={biHost}
                                                                                                                onChange={e => onBiHostChange(e.target.value)}
                                                                                                                placeholder="http://localhost:8088"
                                                                                                                required
                                                                                                              />
                                                                                                            </div>

                                                                                                                <div className="form-grid-row">
                                                                                                                  <div className="form-field-block">
                                                                                                                    <label className="field-label">Username</label>
                                                                                                                    <input
                                                                                                                      className="field-input"
                                                                                                                      value={biUser}
                                                                                                                      onChange={e => onBiUserChange(e.target.value)}
                                                                                                                      required
                                                                                                                    />
                                                                                                                  </div>
                                                                                                                    <div className="form-field-block">
                                                                                                                      <label className="field-label">Password</label>
                                                                                                                      <input
                                                                                                                        className="field-input"
                                                                                                                        type="password"
                                                                                                                        value={biPass}
                                                                                                                        onChange={e => onBiPassChange(e.target.value)}
                                                                                                                        required
                                                                                                                      />
                                                                                                                    </div>
                                                                                                                  </div>

                                                                                                                    <button className="btn-secondary" type="submit" style={{ width: '100%', marginTop: 4 }}>
                                                                                                                      + Connect Apache Superset
                                                                                                                    </button>
                                                                                                                  </form>
                                                                                                                </div>
                                                                                                              </div>
                                                                                                            </div>
                                                                                                          </section>
                                                                                                          );
};
