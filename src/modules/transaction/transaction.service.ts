import { BaseService } from "@/shared/classes/base.service";
import { RepositoryError } from "@/shared/errors/custom.error";
import { QueryResult } from "@/shared/classes/supabase.repository";
import { convertUtcToChileTime } from "@/shared/utils/date.utils";
import { CategoryService } from "@/modules/category/category.service";
import { StatsService } from "@/modules/stats/stats.service";
import { BillingPeriodRepositorySupabase } from "@modules/billingPeriod/billingPeriod.repository.supabase";
import { CreditCardRepositorySupabase } from "@modules/creditCard/creditCard.repository.supabase";
import { Quota } from "@/modules/quota/quota.model";

import { CategoryMatcher, EmailImportService } from "./emailImport.service";
import { Transaction, TransactionRefund, TransactionWithRefundSummary } from "./transaction.model";
import {
  TransactionPaginationParams,
  TransactionRepositorySupabase,
} from "./transaction.repository.supabase";
import { ManualTransactionService } from "./manualTransaction.service";

type CategoryEnrichment = {
  categoryColor?: string;
  categoryIcon?: string;
  categoryName?: string;
};

type TransactionListQuery = {
  categoryId?: string;
  endDate?: string;
  limit?: string;
  startAfter?: string;
  startDate?: string;
};

type TransactionWithCategory = Transaction & CategoryEnrichment;
type TransactionDetails = TransactionWithRefundSummary & CategoryEnrichment;

type TransactionUpdatePayload = Partial<
  Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">
>;

export class TransactionService extends BaseService<Transaction> {
  protected repository: TransactionRepositorySupabase;
  private billingPeriodRepository: BillingPeriodRepositorySupabase;
  private categoryService: CategoryService;
  private creditCardRepository: CreditCardRepositorySupabase;
  private emailImportService: EmailImportService;
  private categoryMatcher: CategoryMatcher;
  private manualTransactionService: ManualTransactionService;

  constructor(
    repository: TransactionRepositorySupabase,
    billingPeriodRepository: BillingPeriodRepositorySupabase,
    creditCardRepository: CreditCardRepositorySupabase,
    categoryService: CategoryService,
    categoryMatcher: CategoryMatcher,
  ) {
    super(repository);
    this.repository = repository;
    this.billingPeriodRepository = billingPeriodRepository;
    this.categoryService = categoryService;
    this.creditCardRepository = creditCardRepository;
    this.emailImportService = new EmailImportService();
    this.categoryMatcher = categoryMatcher;
    this.manualTransactionService = new ManualTransactionService(repository);
  }

  /** Override to accept date-range pagination params. */
  async findAll(
    filters?: Partial<Transaction>,
    pagination?: TransactionPaginationParams,
  ): Promise<QueryResult<Transaction>> {
    return this.repository.findAll(filters, pagination);
  }

  async listTransactions(query: TransactionListQuery): Promise<QueryResult<TransactionDetails>> {
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const filters = query.categoryId ? { categoryId: query.categoryId } : undefined;

    const result = await this.getTransactionsWithRefundSummary(filters, {
      limit,
      startAfter: query.startAfter,
      orderBy: "transactionDate",
      orderDirection: "desc",
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return {
      items: await this.enrichTransactionsWithCategoriesSafely(
        result.items,
        "Could not enrich transactions with categories:",
      ),
      metadata: result.metadata,
    };
  }

  async getTransactionsWithRefundSummary(
    filters?: Partial<Transaction>,
    pagination?: TransactionPaginationParams,
  ): Promise<QueryResult<TransactionWithRefundSummary>> {
    const result = await this.repository.findAll(filters, pagination);
    const items = await this.attachRefundSummary(result.items);

    return {
      items,
      metadata: result.metadata,
    };
  }

  async getTransactionWithRefundSummary(
    transactionId: string,
  ): Promise<TransactionWithRefundSummary | null> {
    const transaction = await this.repository.findById(transactionId);

    if (!transaction) return null;
    if (transaction.parentTransactionId) {
      return this.buildRefundChildSummary(transaction);
    }

    const [enriched] = await this.attachRefundSummary([transaction]);
    return enriched ?? null;
  }

  async getTransactionDetails(transactionId: string): Promise<TransactionDetails | null> {
    const transaction = await this.getTransactionWithRefundSummary(transactionId);

    if (!transaction) return null;

    return this.enrichTransactionWithCategorySafely(
      transaction,
      "Could not enrich transaction with category:",
    );
  }

  async enrichTransactionWithCategory<T extends { categoryId?: string }>(
    transaction: T,
  ): Promise<T & CategoryEnrichment> {
    const [enriched] = await this.enrichTransactionsWithCategories([transaction]);
    return enriched;
  }

  async enrichTransactionsWithCategories<T extends { categoryId?: string }>(
    transactions: T[],
  ): Promise<Array<T & CategoryEnrichment>> {
    if (transactions.length === 0) return [];

    const categories = await this.categoryService.getAllCategories();
    const categoryMap = new Map(categories.map((category) => [category.id, category]));

    return transactions.map((transaction) => {
      if (!transaction.categoryId || !categoryMap.has(transaction.categoryId)) {
        return transaction;
      }

      const category = categoryMap.get(transaction.categoryId)!;
      return {
        ...transaction,
        categoryName: category.name,
        categoryIcon: category.icon,
        categoryColor: category.color,
      };
    });
  }

  async registerMerchantMapping(
    categoryId: string,
    merchantName: string,
    userId: string,
  ): Promise<void> {
    await this.categoryService.registerMerchantMapping(
      categoryId,
      merchantName,
      userId,
    );
  }

  async updateTransaction(
    transactionId: string,
    data: TransactionUpdatePayload,
    userId?: string,
  ): Promise<TransactionWithCategory | null> {
    const updatedTransaction = await this.update(transactionId, data);

    if (!updatedTransaction) {
      return null;
    }

    let responseData: Transaction & CategoryEnrichment = { ...updatedTransaction };

    if (updatedTransaction.categoryId) {
      try {
        responseData = await this.enrichTransactionWithCategory(updatedTransaction);
      } catch (error) {
        console.error("Could not enrich updated transaction with category:", error);
      }

      if (userId && updatedTransaction.merchant) {
        try {
          await this.registerMerchantMapping(
            updatedTransaction.categoryId,
            updatedTransaction.merchant,
            userId,
          );
        } catch (error) {
          console.error("Error registering merchant mapping:", error);
        }
      }
    }

    if (userId) {
      const isCategoryOnlyUpdate =
        Object.keys(data).length === 1 && "categoryId" in data;

      if (isCategoryOnlyUpdate) {
        StatsService.triggerInvalidateOnly(userId, updatedTransaction.creditCardId);
      } else {
        StatsService.triggerRecompute(userId, updatedTransaction.creditCardId);
      }
    }

    return responseData;
  }

  async createRefund(
    transactionId: string,
    data: { amount: number; transactionDate?: string | Date; reason?: string },
    userId?: string,
  ): Promise<{ refund: Transaction; transaction: TransactionWithRefundSummary }> {
    const transaction = await this.repository.findById(transactionId);

    if (!transaction) {
      throw new RepositoryError("Transacción no encontrada", 404);
    }

    if (transaction.parentTransactionId) {
      throw new RepositoryError("No se puede crear un refund de otra transacción refund", 400);
    }

    if (transaction.source !== "email" || (transaction.totalInstallments ?? 1) > 1) {
      throw new RepositoryError(
        "Solo se admiten refunds para compras importadas de una sola cuota",
        400,
      );
    }

    const quotas = await this.repository.getQuotas(transaction.id);
    if (quotas.length !== 1) {
      throw new RepositoryError(
        "Solo se admiten refunds cuando la compra tiene exactamente una cuota activa",
        400,
      );
    }

    const existingRefunds = await this.repository.findRefundsByParentIds([transaction.id]);
    const refunds = existingRefunds[transaction.id] ?? [];
    const refundedAmount = this.roundAmount(
      refunds.reduce((sum, refund) => sum + refund.amount, 0),
    );
    const requestedAmount = this.roundAmount(data.amount);
    const refundableAmount = this.roundAmount(transaction.amount - refundedAmount);

    if (requestedAmount > refundableAmount) {
      throw new RepositoryError(
        `El refund excede el monto disponible. Disponible: ${refundableAmount}`,
        400,
      );
    }

    const refundDate = data.transactionDate ? new Date(data.transactionDate) : new Date();
    const originalQuota = quotas[0];
    const refund = await this.repository.create({
      amount: -requestedAmount,
      currency: transaction.currency,
      cardType: transaction.cardType,
      cardLastDigits: transaction.cardLastDigits,
      merchant: transaction.merchant,
      categoryId: transaction.categoryId,
      transactionDate: refundDate,
      bank: transaction.bank,
      email: transaction.email,
      creditCardId: transaction.creditCardId,
      source: "refund",
      parentTransactionId: transaction.id,
      refundReason: data.reason,
    });

    try {
      await this.repository.addQuota(refund.creditCardId, refund.id, {
        id: refund.id,
        transactionId: refund.id,
        amount: -requestedAmount,
        dueDate: refundDate,
        status: originalQuota.status,
        currency: refund.currency,
        paymentDate:
          originalQuota.status === "paid"
            ? originalQuota.paymentDate ?? refundDate
            : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    } catch (error) {
      await this.repository.delete(refund.id);
      throw error;
    }

    const updatedTransaction = await this.getTransactionWithRefundSummary(transaction.id);
    if (!updatedTransaction) {
      throw new RepositoryError("No se pudo reconstruir la transacción refundeada", 500);
    }

    if (userId) {
      StatsService.triggerRecompute(userId, transaction.creditCardId);
    }

    return { refund, transaction: updatedTransaction };
  }

  async createTransaction(
    data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">,
    userId?: string,
  ): Promise<Transaction> {
    const transaction = await this.create(data);

    if (userId) {
      StatsService.triggerRecompute(userId, transaction.creditCardId);
    }

    return transaction;
  }

  async deleteTransaction(transactionId: string, userId?: string): Promise<boolean> {
    const transaction = await this.repository.findById(transactionId);

    if (!transaction) {
      return false;
    }

    const deleted = await this.softDelete(transactionId);

    if (deleted && userId) {
      StatsService.triggerRecompute(userId, transaction.creditCardId);
    }

    return deleted;
  }

  async fetchBankEmails(userId: string, creditCardId?: string) {
    return this.emailImportService.fetchBankEmails(
      userId,
      this.creditCardRepository,
      this.categoryMatcher,
      creditCardId,
    );
  }

  /**
   * Detecta transacciones que no caen dentro de ningún período de facturación
   * y sugiere el siguiente período basado en el patrón existente.
   */
  async checkOrphanedTransactions(
    preloadedTransactions?: Transaction[],
  ): Promise<{
    orphanedTransactions: Transaction[];
    suggestedPeriod: {
      month: string;
      startDate: string;
      endDate: string;
    } | null;
  }> {
    const bpResult = await this.billingPeriodRepository.findAll();
    const billingPeriods = bpResult.items;
    // Reutilizar lista pre-cargada si viene del flujo de import, evitando un findAll() extra
    const txResult = preloadedTransactions 
      ? { items: preloadedTransactions, metadata: { hasMore: false, nextCursor: null } }
      : await this.repository.findAll();
    const transactions = txResult.items;

    if (!transactions.length) {
      return { orphanedTransactions: [], suggestedPeriod: null };
    }

    // Convertir fechas de billing periods
    const formattedPeriods = billingPeriods.map((period) => ({
      startDate: new Date(
        convertUtcToChileTime(period.startDate, "yyyy-MM-dd HH:mm:ss"),
      ),
      endDate: new Date(
        convertUtcToChileTime(period.endDate, "yyyy-MM-dd HH:mm:ss"),
      ),
    }));

    // Encontrar transacciones huérfanas (excluir manuales: no tienen período asociado por diseño)
    const orphanedTransactions = transactions.filter((tx) => {
      if (!tx.transactionDate || tx.source === "manual") return false;
      const txDate = new Date(
        convertUtcToChileTime(tx.transactionDate, "yyyy-MM-dd HH:mm:ss"),
      );
      return !formattedPeriods.some(
        (period) => txDate >= period.startDate && txDate <= period.endDate,
      );
    });

    // Sugerir siguiente período basado en el patrón existente
    let suggestedPeriod: {
      month: string;
      startDate: string;
      endDate: string;
    } | null = null;

    if (billingPeriods.length > 0) {
      // Tomar el período más reciente (ya vienen ordenados desc por startDate)
      const latestPeriod = billingPeriods[0];
      const latestEnd = new Date(
        convertUtcToChileTime(latestPeriod.endDate, "yyyy-MM-dd"),
      );

      // Calcular la duración del período en días para detectar el patrón
      const nextStart = new Date(latestEnd);
      nextStart.setDate(nextStart.getDate() + 1);

      const nextEnd = new Date(nextStart);
      // Mantener la misma duración relativa (avanzar un mes)
      nextEnd.setMonth(nextEnd.getMonth() + 1);
      nextEnd.setDate(nextEnd.getDate() - 1);

      const monthNames = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];
      const monthName = monthNames[nextEnd.getMonth()];
      const year = nextEnd.getFullYear();

      suggestedPeriod = {
        month: `${monthName} ${year}`,
        startDate: nextStart.toISOString(),
        endDate: nextEnd.toISOString(),
      };
    } else if (orphanedTransactions.length > 0) {
      // Si no hay períodos, sugerir basado en la primera transacción huérfana
      const firstOrphan = orphanedTransactions[0];
      const txDate = new Date(
        convertUtcToChileTime(firstOrphan.transactionDate, "yyyy-MM-dd"),
      );
      const startDate = new Date(txDate.getFullYear(), txDate.getMonth(), 1);
      const endDate = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 0);

      const monthNames = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];

      suggestedPeriod = {
        month: `${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
    }

    return { orphanedTransactions, suggestedPeriod };
  }

  /**
   * Flujo completo de importación optimizado.
   * Comparte un único findAll() entre initializeQuotas y checkOrphans,
   * eliminando la lectura duplicada que ocurría al llamarlos por separado.
   *
   * Costo vs llamadas individuales: −1 findAll() de transacciones por import.
   */
  async runImportFlow(
    userId: string,
    creditCardId: string,
  ): Promise<{
    importedCount: number;
    quotasCreated: number;
    orphanedTransactions: Transaction[];
    suggestedPeriod: {
      month: string;
      startDate: string;
      endDate: string;
    } | null;
  }> {
    const { importedCount, importedTransactionIds } = await this.fetchBankEmails(userId, creditCardId);

    // Cortocircuito: si no hay correos nuevos, no ejecutar ninguna consulta adicional
    if (importedCount === 0) {
      return {
        importedCount: 0,
        quotasCreated: 0,
        orphanedTransactions: [],
        suggestedPeriod: null,
      };
    }

    // Solo cargar las transacciones recién importadas para inicializar cuotas
    // Esto evita escanear TODAS las transacciones del usuario
    const importedTransactions: Transaction[] = [];
    for (const id of importedTransactionIds) {
      const tx = await this.repository.findById(id);
      if (tx) importedTransactions.push(tx);
    }

    const [quotasCreated, { orphanedTransactions, suggestedPeriod }] =
      await Promise.all([
        this.initializeQuotasForAllTransactions(creditCardId, importedTransactions),
        this.checkOrphanedTransactions(importedTransactions),
      ]);

    StatsService.triggerRecompute(userId, creditCardId);

    return {
      importedCount,
      quotasCreated,
      orphanedTransactions,
      suggestedPeriod,
    };
  }

  /**
   * Crea una transacción manual con todas sus cuotas (pagadas y pendientes).
   */
  async createManualTransaction(
    creditCardId: string,
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
    userId?: string,
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    const result = await this.manualTransactionService.create(creditCardId, data);

    if (userId) {
      StatsService.triggerRecompute(userId, creditCardId);
    }

    return result;
  }

  /**
   * Elimina una transacción manual y todas sus cuotas (hard delete).
   */
  async deleteManualTransaction(
    creditCardId: string,
    transactionId: string,
    userId?: string,
  ): Promise<{ deletedQuotas: number }> {
    const result = await this.manualTransactionService.delete(creditCardId, transactionId);

    if (userId) {
      StatsService.triggerRecompute(userId, creditCardId);
    }

    return result;
  }

  /**
   * Edita una transacción manual: actualiza datos y recrea cuotas.
   */
  async updateManualTransaction(
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
    userId?: string,
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    const result = await this.manualTransactionService.update(
      creditCardId,
      transactionId,
      data,
    );

    if (userId) {
      StatsService.triggerRecompute(userId, creditCardId);
    }

    return result;
  }

  /**
   * Lista solo las transacciones manuales de una tarjeta.
   */
  async getManualTransactions(): Promise<TransactionWithCategory[]> {
    const transactions = await this.manualTransactionService.list();
    return this.enrichTransactionsWithCategoriesSafely(
      transactions,
      "Could not enrich manual transactions with categories:",
    );
  }

  async getManualTransactionsWithQuotas(): Promise<{
    transactions: TransactionWithCategory[];
    quotasByTx: Record<string, Quota[]>;
  }> {
    const transactions = await this.repository.findManual();
    const txIds = transactions.map((tx) => tx.id);
    const quotasByTx = await this.repository.getQuotasForTransactionIds(txIds);

    const bpResult = await this.billingPeriodRepository.findAll();
    const periods = bpResult.items;

    for (const txId of Object.keys(quotasByTx)) {
      for (const quota of quotasByTx[txId]) {
        const dueTime = new Date(quota.dueDate).getTime();
        const period = periods.find((p) => {
          const start = new Date(p.startDate).getTime();
          const end = new Date(p.endDate).getTime();
          return dueTime >= start && dueTime <= end;
        });
        if (period?.dueDate) {
          (quota as unknown as Record<string, unknown>).billingDueDate = period.dueDate;
        }
      }
    }

    return {
      transactions: await this.enrichTransactionsWithCategoriesSafely(
        transactions,
        "Could not enrich manual transactions with categories:",
      ),
      quotasByTx,
    };
  }

  async initializeQuotasForAllTransactions(
    creditCardId: string,
    preloadedTransactions?: Transaction[],
    userId?: string,
  ): Promise<number> {
    // Reutilizar lista pre-cargada si viene del flujo de import, evitando un findAll() extra
    const txResult = preloadedTransactions 
      ? { items: preloadedTransactions, metadata: { hasMore: false, nextCursor: null } }
      : await this.repository.findAll(undefined, { limit: 10000 });
    const transactions = txResult.items;

    if (!transactions.length) return 0;

    const created: number[] = await Promise.all(
      transactions.map(async (transaction) => {
        // No crear cuota semilla si la transacción ya tiene cuotas reales
        const existingQuotas = await this.repository.getQuotas(transaction.id);
        if (existingQuotas.length > 0) return 0;

        const now = new Date();
        const quotaData: Quota = {
          id: transaction.id,
          transactionId: transaction.id,
          amount: transaction.amount,
          dueDate: transaction.transactionDate,
          status: "pending",
          currency: transaction.currency,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        const wasCreated = await this.repository.addQuotaIfAbsent(
          creditCardId,
          transaction.id,
          quotaData,
        );

        return wasCreated ? 1 : 0;
      }),
    );

    const quotasCreated = created.reduce((total, current) => total + current, 0);

    if (userId && quotasCreated > 0) {
      StatsService.triggerRecompute(userId, creditCardId);
    }

    return quotasCreated;
  }

  private async attachRefundSummary(
    transactions: Transaction[],
  ): Promise<TransactionWithRefundSummary[]> {
    if (transactions.length === 0) return [];

    const refundMap = await this.repository.findRefundsByParentIds(
      transactions.map((transaction) => transaction.id),
    );

    return transactions.map((transaction) =>
      this.buildRefundSummary(transaction, refundMap[transaction.id] ?? []),
    );
  }

  private buildRefundSummary(
    transaction: Transaction,
    refunds: TransactionRefund[],
  ): TransactionWithRefundSummary {
    const refundedAmount = this.roundAmount(
      refunds.reduce((sum, refund) => sum + refund.amount, 0),
    );
    const originalAmount = this.roundAmount(Math.max(transaction.amount, 0));
    const refundableAmount = this.roundAmount(
      Math.max(originalAmount - refundedAmount, 0),
    );

    let refundStatus: "none" | "partial" | "full" = "none";
    if (refundedAmount > 0 && refundableAmount === 0) {
      refundStatus = "full";
    } else if (refundedAmount > 0) {
      refundStatus = "partial";
    }

    return {
      ...transaction,
      refundStatus,
      refundedAmount,
      refundableAmount,
      canRefund:
        transaction.source === "email" &&
        !transaction.parentTransactionId &&
        (transaction.totalInstallments ?? 1) <= 1 &&
        refundableAmount > 0,
      refunds,
    };
  }

  private buildRefundChildSummary(
    transaction: Transaction,
  ): TransactionWithRefundSummary {
    return {
      ...transaction,
      refundStatus: "none",
      refundedAmount: 0,
      refundableAmount: 0,
      canRefund: false,
      refunds: [],
    };
  }

  private roundAmount(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async enrichTransactionWithCategorySafely<T extends { categoryId?: string }>(
    transaction: T,
    errorMessage: string,
  ): Promise<T & CategoryEnrichment> {
    const [enriched] = await this.enrichTransactionsWithCategoriesSafely(
      [transaction],
      errorMessage,
    );

    return enriched;
  }

  private async enrichTransactionsWithCategoriesSafely<T extends { categoryId?: string }>(
    transactions: T[],
    errorMessage: string,
  ): Promise<Array<T & CategoryEnrichment>> {
    try {
      return await this.enrichTransactionsWithCategories(transactions);
    } catch (error) {
      console.error(errorMessage, error);
      return transactions;
    }
  }
}
