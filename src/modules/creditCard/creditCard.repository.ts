import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { CreditCard } from "./creditCard.model";
import { Transaction } from "@/modules/transaction/transaction.model";

export class CreditCardRepository extends FirestoreRepository<CreditCard> {
  constructor(userId: string) {
    super(["users", userId], "creditCards");
  }

  getTransactionsCollection(creditCardId: string) {
    return this.repository.doc(creditCardId).collection("transactions");
  }

  async addTransaction(
    creditCardId: string,
    transaction: Transaction,
  ): Promise<void> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);
    await transactionsCollection
      .doc(transaction.id)
      .set(this.datesToIsoStrings(transaction), { merge: true });
  }

  async addTransactionIfAbsent(
    creditCardId: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);

    try {
      await transactionsCollection
        .doc(transaction.id)
        .create(this.datesToIsoStrings(transaction));
      return true;
    } catch (error: unknown) {
      if (this.isAlreadyExistsError(error)) {
        return false;
      }
      throw error;
    }
  }

  private isAlreadyExistsError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const firestoreError = error as { code?: string | number; details?: string };
    const details = firestoreError.details ?? "";
    const message = error.message;

    return (
      firestoreError.code === 6 ||
      firestoreError.code === "already-exists" ||
      message.includes("ALREADY_EXISTS") ||
      details.includes("ALREADY_EXISTS")
    );
  }
  async getTransactions(creditCardId: string): Promise<Transaction[]> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);

    const snapshot = await transactionsCollection
      .where("deletedAt", "==", null)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Transaction);
  }
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
