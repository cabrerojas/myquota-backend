// src/modules/quota/services/quota.service.ts
import { Quota } from "./quota.model";
import { QuotaRepository } from "./quota.repository";

import { BaseService } from "@/shared/classes/base.service";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";

export class QuotaService extends BaseService<Quota> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: QuotaRepository;
  protected transactionRepository: TransactionRepository;
  protected creditCardRepository: CreditCardRepository;

  constructor(
    repository: QuotaRepository,
    transactionRepository: TransactionRepository,
    creditCardRepository: CreditCardRepository,
  ) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
    this.transactionRepository = transactionRepository;
    this.creditCardRepository = creditCardRepository;
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
   * y due_dates mensuales a partir de la fecha de la transacción.
   */
  async splitTransactionIntoQuotas(
    creditCardId: string,
    transactionId: string,
    numberOfQuotas: number,
  ): Promise<{ deleted: number; created: number; quotas: Quota[] }> {
    // Validar número de cuotas
    if (numberOfQuotas < 1 || numberOfQuotas > 48) {
      throw new Error("El número de cuotas debe estar entre 1 y 48");
    }

    // Obtener la transacción
    const transaction =
      await this.transactionRepository.findById(transactionId);
    if (!transaction) {
      throw new Error("Transacción no encontrada");
    }

    // Eliminar cuotas existentes
    const deleted = await this.transactionRepository.deleteAllQuotas(
      creditCardId,
      transactionId,
    );
    console.log(
      `🗑️ ${deleted} cuotas eliminadas para transacción ${transactionId}`,
    );

    // Calcular monto por cuota
    const cuotaAmount = Math.round(transaction.amount / numberOfQuotas);
    const transactionDate = new Date(transaction.transactionDate);

    // Crear las nuevas cuotas
    const createdQuotas: Quota[] = [];
    for (let i = 0; i < numberOfQuotas; i++) {
      const dueDate = new Date(transactionDate);
      if (numberOfQuotas === 1) {
        // Pago único: due_date = fecha de la transacción
      } else {
        // Cuotas: primera cuota al mes siguiente, y así sucesivamente
        dueDate.setMonth(dueDate.getMonth() + i + 1);
      }

      // Última cuota absorbe la diferencia del redondeo
      const amount =
        i === numberOfQuotas - 1
          ? transaction.amount - cuotaAmount * (numberOfQuotas - 1)
          : cuotaAmount;

      const quota: Quota = {
        id: this.transactionRepository.repository.doc().id,
        transactionId,
        amount,
        due_date: dueDate,
        status: "pending",
        currency: transaction.currency,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      await this.transactionRepository.addQuota(
        creditCardId,
        transactionId,
        quota,
      );
      createdQuotas.push(quota);
    }

    console.log(
      `✅ ${createdQuotas.length} cuotas creadas para transacción ${transactionId}`,
    );

    return { deleted, created: createdQuotas.length, quotas: createdQuotas };
  }
}
