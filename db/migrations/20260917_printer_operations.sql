-- KROWN Printer Operations foundation.
-- Applied only through the controlled migration pipeline; no production data is touched.
CREATE TABLE IF NOT EXISTS printer_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  printer_type VARCHAR(32) NOT NULL CHECK (printer_type IN ('receipt','kitchen','bar','report','label','other')),
  connection_type VARCHAR(16) NOT NULL CHECK (connection_type IN ('usb','lan')),
  usb_printer_name VARCHAR(255),
  usb_port VARCHAR(128),
  ip_address INET,
  port INTEGER NOT NULL DEFAULT 9100 CHECK (port BETWEEN 1 AND 65535),
  paper_width VARCHAR(8) NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('58mm','80mm')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','online','offline','error')),
  last_seen_at TIMESTAMPTZ,
  last_test_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_printer_config_org_branch ON printer_configurations(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_printer_config_enabled ON printer_configurations(organization_id, branch_id, enabled);

CREATE TABLE IF NOT EXISTS printer_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  printer_id UUID NOT NULL REFERENCES printer_configurations(id) ON DELETE CASCADE,
  destination VARCHAR(32) NOT NULL CHECK (destination IN ('receipt','kitchen','bar','report','label','other')),
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(branch_id, printer_id, destination)
);
CREATE INDEX IF NOT EXISTS idx_printer_routes_org_branch_destination ON printer_routes(organization_id, branch_id, destination, enabled, priority);

ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_print_jobs_org_branch_status ON print_jobs(organization_id, branch_id, status, created_at DESC);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS ban_reason TEXT;
