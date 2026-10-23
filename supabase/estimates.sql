-- ============================================================================
-- KONTRORA PSA: REVENUE & BILLING (ESTIMATES) MODULE
-- Multi-tenant, account-bound, integer cents, soft-deletable, idempotency-safe
-- ============================================================================

-- Ensure pgcrypto is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ESTIMATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS estimates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  project_id             UUID REFERENCES projects(id) ON DELETE SET NULL,
  estimate_number        TEXT NOT NULL,
  title                  TEXT NOT NULL,
  description            TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  currency               VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Financials in minor units (cents)
  subtotal_cents         BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_rate_basis_points  INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points >= 0 AND tax_rate_basis_points <= 10000), -- 1000 = 10.00%
  tax_cents              BIGINT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents            BIGINT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),

  -- Prevent duplicate billing charges
  idempotency_key        TEXT,

  -- Lifecycle audit timestamps
  sent_at                TIMESTAMPTZ,
  accepted_at            TIMESTAMPTZ,
  rejected_at            TIMESTAMPTZ,
  rejection_reason       TEXT,
  
  -- Metadata
  created_by             UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT chk_estimates_sent_state CHECK (sent_at IS NULL OR status IN ('sent', 'accepted', 'rejected')),
  CONSTRAINT chk_estimates_accepted_state CHECK (accepted_at IS NULL OR status = 'accepted'),
  CONSTRAINT chk_estimates_rejected_state CHECK (rejected_at IS NULL OR status = 'rejected')
);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS trg_estimates_updated_at ON estimates;
CREATE TRIGGER trg_estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Performance and tenant indexes (filtering out soft-deleted records)
CREATE INDEX IF NOT EXISTS idx_estimates_account_id 
  ON estimates(account_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_project_id 
  ON estimates(project_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_status 
  ON estimates(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_created_at 
  ON estimates(created_at DESC) WHERE deleted_at IS NULL;

-- Strict unique constraint for account-scoped estimate numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_account_estimate_number
  ON estimates(account_id, estimate_number) WHERE deleted_at IS NULL;

-- Strict idempotency unique constraint: prevents duplicate requests per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_account_idempotency
  ON estimates(account_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- 2. ESTIMATE LINE ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id      UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  position         INTEGER NOT NULL DEFAULT 0,
  description      TEXT NOT NULL,
  quantity         NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  total_cents      BIGINT NOT NULL CHECK (total_cents >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_estimate_line_items_updated_at ON estimate_line_items;
CREATE TRIGGER trg_estimate_line_items_updated_at
  BEFORE UPDATE ON estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_line_items_estimate_id 
  ON estimate_line_items(estimate_id, position ASC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_line_items_account_id 
  ON estimate_line_items(account_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) & STRICT MULTI-TENANCY
-- ============================================================================
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (consistent with existing schema)
DROP POLICY IF EXISTS "estimates_service_role_all" ON estimates;
CREATE POLICY "estimates_service_role_all" ON estimates
  USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "estimate_line_items_service_role_all" ON estimate_line_items;
CREATE POLICY "estimate_line_items_service_role_all" ON estimate_line_items
  USING (TRUE) WITH CHECK (TRUE);

-- Authenticated Users: SELECT (User must belong to the tenant account or be superadmin)
DROP POLICY IF EXISTS "estimates_select_policy" ON estimates;
CREATE POLICY "estimates_select_policy" ON estimates
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
      )
      OR
      EXISTS (
        SELECT 1 FROM account_members
        WHERE account_members.account_id = estimates.account_id
          AND account_members.user_id = auth.uid()
          AND account_members.removed_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM accounts
        WHERE accounts.id = estimates.account_id
          AND accounts.account_manager_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.client_account_id = estimates.account_id
      )
    )
  );

-- Authenticated Users: INSERT (Tenant ID must match membership)
DROP POLICY IF EXISTS "estimates_insert_policy" ON estimates;
CREATE POLICY "estimates_insert_policy" ON estimates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimates.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimates.account_id
        AND accounts.account_manager_id = auth.uid()
    )
  );

-- Authenticated Users: UPDATE (Can update if tenant member, cannot change account_id)
DROP POLICY IF EXISTS "estimates_update_policy" ON estimates;
CREATE POLICY "estimates_update_policy" ON estimates
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL AND (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
      )
      OR
      EXISTS (
        SELECT 1 FROM account_members
        WHERE account_members.account_id = estimates.account_id
          AND account_members.user_id = auth.uid()
          AND account_members.removed_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM accounts
        WHERE accounts.id = estimates.account_id
          AND accounts.account_manager_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    account_id = estimates.account_id
  );

-- Authenticated Users: Hard DELETE is disallowed (enforcing soft deletes)
DROP POLICY IF EXISTS "estimates_delete_policy" ON estimates;
CREATE POLICY "estimates_delete_policy" ON estimates
  FOR DELETE TO authenticated
  USING (FALSE);

-- Line Items RLS: Mirrors parent estimate tenant boundary
DROP POLICY IF EXISTS "estimate_line_items_select_policy" ON estimate_line_items;
CREATE POLICY "estimate_line_items_select_policy" ON estimate_line_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
      )
      OR
      EXISTS (
        SELECT 1 FROM account_members
        WHERE account_members.account_id = estimate_line_items.account_id
          AND account_members.user_id = auth.uid()
          AND account_members.removed_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM accounts
        WHERE accounts.id = estimate_line_items.account_id
          AND accounts.account_manager_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.client_account_id = estimate_line_items.account_id
      )
    )
  );

DROP POLICY IF EXISTS "estimate_line_items_insert_policy" ON estimate_line_items;
CREATE POLICY "estimate_line_items_insert_policy" ON estimate_line_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM account_members
      WHERE account_members.account_id = estimate_line_items.account_id
        AND account_members.user_id = auth.uid()
        AND account_members.removed_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = estimate_line_items.account_id
        AND accounts.account_manager_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "estimate_line_items_update_policy" ON estimate_line_items;
CREATE POLICY "estimate_line_items_update_policy" ON estimate_line_items
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL AND (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid() AND user_profiles.is_superadmin = TRUE
      )
      OR
      EXISTS (
        SELECT 1 FROM account_members
        WHERE account_members.account_id = estimate_line_items.account_id
          AND account_members.user_id = auth.uid()
          AND account_members.removed_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM accounts
        WHERE accounts.id = estimate_line_items.account_id
          AND accounts.account_manager_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    account_id = estimate_line_items.account_id
  );

DROP POLICY IF EXISTS "estimate_line_items_delete_policy" ON estimate_line_items;
CREATE POLICY "estimate_line_items_delete_policy" ON estimate_line_items
  FOR DELETE TO authenticated
  USING (FALSE);
