import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { BillingPeriodRepository } from "@/modules/billingPeriod/billingPeriod.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import { CategoryService } from "@/modules/category/category.service";
import { convertUtcToChileTime } from "@/shared/utils/date.utils";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { db } from "@/config/firebase";
import { DebtForecastService, TransactionWithQuotas } from "@/modules/quota/debtForecast.service";
import { Quota } from "@/modules/quota/quota.model";

/**
 * Maximum age of a Firestore-persisted summary before forcing a full recompute.
 * Firestore summaries survive server restarts; memory cache does not.
 */
const SUMMARY_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

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
  constructor(
    private transactionRepository: TransactionRepository,
    private billingPeriodRepository: BillingPeriodRepository,
  ) {}

  /**
   * Obtiene la sumatoria de cuotas organizadas por períodos de facturación.
   * Costo L3: 1 (billingPeriods) + 1 (transactions) + N_transactions (getQuotas) reads.
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

    try {
      const [billingPeriods, transactions] = await Promise.all([
        this.billingPeriodRepository.findAll(),
        this.transactionRepository.findAll(),
      ]);

      if (!billingPeriods.length || !transactions.length) return [];

      const formattedBillingPeriods = billingPeriods.map((period) => ({
        periodKey: `${convertUtcToChileTime(
          period.startDate,
          "yyyy-MM-dd",
        )} - ${convertUtcToChileTime(period.endDate, "yyyy-MM-dd")}`,
        startDate: new Date(
          convertUtcToChileTime(period.startDate, "yyyy-MM-dd HH:mm:ss"),
        ),
        endDate: new Date(
          convertUtcToChileTime(period.endDate, "yyyy-MM-dd HH:mm:ss"),
        ),
      }));

      const allQuotas = (
        await Promise.all(
          transactions.map((tx) =>
            this.transactionRepository.getQuotas(creditCardId, tx.id),
          ),
        )
      ).flat();

      const periodSumMap: { [key: string]: { [currency: string]: number } } =
        {};

      for (const billingPeriod of formattedBillingPeriods) {
        periodSumMap[billingPeriod.periodKey] = {};
        const quotasInPeriod = allQuotas.filter((quota) => {
          if (!quota.dueDate) return false;
          const quotaDate = new Date(
            convertUtcToChileTime(quota.dueDate, "yyyy-MM-dd HH:mm:ss"),
          );
          return (
            quotaDate >= billingPeriod.startDate &&
            quotaDate <= billingPeriod.endDate
          );
        });
        for (const quota of quotasInPeriod) {
          periodSumMap[billingPeriod.periodKey][quota.currency] =
            (periodSumMap[billingPeriod.periodKey][quota.currency] ?? 0) +
            quota.amount;
        }
      }

      const result = Object.entries(periodSumMap).flatMap(
        ([period, currencyMap]) =>
          Object.entries(currencyMap).map(([currency, totalAmount]) => ({
            period,
            currency,
            totalAmount,
          })),
      );

      CacheService.set(cacheKey, result, CacheTTL.MEDIUM);

      return result;
    } catch (error) {
      console.error(
        "Error al obtener la sumatoria de las cuotas por período de facturación:",
        error,
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Firestore materialized view document references
  // Path: users/{userId}/summaries/debtSummary
  //       users/{userId}/creditCards/{cardId}/summaries/monthlyStats
  // ---------------------------------------------------------------------------

  private static debtSummaryRef(userId: string) {
    return db
      .collection("users")
      .doc(userId)
      .collection("summaries")
      .doc("debtSummary");
  }

  private static monthlyStatsRef(userId: string, creditCardId: string) {
    return db
      .collection("users")
      .doc(userId)
      .collection("creditCards")
      .doc(creditCardId)
      .collection("summaries")
      .doc("monthlyStats");
  }

  // ---------------------------------------------------------------------------
  // 3-level read: L1 memory → L2 Firestore summary (1 read) → L3 full compute
  // ---------------------------------------------------------------------------

  /**
   * Returns the global debt summary.
   * L1: in-memory cache (fast, resets on server restart)
   * L2: Firestore materialized view (1 read, survives restarts)
   * L3: full compute (~789 reads) — only on first load or stale data
   */
  static async getGlobalDebtSummary(userId: string): Promise<DebtSummary> {
    // L1: memory cache
    const memKey = CacheKeys.debtSummary(userId);
    const cached = CacheService.get<DebtSummary>(memKey);
    if (cached !== null) return cached;

    // L2: Firestore materialized view (1 read)
    try {
      const doc = await StatsService.debtSummaryRef(userId).get();
      if (doc.exists) {
        const raw = doc.data()!;
        const ageMs = Date.now() - new Date(raw.computedAt as string).getTime();
        const summary = raw.data as DebtSummary;
        // Migration guard: skip L2 if the persisted doc is missing monthlyBreakdown
        // (written before this field was added). Forces a one-time L3 recompute.
        if (
          ageMs < SUMMARY_MAX_AGE_MS &&
          Array.isArray(summary?.monthlyBreakdown)
        ) {
          CacheService.set(memKey, summary, CacheTTL.LONG);
          return summary;
        }
      }
    } catch (err) {
      console.error("Failed to read debt summary from Firestore:", err);
    }

    // L3: full compute, then persist async
    const result = await StatsService._computeDebtSummary(userId);
    StatsService.debtSummaryRef(userId)
      .set({ data: result, computedAt: new Date().toISOString() })
      .catch((err) => console.error("Failed to persist debt summary:", err));
    CacheService.set(memKey, result, CacheTTL.LONG);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Pure compute methods (no caching — separated for reuse in triggerRecompute)
  // ---------------------------------------------------------------------------

  private static async _computeDebtSummary(
    userId: string,
  ): Promise<DebtSummary> {
    const creditCardRepo = new CreditCardRepository(userId);
    const cards = await creditCardRepo.findAll();

    let totalCLP = 0;
    let totalUSD = 0;
    let pendingCount = 0;
    let nextMonthCLP = 0;
    let nextMonthUSD = 0;
    const periodAmounts = new Map<
      string,
      { CLP: number; USD: number; sortKey: number }
    >();

    // Collect all billing periods across all cards
    const allBillingPeriods: {
      month: string;
      startDate: string;
      endDate: string;
    }[] = [];

    for (const card of cards) {
      const bpRepo = new BillingPeriodRepository(userId, card.id);
      const periods = await bpRepo.findAll();
      allBillingPeriods.push(
        ...periods.map((p) => ({
          month: p.month,
          startDate: String(p.startDate),
          endDate: String(p.endDate),
        })),
      );
    }

    // Find current billing period
    const now = Date.now();
    const currentPeriod = allBillingPeriods.find((p) => {
      const start = new Date(p.startDate).getTime();
      const end = new Date(p.endDate).getTime();
      return now >= start && now <= end;
    });

    // Process each card in parallel
    await Promise.all(
      cards.map(async (card) => {
        const txRepo = new TransactionRepository(userId, card.id);
        const transactions = await txRepo.findAll();

        // Get all quotas for all transactions in parallel
        const allQuotas = await Promise.all(
          transactions.map((tx) => txRepo.getQuotas(card.id, tx.id)),
        );

        for (const quotas of allQuotas) {
          for (const q of quotas) {
            if (q.status !== "pending") continue;

            pendingCount++;

            // Find which billing period this quota belongs to
            const dueTime = new Date(q.dueDate as unknown as string).getTime();
            const periodMonth = allBillingPeriods.find((p) => {
              return (
                dueTime >= new Date(p.startDate).getTime() &&
                dueTime <= new Date(p.endDate).getTime()
              );
            })?.month;

            // Compute calendar month key for this quota
            const dueDate = new Date(q.dueDate as unknown as string);
            const calKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;

            const bucketKey = periodMonth ?? calKey;
            const bucket = periodAmounts.get(bucketKey) ?? {
              CLP: 0,
              USD: 0,
              sortKey: dueTime,
            };
            if (!periodAmounts.has(bucketKey)) {
              periodAmounts.set(bucketKey, bucket);
            }
            if (q.currency === "USD") {
              bucket.USD += q.amount;
              totalUSD += q.amount;
            } else {
              bucket.CLP += q.amount;
              totalCLP += q.amount;
            }
            // Keep sortKey as the earliest dueDate in this bucket
            if (dueTime < bucket.sortKey) bucket.sortKey = dueTime;

            // Next payment = quotas in current billing period or current calendar month
            const nowDate = new Date();
            const currentCalKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
            const isCurrentPeriod =
              (currentPeriod && periodMonth === currentPeriod.month) ||
              (!periodMonth && calKey === currentCalKey);

            if (isCurrentPeriod) {
              if (q.currency === "USD") {
                nextMonthUSD += q.amount;
              } else {
                nextMonthCLP += q.amount;
              }
            }
          }
        }
      }),
    );

    const monthlyBreakdown = Array.from(periodAmounts.entries())
      .sort((a, b) => a[1].sortKey - b[1].sortKey)
      .map(([month, { CLP, USD }]) => ({ month, CLP, USD }));

    const result: DebtSummary = {
      totalCLP,
      totalUSD,
      pendingCount,
      monthsRemaining: periodAmounts.size,
      nextMonthCLP,
      nextMonthUSD,
      monthlyBreakdown,
    };

    return result;
  }

  // ---------------------------------------------------------------------------
  // getMonthlyStats — 3-level cached read
  // ---------------------------------------------------------------------------

  /**
   * Returns monthly spending stats for a credit card.
   * L1: in-memory cache
   * L2: Firestore materialized view (1 read, survives restarts)
   * L3: full compute — only when cache is cold or stale
   */
  async getMonthlyStats(
    userId: string,
    creditCardId: string,
  ): Promise<MonthlyStatEntry[]> {
    // L1: memory cache
    const memKey = CacheKeys.monthlyStats(userId, creditCardId);
    const cached = CacheService.get<MonthlyStatEntry[]>(memKey);
    if (cached !== null) return cached;

    // L2: Firestore materialized view (1 read)
    // schemaVersion: 3 = currency uses "USD" instead of "Dolar"
    try {
      const doc = await StatsService.monthlyStatsRef(
        userId,
        creditCardId,
      ).get();
      if (doc.exists) {
        const raw = doc.data()!;
        const ageMs = Date.now() - new Date(raw.computedAt as string).getTime();
        const isStale =
          raw.needsRecompute === true || ageMs >= SUMMARY_MAX_AGE_MS;
        if (!isStale && raw.schemaVersion === 3) {
          const stats = raw.data as MonthlyStatEntry[];
          CacheService.set(memKey, stats, CacheTTL.LONG);
          return stats;
        }
      }
    } catch (err) {
      console.error("Failed to read monthly stats from Firestore:", err);
    }

    // L3: full compute, then persist async
    const result = await this._computeMonthlyStats(userId);
    StatsService.monthlyStatsRef(userId, creditCardId)
      .set({
        data: result,
        computedAt: new Date().toISOString(),
        schemaVersion: 3,
      })
      .catch((err) => console.error("Failed to persist monthly stats:", err));
    CacheService.set(memKey, result, CacheTTL.LONG);
    return result;
  }

  private async _computeMonthlyStats(
    userId: string,
  ): Promise<MonthlyStatEntry[]> {
    // Fetch categories once and build a lookup map by id
    const categoryService = new CategoryService(userId);
    const allCategories = await categoryService.getAllCategories();
    const catMap = new Map(allCategories.map((c) => [c.id, c.name]));

    // Obtener los BillingPeriods para la tarjeta de crédito
    const billingPeriods = await this.billingPeriodRepository.findAll();

    if (!billingPeriods.length) {
      return [];
    }

    // Obtener todas las transacciones de la tarjeta de crédito
    const transactions = await this.transactionRepository.findAll();

    if (!transactions.length) {
      return [];
    }

    // Crear un mapa de gastos por BillingPeriod
    const billingStats: {
      [month: string]: {
        totalCLP: number;
        totalUSD: number;
        categoryBreakdown: {
          [category: string]: { CLP: number; USD: number };
        };
      };
    } = {};

    for (const period of billingPeriods) {
      billingStats[period.month] = {
        totalCLP: 0,
        totalUSD: 0,
        categoryBreakdown: {},
      };

      const periodStartDate = convertUtcToChileTime(period.startDate);
      const periodEndDate = convertUtcToChileTime(period.endDate);

      transactions.forEach((transaction) => {
        const transactionDate = convertUtcToChileTime(
          transaction.transactionDate,
        );

        // Incluir la transacción si está dentro del BillingPeriod
        if (
          transactionDate >= periodStartDate &&
          transactionDate <= periodEndDate
        ) {
          const currency = (
            transaction.currency === "Dolar" ? "USD" : transaction.currency
          ) as "CLP" | "USD";
          const amount = transaction.amount;
          const category =
            (transaction.categoryId && catMap.get(transaction.categoryId)) ||
            transaction.merchant ||
            "Otros";

          if (currency === "CLP") {
            billingStats[period.month].totalCLP += amount;
          } else if (currency === "USD") {
            billingStats[period.month].totalUSD += amount;
          }

          // Asegurar que la categoría exista en el breakdown
          if (!billingStats[period.month].categoryBreakdown[category]) {
            billingStats[period.month].categoryBreakdown[category] = {
              CLP: 0,
              USD: 0,
            };
          }

          // Sumar en la categoría correspondiente según la moneda
          billingStats[period.month].categoryBreakdown[category][currency] +=
            amount;
        }
      });
    }

    return Object.entries(billingStats)
      .map(([month, data]) => ({
        month,
        totalCLP: data.totalCLP,
        totalUSD: data.totalUSD,
        categoryBreakdown: data.categoryBreakdown,
      }))
      .filter((entry) => entry.totalCLP > 0 || entry.totalUSD > 0);
  }

  // ---------------------------------------------------------------------------
  private static uncategorizedCountRef(userId: string) {
    return db
      .collection("users")
      .doc(userId)
      .collection("summaries")
      .doc("uncategorizedCount");
  }

  /**
   * L3: full compute of uncategorized transaction count (~N_creditCards reads).
   * Separated for reuse in triggerRecompute.
   */
  static async _computeUncategorizedCount(userId: string): Promise<number> {
    const ccRepo = new CreditCardRepository(userId);
    const creditCards = await ccRepo.findAll();
    let count = 0;
    for (const card of creditCards) {
      const txCollection = ccRepo.getTransactionsCollection(card.id);
      const snapshot = await txCollection.where("deletedAt", "==", null).get();
      for (const doc of snapshot.docs) {
        if (!doc.data().categoryId) count++;
      }
    }
    return count;
  }

  // triggerRecompute / triggerInvalidateOnly — called by controllers after writes
  // ---------------------------------------------------------------------------

  /**
   * Invalidates L1 memory cache immediately, then fires async Firestore
   * recomputes so the next GET serves fresh data from L2 (1 read).
   *
   * Use for structural writes: creating/deleting transactions, changing amounts.
   * For category-only changes, use triggerInvalidateOnly instead.
   *
   * @param userId       - The authenticated user
   * @param creditCardId - The card being modified (triggers monthly stats recompute)
   */
  static triggerRecompute(userId: string, creditCardId?: string): void {
    // Invalidate memory immediately so the next request doesn't serve stale L1 data
    CacheService.invalidateByPrefix(CacheKeys.userPrefix(userId));

    // Async recompute debt summary and persist to Firestore
    StatsService._computeDebtSummary(userId)
      .then((result) =>
        StatsService.debtSummaryRef(userId).set({
          data: result,
          computedAt: new Date().toISOString(),
        }),
      )
      .catch((err) => console.error("[recompute] debt summary failed:", err));

    // Async recompute uncategorized count and persist to Firestore
    StatsService._computeUncategorizedCount(userId)
      .then((count) =>
        StatsService.uncategorizedCountRef(userId).set({
          data: count,
          computedAt: new Date().toISOString(),
        }),
      )
      .catch((err) =>
        console.error("[recompute] uncategorized count failed:", err),
      );

    // Async recompute monthly stats for the specific card (if known)
    if (creditCardId) {
      // Invalidate monthlyQuotaSum — keyed by creditCardId (not user prefix)
      CacheService.invalidate(CacheKeys.monthlyQuotaSum(creditCardId));

      const txRepo = new TransactionRepository(userId, creditCardId);
      const bpRepo = new BillingPeriodRepository(userId, creditCardId);
      const svc = new StatsService(txRepo, bpRepo);
      svc
        ._computeMonthlyStats(userId)
        .then((result) =>
          StatsService.monthlyStatsRef(userId, creditCardId).set({
            data: result,
            computedAt: new Date().toISOString(),
            schemaVersion: 3,
          }),
        )
        .catch((err) =>
          console.error("[recompute] monthly stats failed:", err),
        );
    }
  }

  /**
   * Lazy invalidation — marks affected Firestore summaries as stale with a
   * single cheap write, then lets the next GET trigger a recompute naturally.
   *
   * Use for category-only changes. Assigning N categories = N × 2 cheap writes
   * + 0 recomputes. The recompute fires exactly once, when the user navigates
   * to the report that needs fresh data.
   *
   * Summaries affected by a category change:
   *  - uncategorizedCount  → count decreases by 1 when a category is assigned
   *  - monthlyStats        → categoryBreakdown changes (pie chart)
   *
   * Not affected (intentionally skipped):
   *  - debtSummary  → amounts/quotas don't change when only categoryId changes
   *
   * @param userId       - The authenticated user
   * @param creditCardId - The card whose transaction was updated
   */
  static triggerInvalidateOnly(userId: string, creditCardId?: string): void {
    // Invalidate L1 for the affected keys (always fast, 0 Firestore reads)
    CacheService.invalidate(CacheKeys.uncategorizedCount(userId));
    if (creditCardId) {
      CacheService.invalidate(CacheKeys.monthlyStats(userId, creditCardId));
    }

    // Mark uncategorizedCount L2 as stale → next read will recompute
    StatsService.uncategorizedCountRef(userId)
      .set({ needsRecompute: true }, { merge: true })
      .catch((err) =>
        console.error(
          "[invalidate] uncategorizedCount stale mark failed:",
          err,
        ),
      );

    // Mark monthlyStats L2 as stale → next read will recompute
    if (creditCardId) {
      StatsService.monthlyStatsRef(userId, creditCardId)
        .set({ needsRecompute: true }, { merge: true })
        .catch((err) =>
          console.error("[invalidate] monthlyStats stale mark failed:", err),
        );
    }
  }
}

// What-if calculation: map products -> temporary transactions -> call DebtForecastService
import { WhatIfProduct } from "./stats.schemas";

export class WhatIfService {
  constructor(private readonly userId: string) {}

  async calculateWhatIf(products: WhatIfProduct[]) {
    // Map products to temporary transactions with quotas
    // Each product produces `totalInstallments` quotas starting at firstDueDate
    const nowBase = Date.now();
    const transactionsOverride: TransactionWithQuotas[] = products.map((p, idx) => {
      const txId = `temp-tx-${nowBase}-${idx}`;
      const quotas: Quota[] = [];
      const first = new Date(p.firstDueDate);
      for (let i = 0; i < p.totalInstallments; i++) {
        const due = new Date(first.getFullYear(), first.getMonth() + i, first.getDate());
        quotas.push({
          id: `${txId}-q-${i + 1}`,
          dueDate: due,
          amount: +(p.amount / p.totalInstallments),
          currency: p.currency,
          status: "pending",
          transactionId: txId,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });
      }
      return {
        id: txId,
        merchant: p.merchant,
        amount: p.amount,
        currency: p.currency,
        creditCardId: p.creditCardId ?? "",
        quotas,
      };
    });

    const dfs = new DebtForecastService(this.userId);
    const projection = await dfs.getDebtForecast(transactionsOverride);
    return projection;
  }
}
