-- Password reset tokens table
-- Tokens are single-use, time-limited (24h), stored as SHA-256 hashes
CREATE TABLE IF NOT EXISTS password_resets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  token_hash      VARCHAR(128) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_staff_id ON password_resets(staff_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at) WHERE used_at IS NULL;

-- Auto-cleanup: mark expired tokens
-- (handled in application code; index supports fast lookup)
