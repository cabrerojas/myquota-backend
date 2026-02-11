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
import { BaseService } from "@/shared/classes/base.service";
import { Quota } from "@/modules/quota/quota.model";
import { BillingPeriodRepository } from "../billingPeriod/billingPeriod.repository";

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
  async fetchBankEmails(userId: string): Promise<void> {
    console.warn(`🔍 Buscando emailToken para el usuario: ${userId}`);

    // 🔹 Verificar si ya hay un token guardado en Firestore
    const tokenData = await getTokenFromFirestore(userId);

    if (!tokenData) {
      throw new Error(
        "❌ No se encontró un token. Conéctate con Gmail nuevamente.",
      );
    }

    console.log(tokenData);

    // 🔹 Crear cliente OAuth con el token guardado
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

    // 🔹 Si el token expiró, intentar renovar con refresh_token
    if (new Date().getTime() > tokenData.expiryDate) {
      console.log("🔄 Token expirado, renovando con refresh_token...");
      if (!tokenData.refreshToken) {
        throw new Error(
          "❌ El token de Gmail ha expirado y no hay refresh_token. Conéctate nuevamente.",
        );
      }
      try {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);

        // Guardar los nuevos tokens en Firestore
        const { saveTokenToFirestore } = await import("../../config/gmailAuth");
        await saveTokenToFirestore(userId, {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || tokenData.refreshToken,
          expiry_date: credentials.expiry_date,
        });
        console.log("✅ Token de Gmail renovado y guardado");
      } catch (refreshError) {
        console.error("❌ Error renovando token de Gmail:", refreshError);
        throw new Error(
          "❌ No se pudo renovar el token de Gmail. Conéctate nuevamente.",
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

    console.warn(`Buscando correos de transacciones desde ${formattedDate}`);
    const query = `from:enviodigital@bancochile.cl subject:compra tarjeta crédito after:${formattedDate}`;
    const res = await gmail.users.messages.list({ userId: "me", q: query });

    if (res.data.messages) {
      const messageIds = res.data.messages.map((message) => message.id!);
      console.log("Message IDs:", messageIds);
      const existingIds =
        await this.repository.getExistingTransactionIds(messageIds);
      console.log(
        "Existing IDs#####################################:",
        existingIds,
      );
      const newMessageIds = messageIds.filter(
        (id) => !existingIds.includes(id),
      );

      if (newMessageIds.length === 0) {
        console.warn("No hay nuevos correos para procesar.");
        return;
      }

      console.warn(`Procesando ${newMessageIds.length} nuevos correos`);
      const chunks = chunkArray(newMessageIds, 100);
      let batchData: Transaction[] = [];

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (messageId, index) => {
            const email = await gmail.users.messages.get({
              userId: "me",
              id: messageId,
            });
            let encodedMessage = email.data.payload?.body?.data;
            console.warn(`Procesando correo ${index + 1} de ${chunk.length}`);

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
                  transactionDate,
                  bank: "Banco de Chile",
                  email: "enviodigital@bancochile.cl",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                  creditCardId: "",
                };

                batchData.push(transactionData);
              }
            }
          }),
        );

        console.log("Batch data:", batchData);
        if (batchData.length > 0) {
          await this.repository.saveBatch(batchData);
          batchData = [];
        }
      }
    } else {
      console.warn("No se encontraron correos de transacciones para este mes.");
    }
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

  async initializeQuotasForAllTransactions(creditCardId: string) {
    console.log(
      `📌 Inicializando cuotas para la tarjeta de crédito: ${creditCardId}`,
    );

    // Obtener todas las transacciones de la tarjeta de crédito
    const transactions = await this.repository.findAll();

    if (!transactions.length) {
      console.warn("⚠️ No se encontraron transacciones para procesar.");
      return;
    }

    console.log(`📌 Se encontraron ${transactions.length} transacciones.`);

    // Obtener las cuotas existentes para estas transacciones
    const existingQuotas = await Promise.all(
      transactions.map(async (transaction) => {
        return await this.repository.getQuotas(creditCardId, transaction.id);
      }),
    );

    // Aplanar el array de cuotas existentes
    const allExistingQuotas = existingQuotas.flat();
    const existingQuotaIds = new Set(
      allExistingQuotas.map((quota) => quota.transactionId),
    );

    // Filtrar las transacciones que no tienen cuotas creadas
    const transactionsWithoutQuotas = transactions.filter(
      (transaction) => !existingQuotaIds.has(transaction.id),
    );

    if (!transactionsWithoutQuotas.length) {
      console.warn("✅ Todas las transacciones ya tienen cuotas creadas.");
      return;
    }

    console.log(
      `📌 Se crearán cuotas para ${transactionsWithoutQuotas.length} transacciones.`,
    );

    // Crear cuotas en paralelo usando Promise.all
    await Promise.all(
      transactionsWithoutQuotas.map(async (transaction) => {
        const quotaData: Quota = {
          id: this.repository.repository.doc().id, // Generar un ID único para la cuota
          transactionId: transaction.id,
          amount: transaction.amount,
          due_date: transaction.transactionDate, // Fecha estimada de vencimiento
          status: "pending",
          currency: transaction.currency,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };

        // Crear la cuota para la transacción
        await this.repository.addQuota(creditCardId, transaction.id, quotaData);
        console.warn(
          `✅ Cuota creada para la transacción con ID ${transaction.id}`,
        );
      }),
    );

    console.warn(
      `✅ Cuotas creadas para ${transactionsWithoutQuotas.length} transacciones.`,
    );
  }

  /**
   * 🔹 Obtiene la sumatoria de cuotas organizadas por períodos de facturación.
   */
  async getMonthlyQuotaSum(
    creditCardId: string,
  ): Promise<{ period: string; currency: string; totalAmount: number }[]> {
    try {
      console.warn(
        `📌 Obteniendo sumatoria de cuotas por período de facturación para la tarjeta ${creditCardId}...`,
      );

      // 🔹 Obtener los períodos de facturación de la tarjeta
      const billingPeriods = await this.billingPeriodRepository.findAll();
      if (!billingPeriods.length) {
        console.warn("⚠️ No se encontraron períodos de facturación.");
        return [];
      }

      // 🔹 Convertir las fechas de `billingPeriods` a hora de Chile
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

      // 🔹 Obtener todas las transacciones de la tarjeta
      const transactions = await this.repository.findAll();
      if (!transactions.length) {
        console.warn("⚠️ No se encontraron transacciones para procesar.");
        return [];
      }

      console.log(`📌 Se encontraron ${transactions.length} transacciones.`);

      // 🔹 Obtener todas las cuotas de las transacciones
      const quotas = await Promise.all(
        transactions.map(async (transaction) => {
          return await this.repository.getQuotas(creditCardId, transaction.id);
        }),
      );

      // 🔹 Aplanar el array de cuotas
      const allQuotas = quotas.flat();
      console.log(`📌 Se encontraron ${allQuotas.length} cuotas.`);

      // 🔹 Inicializar el mapa de sumas por período
      const periodSumMap: { [key: string]: { [currency: string]: number } } =
        {};

      formattedBillingPeriods.forEach((billingPeriod) => {
        periodSumMap[billingPeriod.periodKey] = {};

        // 🔹 Filtrar las cuotas que caen dentro del período de facturación
        const quotasInPeriod = allQuotas.filter((quota) => {
          if (!quota.due_date) return false;

          const quotaDate = new Date(
            convertUtcToChileTime(quota.due_date, "yyyy-MM-dd HH:mm:ss"),
          );

          return (
            quotaDate >= billingPeriod.startDate &&
            quotaDate <= billingPeriod.endDate
          );
        });

        // 🔹 Sumar las cuotas dentro del período por moneda
        quotasInPeriod.forEach((quota) => {
          if (!periodSumMap[billingPeriod.periodKey][quota.currency]) {
            periodSumMap[billingPeriod.periodKey][quota.currency] = 0;
          }
          periodSumMap[billingPeriod.periodKey][quota.currency] += quota.amount;
        });
      });

      // 🔹 Convertir el objeto de sumas a un array de resultados
      const periodSumArray = Object.entries(periodSumMap).flatMap(
        ([period, currencyMap]) =>
          Object.entries(currencyMap).map(([currency, totalAmount]) => ({
            period,
            currency,
            totalAmount,
          })),
      );

      return periodSumArray;
    } catch (error) {
      console.error(
        "❌ Error al obtener la sumatoria de las cuotas por período de facturación:",
        error,
      );
      throw error;
    }
  }
}
