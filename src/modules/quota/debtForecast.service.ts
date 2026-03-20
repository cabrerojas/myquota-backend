import { db } from "@/config/firebase";
import { CreditCard } from "@modules/creditCard/creditCard.model";
import { Transaction } from "@modules/transaction/transaction.model";
import { BillingPeriod } from "@modules/billingPeriod/billingPeriod.model";
import { Quota } from "./quota.model";
import { CacheService } from "@shared/services/cache.service";

interface MonthBucket {
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

  private parseCalendarKey(key: string): number {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).getTime();
  }

  // Extended Transaction type for what-if simulations
  public async getDebtForecast(
    transactionsOverride?: TransactionWithQuotas[],
  ): Promise<{
    months: MonthBucket[];
    totalDebtCLP: number;
    totalDebtUSD: number;
  }> {
    // --- CACHE ---
    const cacheKey = `debtForecast:${this.userId}`;
    // Do NOT use cached results when a transactionsOverride is provided
    if (!transactionsOverride || !transactionsOverride.length) {
      const cached = CacheService.get<{
        months: MonthBucket[];
        totalDebtCLP: number;
        totalDebtUSD: number;
      }>(cacheKey);
      if (cached) return cached;
    }

    // --- BATCH FETCH ---
    // If transactionsOverride is provided, use its quotas instead of reading
    // quotas from Firestore. transactionsOverride is expected to be an array
    // of Transaction-like objects that MAY include a `quotas` array with
    // quota objects. This enables temporary, in-memory simulations.
    let allQuotas: (Quota & { transactionId: string; creditCardId: string })[] = [];
    const txMap = new Map<string, Transaction>();

    // Temporary type for transaction overrides with quotas
    interface TransactionWithQuotas extends Transaction {
      quotas?: Quota[];
      creditCardId?: string;
    }

    if (transactionsOverride && transactionsOverride.length) {
      // Build allQuotas and txMap from the override
      for (const tx of transactionsOverride) {
        const txWithQuotas = tx as TransactionWithQuotas;
        txMap.set(tx.id, tx);
        const quotasFromTx = txWithQuotas.quotas ?? [];
        for (const q of quotasFromTx) {
          allQuotas.push({
            ...q,
            transactionId: tx.id,
            creditCardId: txWithQuotas.creditCardId || "",
          });
        }
      }
    } else {
      // 1. Todas las cuotas pendientes del usuario (collectionGroup)
      const quotasSnap = await db
        .collectionGroup("quotas")
        .where("status", "==", "pending")
        .where("deletedAt", "==", null)
        .get();
      allQuotas = quotasSnap.docs.map((doc) => {
        const data = doc.data() as Quota & { transactionId: string };
        // Parse creditCardId y transactionId desde el path
        const path = doc.ref.path.split("/");
        // ...users/{userId}/creditCards/{creditCardId}/transactions/{transactionId}/quotas/{quotaId}
        const creditCardId = path[3];
        const transactionId = path[5];
        return {
          ...data,
          creditCardId,
          transactionId,
        };
      });
    }

    // 2. Todas las tarjetas del usuario
    const cardsSnap = await db
      .collection("users")
      .doc(this.userId)
      .collection("creditCards")
      .where("deletedAt", "==", null)
      .get();
    const cards: CreditCard[] = cardsSnap.docs.map(
      (doc) => doc.data() as CreditCard,
    );
    const cardMap = new Map(cards.map((card) => [card.id, card]));

    // 3. Todas las transacciones del usuario (collectionGroup)
    if (!transactionsOverride || !transactionsOverride.length) {
      const txsSnap = await db
        .collectionGroup("transactions")
        .where("deletedAt", "==", null)
        .get();
      const txs: Transaction[] = txsSnap.docs.map((doc) => doc.data() as Transaction);
      for (const tx of txs) txMap.set(tx.id, tx);
    }

    // 4. Todos los billingPeriods del usuario (collectionGroup)
    const periodsSnap = await db
      .collectionGroup("billingPeriods")
      .where("deletedAt", "==", null)
      .get();
    const allBillingPeriods: (BillingPeriod & { creditCardId: string })[] =
      periodsSnap.docs.map((doc) => {
        const data = doc.data() as BillingPeriod;
        // ...users/{userId}/creditCards/{creditCardId}/billingPeriods/{periodId}
        const path = doc.ref.path.split("/");
        const creditCardId = path[3];
        return { ...data, creditCardId };
      });
    const sortedPeriods = [...allBillingPeriods].sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    // --- ENRIQUECIMIENTO ---
    // Enriquecer cuotas con merchant, card info, etc.
    const enrichedQuotas = allQuotas.map((q) => {
      const tx = txMap.get(q.transactionId);
      const card = cardMap.get(q.creditCardId);
      return {
        ...q,
        merchant: tx?.merchant || "",
        creditCardLabel: card ? `${card.cardType} •${card.cardLastDigits}` : "",
        quotaNumber: 0, // se calcula abajo
        totalQuotas: 0, // se calcula abajo
      };
    });

    // Agrupar cuotas por transacción para calcular quotaNumber y totalQuotas
    const quotasByTx = new Map<string, typeof enrichedQuotas>();
    for (const q of enrichedQuotas) {
      if (!quotasByTx.has(q.transactionId)) quotasByTx.set(q.transactionId, []);
      quotasByTx.get(q.transactionId)!.push(q);
    }
    for (const arr of quotasByTx.values()) {
      arr.sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );
      arr.forEach((q, idx) => {
        q.quotaNumber = idx + 1;
        q.totalQuotas = arr.length;
      });
    }

    // --- AGRUPACIÓN POR MES ---
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
      // Aseguramos que dueDate es string (puede venir como Date)
      const dueDateStr =
        typeof q.dueDate === "string"
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
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = date.toLocaleDateString("es-CL", {
          month: "long",
          year: "numeric",
          timeZone: "America/Santiago",
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
      if (q.currency === "USD") bucket.totalUSD += q.amount;
      else bucket.totalCLP += q.amount;
      bucket.count += 1;
      bucket.details.push({
        merchant: q.merchant,
        amount: q.amount,
        currency: q.currency,
        quotaNumber: q.quotaNumber,
        totalQuotas: q.totalQuotas,
        transactionId: q.transactionId,
        creditCardId: q.creditCardId,
      });
    }

    // Populate periodsByCard
    for (const p of sortedPeriods) {
      const bucket = bucketMap.get(p.month);
      if (bucket) {
        const exists = bucket.periodsByCard.find(
          (pb) =>
            pb.creditCardId === p.creditCardId && pb.billingPeriodId === p.id,
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

    // Build period start map for sorting (used in computeDebtForecast)
    Array.from(bucketMap.values()).sort((a, b) => {
      const aTime = periodStartMap.get(a.key) ?? this.parseCalendarKey(a.key);
      const bTime = periodStartMap.get(b.key) ?? this.parseCalendarKey(b.key);
      return aTime - bTime;
    });

    const result = computeDebtForecast(enrichedQuotas, sortedPeriods);
    // Only cache real computations (no transactionsOverride)
    if (!transactionsOverride || !transactionsOverride.length) {
      CacheService.set(cacheKey, result, 300); // cache 5 min
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
  // --- AGRUPACIÓN POR MES ---
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
    // Aseguramos que dueDate es string (puede venir como Date)
    const dueDateStr =
      typeof q.dueDate === "string"
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
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString("es-CL", {
        month: "long",
        year: "numeric",
        timeZone: "America/Santiago",
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
    if (q.currency === "USD") bucket.totalUSD += q.amount;
    else bucket.totalCLP += q.amount;
    bucket.count += 1;
    bucket.details.push({
      merchant: q.merchant,
      amount: q.amount,
      currency: q.currency,
      quotaNumber: q.quotaNumber!,
      totalQuotas: q.totalQuotas!,
      transactionId: q.transactionId,
      creditCardId: q.creditCardId,
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
    .filter((q) => q.currency !== "USD")
    .reduce((s, q) => s + (q.amount || 0), 0);
  const totalDebtUSD = enrichedQuotas
    .filter((q) => q.currency === "USD")
    .reduce((s, q) => s + (q.amount || 0), 0);

  return { months: sortedBuckets, totalDebtCLP, totalDebtUSD };
}
