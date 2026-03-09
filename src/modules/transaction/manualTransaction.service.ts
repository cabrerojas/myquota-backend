import { TransactionRepository } from "./transaction.repository";
import { Transaction } from "./transaction.model";
import { Quota } from "@/modules/quota/quota.model";

/**
 * Handles CRUD operations for manual (user-entered) transactions and their
 * quota generation. Extracted from TransactionService to isolate manual-debt
 * logic from email-import and reporting concerns.
 */
export class ManualTransactionService {
  constructor(private readonly repository: TransactionRepository) {}

  /**
   * Creates a manual transaction with all its quotas (paid and pending).
   */
  async create(
    creditCardId: string,
    data: {
      merchant: string;
      purchaseDate: string;
      quotaAmount: number;
      totalInstallments: number;
      paidInstallments: number;
      lastPaidMonth: string; // "2026-01"
      currency: string;
      categoryId?: string;
    },
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    const transactionId = this.repository.repository.doc().id;
    const transaction: Transaction = {
      id: transactionId,
      amount: data.quotaAmount,
      currency: data.currency,
      cardType: "",
      cardLastDigits: "",
      merchant: data.merchant,
      categoryId: data.categoryId,
      transactionDate: new Date(data.purchaseDate),
      bank: "manual",
      email: "",
      creditCardId,
      source: "manual",
      totalInstallments: data.totalInstallments,
      paidInstallments: data.paidInstallments,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    await this.repository.create(transaction);

    // lastPaidMonth is "2026-01" => quota #paidInstallments was paid in that month
    // Pending quotas start from the following month
    const [lastYear, lastMonthNum] = data.lastPaidMonth.split("-").map(Number);

    for (let i = 1; i <= data.totalInstallments; i++) {
      const isPaid = i <= data.paidInstallments;
      const monthOffset = i - data.paidInstallments;
      const dueDate = new Date(lastYear, lastMonthNum - 1 + monthOffset, 15);

      const quota: Quota = {
        id: this.repository.repository.doc().id,
        transactionId,
        amount: data.quotaAmount,
        dueDate: dueDate,
        status: isPaid ? "paid" : "pending",
        currency: data.currency,
        paymentDate: isPaid ? dueDate : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      await this.repository.addQuota(creditCardId, transactionId, quota);
    }

    return { transaction, quotasCreated: data.totalInstallments };
  }

  /**
   * Deletes a manual transaction and all its quotas (hard delete).
   */
  async delete(
    creditCardId: string,
    transactionId: string,
  ): Promise<{ deletedQuotas: number }> {
    const transaction = await this.repository.findById(transactionId);
    if (!transaction) {
      throw new Error("Transacción no encontrada");
    }
    if (transaction.source !== "manual") {
      throw new Error("Solo se pueden eliminar transacciones manuales");
    }

    const deletedQuotas = await this.repository.deleteAllQuotas(
      creditCardId,
      transactionId,
    );
    await this.repository.delete(transactionId);

    return { deletedQuotas };
  }

  /**
   * Updates a manual transaction: modifies data and recreates all quotas.
   */
  async update(
    creditCardId: string,
    transactionId: string,
    data: {
      merchant: string;
      purchaseDate: string;
      quotaAmount: number;
      totalInstallments: number;
      paidInstallments: number;
      lastPaidMonth: string;
      currency: string;
      categoryId?: string;
    },
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    const existing = await this.repository.findById(transactionId);
    if (!existing) {
      throw new Error("Transacción no encontrada");
    }
    if (existing.source !== "manual") {
      throw new Error("Solo se pueden editar transacciones manuales");
    }

    await this.repository.update(transactionId, {
      merchant: data.merchant,
      amount: data.quotaAmount,
      ...(data.categoryId ? { categoryId: data.categoryId } : {}),
      currency: data.currency,
      transactionDate: new Date(data.purchaseDate),
      totalInstallments: data.totalInstallments,
      paidInstallments: data.paidInstallments,
      updatedAt: new Date(),
    } as Partial<Transaction>);

    // Delete all existing quotas and recreate them
    await this.repository.deleteAllQuotas(creditCardId, transactionId);

    const [lastYear, lastMonthNum] = data.lastPaidMonth.split("-").map(Number);

    for (let i = 1; i <= data.totalInstallments; i++) {
      const isPaid = i <= data.paidInstallments;
      const monthOffset = i - data.paidInstallments;
      const dueDate = new Date(lastYear, lastMonthNum - 1 + monthOffset, 15);

      const quota: Quota = {
        id: this.repository.repository.doc().id,
        transactionId,
        amount: data.quotaAmount,
        dueDate: dueDate,
        status: isPaid ? "paid" : "pending",
        currency: data.currency,
        paymentDate: isPaid ? dueDate : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      await this.repository.addQuota(creditCardId, transactionId, quota);
    }

    const updated = await this.repository.findById(transactionId);
    return { transaction: updated!, quotasCreated: data.totalInstallments };
  }

  /**
   * Lists only manual transactions for the current credit card.
   */
  async list(): Promise<Transaction[]> {
    const all = await this.repository.findAll();
    return all.filter((t) => t.source === "manual");
  }
}
