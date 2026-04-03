// src/modules/quota/services/quota.service.ts
import { Quota } from "./quota.model";
import { QuotaRepository } from "./quota.repository";

import { BaseService } from "@/shared/classes/base.service";
import { RepositoryError } from "@/shared/errors/custom.error";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";

export class QuotaService extends BaseService<Quota> {
  protected transactionRepository: TransactionRepository;

  constructor(
    repository: QuotaRepository,
    transactionRepository: TransactionRepository,
  ) {
    super(repository);
    this.transactionRepository = transactionRepository;
  }

  // Otros métodos específicos del servicio

  async getQuotasByTransaction(creditCardId: string, transactionId: string) {
    return await this.transactionRepository.getQuotas(
      creditCardId,
      transactionId,
    );
  }

  /**
   * Divide una transacción en N cuotas mensuales.
   * Elimina las cuotas existentes y crea N nuevas con montos divididos
   * y dueDates mensuales a partir de la fecha de la transacción.
   */
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
        id: this.transactionRepository.repository.doc().id,
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
