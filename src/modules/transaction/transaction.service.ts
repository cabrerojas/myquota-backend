import { convertUtcToChileTime } from "@/shared/utils/date.utils";

import { TransactionRepository } from "./transaction.repository";
import { Transaction } from "./transaction.model";
import { BaseService } from "@/shared/classes/base.service";
import { Quota } from "@/modules/quota/quota.model";
import { BillingPeriodRepository } from "../billingPeriod/billingPeriod.repository";
import {
  CacheService,
  CacheKeys,
  CacheTTL,
} from "@/shared/services/cache.service";
import { EmailImportService } from "./emailImport.service";

export class TransactionService extends BaseService<Transaction> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: TransactionRepository;
  private billingPeriodRepository: BillingPeriodRepository;
  private emailImportService: EmailImportService;

  constructor(
    repository: TransactionRepository,
    billingPeriodRepository: BillingPeriodRepository,
  ) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
    this.billingPeriodRepository = billingPeriodRepository;
    this.emailImportService = new EmailImportService();
  }

  async fetchBankEmails(userId: string): Promise<{ importedCount: number }> {
    return this.emailImportService.fetchBankEmails(userId, this.repository);
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
      lastPaidMonth: string; // "2026-01"
      currency: string;
      categoryId?: string;
    },
  ): Promise<{ transaction: Transaction; quotasCreated: number }> {
    // Crear la transacción
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

    // Generar cuotas
    // lastPaidMonth es "2026-01" => la cuota paidInstallments se pagó en ese mes
    // Las cuotas pendientes empiezan el mes siguiente
    const [lastYear, lastMonthNum] = data.lastPaidMonth.split("-").map(Number);

    for (let i = 1; i <= data.totalInstallments; i++) {
      const isPaid = i <= data.paidInstallments;

      // Calcular dueDate: cuotas van mes a mes
      // Cuota paidInstallments cae en lastPaidMonth
      // Offset from lastPaidMonth: i - paidInstallments
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

    return {
      transaction,
      quotasCreated: data.totalInstallments,
    };
  }

  /**
   * Elimina una transacción manual y todas sus cuotas (hard delete).
   */
  async deleteManualTransaction(
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

    // Eliminar todas las cuotas primero
    const deletedQuotas = await this.repository.deleteAllQuotas(
      creditCardId,
      transactionId,
    );

    // Eliminar la transacción (hard delete)
    await this.repository.delete(transactionId);

    return { deletedQuotas };
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
    const existing = await this.repository.findById(transactionId);
    if (!existing) {
      throw new Error("Transacción no encontrada");
    }
    if (existing.source !== "manual") {
      throw new Error("Solo se pueden editar transacciones manuales");
    }

    // Actualizar la transacción
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

    // Borrar todas las cuotas existentes y recrearlas
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
    return {
      transaction: updated!,
      quotasCreated: data.totalInstallments,
    };
  }

  /**
   * Lista solo las transacciones manuales de una tarjeta.
   */
  async getManualTransactions(): Promise<Transaction[]> {
    const all = await this.repository.findAll();
    return all.filter((t) => t.source === "manual");
  }

  async initializeQuotasForAllTransactions(
    creditCardId: string,
    preloadedTransactions?: Transaction[],
  ): Promise<number> {
    // Reutilizar lista pre-cargada si viene del flujo de import, evitando un findAll() extra
    const transactions =
      preloadedTransactions ?? (await this.repository.findAll());

    if (!transactions.length) return 0;

    // Obtener las cuotas existentes para estas transacciones (N lecturas paralelas)
    const existingQuotas = await Promise.all(
      transactions.map((transaction) =>
        this.repository.getQuotas(creditCardId, transaction.id),
      ),
    );

    const existingQuotaIds = new Set(
      existingQuotas.flat().map((quota) => quota.transactionId),
    );

    const transactionsWithoutQuotas = transactions.filter(
      (transaction) => !existingQuotaIds.has(transaction.id),
    );

    if (!transactionsWithoutQuotas.length) return 0;

    // Crear cuotas en paralelo
    await Promise.all(
      transactionsWithoutQuotas.map(async (transaction) => {
        const quotaData: Quota = {
          id: this.repository.repository.doc().id,
          transactionId: transaction.id,
          amount: transaction.amount,
          dueDate: transaction.transactionDate,
          status: "pending",
          currency: transaction.currency,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        await this.repository.addQuota(creditCardId, transaction.id, quotaData);
      }),
    );

    return transactionsWithoutQuotas.length;
  }

  /**
   * Obtiene la sumatoria de cuotas organizadas por períodos de facturación.
   * Costo L3: 1 (billingPeriods) + 1 (transactions) + N_transactions (getQuotas) reads.
   * Resultado cacheado en L1 memoria con TTL MEDIUM (2 min).
   * Invalidación automática vía StatsService.triggerRecompute → CacheService.invalidateByPrefix.
   */
  async getMonthlyQuotaSum(
    creditCardId: string,
  ): Promise<{ period: string; currency: string; totalAmount: number }[]> {
    // L1: memoria — clave por creditCardId (IDs de Firestore son globalmente únicos)
    // Invalidación explícita vía StatsService.triggerRecompute cuando creditCardId es conocido
    const cacheKey = CacheKeys.monthlyQuotaSum(creditCardId);
    const cached =
      CacheService.get<
        { period: string; currency: string; totalAmount: number }[]
      >(cacheKey);
    if (cached !== null) return cached;

    try {
      const [billingPeriods, transactions] = await Promise.all([
        this.billingPeriodRepository.findAll(),
        this.repository.findAll(),
      ]);

      if (!billingPeriods.length || !transactions.length) return [];

      const formattedBillingPeriods = billingPeriods.map((period) => ({
        periodKey: `${convertUtcToChileTime(
          period.startDate,
          "yyyy-MM-dd",
        )} - ${convertUtcToChileTime(period.endDate, "yyyy-MM-dd")}`,
        startDate: new Date(
          convertUtcToChileTime(period.startDate, "yyyy-MM-dd HH:mm:ss"),
        ),
        endDate: new Date(
          convertUtcToChileTime(period.endDate, "yyyy-MM-dd HH:mm:ss"),
        ),
      }));

      // N reads paralelas (una por transacción)
      const allQuotas = (
        await Promise.all(
          transactions.map((tx) =>
            this.repository.getQuotas(creditCardId, tx.id),
          ),
        )
      ).flat();

      const periodSumMap: { [key: string]: { [currency: string]: number } } =
        {};

      for (const billingPeriod of formattedBillingPeriods) {
        periodSumMap[billingPeriod.periodKey] = {};
        const quotasInPeriod = allQuotas.filter((quota) => {
          if (!quota.dueDate) return false;
          const quotaDate = new Date(
            convertUtcToChileTime(quota.dueDate, "yyyy-MM-dd HH:mm:ss"),
          );
          return (
            quotaDate >= billingPeriod.startDate &&
            quotaDate <= billingPeriod.endDate
          );
        });
        for (const quota of quotasInPeriod) {
          periodSumMap[billingPeriod.periodKey][quota.currency] =
            (periodSumMap[billingPeriod.periodKey][quota.currency] ?? 0) +
            quota.amount;
        }
      }

      const result = Object.entries(periodSumMap).flatMap(
        ([period, currencyMap]) =>
          Object.entries(currencyMap).map(([currency, totalAmount]) => ({
            period,
            currency,
            totalAmount,
          })),
      );

      if (cacheKey) CacheService.set(cacheKey, result, CacheTTL.MEDIUM);

      return result;
    } catch (error) {
      console.error(
        "Error al obtener la sumatoria de las cuotas por período de facturación:",
        error,
      );
      throw error;
    }
  }
}
