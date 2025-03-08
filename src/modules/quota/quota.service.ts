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
    creditCardRepository: CreditCardRepository
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
      transactionId
    );
  }
}
