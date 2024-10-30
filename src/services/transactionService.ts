import { gmail_v1, google } from 'googleapis';
import { authenticate } from '../config/gmailAuth';
import { Transaction, transactionModel } from '../models/transactionModel';
import * as cheerio from 'cheerio';

export const transactionService = {
    async getTransactionById(transactionId: string): Promise<Transaction | null> {
        return await transactionModel.getTransactionById(transactionId);
    },
    async addTransaction(data: Transaction) {
        return await transactionModel.createTransaction(data, 'messageId');
    },
    async getAllTransactions() {
        return await transactionModel.getAllTransactions();
    },
    async fetchBankEmails() {
        const auth = await authenticate();
        const gmail = google.gmail({ version: 'v1', auth });

        // Calcular el primer día del mes actual en formato YYYY/MM/DD
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const formattedDate = `${startOfMonth.getFullYear()}/${(startOfMonth.getMonth() + 1).toString().padStart(2, '0')}/${startOfMonth.getDate().toString().padStart(2, '0')}`;

        const query = `from:enviodigital@bancochile.cl subject:compra tarjeta crédito after:${formattedDate}`;
        const res = await gmail.users.messages.list({ userId: 'me', q: query });

        if (res.data.messages) {

            const messageIds = res.data.messages.map(message => message.id!);

            // Filtrar los messageIds que ya existen en Firestore
            const existingIds = await transactionModel.getExistingTransactionIds(messageIds);
            const newMessageIds = messageIds.filter(id => !existingIds.includes(id));

            console.log(`Procesando ${newMessageIds.length} nuevos correos`);

            let batchData: Transaction[] = [];

            for (const [index, messageId] of newMessageIds.entries()) {

                const email = await gmail.users.messages.get({ userId: 'me', id: messageId });
                let encodedMessage = email.data.payload?.body?.data;

                if (email.data.payload) {
                    encodedMessage = findHtmlOrPlainText(email.data.payload);
                }

                if (encodedMessage) {
                    const content = Buffer.from(encodedMessage, 'base64').toString('utf8');
                    const { amount, currency, cardLastDigits, merchant, transactionDate } = extractTransactionDataFromHtml(content);

                    if (amount && cardLastDigits && merchant && transactionDate) {
                        const transactionData: Transaction = {
                            id: messageId,
                            amount,
                            currency,
                            card_type: 'Tarjeta de Crédito',
                            card_last_digits: cardLastDigits,
                            merchant,
                            transaction_date: transactionDate,
                            bank: 'Banco de Chile',
                            email: 'enviodigital@bancochile.cl'
                        };

                        batchData.push(transactionData);

                        // Cada vez que acumulamos 5 transacciones, las guardamos en Firestore
                        if ((index + 1) % 5 === 0 || index + 1 === res.data.messages.length) {
                            await transactionModel.saveBatch(batchData);
                            console.log('Batch de 5 transacciones guardado.');
                            batchData = [];
                        }
                    }
                }
            }
        } else {
            console.log('No se encontraron correos de transacciones para este mes.');
        }
    },

    // ... otras funciones del servicio
};


// Función recursiva para buscar contenido HTML o texto plano en partes anidadas
export function findHtmlOrPlainText(part: gmail_v1.Schema$MessagePart): string | null | undefined {
    // Busca contenido HTML o texto plano directamente
    if (part.mimeType === "text/html" || part.mimeType === "text/plain") {
        return part.body?.data;
    }
    // Si la parte es multipart/alternative o multipart/mixed, explora sus subpartes
    else if ((part.mimeType === "multipart/alternative" || part.mimeType === "multipart/mixed") && part.parts) {
        for (const subPart of part.parts) {
            const result = findHtmlOrPlainText(subPart);
            if (result) return result;
        }
    }
    return undefined;
}

// Función para analizar contenido HTML y extraer la información
export function extractTransactionDataFromHtml(htmlContent: string) {
    const $ = cheerio.load(htmlContent);

    // Extraer el texto del elemento que contiene el mensaje principal
    const textContent = $('td:contains("compra por")').text();

    // Detectar la moneda y el monto
    const amountMatch = textContent.match(/(?:US\$|CLP\$|\$)(\d{1,64}(?:[.,]\d{3})*(?:[.,]\d{2})?)/);
    const currency = textContent.includes('US$') ? 'Dolar' : 'CLP';

    // Formatear el monto extraído para asegurar que siempre sea un número válido
    let amount = null;
    if (amountMatch) {
        const amountString = amountMatch[1].replace(/\./g, '').replace(',', '.');
        amount = parseFloat(amountString);
    }

    // Extraer otros datos
    const lastDigitsMatch = textContent.match(/Tarjeta de Crédito \*\*\*\*(\d{4})/);
    const merchantMatch = textContent.match(/en (.+?) el \d{2}\/\d{2}\/\d{4}/);
    const dateMatch = textContent.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);

    // Formatear otros datos extraídos
    const cardLastDigits = lastDigitsMatch ? lastDigitsMatch[1] : null;
    const merchant = merchantMatch ? merchantMatch[1].replace(/\s+/g, ' ').trim() : null;
    const transactionDate = dateMatch ? dateMatch[0] : null;

    return { amount, currency, cardLastDigits, merchant, transactionDate };
}
