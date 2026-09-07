-- Migration 013: Enhance Personal Credits system
-- Add due_date, paid_at, cancelled_at, written_off_at, idempotency_key
-- Add write_off and reversal to ledger entry_type
-- Add idempotency_keys table

-- 1. Add new columns to personal_credit_profiles
ALTER TABLE personal_credit_profiles ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE personal_credit_profiles ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE personal_credit_profiles ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE personal_credit_profiles ADD COLUMN IF NOT EXISTS written_off_at timestamptz;
ALTER TABLE personal_credit_profiles ADD COLUMN IF NOT EXISTS original_amount_ugx numeric NOT NULL DEFAULT 0;
ALTER TABLE personal_credit_profiles ADD COLUMN IF NOT EXISTS total_paid_ugx numeric NOT NULL DEFAULT 0;

-- 2. Update status CHECK to include more states
ALTER TABLE personal_credit_profiles DROP CONSTRAINT IF EXISTS personal_credit_profiles_status_check;
ALTER TABLE personal_credit_profiles ADD CONSTRAINT personal_credit_profiles_status_check 
  CHECK (status IN ('active','partially_paid','paid','overdue','written_off','cancelled'));

-- 3. Update ledger entry_type CHECK to include write_off and reversal
ALTER TABLE personal_credit_ledger DROP CONSTRAINT IF EXISTS personal_credit_ledger_entry_type_check;
ALTER TABLE personal_credit_ledger ADD CONSTRAINT personal_credit_ledger_entry_type_check 
  CHECK (entry_type IN ('charge','payment','adjustment','reversal','write_off','refund'));

-- 4. Add idempotency_keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(64) PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  request_hash VARCHAR(128) NOT NULL,
  response_body jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_org ON idempotency_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- 5. Add indexes for credit queries
CREATE INDEX IF NOT EXISTS idx_credit_profiles_org_status ON personal_credit_profiles(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_profiles_due_date ON personal_credit_profiles(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_profiles_org_branch ON personal_credit_profiles(organization_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_profile ON personal_credit_ledger(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_org ON personal_credit_ledger(organization_id, created_at DESC);

-- 6. Backfill original_amount_ugx from current_balance for existing profiles
UPDATE personal_credit_profiles SET original_amount_ugx = current_balance_ugx WHERE original_amount_ugx = 0 AND current_balance_ugx > 0;
