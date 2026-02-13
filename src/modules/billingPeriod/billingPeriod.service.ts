import { BaseService } from "@/shared/classes/base.service";
import { BillingPeriodRepository } from "./billingPeriod.repository";
import { BillingPeriod } from "./billingPeriod.model";
import { IBaseEntity } from "@/shared/interfaces/base.repository";
import { toChileStartOfDay, toChileEndOfDay } from "@/shared/utils/date.utils";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";

export class BillingPeriodService extends BaseService<BillingPeriod> {
  protected repository: BillingPeriodRepository;
  private transactionRepository: TransactionRepository | null = null;

  constructor(repository: BillingPeriodRepository, transactionRepository?: TransactionRepository) {
    super(repository);
    this.repository = repository;
    if (transactionRepository) {
      this.transactionRepository = transactionRepository;
    }
  }

  /**
   * Normaliza las fechas del período:
   * - startDate → 00:00:00 hora Chile (guardado en UTC)
   * - endDate → 23:59:59 hora Chile (guardado en UTC)
   */
  private normalizeDates<
    D extends { startDate?: Date | string; endDate?: Date | string },
  >(data: D): D {
    const normalized = { ...data };
    if (normalized.startDate) {
      (normalized as Record<string, unknown>).startDate = toChileStartOfDay(
        normalized.startDate,
      );
    }
    if (normalized.endDate) {
      (normalized as Record<string, unknown>).endDate = toChileEndOfDay(
        normalized.endDate,
      );
    }
    return normalized;
  }

  async create(
    data: Omit<BillingPeriod, keyof IBaseEntity>,
  ): Promise<BillingPeriod> {
    return super.create(this.normalizeDates(data));
  }

  async update(
    id: string,
    data: Partial<Omit<BillingPeriod, keyof IBaseEntity>>,
  ): Promise<BillingPeriod | null> {
    return super.update(id, this.normalizeDates(data));
  }

  /**
   * Marca como pagadas todas las cuotas pendientes cuyo due_date
   * cae dentro del rango del período de facturación.
   */
  async payBillingPeriod(
    creditCardId: string,
    billingPeriodId: string,
  ): Promise<{ paidCount: number; totalAmount: number }> {
    if (!this.transactionRepository) {
      throw new Error("TransactionRepository no disponible");
    }

    // Obtener el período
    const period = await this.findById(billingPeriodId);
    if (!period) {
      throw new Error("Período de facturación no encontrado");
    }

    const startDate = new Date(period.startDate).getTime();
    const endDate = new Date(period.endDate).getTime();

    // Obtener todas las transacciones de la tarjeta
    const transactions = await this.transactionRepository.findAll();

    let paidCount = 0;
    let totalAmount = 0;
    const paymentDate = new Date().toISOString();

    // Para cada transacción, buscar cuotas pendientes en el rango
    for (const tx of transactions) {
      const quotas = await this.transactionRepository.getQuotas(
        creditCardId,
        tx.id,
      );

      const pendingInRange = quotas.filter((q) => {
        if (q.status !== "pending") return false;
        const dueTime = new Date(q.due_date).getTime();
        return dueTime >= startDate && dueTime <= endDate;
      });

      // Marcar cada cuota como pagada
      for (const quota of pendingInRange) {
        const quotaRef = this.transactionRepository
          .getQuotasCollection(creditCardId, tx.id)
          .doc(quota.id);
        await quotaRef.update({
          status: "paid",
          payment_date: paymentDate,
          updatedAt: paymentDate,
        });
        paidCount++;
        totalAmount += quota.amount;
      }
    }

    console.log(
      `✅ Período ${period.month} pagado: ${paidCount} cuotas, $${totalAmount}`,
    );

    return { paidCount, totalAmount };
  }
}
