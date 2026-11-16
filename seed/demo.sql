PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO clients (
  id,
  name,
  client_reference,
  contact_name,
  contact_email,
  status,
  is_demo
) VALUES
  (
    'client-pulse-activations',
    'Pulse Activations',
    'DEMO-PA',
    'Thandi Mokoena',
    'thandi@pulseactivations.co.za',
    'active',
    1
  ),
  (
    'client-pulse-motors',
    'Pulse Motors',
    'DEMO-PM',
    'Kagiso Molefe',
    'kagiso@pulsemotors.co.za',
    'active',
    1
  );

INSERT OR IGNORE INTO applications (
  id,
  client_id,
  name,
  identifier,
  application_type,
  environment,
  origin_url,
  status,
  is_demo
) VALUES
  (
    'application-pulse-partner-portal',
    'client-pulse-activations',
    'Partner Portal',
    'pulse-partner-portal-demo',
    'external_https',
    'development',
    NULL,
    'draft',
    1
  ),
  (
    'application-pulse-member-portal',
    'client-pulse-motors',
    'Member Portal',
    'pulse-member-portal-demo',
    'external_https',
    'development',
    NULL,
    'draft',
    1
  );
