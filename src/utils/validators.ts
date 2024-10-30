import { Quota } from "../models/quotaModel";
import { Transaction } from "../models/transactionModel";

export function validateTransactionData(data: Transaction) {
    if (!data.amount || !data.currency || !data.card_type || !data.card_last_digits || !data.merchant || !data.transaction_date || !data.bank || !data.email) {
        throw new Error('Faltan campos requeridos para crear una transacción.');
    }
    // Implementa aquí validaciones como fechas, montos, etc.
    return true; // Retorna true si es válido o lanza un error
}

export const validateQuotaData = (data: Quota) => {
    if (!data.transactionId || !data.amount || !data.due_date || !data.currency) {
        throw new Error('Faltan campos requeridos para crear cuotas.');
    }
};