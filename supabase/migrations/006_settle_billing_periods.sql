-- Durable, idempotent statement settlements. This migration is local-only until deployed.

CREATE TABLE IF NOT EXISTS public.billing_period_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_period_id UUID NOT NULL REFERENCES public.billing_periods(id) ON DELETE RESTRICT,
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_quota_count INTEGER NOT NULL DEFAULT 0 CHECK (settled_quota_count >= 0),
  settled_total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (billing_period_id)
);

CREATE TABLE IF NOT EXISTS public.billing_period_settlement_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id UUID NOT NULL REFERENCES public.billing_period_settlements(id) ON DELETE RESTRICT,
  quota_id UUID NOT NULL REFERENCES public.quotas(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (settlement_id, quota_id)
);

CREATE INDEX IF NOT EXISTS idx_bps_credit_card_settled_at
  ON public.billing_period_settlements(credit_card_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bps_user_settled_at
  ON public.billing_period_settlements(user_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bpsl_settlement
  ON public.billing_period_settlement_lines(settlement_id);
CREATE INDEX IF NOT EXISTS idx_bpsl_quota
  ON public.billing_period_settlement_lines(quota_id);
CREATE INDEX IF NOT EXISTS idx_quota_settlement_eligibility
  ON public.quotas(transaction_id, due_date)
  WHERE deleted_at IS NULL AND status = 'pending';

ALTER TABLE public.billing_period_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_period_settlement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bps_select_own"
  ON public.billing_period_settlements FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "bpsl_select_own"
  ON public.billing_period_settlement_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.billing_period_settlements settlement
      WHERE settlement.id = billing_period_settlement_lines.settlement_id
        AND settlement.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON public.billing_period_settlements, public.billing_period_settlement_lines TO authenticated;
GRANT ALL ON public.billing_period_settlements, public.billing_period_settlement_lines TO service_role;

CREATE OR REPLACE FUNCTION public.settle_billing_period(
  p_billing_period_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  settlement_id UUID,
  billing_period_id UUID,
  credit_card_id UUID,
  settled_at TIMESTAMPTZ,
  already_settled BOOLEAN,
  settled_quota_count INTEGER,
  settled_total_amount NUMERIC(12, 2),
  lines JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.billing_periods%ROWTYPE;
  v_settlement public.billing_period_settlements%ROWTYPE;
  v_quota_count INTEGER;
  v_total_amount NUMERIC(12, 2);
BEGIN
  -- The service-role backend supplies the authenticated application user; this
  -- server-side lookup is the authorization boundary for this privileged RPC.
  SELECT bp.* INTO v_period
  FROM public.billing_periods bp
  JOIN public.credit_cards cc ON cc.id = bp.credit_card_id
  WHERE bp.id = p_billing_period_id
    AND bp.deleted_at IS NULL
    AND cc.id IS NOT NULL
    AND cc.deleted_at IS NULL
    AND cc.user_id = p_user_id
  FOR UPDATE OF bp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing period not found for credit card owner'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT settlement.* INTO v_settlement
  FROM public.billing_period_settlements settlement
  WHERE settlement.billing_period_id = v_period.id;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_settlement.id,
      v_settlement.billing_period_id,
      v_settlement.credit_card_id,
      v_settlement.settled_at,
      TRUE,
      v_settlement.settled_quota_count,
      v_settlement.settled_total_amount,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'quota_id', line.quota_id,
            'transaction_id', line.transaction_id,
            'amount', line.amount,
            'currency', line.currency,
            'due_date', line.due_date
          )
          ORDER BY line.due_date, line.quota_id
        ) FILTER (WHERE line.id IS NOT NULL),
        '[]'::jsonb
      )
    FROM public.billing_period_settlement_lines line
    WHERE line.settlement_id = v_settlement.id
    GROUP BY v_settlement.id;
    RETURN;
  END IF;

  INSERT INTO public.billing_period_settlements (
    billing_period_id,
    credit_card_id,
    user_id
  )
  VALUES (v_period.id, v_period.credit_card_id, p_user_id)
  ON CONFLICT (billing_period_id) DO NOTHING
  RETURNING * INTO v_settlement;

  IF v_settlement.id IS NULL THEN
    SELECT settlement.* INTO v_settlement
    FROM public.billing_period_settlements settlement
    WHERE settlement.billing_period_id = v_period.id;

    RETURN QUERY
    SELECT
      v_settlement.id,
      v_settlement.billing_period_id,
      v_settlement.credit_card_id,
      v_settlement.settled_at,
      TRUE,
      v_settlement.settled_quota_count,
      v_settlement.settled_total_amount,
      COALESCE(jsonb_agg(jsonb_build_object(
        'quota_id', line.quota_id,
        'transaction_id', line.transaction_id,
        'amount', line.amount,
        'currency', line.currency,
        'due_date', line.due_date
      )), '[]'::jsonb)
    FROM public.billing_period_settlement_lines line
    WHERE line.settlement_id = v_settlement.id
    GROUP BY v_settlement.id;
    RETURN;
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT q.id, q.transaction_id, q.amount, q.currency, q.due_date
    FROM public.quotas q
    JOIN public.transactions t ON t.id = q.transaction_id
    WHERE q.credit_card_id = v_period.credit_card_id
      AND q.deleted_at IS NULL
      AND q.status = 'pending'
      AND q.due_date <= v_period.due_date
      AND t.credit_card_id = v_period.credit_card_id
      AND t.deleted_at IS NULL
      AND t.parent_transaction_id IS NULL
      AND t.transaction_date BETWEEN v_period.start_date AND v_period.end_date
    FOR UPDATE OF q
  ), inserted_lines AS (
    INSERT INTO public.billing_period_settlement_lines (
      settlement_id,
      quota_id,
      transaction_id,
      amount,
      currency,
      due_date
    )
    SELECT v_settlement.id, id, transaction_id, amount, currency, due_date
    FROM eligible
    ON CONFLICT (settlement_id, quota_id) DO NOTHING
    RETURNING quota_id
  ), paid AS (
    UPDATE public.quotas q
    SET status = 'paid',
        payment_date = CURRENT_DATE,
        updated_at = now()
    FROM eligible
    WHERE q.id = eligible.id
      AND q.status = 'pending'
    RETURNING eligible.amount
  )
  SELECT COUNT(*)::INTEGER, COALESCE(SUM(amount), 0)::NUMERIC(12, 2)
  INTO v_quota_count, v_total_amount
  FROM paid;

  UPDATE public.billing_period_settlements
  SET settled_quota_count = v_quota_count,
      settled_total_amount = v_total_amount
  WHERE id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN QUERY
  SELECT
    v_settlement.id,
    v_settlement.billing_period_id,
    v_settlement.credit_card_id,
    v_settlement.settled_at,
    FALSE,
    v_settlement.settled_quota_count,
    v_settlement.settled_total_amount,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'quota_id', line.quota_id,
          'transaction_id', line.transaction_id,
          'amount', line.amount,
          'currency', line.currency,
          'due_date', line.due_date
        )
        ORDER BY line.due_date, line.quota_id
      ) FILTER (WHERE line.id IS NOT NULL),
      '[]'::jsonb
    )
  FROM public.billing_period_settlement_lines line
  WHERE line.settlement_id = v_settlement.id
  GROUP BY v_settlement.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_billing_period(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_billing_period(UUID, UUID) TO service_role;
