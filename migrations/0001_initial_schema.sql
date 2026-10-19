-- Migration: 0001_initial_schema.sql
-- Autonomous Data Analyst Multi-Tenant Persistence

CREATE TABLE IF NOT EXISTS _migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organizations (Tenant root)
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memberships (RBAC & Tenant binding)
CREATE TABLE IF NOT EXISTS memberships (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_membership_user_org UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  csrf_token VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Datasets
CREATE TABLE IF NOT EXISTS datasets (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  format VARCHAR(16) NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  column_count INT NOT NULL DEFAULT 0,
  schema_fingerprint VARCHAR(128) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'registered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_datasets_org ON datasets(organization_id);
CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets(uploaded_by_user_id);

-- Dataset Profiles
CREATE TABLE IF NOT EXISTS dataset_profiles (
  id VARCHAR(64) PRIMARY KEY,
  dataset_id VARCHAR(64) NOT NULL REFERENCES datasets(id) ON DELETE CASCADE UNIQUE,
  profile_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dataset_profiles_dataset ON dataset_profiles(dataset_id);

-- Analyses
CREATE TABLE IF NOT EXISTS analyses (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id),
  dataset_id VARCHAR(64) NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  user_query TEXT NOT NULL,
  job_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  stage VARCHAR(64) NOT NULL DEFAULT 'queued',
  progress_percent INT NOT NULL DEFAULT 0,
  execution_result_json TEXT,
  validation_result_json TEXT,
  insights_json TEXT,
  dashboard_spec_json TEXT,
  clarification_question TEXT,
  final_explanation TEXT,
  error_message TEXT,
  trace_id VARCHAR(128),
  run_id VARCHAR(128),
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analyses_org ON analyses(organization_id);
CREATE INDEX IF NOT EXISTS idx_analyses_job ON analyses(job_id);
CREATE INDEX IF NOT EXISTS idx_analyses_dataset ON analyses(dataset_id);

-- Artifacts
CREATE TABLE IF NOT EXISTS artifacts (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  analysis_id VARCHAR(64) NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  artifact_type VARCHAR(64) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_org ON artifacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_analysis ON artifacts(analysis_id);
