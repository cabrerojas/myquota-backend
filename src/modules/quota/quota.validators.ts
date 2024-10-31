import { Transaction } from "../transaction/transaction.model";

export function validateTransactionData(data: Transaction) {
    if (!data.amount || !data.currency || !data.card_type || !data.card_last_digits || !data.merchant || !data.transaction_date || !data.bank || !data.email) {
        throw new Error('Faltan campos requeridos para crear una transacción.');
    }
    // Implementa aquí validaciones como fechas, montos, etc.
    return true; // Retorna true si es válido o lanza un error
}