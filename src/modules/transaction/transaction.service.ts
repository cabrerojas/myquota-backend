import { convertUtcToChileTime } from "@/shared/utils/date.utils";

import { TransactionRepository } from "./transaction.repository";
import { Transaction } from "./transaction.model";
import { BaseService } from "@/shared/classes/base.service";
import { Quota } from "@/modules/quota/quota.model";
import { BillingPeriodRepository } from "@modules/billingPeriod/billingPeriod.repository";
import { CreditCardRepository } from "@modules/creditCard/creditCard.repository";
import { CategoryMatcher, EmailImportService } from "./emailImport.service";
import { ManualTransactionService } from "./manualTransaction.service";

export class TransactionService extends BaseService<Transaction> {
  protected repository: TransactionRepository;
  private billingPeriodRepository: BillingPeriodRepository;
  private creditCardRepository: CreditCardRepository;
  private emailImportService: EmailImportService;
  private categoryMatcher: CategoryMatcher;
  private manualTransactionService: ManualTransactionService;

  constructor(
    repository: TransactionRepository,
    billingPeriodRepository: BillingPeriodRepository,
    creditCardRepository: CreditCardRepository,
    categoryMatcher: CategoryMatcher,
  ) {
    super(repository);
    this.repository = repository;
    this.billingPeriodRepository = billingPeriodRepository;
    this.creditCardRepository = creditCardRepository;
    this.emailImportService = new EmailImportService();
    this.categoryMatcher = categoryMatcher;
    this.manualTransactionService = new ManualTransactionService(repository);
  }

  async fetchBankEmails(userId: string): Promise<{ importedCount: number }> {
    return this.emailImportService.fetchBankEmails(
      userId,
      this.creditCardRepository,
      this.categoryMatcher,
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
    const billingPeriods = await this.billingPeriodRepository.findAll();
    // Reutilizar lista pre-cargada si viene del flujo de import, evitando un findAll() extra
    const transactions =
      preloadedTransactions ?? (await this.repository.findAll());

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
    const { importedCount } = await this.fetchBankEmails(userId);

    // Cortocircuito: si no hay correos nuevos, no ejecutar ninguna consulta adicional
    if (importedCount === 0) {
      return {
        importedCount: 0,
        quotasCreated: 0,
        orphanedTransactions: [],
        suggestedPeriod: null,
      };
    }

    // UN solo findAll() compartido por initializeQuotas y checkOrphans
    const transactions = await this.repository.findAll();

    const [quotasCreated, { orphanedTransactions, suggestedPeriod }] =
      await Promise.all([
        this.initializeQuotasForAllTransactions(creditCardId, transactions),
        this.checkOrphanedTransactions(transactions),
      ]);

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
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    return this.manualTransactionService.create(creditCardId, data);
  }

  /**
   * Elimina una transacción manual y todas sus cuotas (hard delete).
   */
  async deleteManualTransaction(
    creditCardId: string,
    transactionId: string,
  ): Promise<{ deletedQuotas: number }> {
    return this.manualTransactionService.delete(creditCardId, transactionId);
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
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    return this.manualTransactionService.update(
      creditCardId,
      transactionId,
      data,
    );
  }

  /**
   * Lista solo las transacciones manuales de una tarjeta.
   */
  async getManualTransactions(): Promise<Transaction[]> {
    return this.manualTransactionService.list();
  }

  async initializeQuotasForAllTransactions(
    creditCardId: string,
    preloadedTransactions?: Transaction[],
  ): Promise<number> {
    // Reutilizar lista pre-cargada si viene del flujo de import, evitando un findAll() extra
    const transactions =
      preloadedTransactions ?? (await this.repository.findAll());

    if (!transactions.length) return 0;

    const created: number[] = await Promise.all(
      transactions.map(async (transaction) => {
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

    return created.reduce((total, current) => total + current, 0);
  }
}
