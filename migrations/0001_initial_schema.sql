PRAGMA foreign_keys = ON;

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  client_reference TEXT UNIQUE,
  contact_name TEXT,
  contact_email TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  application_type TEXT NOT NULL CHECK (application_type IN ('cloudflare_worker', 'external_https')),
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  origin_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'disabled')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  hostname TEXT NOT NULL UNIQUE,
  cname_target TEXT,
  ownership_status TEXT NOT NULL CHECK (ownership_status IN ('pending', 'verified', 'failed')),
  dns_status TEXT NOT NULL CHECK (dns_status IN ('pending', 'verified', 'failed')),
  ssl_status TEXT NOT NULL CHECK (ssl_status IN ('pending', 'active', 'failed')),
  cloudflare_hostname_id TEXT UNIQUE,
  cloudflare_status TEXT,
  status_message TEXT,
  ownership_records TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ownership_records)),
  certificate_records TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(certificate_records)),
  last_checked_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL UNIQUE REFERENCES domains(id) ON DELETE RESTRICT,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'staging', 'production')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'disabled')),
  published_version TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE provisioning_operations (
  id TEXT PRIMARY KEY,
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  request_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(request_metadata)),
  result_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_metadata)),
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_applications_client_id ON applications(client_id);
CREATE INDEX idx_domains_client_id ON domains(client_id);
CREATE INDEX idx_domains_application_id ON domains(application_id);
CREATE INDEX idx_routes_application_id ON routes(application_id);
CREATE INDEX idx_provisioning_operations_domain_id ON provisioning_operations(domain_id);
CREATE UNIQUE INDEX idx_provisioning_operations_one_active_per_domain
  ON provisioning_operations (domain_id)
  WHERE status IN ('pending', 'running');
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);

CREATE TABLE auth_sign_in_attempts (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_auth_sign_in_attempts_created_at
  ON auth_sign_in_attempts (created_at);

CREATE TABLE auth_sign_in_requests (
  client_hash TEXT NOT NULL,
  requested_at INTEGER NOT NULL
);

CREATE INDEX idx_auth_sign_in_requests_client
  ON auth_sign_in_requests (client_hash, requested_at);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  entra_tenant_id TEXT NOT NULL,
  entra_object_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrator', 'viewer')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_admin_sessions_expires_at
  ON admin_sessions (expires_at);
