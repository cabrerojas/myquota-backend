// src/shared/lib/sql-queries.ts
// SQL query helpers for StatsService and DebtForecastService.
// Used when USE_SUPABASE=true — replaces Firestore collectionGroup + in-memory compute.

import { getSupabaseAdmin } from '@/config/supabase';

// ---------------------------------------------------------------------------
// Raw row types (as returned from Supabase)
// ---------------------------------------------------------------------------

export interface RawDebtSummaryRow {
  month: string;
  start_date: string;
  end_date: string;
  due_date: string;
  is_paid: boolean;
  total_amount: number;
  currency: string;
  quota_count: number;
}

export interface RawMonthlyStatsRow {
  month: string;
  start_date: string;
  end_date: string;
  category_id: string | null;
  category_name: string;
  total_amount: number;
  currency: string;
  transaction_count: number;
}

export interface RawMonthlyQuotaSumRow {
  period: string;
  currency: string;
  total_amount: number;
}

export interface RawPendingQuotaRow {
  id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  due_date: string;
  status: string;
  merchant: string;
  credit_card_id: string;
}

export interface RawTransactionRow {
  id: string;
  credit_card_id: string;
  amount: number;
  currency: string;
  merchant: string;
  category_id: string | null;
  transaction_date: string;
}

export interface RawBillingPeriodRow {
  id: string;
  credit_card_id: string;
  month: string;
  start_date: string;
  end_date: string;
}

// ---------------------------------------------------------------------------
// executeDebtSummaryQuery
// Replaces _computeDebtSummary L3: reads ALL cards → ALL transactions → ALL quotas.
// Uses JOIN to get billing period info + currency aggregation.
// ---------------------------------------------------------------------------

export async function executeDebtSummaryQuery(
  userId: string,
): Promise<RawDebtSummaryRow[]> {
  const supabase = getSupabaseAdmin();

  // Step 1: Get user's credit card IDs
  const { data: cards, error: cardsError } = await supabase
    .from('credit_cards')
    .select('id, currency')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (cardsError) {
    throw new Error(`[sql-queries] get credit cards failed: ${cardsError.message}`);
  }

  if (!cards || cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id as string);

  // Step 2: Get all pending quotas for those cards with billing period info
  // We fetch via quotas JOINed with transactions + billing_periods
  const { data, error } = await supabase
    .from('quotas')
    .select(`
      id,
      amount,
      currency,
      due_date,
      transaction_id,
      billing_periods!inner(
        month,
        start_date,
        end_date,
        due_date,
        is_paid,
        credit_card_id
      )
    `)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .in('billing_periods.credit_card_id', cardIds);

  if (error) {
    throw new Error(`[sql-queries] debt summary query failed: ${error.message}`);
  }

  // Transform to RawDebtSummaryRow format
  // Filter to only quotas where the billing period's credit card belongs to user
  const cardIdSet = new Set(cardIds);
  const result: RawDebtSummaryRow[] = [];

  for (const row of data ?? []) {
    // billing_periods is a nested select, so it's an array even with !inner
    const bpArray = row.billing_periods as unknown as Array<Record<string, unknown>>;
    const bp = bpArray?.[0];
    const bpCardId = bp?.credit_card_id as string;
    if (!bpCardId || !cardIdSet.has(bpCardId)) continue;

    result.push({
      month: bp?.month as string ?? '',
      start_date: bp?.start_date as string ?? '',
      end_date: bp?.end_date as string ?? '',
      due_date: row.due_date as string ?? '',
      is_paid: (bp?.is_paid as boolean) ?? false,
      total_amount: row.amount as number,
      currency: row.currency as string,
      quota_count: 1,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// executeMonthlyStatsQuery
// Replaces _computeMonthlyStats L3: single JOIN aggregates by billing period + category.
// ---------------------------------------------------------------------------

export async function executeMonthlyStatsQuery(
  creditCardId: string,
): Promise<RawMonthlyStatsRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      amount,
      currency,
      category_id,
      transaction_date,
      billing_periods!inner(
        month,
        start_date,
        end_date,
        credit_card_id
      ),
      categories(name)
    `)
    .eq('credit_card_id', creditCardId)
    .is('deleted_at', null)
    .not('billing_periods.start_date', 'is', null);

  if (error) {
    throw new Error(`[sql-queries] monthly stats query failed: ${error.message}`);
  }

  const result: RawMonthlyStatsRow[] = [];

  for (const row of data ?? []) {
    // Nested selects return arrays
    const bpArray = row.billing_periods as unknown as Array<Record<string, unknown>>;
    const bp = bpArray?.[0];
    const catArray = row.categories as unknown as Array<{ name: string }>;
    const cat = catArray?.[0] ?? null;

    result.push({
      month: bp?.month as string ?? '',
      start_date: bp?.start_date as string ?? '',
      end_date: bp?.end_date as string ?? '',
      category_id: row.category_id as string | null,
      category_name: cat?.name ?? 'Otros',
      total_amount: row.amount as number,
      currency: row.currency as string,
      transaction_count: 1,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// executeMonthlyQuotaSumQuery
// Replaces getMonthlyQuotaSum N+1 loop with single query + in-memory aggregation.
// ---------------------------------------------------------------------------

export async function executeMonthlyQuotaSumQuery(
  creditCardId: string,
): Promise<RawMonthlyQuotaSumRow[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('quotas')
    .select('amount, currency, due_date')
    .eq('credit_card_id', creditCardId)
    .is('deleted_at', null)
    .not('due_date', 'is', null);

  if (error) {
    throw new Error(`[sql-queries] monthly quota sum query failed: ${error.message}`);
  }

  // Group by month+currency in JS
  const bpMap = new Map<string, Map<string, number>>();

  for (const q of data ?? []) {
    const dueDate = q.due_date as string;
    if (!dueDate) continue;
    const monthKey = dueDate.substring(0, 7); // 'YYYY-MM'
    if (!bpMap.has(monthKey)) bpMap.set(monthKey, new Map());
    const currencyMap = bpMap.get(monthKey)!;
    const currency = q.currency as string;
    currencyMap.set(currency, (currencyMap.get(currency) ?? 0) + (q.amount as number));
  }

  const result: RawMonthlyQuotaSumRow[] = [];
  for (const [period, currencyMap] of bpMap.entries()) {
    for (const [currency, total_amount] of currencyMap.entries()) {
      result.push({ period, currency, total_amount });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// executePendingQuotasByUserQuery
// Replaces collectionGroup("quotas").where("status", "==", "pending")
// via JOIN through transactions → credit_cards.
// ---------------------------------------------------------------------------

export async function executePendingQuotasByUserQuery(
  userId: string,
): Promise<RawPendingQuotaRow[]> {
  const supabase = getSupabaseAdmin();

  // Get user's credit card IDs first
  const { data: cards, error: cardsErr } = await supabase
    .from('credit_cards')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (cardsErr) {
    throw new Error(`[sql-queries] get credit cards for pending quotas: ${cardsErr.message}`);
  }

  if (!cards || cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id as string);

  // Get all pending quotas for those cards with transaction info
  const { data, error } = await supabase
    .from('quotas')
    .select(`
      id,
      transaction_id,
      amount,
      currency,
      due_date,
      status,
      transactions!inner(
        merchant,
        credit_card_id
      )
    `)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .in('transactions.credit_card_id', cardIds);

  if (error) {
    throw new Error(`[sql-queries] pending quotas query failed: ${error.message}`);
  }

  const cardIdSet = new Set(cardIds);
  const result: RawPendingQuotaRow[] = [];

  for (const row of data ?? []) {
    // transactions is a nested select, so it's an array even with !inner
    const txArray = row.transactions as unknown as Array<Record<string, unknown>>;
    const tx = txArray?.[0];
    const ccId = tx?.credit_card_id as string;
    if (!ccId || !cardIdSet.has(ccId)) continue;

    result.push({
      id: row.id as string,
      transaction_id: row.transaction_id as string,
      amount: row.amount as number,
      currency: row.currency as string,
      due_date: row.due_date as string,
      status: row.status as string,
      merchant: (tx?.merchant as string) ?? '',
      credit_card_id: ccId,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// executeAllTransactionsByUserQuery
// Replaces collectionGroup("transactions").where("deletedAt", "==", null)
// via JOIN through credit_cards.
// ---------------------------------------------------------------------------

export async function executeAllTransactionsByUserQuery(
  userId: string,
): Promise<RawTransactionRow[]> {
  const supabase = getSupabaseAdmin();

  // Get user's credit card IDs first
  const { data: cards, error: cardsErr } = await supabase
    .from('credit_cards')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (cardsErr) {
    throw new Error(`[sql-queries] get credit cards for transactions: ${cardsErr.message}`);
  }

  if (!cards || cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id as string);

  const { data, error } = await supabase
    .from('transactions')
    .select('id, credit_card_id, amount, currency, merchant, category_id, transaction_date')
    .in('credit_card_id', cardIds)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`[sql-queries] all transactions query failed: ${error.message}`);
  }

  return (data ?? []) as RawTransactionRow[];
}

// ---------------------------------------------------------------------------
// executeAllBillingPeriodsByUserQuery
// Replaces collectionGroup("billingPeriods").where("deletedAt", "==", null)
// via JOIN through credit_cards.
// ---------------------------------------------------------------------------

export async function executeAllBillingPeriodsByUserQuery(
  userId: string,
): Promise<RawBillingPeriodRow[]> {
  const supabase = getSupabaseAdmin();

  // Get user's credit card IDs first
  const { data: cards, error: cardsErr } = await supabase
    .from('credit_cards')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (cardsErr) {
    throw new Error(`[sql-queries] get credit cards for billing periods: ${cardsErr.message}`);
  }

  if (!cards || cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id as string);

  const { data, error } = await supabase
    .from('billing_periods')
    .select('id, credit_card_id, month, start_date, end_date')
    .in('credit_card_id', cardIds)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) {
    throw new Error(`[sql-queries] all billing periods query failed: ${error.message}`);
  }

  return (data ?? []) as RawBillingPeriodRow[];
}