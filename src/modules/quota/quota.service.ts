// src/modules/quota/services/quota.service.ts
import { Quota } from "./quota.model";
import { QuotaRepositorySupabase } from "./quota.repository.supabase";

import { BaseService } from "@/shared/classes/base.service";
import { RepositoryError } from "@/shared/errors/custom.error";
import { TransactionRepositorySupabase } from "@/modules/transaction/transaction.repository.supabase";
import { BillingPeriodRepositorySupabase } from "@/modules/billingPeriod/billingPeriod.repository.supabase";

export class QuotaService extends BaseService<Quota> {
  protected transactionRepository: TransactionRepositorySupabase;
  private billingPeriodRepo?: BillingPeriodRepositorySupabase;

  constructor(
    repository: QuotaRepositorySupabase,
    transactionRepository: TransactionRepositorySupabase,
    billingPeriodRepo?: BillingPeriodRepositorySupabase,
  ) {
    super(repository);
    this.transactionRepository = transactionRepository;
    this.billingPeriodRepo = billingPeriodRepo;
  }

  async getQuotasByTransaction(_creditCardId: string, transactionId: string) {
    const quotas = await this.transactionRepository.getQuotas(transactionId);

    // Enrich each quota with its billing period's due date
    if (this.billingPeriodRepo && quotas.length > 0) {
      const bpResult = await this.billingPeriodRepo.findAll();
      const periods = bpResult.items;

      for (const quota of quotas) {
        const dueTime = new Date(quota.dueDate).getTime();
        const period = periods.find((p) => {
          const start = new Date(p.startDate).getTime();
          const end = new Date(p.endDate).getTime();
          return dueTime >= start && dueTime <= end;
        });
        if (period?.dueDate) {
          (quota as unknown as Record<string, unknown>).billingDueDate = period.dueDate;
        }
      }
    }

    return quotas;
  }

  async splitTransactionIntoQuotas(
    _creditCardId: string,
    transactionId: string,
    numberOfQuotas: number,
  ): Promise<{ deleted: number; created: number; quotas: Quota[] }> {
    try {
      if (numberOfQuotas < 1 || numberOfQuotas > 48) {
        throw new RepositoryError(
          "El número de cuotas debe estar entre 1 y 48",
          400,
        );
      }

      const transaction = await this.transactionRepository.findById(transactionId);
      if (!transaction) {
        throw new RepositoryError("Transacción no encontrada", 404);
      }

      const quotas = this.buildSplitQuotas(
        transaction,
        transactionId,
        numberOfQuotas,
      );

      const { deleted, created } =
        await this.transactionRepository.replaceQuotasAtomically(
          transactionId,
          quotas,
        );

      return { deleted, created, quotas };
    } catch (error) {
      if (error instanceof RepositoryError) {
        throw error;
      }

      throw new RepositoryError(
        error instanceof Error ? error.message : "Error desconocido",
        500,
      );
    }
  }

  private buildSplitQuotas(
    transaction: {
      amount: number;
      transactionDate: Date | string;
      currency: string;
    },
    transactionId: string,
    numberOfQuotas: number,
  ): Quota[] {
    const quotaAmount = Math.round(transaction.amount / numberOfQuotas);
    const transactionDate = new Date(transaction.transactionDate);
    const createdQuotas: Quota[] = [];

    for (let i = 0; i < numberOfQuotas; i++) {
      const dueDate = new Date(transactionDate);
      if (numberOfQuotas > 1) {
        dueDate.setMonth(dueDate.getMonth() + i + 1);
      }

      const amount =
        i === numberOfQuotas - 1
          ? transaction.amount - quotaAmount * (numberOfQuotas - 1)
          : quotaAmount;

      createdQuotas.push({
        id: (crypto as { randomUUID: () => string }).randomUUID(),
        transactionId,
        amount,
        dueDate,
        status: "pending",
        currency: transaction.currency,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }

    return createdQuotas;
  }
}
