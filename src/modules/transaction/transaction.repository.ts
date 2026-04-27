import { FirestoreRepository } from "@/shared/classes/firestore.repository";
import { Quota } from "@/modules/quota/quota.model";
import { Transaction } from "./transaction.model";

export class TransactionRepository extends FirestoreRepository<Transaction> {
  constructor(userId: string, creditCardId: string) {
    super(["users", userId, "creditCards", creditCardId], "transactions");
  }

  async addIfAbsent(transaction: Transaction): Promise<boolean> {
    try {
      await this.repository
        .doc(transaction.id)
        .create(this.datesToIsoStrings(transaction) as Transaction);
      return true;
    } catch (error: unknown) {
      if (this.isAlreadyExistsError(error)) {
        return false;
      }
      throw error;
    }
  }

  async getCreditCardIdByTransactionId(
    userId: string,
    transactionId: string,
  ): Promise<string | null> {
    const snapshot = await this.repository.firestore
      .collectionGroup("transactions")
      .where("id", "==", transactionId)
      .get();

    if (!snapshot.empty) {
      const userScopedDoc = snapshot.docs.find((doc) => {
        const path = doc.ref.path.split("/");
        return path[0] === "users" && path[1] === userId;
      });

      if (userScopedDoc) {
        return userScopedDoc.ref.parent.parent?.id || null;
      }
    }

    return null;
  }

  // Obtener la referencia a la subcolección de cuotas dentro de una transacción
  getQuotasCollection(
    creditCardIdOrTransactionId: string,
    maybeTransactionId?: string,
  ): FirebaseFirestore.CollectionReference<Quota> {
    const transactionId = maybeTransactionId ?? creditCardIdOrTransactionId;
    return this.repository
      .doc(transactionId)
      .collection("quotas") as FirebaseFirestore.CollectionReference<Quota>;
  }

  // Agregar una cuota a la subcolección
  async addQuota(
    _creditCardId: string,
    transactionId: string,
    quota: Quota,
  ): Promise<void> {
    if (!quota.id) {
      quota.id = this.repository.doc().id;
    }
    const quotasCollection = this.getQuotasCollection(transactionId);
    await quotasCollection
      .doc(quota.id)
      .set(this.datesToIsoStrings(quota) as Quota);
  }

  async replaceQuotasAtomically(
    transactionId: string,
    quotas: Quota[],
  ): Promise<{ deleted: number; created: number }> {
    const quotasCollection = this.getQuotasCollection(transactionId);
    const existingSnapshot = await quotasCollection.get();
    const batch = this.repository.firestore.batch();

    existingSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    quotas.forEach((quota) => {
      const quotaId = quota.id || quotasCollection.doc().id;
      if (!quotaId) {
        throw new Error("Quota ID inválido para escritura atómica");
      }
      const quotaToWrite = {
        ...quota,
        id: quotaId,
      } as Quota;

      batch.set(
        quotasCollection.doc(quotaId),
        this.datesToIsoStrings(quotaToWrite) as Quota,
      );
    });

    await batch.commit();

    return {
      deleted: existingSnapshot.size,
      created: quotas.length,
    };
  }

  async updateTransactionAndReplaceQuotasAtomically(
    transactionId: string,
    transactionPatch: Partial<Transaction>,
    quotas: Quota[],
  ): Promise<{ deleted: number; created: number }> {
    const transactionRef = this.repository.doc(transactionId);
    const transactionSnapshot = await transactionRef.get();

    if (!transactionSnapshot.exists) {
      throw new Error("Transacción no encontrada");
    }

    const quotasCollection = this.getQuotasCollection(transactionId);
    const existingSnapshot = await quotasCollection.get();
    const batch = this.repository.firestore.batch();

    batch.update(
      transactionRef,
      this.datesToIsoStrings(transactionPatch as Record<string, unknown>),
    );

    existingSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    quotas.forEach((quota) => {
      const quotaId = quota.id || quotasCollection.doc().id;
      if (!quotaId) {
        throw new Error("Quota ID inválido para escritura atómica");
      }
      const quotaToWrite = {
        ...quota,
        id: quotaId,
      } as Quota;

      batch.set(
        quotasCollection.doc(quotaId),
        this.datesToIsoStrings(quotaToWrite) as Quota,
      );
    });

    await batch.commit();

    return {
      deleted: existingSnapshot.size,
      created: quotas.length,
    };
  }

  async addQuotaIfAbsent(
    _creditCardId: string,
    transactionId: string,
    quota: Quota,
  ): Promise<boolean> {
    const quotasCollection = this.getQuotasCollection(
      transactionId,
    );

    try {
      await quotasCollection
        .doc(quota.id)
        .create(this.datesToIsoStrings(quota) as Quota);
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

    const maybeCode = (
      error as { code?: string | number; details?: string }
    ).code;

    return (
      maybeCode === 6 ||
      maybeCode === "already-exists" ||
      error.message.includes("ALREADY_EXISTS") ||
      ((error as { details?: string }).details?.includes("ALREADY_EXISTS") ??
        false)
    );
  }

  async findManual(): Promise<import("./transaction.model").Transaction[]> {
    const snapshot = await this.repository
      .where("deletedAt", "==", null)
      .where("source", "==", "manual")
      .get();
    return snapshot.docs.map((doc) => this.sanitizeTimestamps(doc.data()));
  }

  // Obtener todas las cuotas de la subcolección
  async getQuotas(
    _creditCardId: string,
    transactionId: string,
  ): Promise<Quota[]> {
    const quotasCollection = this.getQuotasCollection(
      transactionId,
    );
    const snapshot = await quotasCollection
      .where("deletedAt", "==", null)
      .get();
    return snapshot.docs.map((doc) => {
      const raw = doc.data() as unknown as Record<string, unknown>;
      return {
        ...raw,
        dueDate: raw.dueDate ?? raw.due_date,
        paymentDate: raw.paymentDate ?? raw.payment_date,
        currency: raw.currency === "Dolar" ? "USD" : raw.currency,
      } as Quota;
    });
  }

  // Eliminar todas las cuotas de una transacción (hard delete)
  async deleteAllQuotas(
    _creditCardId: string,
    transactionId: string,
  ): Promise<number> {
    const quotasCollection = this.getQuotasCollection(
      transactionId,
    );
    const snapshot = await quotasCollection.get();
    const batch = this.repository.firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return snapshot.size;
  }
}
