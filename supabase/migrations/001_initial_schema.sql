-- ============================================
-- myquota-backend: Initial Supabase Schema
-- Firestore → Supabase Migration, Phase 1
-- ============================================

-- Enable UUID extension (Supabase default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (maps to Supabase Auth auth.users)
-- The public.users table mirrors auth.users for
-- app-specific fields (name, picture, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ============================================
-- CREDIT CARDS
-- ============================================
CREATE TABLE IF NOT EXISTS credit_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_type VARCHAR(50) NOT NULL,
  card_last_digits VARCHAR(4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  card_holder_name VARCHAR(255),
  billing_period_start DATE,
  billing_period_end DATE,
  due_date DATE,
  national_amount_used DECIMAL(12,2) DEFAULT 0,
  national_amount_available DECIMAL(12,2) DEFAULT 0,
  national_total_limit DECIMAL(12,2) DEFAULT 0,
  national_advance_available DECIMAL(12,2) DEFAULT 0,
  international_amount_used DECIMAL(12,2) DEFAULT 0,
  international_amount_available DECIMAL(12,2) DEFAULT 0,
  international_total_limit DECIMAL(12,2) DEFAULT 0,
  international_advance_available DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Prevent duplicate cards per user (same last 4 digits)
CREATE UNIQUE INDEX idx_cc_user_digits
  ON credit_cards(user_id, card_last_digits)
  WHERE deleted_at IS NULL;

-- Index for user-scoped lookups
CREATE INDEX idx_cc_user_deleted
  ON credit_cards(user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================
-- TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  merchant VARCHAR(255),
  category_id UUID,
  transaction_date DATE NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  description TEXT,
  card_type VARCHAR(50),
  card_last_digits VARCHAR(4),
  bank VARCHAR(255),
  email TEXT,
  total_installments INTEGER,
  paid_installments INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Composite index for date-range queries on a card
CREATE INDEX idx_tx_cc_date
  ON transactions(credit_card_id, transaction_date)
  WHERE deleted_at IS NULL;

-- Index for soft-delete filter
CREATE INDEX idx_tx_cc_deleted
  ON transactions(credit_card_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Index for category lookups
CREATE INDEX idx_tx_category
  ON transactions(category_id)
  WHERE deleted_at IS NULL;

-- ============================================
-- QUOTAS (promoted from Firestore subcollection)
-- Top-level table with FK to transactions
-- ============================================
CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Index for pending quota lookups per transaction
CREATE INDEX idx_quota_tx_status
  ON quotas(transaction_id, status)
  WHERE deleted_at IS NULL;

-- Index for status + deleted_at filter
CREATE INDEX idx_quota_status_deleted
  ON quotas(status, deleted_at)
  WHERE deleted_at IS NULL;

-- Critical: user_id on credit_cards enables collectionGroup("quotas") equivalence
-- via JOIN: quotas → transactions → credit_cards → user_id
CREATE INDEX idx_quota_credit_card
  ON quotas(credit_card_id)
  WHERE deleted_at IS NULL;

-- ============================================
-- BILLING PERIODS
-- ============================================
CREATE TABLE IF NOT EXISTS billing_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_card_id UUID NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Unique index: one billing period per card per month
CREATE UNIQUE INDEX idx_bp_cc_month
  ON billing_periods(credit_card_id, month)
  WHERE deleted_at IS NULL;

-- Index for soft-delete filter
CREATE INDEX idx_bp_cc_deleted
  ON billing_periods(credit_card_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================
-- CATEGORIES
-- is_global = true → shared across all users
-- is_global = false + user_id = user's personal category
-- user_id = NULL + is_global = false → orphan (should not happen)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  normalized_name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL,
  icon VARCHAR(50),
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Index for deduplication lookups (user + normalized name)
CREATE INDEX idx_cat_user_norm
  ON categories(user_id, normalized_name)
  WHERE deleted_at IS NULL;

-- Index for global category queries
CREATE INDEX idx_cat_is_global
  ON categories(is_global)
  WHERE deleted_at IS NULL;

-- ============================================
-- MERCHANT PATTERNS
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  pattern VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Unique index: one pattern per category
CREATE UNIQUE INDEX idx_mp_cat_pattern
  ON merchant_patterns(category_id, pattern)
  WHERE deleted_at IS NULL;

-- ============================================
-- USER TOKENS (Gmail OAuth, AES-256 encrypted)
-- ============================================
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL DEFAULT 'gmail',
  access_token TEXT,
  refresh_token_encrypted TEXT,
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Index for user + provider lookups
CREATE INDEX idx_ut_user_provider
  ON user_tokens(user_id, provider);

-- ============================================
-- REVOKED TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash VARCHAR(64) PRIMARY KEY,
  revoked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for expiry-based cleanup
CREATE INDEX idx_rt_expires
  ON revoked_tokens(expires_at);

-- ============================================
-- SUMMARIES (replaces Firestore L2 materialized docs)
-- Stores pre-computed stats data as JSONB
-- ============================================
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  needs_recompute BOOLEAN NOT NULL DEFAULT false,
  age_ms BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, type)
);

-- Index for user + type lookups
CREATE INDEX idx_summaries_user_type
  ON summaries(user_id, type);

-- ============================================
-- DEBT FORECAST
-- Stores computed forecast data as JSONB
-- ============================================
CREATE TABLE IF NOT EXISTS debt_forecast (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user lookups
CREATE INDEX idx_df_user
  ON debt_forecast(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_forecast ENABLE ROW LEVEL SECURITY;

-- === USERS ===
-- Users can read/update their own row
CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- === CREDIT CARDS ===
CREATE POLICY "cc_select_own"
  ON credit_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cc_insert_own"
  ON credit_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cc_update_own"
  ON credit_cards FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "cc_delete_own"
  ON credit_cards FOR DELETE
  USING (auth.uid() = user_id);

-- === TRANSACTIONS ===
-- User sees transactions via credit card FK
CREATE POLICY "tx_select_own"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM credit_cards
      WHERE id = transactions.credit_card_id
        AND user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

CREATE POLICY "tx_insert_own"
  ON transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM credit_cards
      WHERE id = transactions.credit_card_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "tx_update_own"
  ON transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM credit_cards
      WHERE id = transactions.credit_card_id
        AND user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- === QUOTAS ===
-- Quotas visible via transaction → credit_card → user chain
CREATE POLICY "quota_select_own"
  ON quotas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN credit_cards cc ON t.credit_card_id = cc.id
      WHERE t.id = quotas.transaction_id
        AND cc.user_id = auth.uid()
        AND cc.deleted_at IS NULL
    )
  );

CREATE POLICY "quota_insert_own"
  ON quotas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN credit_cards cc ON t.credit_card_id = cc.id
      WHERE t.id = quotas.transaction_id
        AND cc.user_id = auth.uid()
    )
  );

CREATE POLICY "quota_update_own"
  ON quotas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      JOIN credit_cards cc ON t.credit_card_id = cc.id
      WHERE t.id = quotas.transaction_id
        AND cc.user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- === BILLING PERIODS ===
CREATE POLICY "bp_select_own"
  ON billing_periods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM credit_cards
      WHERE id = billing_periods.credit_card_id
        AND user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

CREATE POLICY "bp_insert_own"
  ON billing_periods FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM credit_cards
      WHERE id = billing_periods.credit_card_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "bp_update_own"
  ON billing_periods FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM credit_cards
      WHERE id = billing_periods.credit_card_id
        AND user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- === CATEGORIES ===
-- Global categories readable by all authenticated users
-- Personal categories readable/ writable only by owner
CREATE POLICY "cat_select_all"
  ON categories FOR SELECT
  USING (
    is_global = true
    OR user_id = auth.uid()
    OR user_id IS NULL
  );

CREATE POLICY "cat_insert_own"
  ON categories FOR INSERT
  WITH CHECK (
    is_global = true
    OR user_id = auth.uid()
  );

CREATE POLICY "cat_update_own"
  ON categories FOR UPDATE
  USING (
    (is_global = true OR user_id = auth.uid())
    AND deleted_at IS NULL
  );

-- === MERCHANT PATTERNS ===
-- Visible via category → user chain
CREATE POLICY "mp_select_own"
  ON merchant_patterns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM categories c
      WHERE c.id = merchant_patterns.category_id
        AND (c.is_global = true OR c.user_id = auth.uid())
        AND c.deleted_at IS NULL
    )
  );

CREATE POLICY "mp_insert_own"
  ON merchant_patterns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM categories c
      WHERE c.id = merchant_patterns.category_id
        AND (c.is_global = true OR c.user_id = auth.uid())
        AND c.deleted_at IS NULL
    )
  );

-- === USER TOKENS ===
CREATE POLICY "ut_select_own"
  ON user_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ut_insert_own"
  ON user_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ut_update_own"
  ON user_tokens FOR UPDATE
  USING (auth.uid() = user_id);

-- === REVOKED TOKENS ===
-- No RLS needed - validated in application code
-- Token hash is the PK, no user_id FK

-- === SUMMARIES ===
CREATE POLICY "sum_select_own"
  ON summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sum_insert_own"
  ON summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sum_update_own"
  ON summaries FOR UPDATE
  USING (auth.uid() = user_id);

-- === DEBT FORECAST ===
CREATE POLICY "df_select_own"
  ON debt_forecast FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "df_insert_own"
  ON debt_forecast FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "df_update_own"
  ON debt_forecast FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to refresh updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_cards_updated_at
  BEFORE UPDATE ON credit_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotas_updated_at
  BEFORE UPDATE ON quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_periods_updated_at
  BEFORE UPDATE ON billing_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_merchant_patterns_updated_at
  BEFORE UPDATE ON merchant_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_tokens_updated_at
  BEFORE UPDATE ON user_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_summaries_updated_at
  BEFORE UPDATE ON summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_debt_forecast_updated_at
  BEFORE UPDATE ON debt_forecast
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();