ALTER TABLE admin_sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'administrator'
  CHECK (role IN ('owner', 'administrator', 'viewer'));

ALTER TABLE domains ADD COLUMN cloudflare_status TEXT;
ALTER TABLE domains ADD COLUMN status_message TEXT;

CREATE UNIQUE INDEX idx_provisioning_operations_one_active_per_domain
  ON provisioning_operations (domain_id)
  WHERE status IN ('pending', 'running');
