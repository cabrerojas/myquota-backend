import { Auth, gmail_v1, google } from "googleapis";
import { getTokenFromFirestore } from "../../config/gmailAuth";
import * as cheerio from "cheerio";
import { chunkArray } from "@/shared/utils/array.utils";
import {
  convertUtcToChileTime,
  parseFirebaseDate,
} from "@/shared/utils/date.utils";

import { TransactionRepository } from "./transaction.repository";
import { Transaction } from "./transaction.model";
import { CategoryService } from "@/modules/category/category.service";
import { BaseService } from "@/shared/classes/base.service";
import { Quota } from "@/modules/quota/quota.model";
import { BillingPeriodRepository } from "../billingPeriod/billingPeriod.repository";
import {
  CacheService,
  CacheKeys,
  CacheTTL,
} from "@/shared/services/cache.service";

export class TransactionService extends BaseService<Transaction> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: TransactionRepository;
  private billingPeriodRepository: BillingPeriodRepository;

  constructor(
    repository: TransactionRepository,
    billingPeriodRepository: BillingPeriodRepository,
  ) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
    this.billingPeriodRepository = billingPeriodRepository;
  }

  // Otros métodos específicos del servicio
  async fetchBankEmails(userId: string): Promise<{ importedCount: number }> {
    // Verificar si ya hay un token guardado en Firestore
    const tokenData = await getTokenFromFirestore(userId);

    if (!tokenData) {
      throw new Error(
        "No se encontró un token de Gmail. Conéctate con Gmail nuevamente.",
      );
    }

    // Crear cliente OAuth con el token guardado
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const auth: Auth.OAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
    );
    auth.setCredentials({
      access_token: tokenData.accessToken,
      refresh_token: tokenData.refreshToken,
      expiry_date: tokenData.expiryDate,
    });

    // Si el token expiró, intentar renovar con refresh_token
    if (new Date().getTime() > tokenData.expiryDate) {
      if (!tokenData.refreshToken) {
        throw new Error(
          "El token de Gmail ha expirado y no hay refresh_token. Conéctate nuevamente.",
        );
      }
      try {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);

        const { saveTokenToFirestore } = await import("../../config/gmailAuth");
        await saveTokenToFirestore(userId, {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || tokenData.refreshToken,
          expiry_date: credentials.expiry_date,
        });
      } catch (refreshError) {
        console.error("Error renovando token de Gmail:", refreshError);
        throw new Error(
          "No se pudo renovar el token de Gmail. Conéctate nuevamente.",
        );
      }
    }

    const gmail = google.gmail({ version: "v1", auth });

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const formattedDate = `${startOfMonth.getFullYear()}/${(
      startOfMonth.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${startOfMonth.getDate().toString().padStart(2, "0")}`;

    const query = `from:enviodigital@bancochile.cl subject:compra tarjeta crédito after:${formattedDate}`;
    const res = await gmail.users.messages.list({ userId: "me", q: query });

    if (res.data.messages) {
      const messageIds = res.data.messages.map((message) => message.id!);
      const existingIds =
        await this.repository.getExistingTransactionIds(messageIds);
      const newMessageIds = messageIds.filter(
        (id) => !existingIds.includes(id),
      );

      if (newMessageIds.length === 0) {
        return { importedCount: 0 };
      }
      const chunks = chunkArray(newMessageIds, 100);
      let batchData: Transaction[] = [];
      let totalImported = 0;

      // Pre-cargar el mapa de merchants UNA sola vez para todos los correos.
      // Costo fijo: N_categories reads. Sin esto sería N_emails × N_categories reads.
      const categoryService = new CategoryService();
      let merchantMap: Map<
        string,
        { categoryId: string; categoryName: string }
      >;
      try {
        merchantMap = await categoryService.buildMerchantCategoryMap();
      } catch (err) {
        console.error("Error pre-cargando merchant map:", err);
        merchantMap = new Map();
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (messageId) => {
            const email = await gmail.users.messages.get({
              userId: "me",
              id: messageId,
            });
            let encodedMessage = email.data.payload?.body?.data;

            if (email.data.payload) {
              encodedMessage = this.findHtmlOrPlainText(email.data.payload);
            }

            if (encodedMessage) {
              const content = Buffer.from(encodedMessage, "base64").toString(
                "utf8",
              );
              const {
                amount,
                currency,
                cardLastDigits,
                merchant,
                transactionDate,
              } = this.extractTransactionDataFromHtml(content);

              if (amount && cardLastDigits && merchant && transactionDate) {
                const transactionData: Transaction = {
                  id: messageId,
                  amount,
                  currency,
                  cardType: "Tarjeta de Crédito",
                  cardLastDigits,
                  merchant,
                  // categoryId will be set if we find an automatic match
                  categoryId: undefined,
                  transactionDate,
                  bank: "Banco de Chile",
                  email: "enviodigital@bancochile.cl",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                  creditCardId: "",
                };

                // Lookup en el mapa pre-cargado — sin reads adicionales
                const match = CategoryService.matchMerchantInMap(
                  merchant,
                  merchantMap,
                );
                if (match) {
                  transactionData.categoryId = match.categoryId;
                }

                batchData.push(transactionData);
              }
            }
          }),
        );

        if (batchData.length > 0) {
          totalImported += batchData.length;
          await this.repository.saveBatch(batchData);
          batchData = [];
        }
      }
      return { importedCount: totalImported };
    } else {
      console.warn("No se encontraron correos de transacciones para este mes.");
    }
    return { importedCount: 0 };
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

  // Función recursiva para buscar contenido HTML o texto plano en partes anidadas
  private findHtmlOrPlainText(
    part: gmail_v1.Schema$MessagePart,
  ): string | null | undefined {
    // Busca contenido HTML o texto plano directamente
    if (part.mimeType === "text/html" || part.mimeType === "text/plain") {
      return part.body?.data;
    }
    // Si la parte es multipart/alternative o multipart/mixed, explora sus subpartes
    else if (
      (part.mimeType === "multipart/alternative" ||
        part.mimeType === "multipart/mixed") &&
      part.parts
    ) {
      for (const subPart of part.parts) {
        const result = this.findHtmlOrPlainText(subPart);
        if (result) return result;
      }
    }
    return undefined;
  }

  // Función para analizar contenido HTML y extraer la información
  private extractTransactionDataFromHtml(htmlContent: string) {
    const $ = cheerio.load(htmlContent);

    // Extraer el texto del elemento que contiene el mensaje principal
    const textContent = $('td:contains("compra por")').text();

    // Detectar la moneda y el monto
    const amountMatch = textContent.match(
      /(?:US\$|CLP\$|\$)(\d{1,64}(?:[.,]\d{3})*(?:[.,]\d{2})?)/,
    );
    const currency = textContent.includes("US$") ? "Dolar" : "CLP";

    // Formatear el monto extraído para asegurar que siempre sea un número válido
    let amount = null;
    if (amountMatch) {
      const amountString = amountMatch[1].replace(/\./g, "").replace(",", ".");
      amount = parseFloat(amountString);
    }

    // Extraer otros datos
    const lastDigitsMatch = textContent.match(
      /Tarjeta de Crédito \*\*\*\*(\d{4})/,
    );
    const merchantMatch = textContent.match(/en (.+?) el \d{2}\/\d{2}\/\d{4}/);
    const dateMatch = textContent.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);

    // Formatear otros datos extraídos
    const cardLastDigits = lastDigitsMatch ? lastDigitsMatch[1] : null;
    const merchant = merchantMatch
      ? merchantMatch[1].replace(/\s+/g, " ").trim()
      : null;
    // Convertir transactionDate a un objeto Date si se extrajo correctamente
    const transactionDate = dateMatch ? parseFirebaseDate(dateMatch[0]) : null;

    return { amount, currency, cardLastDigits, merchant, transactionDate };
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
