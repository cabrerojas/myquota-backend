import { Auth, gmail_v1, google } from 'googleapis';
import { getTokenFromFirestore } from '../../../config/gmailAuth';
import * as cheerio from 'cheerio';
import { chunkArray } from '@/shared/utils/array.utils';
import { parseFirebaseDate } from '@/shared/utils/date.utils';

import { TransactionRepository } from '../repositories/transaction.repository';
import { Transaction } from '../models/transaction.model';
import { BaseService } from '@/shared/classes/base.service';

export class TransactionService extends BaseService<Transaction> {
  // Cambiar el tipo del repository para acceder a los métodos específicos
  protected repository: TransactionRepository;

  constructor(repository: TransactionRepository) {
    super(repository);
    // Guardar la referencia al repository tipado
    this.repository = repository;
  }

  // Otros métodos específicos del servicio
  async fetchBankEmails(userId: string): Promise<void> {
    console.warn(`🔍 Buscando emailToken para el usuario: ${userId}`);

    // 🔹 Verificar si ya hay un token guardado en Firestore
    const tokenData = await getTokenFromFirestore(userId);

    if (!tokenData) {
      throw new Error(
        "❌ No se encontró un token. Conéctate con Gmail nuevamente."
      );
    }

    // 🔹 Verificar si el token ha expirado
    if (new Date().getTime() > tokenData.expiryDate) {
      throw new Error(
        "❌ El token de Gmail ha expirado. Conéctate con Gmail nuevamente."
      );
    }

    // 🔹 Crear cliente OAuth con el token guardado
    const auth: Auth.OAuth2Client = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: tokenData.accessToken,
      refresh_token: tokenData.refreshToken,
      expiry_date: tokenData.expiryDate,
    });

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
      const existingIds = await this.repository.getExistingTransactionIds(
        messageIds
      );
      console.log(
        "Existing IDs#####################################:",
        existingIds
      );
      const newMessageIds = messageIds.filter(
        (id) => !existingIds.includes(id)
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
                "utf8"
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
          })
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
    part: gmail_v1.Schema$MessagePart
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
      /(?:US\$|CLP\$|\$)(\d{1,64}(?:[.,]\d{3})*(?:[.,]\d{2})?)/
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
      /Tarjeta de Crédito \*\*\*\*(\d{4})/
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
}
