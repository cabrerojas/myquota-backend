ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tx_parent_transaction
  ON transactions(parent_transaction_id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_transaction_refund_link'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transaction_refund_link
      CHECK (
        parent_transaction_id IS NULL
        OR (
          parent_transaction_id <> id
          AND amount <= 0
        )
      );
  END IF;
END $$;
