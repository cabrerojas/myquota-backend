import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { BillingPeriodRepository } from "@/modules/billingPeriod/billingPeriod.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import { convertUtcToChileTime } from "@/shared/utils/date.utils";
import {
  CacheService,
  CacheTTL,
  CacheKeys,
} from "@/shared/services/cache.service";
import { db } from "@/config/firebase";

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
}

interface MonthlyStatEntry {
  month: string;
  totalCLP: number;
  totalDolar: number;
  categoryBreakdown: {
    [category: string]: { CLP: number; Dolar: number };
  };
}

export class StatsService {
  constructor(
    private transactionRepository: TransactionRepository,
    private billingPeriodRepository: BillingPeriodRepository,
  ) {}

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
        if (ageMs < SUMMARY_MAX_AGE_MS) {
          const summary = raw.data as DebtSummary;
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
    const periodKeys = new Set<string>();

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
            const dueTime = new Date(q.due_date as unknown as string).getTime();
            const periodMonth = allBillingPeriods.find((p) => {
              return (
                dueTime >= new Date(p.startDate).getTime() &&
                dueTime <= new Date(p.endDate).getTime()
              );
            })?.month;

            // Compute calendar month key for this quota
            const dueDate = new Date(q.due_date as unknown as string);
            const calKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;

            if (periodMonth) {
              periodKeys.add(periodMonth);
            } else {
              // Fallback: calendar month key for quotas outside billing periods
              periodKeys.add(calKey);
            }

            if (q.currency === "Dolar") {
              totalUSD += q.amount;
            } else {
              totalCLP += q.amount;
            }

            // Next payment = quotas in current billing period or current calendar month
            const nowDate = new Date();
            const currentCalKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
            const isCurrentPeriod =
              (currentPeriod && periodMonth === currentPeriod.month) ||
              (!periodMonth && calKey === currentCalKey);

            if (isCurrentPeriod) {
              if (q.currency === "Dolar") {
                nextMonthUSD += q.amount;
              } else {
                nextMonthCLP += q.amount;
              }
            }
          }
        }
      }),
    );

    const result: DebtSummary = {
      totalCLP,
      totalUSD,
      pendingCount,
      monthsRemaining: periodKeys.size,
      nextMonthCLP,
      nextMonthUSD,
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
    try {
      const doc = await StatsService.monthlyStatsRef(
        userId,
        creditCardId,
      ).get();
      if (doc.exists) {
        const raw = doc.data()!;
        const ageMs = Date.now() - new Date(raw.computedAt as string).getTime();
        if (ageMs < SUMMARY_MAX_AGE_MS) {
          const stats = raw.data as MonthlyStatEntry[];
          CacheService.set(memKey, stats, CacheTTL.LONG);
          return stats;
        }
      }
    } catch (err) {
      console.error("Failed to read monthly stats from Firestore:", err);
    }

    // L3: full compute, then persist async
    const result = await this._computeMonthlyStats();
    StatsService.monthlyStatsRef(userId, creditCardId)
      .set({ data: result, computedAt: new Date().toISOString() })
      .catch((err) => console.error("Failed to persist monthly stats:", err));
    CacheService.set(memKey, result, CacheTTL.LONG);
    return result;
  }

  private async _computeMonthlyStats(): Promise<MonthlyStatEntry[]> {
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
        totalDolar: number;
        categoryBreakdown: {
          [category: string]: { CLP: number; Dolar: number };
        };
      };
    } = {};

    for (const period of billingPeriods) {
      billingStats[period.month] = {
        totalCLP: 0,
        totalDolar: 0,
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
          const currency = transaction.currency as "CLP" | "Dolar"; // "CLP" o "Dolar"
          const amount = transaction.amount;
          const category = transaction.merchant || "Otros";

          if (currency === "CLP") {
            billingStats[period.month].totalCLP += amount;
          } else if (currency === "Dolar") {
            billingStats[period.month].totalDolar += amount;
          }

          // Asegurar que la categoría exista en el breakdown
          if (!billingStats[period.month].categoryBreakdown[category]) {
            billingStats[period.month].categoryBreakdown[category] = {
              CLP: 0,
              Dolar: 0,
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
        totalDolar: data.totalDolar,
        categoryBreakdown: data.categoryBreakdown,
      }))
      .filter((entry) => entry.totalCLP > 0 || entry.totalDolar > 0);
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
      const snapshot = await txCollection
        .where("deletedAt", "==", null)
        .get();
      for (const doc of snapshot.docs) {
        if (!doc.data().categoryId) count++;
      }
    }
    return count;
  }

  // triggerRecompute — called by controllers after any write operation
  // ---------------------------------------------------------------------------

  /**
   * Invalidates L1 memory cache immediately, then fires async Firestore
   * recomputes so the next GET serves fresh data from L2 (1 read).
   *
   * Use this instead of CacheService.invalidateByPrefix after writes.
   *
   * @param userId     - The authenticated user
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
        ._computeMonthlyStats()
        .then((result) =>
          StatsService.monthlyStatsRef(userId, creditCardId).set({
            data: result,
            computedAt: new Date().toISOString(),
          }),
        )
        .catch((err) =>
          console.error("[recompute] monthly stats failed:", err),
        );
    }
  }
}
