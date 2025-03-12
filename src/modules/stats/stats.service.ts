import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { BillingPeriodRepository } from "@/modules/billingPeriod/billingPeriod.repository";
import { convertUtcToChileTime } from "@/shared/utils/date.utils";

export class StatsService {
  constructor(
    private transactionRepository: TransactionRepository,
    private billingPeriodRepository: BillingPeriodRepository
  ) {}

  async getMonthlyStats(userId: string, creditCardId: string) {
    console.log(`📌 Obteniendo estadísticas para ${userId}, ${creditCardId}`);

    // 🔹 Obtener los BillingPeriods para la tarjeta de crédito
    const billingPeriods = await this.billingPeriodRepository.findAll();

    if (!billingPeriods.length) {
      console.warn("⚠️ No hay períodos de facturación registrados.");
      return [];
    }

    console.log(
      `📌 Se encontraron ${billingPeriods.length} períodos de facturación.`
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
          transaction.transactionDate
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
