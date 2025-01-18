

import { FirestoreRepository } from '@/shared/classes/firestore.repository';
import { CreditCard } from '../models/creditCard.model';
import { Transaction } from '@/modules/transaction/models/transaction.model';
import { BillingPeriod } from '../models/billingPeriod.model';

export class CreditCardRepository extends FirestoreRepository<CreditCard> {
  constructor() {
    super("creditCards"); // Define el nombre de la colección aquí
  }

  // Obtener la referencia a la subcolección de transacciones
  getTransactionsCollection(
    creditCardId: string
  ): FirebaseFirestore.CollectionReference<Transaction> {
    return this.repository
      .doc(creditCardId)
      .collection(
        "transactions"
      ) as FirebaseFirestore.CollectionReference<Transaction>;
  }

  // Agregar una transacción a la subcolección
  async addTransaction(
    creditCardId: string,
    transaction: Transaction
  ): Promise<void> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);
    await transactionsCollection.doc(transaction.id).set(transaction);
  }

  // Obtener todas las transacciones de la subcolección
  async getTransactions(creditCardId: string): Promise<Transaction[]> {
    const transactionsCollection = this.getTransactionsCollection(creditCardId);
    console.log(
      `Obteniendo transacciones para la tarjeta de crédito con ID: ${creditCardId}`
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
    transactionId: string
  ): Promise<string | null> {
    const creditCards = await this.findAll();
    for (const creditCard of creditCards) {
      const transactionsCollection = this.getTransactionsCollection(
        creditCard.id
      );
      const transactionDoc = await transactionsCollection
        .doc(transactionId)
        .get();
      if (transactionDoc.exists) {
        return creditCard.id;
      }
    }
    return null;
  }

  // Obtener la referencia a la subcolección de periodos de facturación
  getBillingPeriodsCollection(
    creditCardId: string
  ): FirebaseFirestore.CollectionReference<BillingPeriod> {
    return this.repository
      .doc(creditCardId)
      .collection(
        "billingPeriods"
      ) as FirebaseFirestore.CollectionReference<BillingPeriod>;
  }

  // Agregar un periodo de facturación a la subcolección
  async addBillingPeriod(
    creditCardId: string,
    billingPeriod: BillingPeriod
  ): Promise<void> {
    const billingPeriodsCollection =
      this.getBillingPeriodsCollection(creditCardId);
    await billingPeriodsCollection.doc(billingPeriod.id).set(billingPeriod);
  }

  // Obtener todos los periodos de facturación de la subcolección
  async getBillingPeriods(creditCardId: string): Promise<BillingPeriod[]> {
    const billingPeriodsCollection =
      this.getBillingPeriodsCollection(creditCardId);
    const snapshot = await billingPeriodsCollection
      .where("deletedAt", "==", null)
      .get();
    return snapshot.docs.map((doc) => doc.data() as BillingPeriod);
  }
}