import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { Transaction } from "./transaction.model";
import { chunkArray } from "@/shared/utils/array.utils";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import { Quota } from "@/modules/quota/quota.model";

export class TransactionRepository extends FirestoreRepository<Transaction> {
  private creditCardRepository: CreditCardRepository;

  constructor(userId: string, creditCardId: string) {
    super(["users", userId, "creditCards", creditCardId], "transactions");

    this.creditCardRepository = new CreditCardRepository(userId);
  }

  // Obtener la referencia a la subcolección de cuotas dentro de la subcolección de transacciones de una tarjeta de crédito
  getQuotasCollection(
    creditCardId: string,
    transactionId: string,
  ): FirebaseFirestore.CollectionReference<Quota> {
    return this.creditCardRepository.repository
      .doc(creditCardId)
      .collection("transactions")
      .doc(transactionId)
      .collection("quotas") as FirebaseFirestore.CollectionReference<Quota>;
  }

  // Agregar una cuota a la subcolección
  async addQuota(
    creditCardId: string,
    transactionId: string,
    quota: Quota,
  ): Promise<void> {
    if (!quota.id) {
      quota.id = this.repository.doc().id;
    }
    const quotasCollection = this.getQuotasCollection(
      creditCardId,
      transactionId,
    );
    await quotasCollection
      .doc(quota.id)
      .set(this.datesToIsoStrings(quota) as Quota);
  }

  // Obtener todas las cuotas de la subcolección
  async getQuotas(
    creditCardId: string,
    transactionId: string,
  ): Promise<Quota[]> {
    const quotasCollection = this.getQuotasCollection(
      creditCardId,
      transactionId,
    );
    const snapshot = await quotasCollection
      .where("deletedAt", "==", null)
      .get();
    return snapshot.docs.map((doc) => doc.data() as Quota);
  }

  // Obtener IDs de transacciones existentes en Firestore y en CreditCard
  async getExistingTransactionIds(ids: string[]): Promise<string[]> {
    const chunks = chunkArray(ids, 10);
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const creditCardTransactionIds: string[] = [];
        const creditCards = await this.creditCardRepository.findAll();
        for (const creditCard of creditCards) {
          const transactionsCollection =
            this.creditCardRepository.getTransactionsCollection(creditCard.id);
          const transactionSnapshot = await transactionsCollection
            .where("id", "in", chunk)
            .where("deletedAt", "==", null)
            .get();
          creditCardTransactionIds.push(
            ...transactionSnapshot.docs.map((doc) => doc.id),
          );
        }

        return creditCardTransactionIds;
      }),
    );
    return results.flat();
  }

  // Guardar un lote de transacciones y actualiza la tarjeta de crédito correspondiente
  // Guardar un lote de transacciones y actualiza la tarjeta de crédito correspondiente
  async saveBatch(transactions: Transaction[]): Promise<void> {
    try {
      await Promise.all(
        transactions.map(async (transaction) => {
          // Actualizar la tarjeta de crédito correspondiente
          const creditCard = await this.creditCardRepository.findOne({
            cardLastDigits: transaction.cardLastDigits,
          });
          if (creditCard) {
            transaction.creditCardId = creditCard.id; // Establece el creditCardId
            await this.creditCardRepository.addTransaction(
              creditCard.id,
              transaction,
            );
          }
        }),
      );
      console.warn(
        `Lote de transacciones guardado exitosamente en Firestore. Total de registros: ${transactions.length}`,
      );
    } catch (error) {
      console.error(
        "Error al guardar el lote de transacciones en Firestore:",
        error,
      );
      throw error; // Propaga el error para manejo en niveles superiores
    }
  }
}
