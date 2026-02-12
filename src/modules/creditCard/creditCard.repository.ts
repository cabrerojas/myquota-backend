import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { CreditCard } from "./creditCard.model";
import { Transaction } from "@/modules/transaction/transaction.model";

export class CreditCardRepository extends FirestoreRepository<CreditCard> {
  constructor(userId: string) {
    super(["users", userId], "creditCards");
  }

  // Obtener la referencia a la subcolección de transacciones
  getTransactionsCollection(creditCardId: string) {
    return this.repository.doc(creditCardId).collection("transactions");
  }

  // Agregar una transacción a la subcolección
  async addTransaction(
    creditCardId: string,
    transaction: Transaction,
  ): Promise<void> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);
    await transactionsCollection
      .doc(transaction.id)
      .set(this.datesToIsoStrings(transaction), { merge: true });
  }
  // Obtener todas las transacciones de la subcolección
  async getTransactions(creditCardId: string): Promise<Transaction[]> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);
    console.log(
      `Obteniendo transacciones para la tarjeta de crédito con ID: ${creditCardId}`,
    );

    console.log(`transactionsCollection: ${transactionsCollection}`);

    const snapshot = await transactionsCollection
      .where("deletedAt", "==", null)
      .get();
    console.log(`Número de transacciones encontradas: ${snapshot.size}`);

    return snapshot.docs.map((doc) => doc.data() as Transaction);
  }
  // Obtener el ID de la tarjeta de crédito a partir del ID de la transacción
  async getCreditCardIdByTransactionId(
    transactionId: string,
  ): Promise<string | null> {
    const snapshot = await this.repository.firestore
      .collectionGroup("transactions")
      .where("id", "==", transactionId)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs[0].ref.parent.parent?.id || null;
    }

    return null;
  }
}
