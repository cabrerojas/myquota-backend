// src/modules/stats/stats.service.ts
// Stats service — L1 memory cache + Supabase SQL queries.
// USE_SUPABASE is always true in production — Firestore code has been removed.

import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from '@/shared/services/cache.service';
import { TransactionRepositorySupabase } from '@/modules/transaction/transaction.repository.supabase';
import { BillingPeriodRepositorySupabase } from '@/modules/billingPeriod/billingPeriod.repository.supabase';
import {
  executeDebtSummaryQuery,
  executeMonthlyStatsQuery,
  executeMonthlyQuotaSumQuery,
} from '@/shared/lib/sql-queries';
import { WhatIfProduct } from './stats.schemas';

interface DebtSummary {
  totalCLP: number;
  totalUSD: number;
  pendingCount: number;
  monthsRemaining: number;
  nextMonthCLP: number;
  nextMonthUSD: number;
  /** Per-billing-period breakdown sorted chronologically, used for the 3-month preview in the dashboard. */
  monthlyBreakdown: { month: string; CLP: number; USD: number }[];
}

interface MonthlyStatEntry {
  month: string;
  totalCLP: number;
  totalUSD: number;
  categoryBreakdown: {
    [category: string]: { CLP: number; USD: number };
  };
}

export class StatsService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(
    _transactionRepository: TransactionRepositorySupabase,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _billingPeriodRepository: BillingPeriodRepositorySupabase,
  ) {}

  /**
   * Obtiene la sumatoria de cuotas organizadas por períodos de facturación.
   * Uses SQL query: single JOIN query replaces N+1 getQuotas loop.
   * Resultado cacheado en L1 memoria con TTL MEDIUM (2 min).
   */
  async getMonthlyQuotaSum(
    creditCardId: string,
  ): Promise<{ period: string; currency: string; totalAmount: number }[]> {
    const cacheKey = CacheKeys.monthlyQuotaSum(creditCardId);
    const cached =
      CacheService.get<
        { period: string; currency: string; totalAmount: number }[]
      >(cacheKey);
    if (cached !== null) return cached;

    const result = await this.getMonthlyQuotaSumSql(creditCardId);

    CacheService.set(cacheKey, result, CacheTTL.MEDIUM);
    return result;
  }

  /**
   * getMonthlyQuotaSumSql — SQL path, single JOIN query replaces N+1 getQuotas loop.
   */
  private async getMonthlyQuotaSumSql(
    creditCardId: string,
  ): Promise<{ period: string; currency: string; totalAmount: number }[]> {
    const rows = await executeMonthlyQuotaSumQuery(creditCardId);
    return rows.map((row) => ({
      period: row.period,
      currency: row.currency,
      totalAmount: row.total_amount,
    }));
  }

  // ---------------------------------------------------------------------------
  // getGlobalDebtSummary — L1 memory cache + SQL query
  // ---------------------------------------------------------------------------

  /**
   * Returns the global debt summary.
   * L1: in-memory cache (fast, resets on server restart)
   * L3: SQL query via executeDebtSummaryQuery
   */
  static async getGlobalDebtSummary(userId: string): Promise<DebtSummary> {
    // L1: memory cache
    const memKey = CacheKeys.debtSummary(userId);
    const cached = CacheService.get<DebtSummary>(memKey);
    if (cached !== null) return cached;

    const result = await StatsService.computeDebtSummarySql(userId);
    CacheService.set(memKey, result, CacheTTL.LONG);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Pure compute method — SQL path
  // ---------------------------------------------------------------------------

  /**
   * computeDebtSummarySql — SQL path, single query with JOINs.
   */
  private static async computeDebtSummarySql(
    userId: string,
  ): Promise<DebtSummary> {
    const rows = await executeDebtSummaryQuery(userId);

    if (!rows || rows.length === 0) {
      return {
        totalCLP: 0,
        totalUSD: 0,
        pendingCount: 0,
        monthsRemaining: 0,
        nextMonthCLP: 0,
        nextMonthUSD: 0,
        monthlyBreakdown: [],
      };
    }

    const totalsMap: { [currency: string]: number } = { CLP: 0, USD: 0 };
    const monthBuckets = new Map<
      string,
      { CLP: number; USD: number; sortKey: number }
    >();

    const now = new Date();
    const currentCalKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let pendingCount = 0;

    for (const row of rows) {
      pendingCount++;

      const currency = row.currency === 'USD' ? 'USD' : 'CLP';
      totalsMap[currency] = (totalsMap[currency] ?? 0) + row.total_amount;

      // Month key from billing period or due_date
      const bucketKey = row.month || row.due_date.substring(0, 7);

      if (!monthBuckets.has(bucketKey)) {
        monthBuckets.set(bucketKey, {
          CLP: 0,
          USD: 0,
          sortKey: new Date(row.start_date || row.due_date).getTime(),
        });
      }

      const bucket = monthBuckets.get(bucketKey)!;
      if (currency === 'USD') {
        bucket.USD += row.total_amount;
      } else {
        bucket.CLP += row.total_amount;
      }
    }

    // Calculate next month totals from monthBuckets
    let nextMonthCLP = 0;
    let nextMonthUSD = 0;
    for (const [key, bucket] of monthBuckets.entries()) {
      if (key === currentCalKey) {
        nextMonthCLP = bucket.CLP;
        nextMonthUSD = bucket.USD;
      }
    }

    const monthlyBreakdown = Array.from(monthBuckets.entries())
      .sort((a, b) => a[1].sortKey - b[1].sortKey)
      .map(([month, { CLP, USD }]) => ({ month, CLP, USD }));

    return {
      totalCLP: totalsMap.CLP ?? 0,
      totalUSD: totalsMap.USD ?? 0,
      pendingCount,
      monthsRemaining: monthBuckets.size,
      nextMonthCLP,
      nextMonthUSD,
      monthlyBreakdown,
    };
  }

  // ---------------------------------------------------------------------------
  // getMonthlyStats — L1 memory cache + SQL query
  // ---------------------------------------------------------------------------

  /**
   * Returns monthly spending stats for a credit card.
   * L1: in-memory cache
   * L3: SQL query via executeMonthlyStatsQuery
   */
  async getMonthlyStats(
    userId: string,
    creditCardId: string,
  ): Promise<MonthlyStatEntry[]> {
    // L1: memory cache
    const memKey = CacheKeys.monthlyStats(userId, creditCardId);
    const cached = CacheService.get<MonthlyStatEntry[]>(memKey);
    if (cached !== null) return cached;

    const result = await this.computeMonthlyStatsSql(userId, creditCardId);
    CacheService.set(memKey, result, CacheTTL.LONG);
    return result;
  }

  /**
   * computeMonthlyStatsSql — SQL path, single JOIN query.
   */
  private async computeMonthlyStatsSql(
    _userId: string,
    creditCardId: string,
  ): Promise<MonthlyStatEntry[]> {
    const rows = await executeMonthlyStatsQuery(creditCardId);

    if (!rows || rows.length === 0) return [];

    // Group by billing period month
    const statsMap = new Map<string, MonthlyStatEntry>();

    for (const row of rows) {
      if (!statsMap.has(row.month)) {
        statsMap.set(row.month, {
          month: row.month,
          totalCLP: 0,
          totalUSD: 0,
          categoryBreakdown: {},
        });
      }

      const entry = statsMap.get(row.month)!;
      const currency = row.currency === 'USD' ? 'USD' : 'CLP';

      if (currency === 'CLP') {
        entry.totalCLP += row.total_amount;
      } else {
        entry.totalUSD += row.total_amount;
      }

      if (!entry.categoryBreakdown[row.category_name]) {
        entry.categoryBreakdown[row.category_name] = { CLP: 0, USD: 0 };
      }
      entry.categoryBreakdown[row.category_name][currency] += row.total_amount;
    }

    return Array.from(statsMap.values());
  }

  // ---------------------------------------------------------------------------
  // triggerRecompute / triggerInvalidateOnly — L1 cache invalidation only
  // ---------------------------------------------------------------------------

  /**
   * triggerRecompute — invalidates L1 memory cache.
   * Debt forecast cache is also invalidated.
   *
   * @param userId       - The authenticated user
   * @param creditCardId - The card being modified (triggers monthly stats recompute)
   */
  static triggerRecompute(userId: string, _creditCardId?: string): void {
    // Invalidate L1 memory cache
    CacheService.invalidateByPrefix(CacheKeys.userPrefix(userId));

    // Debt forecast cache also needs invalidation
    CacheService.invalidate(`debtForecast:${userId}`);
  }

  /**
   * triggerInvalidateOnly — L1 cache invalidation for category-only changes.
   *
   * @param userId       - The authenticated user
   * @param creditCardId - The card whose transaction was updated
   */
  static triggerInvalidateOnly(userId: string, creditCardId?: string): void {
    CacheService.invalidate(CacheKeys.uncategorizedCount(userId));
    if (creditCardId) {
      CacheService.invalidate(CacheKeys.monthlyStats(userId, creditCardId));
    }
  }
}

// What-if calculation: map products -> temporary transactions -> compute projection

interface QuotaInput {
  merchant: string;
  amount: number;
  currency: string;
  dueDate: string;
}

export class WhatIfService {
  async calculateWhatIf(products: WhatIfProduct[]) {
    const maxInstallments = Math.max(...products.map((p) => p.totalInstallments), 0);

    const allQuotas: QuotaInput[] = [];

    for (const p of products) {
      const first = new Date(p.firstDueDate);
      const firstYear = first.getUTCFullYear();
      const firstMonth = first.getUTCMonth();
      const firstDay = first.getUTCDate();

      for (let i = 0; i < p.totalInstallments; i++) {
        const due = new Date(Date.UTC(firstYear, firstMonth + i, firstDay));
        allQuotas.push({
          merchant: p.merchant,
          amount: +(p.amount / p.totalInstallments),
          currency: p.currency,
          dueDate: due.toISOString(),
        });
      }
    }

    const bucketMap = new Map<
      string,
      { key: string; label: string; totalCLP: number; totalUSD: number; count: number }
    >();

    for (const q of allQuotas) {
      const date = new Date(q.dueDate);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('es-CL', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      const label = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

      if (!bucketMap.has(key)) {
        bucketMap.set(key, { key, label, totalCLP: 0, totalUSD: 0, count: 0 });
      }

      const bucket = bucketMap.get(key)!;
      if (q.currency === 'USD') {
        bucket.totalUSD += q.amount;
      } else {
        bucket.totalCLP += q.amount;
      }
      bucket.count += 1;
    }

    const sortedMonths = Array.from(bucketMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const limitedMonths = sortedMonths.slice(0, maxInstallments);

    let totalDebtCLP = 0;
    let totalDebtUSD = 0;
    for (const m of limitedMonths) {
      totalDebtCLP += m.totalCLP;
      totalDebtUSD += m.totalUSD;
    }

    return {
      months: limitedMonths.map((m) => ({
        ...m,
        details: [],
        periodsByCard: [],
      })),
      totalDebtCLP,
      totalDebtUSD,
      meta: {
        months: limitedMonths.length,
      },
    };
  }
}