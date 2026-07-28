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
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (cardsError) {
    throw new Error(`[sql-queries] get credit cards failed: ${cardsError.message}`);
  }

  if (!cards || cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id as string);

  // Step 2: Get all active billing periods for the user's cards
  const { data: billingPeriods, error: bpError } = await supabase
    .from('billing_periods')
    .select('id, credit_card_id, month, start_date, end_date, due_date')
    .in('credit_card_id', cardIds)
    .is('deleted_at', null);

  if (bpError) {
    throw new Error(`[sql-queries] get billing periods failed: ${bpError.message}`);
  }

  // Step 3: Get all pending quotas for those cards
  const { data: quotas, error: qError } = await supabase
    .from('quotas')
    .select('id, amount, currency, due_date, credit_card_id')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .in('credit_card_id', cardIds);

  if (qError) {
    throw new Error(`[sql-queries] debt summary query failed: ${qError.message}`);
  }

  // Step 4: Match quotas to billing periods by credit card + date range in JS
  const result: RawDebtSummaryRow[] = [];

  for (const quota of quotas ?? []) {
    const dueDate = new Date(quota.due_date as string);
    const bp = (billingPeriods ?? []).find(
      (bp) =>
        bp.credit_card_id === quota.credit_card_id &&
        bp.start_date &&
        bp.end_date &&
        dueDate >= new Date(bp.start_date) &&
        dueDate <= new Date(bp.end_date),
    );

    if (!bp) continue;

    result.push({
      month: bp.month ?? '',
      start_date: bp.start_date ?? '',
      end_date: bp.end_date ?? '',
      due_date: quota.due_date as string ?? '',
      is_paid: (bp as Record<string, unknown>).is_paid as boolean ?? false,
      total_amount: quota.amount as number,
      currency: quota.currency as string,
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

  // Step 1: Get billing periods for this card
  const { data: billingPeriods, error: bpError } = await supabase
    .from('billing_periods')
    .select('id, month, start_date, end_date')
    .eq('credit_card_id', creditCardId)
    .is('deleted_at', null);

  if (bpError) {
    throw new Error(`[sql-queries] get billing periods failed: ${bpError.message}`);
  }

  // Step 2: Get transactions for this card with category info
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      amount,
      currency,
      category_id,
      transaction_date,
      categories(name)
    `)
    .eq('credit_card_id', creditCardId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`[sql-queries] monthly stats query failed: ${error.message}`);
  }

  // Step 3: Match transactions to billing periods by date range in JS
  const result: RawMonthlyStatsRow[] = [];

  for (const row of data ?? []) {
    const txDate = new Date(row.transaction_date as string);

    const bp = (billingPeriods ?? []).find(
      (bp) =>
        bp.start_date &&
        bp.end_date &&
        txDate >= new Date(bp.start_date) &&
        txDate <= new Date(bp.end_date),
    );

    if (!bp) continue;

    const catArray = row.categories as unknown as Array<{ name: string }>;
    const cat = catArray?.[0] ?? null;

    result.push({
      month: bp.month ?? '',
      start_date: bp.start_date ?? '',
      end_date: bp.end_date ?? '',
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