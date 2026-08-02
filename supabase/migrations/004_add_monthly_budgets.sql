-- 004_add_monthly_budgets.sql
-- Add monthly budget columns to users table for budget tracking feature.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_budget_clp DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS monthly_budget_usd DECIMAL(12,2);
