CREATE TABLE IF NOT EXISTS email_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  staff_id        UUID,
  email_type      VARCHAR(64) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject         VARCHAR(512) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'sent',
  message_id      VARCHAR(512),
  error_message   TEXT,
  error_category  VARCHAR(64),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_org ON email_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_staff ON email_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
