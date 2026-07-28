-- ============================================
-- Add closing_day and due_day to credit_cards
-- ============================================

ALTER TABLE IF EXISTS credit_cards ADD COLUMN IF NOT EXISTS closing_day INTEGER;
ALTER TABLE IF EXISTS credit_cards ADD COLUMN IF NOT EXISTS due_day INTEGER;
