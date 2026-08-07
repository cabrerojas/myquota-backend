// src/modules/quota/debtForecast.service.ts
// Debt forecast service — computes monthly debt projections from pending quotas.
// Uses Supabase SQL queries from sql-queries.ts.
// Firestore collectionGroup code has been removed.

import { Transaction } from '@modules/transaction/transaction.model';
import { BillingPeriod } from '@modules/billingPeriod/billingPeriod.model';
import { Quota } from './quota.model';
import { CacheService } from '@shared/services/cache.service';
import {
  executePendingQuotasByUserQuery,
  executeAllTransactionsByUserQuery,
  executeAllBillingPeriodsByUserQuery,
} from '@/shared/lib/sql-queries';

// Extended Transaction type for what-if simulations - exported for use in stats module
export interface TransactionWithQuotas {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  creditCardId: string;
  quotas: Quota[];
}

// MonthBucket interface - exported for use in stats module
export interface MonthBucket {
  key: string;
  label: string;
  totalCLP: number;
  totalUSD: number;
  count: number;
  details: Array<{
    merchant: string;
    amount: number;
    currency: string;
    quotaNumber: number;
    totalQuotas: number;
    transactionId: string;
    creditCardId: string;
  }>;
  periodsByCard: { creditCardId: string; billingPeriodId: string }[];
}

export class DebtForecastService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * getDebtForecast — returns monthly debt projection.
   * L1: debtForecast:{userId} cache (5 min TTL)
   * L3: SQL queries via sql-queries.ts
   */
  public async getDebtForecast(
    transactionsOverride?: TransactionWithQuotas[],
    force?: boolean,
  ): Promise<{
    months: MonthBucket[];
    totalDebtCLP: number;
    totalDebtUSD: number;
  }> {
    const cacheKey = `debtForecast:${this.userId}`;

    if (!force && (!transactionsOverride || !transactionsOverride.length)) {
      const cached = CacheService.get<{
        months: MonthBucket[];
        totalDebtCLP: number;
        totalDebtUSD: number;
      }>(cacheKey);
      // Don't serve cached empty results — quotas may have been added
      if (cached && cached.months.length > 0) return cached;
    }

    let allQuotas: (Quota & { transactionId: string; creditCardId: string })[] = [];
    const txMap = new Map<string, Transaction>();

    if (transactionsOverride && transactionsOverride.length) {
      // Build from override (used for what-if simulations)
      for (const tx of transactionsOverride) {
        txMap.set(tx.id, tx as unknown as Transaction);
        for (const q of tx.quotas ?? []) {
          allQuotas.push({
            ...q,
            transactionId: tx.id,
            creditCardId: tx.creditCardId || '',
          });
        }
      }
    } else {
      // SQL path: fetch all data via sql-queries.ts
      const [quotaRows, txRows, bpRows] = await Promise.all([
        executePendingQuotasByUserQuery(this.userId),
        executeAllTransactionsByUserQuery(this.userId),
        executeAllBillingPeriodsByUserQuery(this.userId),
      ]);

      // Build txMap from transaction rows
      for (const tx of txRows) {
        txMap.set(tx.id, {
          id: tx.id,
          creditCardId: tx.credit_card_id,
          amount: tx.amount,
          currency: tx.currency,
          merchant: tx.merchant,
          categoryId: tx.category_id ?? undefined,
          transactionDate: new Date(tx.transaction_date),
          source: 'manual' as const,
          description: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          cardType: '',
          cardLastDigits: '',
          bank: '',
        } as unknown as Transaction);
      }

      // Map quota rows to Quota objects
      allQuotas = quotaRows.map((q) => ({
        id: q.id,
        transactionId: q.transaction_id,
        creditCardId: q.credit_card_id,
        amount: q.amount,
        currency: q.currency,
        dueDate: new Date(q.due_date),
        status: q.status as 'pending' | 'paid',
        paymentDate: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        merchant: q.merchant,
      }));

      // Build sorted billing periods for computeDebtForecast
      const sortedPeriods: (BillingPeriod & { creditCardId: string })[] = bpRows.map(
        (bp) => ({
          id: bp.id,
          creditCardId: bp.credit_card_id,
          month: bp.month,
          startDate: new Date(bp.start_date),
          endDate: new Date(bp.end_date),
          dueDate: new Date(bp.end_date),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      );

      const result = computeDebtForecast(
        allQuotas.map((q) => ({
          ...q,
          merchant: (q as { merchant?: string }).merchant || '',
          creditCardLabel: '',
          quotaNumber: 0,
          totalQuotas: 0,
        })),
        sortedPeriods,
      );

      // Only cache non-empty results
      if (result.months.length > 0) {
        CacheService.set(cacheKey, result, 300);
      }
      return result;
    }

    // transactionsOverride path: compute from override data
    const result = computeDebtForecast(
      allQuotas.map((q) => ({
        ...q,
        merchant: (q as { merchant?: string }).merchant || '',
        creditCardLabel: '',
        quotaNumber: 0,
        totalQuotas: 0,
      })),
      [],
    );

    if (!transactionsOverride || !transactionsOverride.length) {
      if (result.months.length > 0) {
        CacheService.set(cacheKey, result, 300);
      }
    }
    return result;
  }
}

/**
 * Pure compute function that turns enriched quotas + billing periods into
 * month buckets and totals. Exported for reuse and unit testing.
 */
export function computeDebtForecast(
  enrichedQuotas: Array<
    Quota & {
      transactionId: string;
      creditCardId: string;
      merchant?: string;
      creditCardLabel?: string;
      quotaNumber?: number;
      totalQuotas?: number;
    }
  >,
  sortedPeriods: (BillingPeriod & { creditCardId: string })[],
): { months: MonthBucket[]; totalDebtCLP: number; totalDebtUSD: number } {
  const findPeriodForQuota = (dueDate: string) => {
    const d = new Date(dueDate).getTime();
    for (const p of sortedPeriods) {
      const start = new Date(p.startDate).getTime();
      const end = new Date(p.endDate).getTime();
      if (d >= start && d <= end) return p;
    }
    return null;
  };

  const bucketMap = new Map<string, MonthBucket>();

  for (const q of enrichedQuotas) {
    const dueDateStr =
      typeof q.dueDate === 'string'
        ? q.dueDate
        : q.dueDate instanceof Date
        ? q.dueDate.toISOString()
        : String(q.dueDate);

    const period = findPeriodForQuota(dueDateStr);
    let key: string;
    let label: string;
    if (period) {
      key = period.month;
      label = period.month;
    } else {
      const date = new Date(dueDateStr);
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('es-CL', {
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Santiago',
      });
      label = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
    }

    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        label,
        totalCLP: 0,
        totalUSD: 0,
        count: 0,
        details: [],
        periodsByCard: [],
      });
    }

    const bucket = bucketMap.get(key)!;
    if (q.currency === 'USD') bucket.totalUSD += q.amount;
    else bucket.totalCLP += q.amount;
    bucket.count += 1;
    bucket.details.push({
      merchant: q.merchant || 'Sin comercio',
      amount: q.amount,
      currency: q.currency,
      quotaNumber: q.quotaNumber!,
      totalQuotas: q.totalQuotas!,
      transactionId: q.transactionId,
      creditCardId: q.creditCardId || '',
    });
  }

  // Populate periodsByCard
  for (const p of sortedPeriods) {
    const bucket = bucketMap.get(p.month);
    if (bucket) {
      const exists = bucket.periodsByCard.find(
        (pb) => pb.creditCardId === p.creditCardId && pb.billingPeriodId === p.id,
      );
      if (!exists) {
        bucket.periodsByCard.push({
          creditCardId: p.creditCardId,
          billingPeriodId: p.id,
        });
      }
    }
  }

  const periodStartMap = new Map<string, number>();
  for (const p of sortedPeriods) {
    if (!periodStartMap.has(p.month))
      periodStartMap.set(p.month, new Date(p.startDate).getTime());
  }

  const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => {
    const aTime = periodStartMap.get(a.key) ?? new Date(a.key).getTime();
    const bTime = periodStartMap.get(b.key) ?? new Date(b.key).getTime();
    return aTime - bTime;
  });

  const totalDebtCLP = enrichedQuotas
    .filter((q) => q.currency !== 'USD')
    .reduce((s, q) => s + (q.amount || 0), 0);
  const totalDebtUSD = enrichedQuotas
    .filter((q) => q.currency === 'USD')
    .reduce((s, q) => s + (q.amount || 0), 0);

  return { months: sortedBuckets, totalDebtCLP, totalDebtUSD };
}