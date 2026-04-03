import { Auth, gmail_v1, google } from "googleapis";
import { createHash } from "crypto";
import { getTokenFromFirestore, saveTokenToFirestore } from "@config/gmailAuth";
import * as cheerio from "cheerio";
import { chunkArray } from "@/shared/utils/array.utils";
import { parseFirebaseDate } from "@/shared/utils/date.utils";
import { getEnv } from "@config/env.validation";

import { CreditCardRepository } from "@modules/creditCard/creditCard.repository";
import { TransactionRepository } from "./transaction.repository";
import { Transaction } from "./transaction.model";
import { AuthError } from "@shared/errors/custom.error";

type MerchantCategoryMap = Map<string, { categoryId: string; categoryName: string }>;
export type CategoryMatcher = {
  buildMerchantCategoryMapAsync: () => Promise<MerchantCategoryMap>;
};
export class EmailImportService {
  async fetchBankEmails(
    userId: string,
    creditCardRepository: CreditCardRepository,
    categoryService: CategoryMatcher,
  ): Promise<{ importedCount: number }> {
    const tokenData = await getTokenFromFirestore(userId);

    if (!tokenData) {
      throw new AuthError(
        "No se encontró un token de Gmail. Conéctate con Gmail nuevamente.",
      );
    }

    const env = getEnv();
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const oauthClient: Auth.OAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
    );
    oauthClient.setCredentials({
      access_token: tokenData.accessToken,
      refresh_token: tokenData.refreshToken,
      expiry_date: tokenData.expiryDate,
    });

    if (new Date().getTime() > tokenData.expiryDate) {
      if (!tokenData.refreshToken) {
        throw new AuthError(
          "El token de Gmail ha expirado y no hay refresh_token. Conéctate nuevamente.",
        );
      }
      try {
        const { credentials } = await oauthClient.refreshAccessToken();
        oauthClient.setCredentials(credentials);

        await saveTokenToFirestore(userId, {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || tokenData.refreshToken,
          expiry_date: credentials.expiry_date,
        });
      } catch (refreshError) {
        console.error(
          "Error renovando token de Gmail:",
          refreshError instanceof Error
            ? refreshError.message
            : "Error desconocido",
        );
        throw new AuthError(
          "No se pudo renovar el token de Gmail. Conéctate nuevamente.",
        );
      }
    }

    const gmail = google.gmail({ version: "v1", auth: oauthClient });

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
    const chunks = chunkArray(messageIds, 100);
    let totalImported = 0;

    let merchantMap: MerchantCategoryMap;
    try {
      merchantMap = await categoryService.buildMerchantCategoryMapAsync();
    } catch (err) {
      console.error(
        "Error pre-cargando merchant map:",
        err instanceof Error ? err.message : "Error desconocido",
      );
      merchantMap = new Map();
    }

    const creditCards = await creditCardRepository.findAll();
    const transactionRepositoryByCard = new Map<string, TransactionRepository>(
      creditCards.map((card) => [
        card.id,
        new TransactionRepository(userId, card.id),
      ]),
    );

    for (const chunk of chunks) {
      const batchData = (
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

            if (!encodedMessage) {
              return null;
            }

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

            if (!(amount && cardLastDigits && merchant && transactionDate)) {
              return null;
            }

            const transactionData: Transaction = {
              id: this.buildDeterministicTransactionId({
                amount,
                currency,
                cardLastDigits,
                merchant,
                transactionDate,
                bank: "Banco de Chile",
              }),
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
              source: "email",
            };

            const match = this.matchMerchantInMap(merchant, merchantMap);
            if (match) {
              transactionData.categoryId = match.categoryId;
            }

            return transactionData;
          }),
        )
      ).filter((transaction): transaction is Transaction => !!transaction);

      if (batchData.length > 0) {
        totalImported += await this.saveBatch(
          creditCardRepository,
          transactionRepositoryByCard,
          batchData,
        );
      }
    }

    return { importedCount: totalImported };
  }

  private buildDeterministicTransactionId(params: {
    amount: number;
    currency: string;
    cardLastDigits: string;
    merchant: string;
    transactionDate: Date;
    bank: string;
  }): string {
    const normalizedMerchant = params.merchant
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    const amountCents = Math.round(params.amount * 100);
    const identity = [
      params.bank.toUpperCase(),
      params.cardLastDigits,
      params.currency.toUpperCase(),
      amountCents.toString(),
      normalizedMerchant,
      params.transactionDate.toISOString(),
    ].join("|");

    return createHash("sha256").update(identity).digest("hex").slice(0, 32);
  }

  private async saveBatch(
    creditCardRepository: CreditCardRepository,
    transactionRepositoryByCard: Map<string, TransactionRepository>,
    transactions: Transaction[],
  ): Promise<number> {
    const creditCards = await creditCardRepository.findAll();
    const byLastDigits = new Map<string, string[]>();

    for (const card of creditCards) {
      const existing = byLastDigits.get(card.cardLastDigits) ?? [];
      existing.push(card.id);
      byLastDigits.set(card.cardLastDigits, existing);
    }

    const createdFlags = await Promise.all(
      transactions.map(async (transaction) => {
        const matchingCards = byLastDigits.get(transaction.cardLastDigits) ?? [];

        if (!matchingCards.length) {
          return false;
        }

        const matchedCreditCardId = [...matchingCards].sort()[0];
        transaction.creditCardId = matchedCreditCardId;

        const transactionRepository = transactionRepositoryByCard.get(
          matchedCreditCardId,
        );

        if (!transactionRepository) {
          return false;
        }

        return transactionRepository.addIfAbsent(transaction);
      }),
    );

    return createdFlags.filter(Boolean).length;
  }

  private matchMerchantInMap(
    merchantName: string,
    map: MerchantCategoryMap,
  ): { categoryId: string; categoryName: string } | null {
    for (const [pattern, cat] of map) {
      if (merchantName.toUpperCase().includes(pattern)) {
        return cat;
      }
    }

    return null;
  }

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

  private extractTransactionDataFromHtml(htmlContent: string) {
    const $ = cheerio.load(htmlContent);

    const textContent = $('td:contains("compra por")').text();

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
