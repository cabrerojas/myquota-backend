import { BaseService } from "@/shared/classes/base.service";
import { CreditCard } from "./creditCard.model";
import { CreditCardRepository } from "./creditCard.repository";

export class CreditCardService extends BaseService<CreditCard> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: CreditCardRepository;

  constructor(repository: CreditCardRepository) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
  }

  /**
   * Counts the total number of uncategorized transactions across all
   * credit cards for the current user.
   */
  async getUncategorizedCount(): Promise<number> {
    const creditCards = await this.repository.findAll();
    let count = 0;

    for (const card of creditCards) {
      const txCollection = this.repository.getTransactionsCollection(card.id);
      const snapshot = await txCollection.where("deletedAt", "==", null).get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data.categoryId) {
          count++;
        }
      }
    }

    return count;
  }
}
