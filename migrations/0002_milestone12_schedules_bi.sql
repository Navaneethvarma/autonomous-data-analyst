-- Migration: 0002_milestone12_schedules_bi.sql
-- Milestone 12: BI Integrations, Scheduled Autonomous Analysis & Report Delivery

-- Delivery Destinations (Email / Webhook with encrypted credentials)
CREATE TABLE IF NOT EXISTS delivery_destinations (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  destination_type VARCHAR(32) NOT NULL, -- 'email', 'webhook'
  recipient_emails TEXT, -- comma-separated or JSON list of emails
  webhook_url VARCHAR(1024),
  encrypted_secret TEXT, -- AES-256-GCM encrypted webhook HMAC key or auth token
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_destinations_org ON delivery_destinations(organization_id);

-- BI Platform Connections (Apache Superset, Metabase, etc.)
CREATE TABLE IF NOT EXISTS bi_connections (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  platform_type VARCHAR(32) NOT NULL, -- 'superset', 'metabase'
  host_url VARCHAR(1024) NOT NULL,
  encrypted_credentials TEXT NOT NULL, -- AES-256-GCM encrypted JSON credentials {username, password, etc.}
  status VARCHAR(32) NOT NULL DEFAULT 'untested', -- 'untested', 'connected', 'error'
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bi_connections_org ON bi_connections(organization_id);

-- Schedules (One-time and recurring autonomous analysis jobs)
CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  dataset_id VARCHAR(64) NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  user_query TEXT NOT NULL,
  schedule_type VARCHAR(32) NOT NULL DEFAULT 'recurring', -- 'recurring', 'one_time'
  cron_expression VARCHAR(128),
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  one_time_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  concurrency_limit INT NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  delivery_destination_id VARCHAR(64) REFERENCES delivery_destinations(id) ON DELETE SET NULL,
  bi_connection_id VARCHAR(64) REFERENCES bi_connections(id) ON DELETE SET NULL,
  export_format VARCHAR(32) NOT NULL DEFAULT 'html', -- 'html', 'pdf', 'both'
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedules_org ON schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_schedules_dataset ON schedules(dataset_id);

-- Schedule Execution History
CREATE TABLE IF NOT EXISTS schedule_runs (
  id VARCHAR(64) PRIMARY KEY,
  schedule_id VARCHAR(64) NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  analysis_id VARCHAR(64) REFERENCES analyses(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
  error_message TEXT,
  delivery_status VARCHAR(32), -- 'pending', 'sent', 'failed', 'skipped'
  delivery_details_json TEXT,
  bi_export_status VARCHAR(32), -- 'pending', 'exported', 'failed', 'skipped'
  bi_export_details_json TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_org ON schedule_runs(organization_id);

-- Audit Logs (Schedule changes, credential rotation, delivery events)
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  details_json TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
