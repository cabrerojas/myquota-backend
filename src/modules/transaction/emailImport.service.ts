import { Auth, gmail_v1, google } from "googleapis";
import { getTokenFromFirestore } from "@config/gmailAuth";
import * as cheerio from "cheerio";
import { chunkArray } from "@/shared/utils/array.utils";
import { parseFirebaseDate } from "@/shared/utils/date.utils";

import { TransactionRepository } from "./transaction.repository";
import { Transaction } from "./transaction.model";
import { CategoryService } from "@/modules/category/category.service";

/**
 * Handles Gmail integration and bank-email parsing.
 *
 * Extracted from TransactionService to isolate external-API and HTML-parsing
 * concerns. This service is stateless; all dependencies are passed explicitly.
 */
export class EmailImportService {
  /**
   * Fetches new bank-notification emails from the user's Gmail inbox,
   * parses transaction data from the HTML body, and persists new records.
   *
   * @returns The number of newly imported transactions.
   */
  async fetchBankEmails(
    userId: string,
    repository: TransactionRepository,
  ): Promise<{ importedCount: number }> {
    const tokenData = await getTokenFromFirestore(userId);

    if (!tokenData) {
      throw new Error(
        "No se encontró un token de Gmail. Conéctate con Gmail nuevamente.",
      );
    }

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

    // Refresh expired token
    if (new Date().getTime() > tokenData.expiryDate) {
      if (!tokenData.refreshToken) {
        throw new Error(
          "El token de Gmail ha expirado y no hay refresh_token. Conéctate nuevamente.",
        );
      }
      try {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);

        const { saveTokenToFirestore } = await import("@config/gmailAuth");
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

    if (!res.data.messages) {
      return { importedCount: 0 };
    }

    const messageIds = res.data.messages.map((message) => message.id!);
    const existingIds = await repository.getExistingTransactionIds(messageIds);
    const newMessageIds = messageIds.filter((id) => !existingIds.includes(id));

    if (newMessageIds.length === 0) {
      return { importedCount: 0 };
    }

    const chunks = chunkArray(newMessageIds, 100);
    let batchData: Transaction[] = [];
    let totalImported = 0;

    // Pre-load merchant→category map once for all emails
    const categoryService = new CategoryService();
    let merchantMap: Map<string, { categoryId: string; categoryName: string }>;
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
                categoryId: undefined,
                transactionDate,
                bank: "Banco de Chile",
                email: "enviodigital@bancochile.cl",
                creditCardId: "",
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
              };

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
        await repository.saveBatch(batchData);
        batchData = [];
      }
    }

    return { importedCount: totalImported };
  }

  /**
   * Recursively searches a MIME message tree for the HTML (or plain-text) body.
   */
  private findHtmlOrPlainText(
    part: gmail_v1.Schema$MessagePart,
  ): string | null | undefined {
    if (part.mimeType === "text/html" || part.mimeType === "text/plain") {
      return part.body?.data;
    } else if (
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

  /**
   * Parses the HTML content of a Banco de Chile purchase notification
   * and extracts structured transaction data.
   */
  private extractTransactionDataFromHtml(htmlContent: string) {
    const $ = cheerio.load(htmlContent);

    const textContent = $('td:contains("compra por")').text();

    // Detect currency and amount
    const amountMatch = textContent.match(
      /(?:US\$|CLP\$|\$)(\d{1,64}(?:[.,]\d{3})*(?:[.,]\d{2})?)/,
    );
    const currency = textContent.includes("US$") ? "USD" : "CLP";

    let amount = null;
    if (amountMatch) {
      const amountString = amountMatch[1].replace(/\./g, "").replace(",", ".");
      amount = parseFloat(amountString);
    }

    const lastDigitsMatch = textContent.match(
      /Tarjeta de Crédito \*\*\*\*(\d{4})/,
    );
    const merchantMatch = textContent.match(/en (.+?) el \d{2}\/\d{2}\/\d{4}/);
    const dateMatch = textContent.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);

    const cardLastDigits = lastDigitsMatch ? lastDigitsMatch[1] : null;
    const merchant = merchantMatch
      ? merchantMatch[1].replace(/\s+/g, " ").trim()
      : null;
    const transactionDate = dateMatch ? parseFirebaseDate(dateMatch[0]) : null;

    return { amount, currency, cardLastDigits, merchant, transactionDate };
  }
}
