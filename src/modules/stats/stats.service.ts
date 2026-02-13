import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { BillingPeriodRepository } from "@/modules/billingPeriod/billingPeriod.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import { convertUtcToChileTime } from "@/shared/utils/date.utils";

export class StatsService {
  constructor(
    private transactionRepository: TransactionRepository,
    private billingPeriodRepository: BillingPeriodRepository,
  ) {}

  static async getGlobalDebtSummary(userId: string) {
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

            if (periodMonth) periodKeys.add(periodMonth);

            if (q.currency === "Dolar") {
              totalUSD += q.amount;
            } else {
              totalCLP += q.amount;
            }

            // Next payment = quotas in current billing period
            if (currentPeriod && periodMonth === currentPeriod.month) {
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

    return {
      totalCLP,
      totalUSD,
      pendingCount,
      monthsRemaining: periodKeys.size,
      nextMonthCLP,
      nextMonthUSD,
    };
  }

  async getMonthlyStats(userId: string, creditCardId: string) {
    console.log(`📌 Obteniendo estadísticas para ${userId}, ${creditCardId}`);

    // 🔹 Obtener los BillingPeriods para la tarjeta de crédito
    const billingPeriods = await this.billingPeriodRepository.findAll();

    if (!billingPeriods.length) {
      console.warn("⚠️ No hay períodos de facturación registrados.");
      return [];
    }

    console.log(
      `📌 Se encontraron ${billingPeriods.length} períodos de facturación.`,
    );

    // 🔹 Obtener todas las transacciones de la tarjeta de crédito
    const transactions = await this.transactionRepository.findAll();

    if (!transactions.length) {
      console.warn("⚠️ No hay transacciones registradas.");
      return [];
    }

    // 🔹 Crear un mapa de gastos por BillingPeriod
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

        // ✅ Incluir la transacción si está dentro del BillingPeriod
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

          // 🔹 Asegurar que la categoría exista en el breakdown
          if (!billingStats[period.month].categoryBreakdown[category]) {
            billingStats[period.month].categoryBreakdown[category] = {
              CLP: 0,
              Dolar: 0,
            };
          }

          // 🔹 Sumar en la categoría correspondiente según la moneda
          billingStats[period.month].categoryBreakdown[category][currency] +=
            amount;
        }
      });
    }

    // 🔹 Convertir a un array de respuesta
    return Object.entries(billingStats)
      .map(([month, data]) => ({
        month,
        totalCLP: data.totalCLP,
        totalDolar: data.totalDolar,
        categoryBreakdown: data.categoryBreakdown,
      }))
      .filter((entry) => entry.totalCLP > 0 || entry.totalDolar > 0); // Filtrar meses sin transacciones
  }
}
