import { Collection, getRepository } from 'fireorm';
import { chunkArray } from '../../utils/array.utils';
@Collection('transactions')
export class Transaction {
    id!: string; // Fireorm requiere un ID explícito
    amount!: number;        // Monto de la transacción
    currency!: string;     // Moneda de la transacción
    card_type!: string;      // Tipo de tarjeta, por ejemplo, "Tarjeta de Crédito"
    cardLast_digits!: string; // Últimos cuatro dígitos de la tarjeta utilizada
    merchant!: string;     // Nombre del comercio donde se realizó la transacción
    transaction_date!: Date;  // Fecha y hora de la transacción
    bank!: string;         // Nombre del banco emisor
    email!: string;       // Correo desde el cual se envió el mensaje
    isDeleted?: boolean = false; // Soft delete flag, por defecto false
}


const transactionRepository = getRepository(Transaction);

export const transactionModel = {
    // Obtener todas las transacciones ordenadas por fecha, sin las eliminadas
    async getAllTransactions() {
        return await transactionRepository
            .whereEqualTo('isDeleted', false)
            .orderByDescending('transaction_date')
            .find();
    },
    // Obtener una transacción por su ID, si no está eliminada
    async getTransactionById(transactionId: string): Promise<Transaction | null> {
        try {
            const transaction = await transactionRepository.findById(transactionId);
            return transaction.isDeleted ? null : transaction;
        } catch (error) {
            console.error(`Error al obtener la transacción con ID ${transactionId}:`, error);
            return null;
        }
    },
    // Obtener IDs de transacciones existentes en Firestore
    async getExistingTransactionIds(ids: string[]): Promise<string[]> {
        const chunks = chunkArray(ids, 10);
        const results = await Promise.all(
            chunks.map(async (chunk) => {
                const transactions = await transactionRepository
                    .whereIn('id', chunk)
                    .whereEqualTo('isDeleted', false)
                    .find();
                return transactions.map(transaction => transaction.id);
            })
        );
        return results.flat();
    },
    // Guardar un lote de transacciones
    async saveBatch(transactions: Transaction[]) {
        try {
            await Promise.all(
                transactions.map(async (transaction) => {
                    await transactionRepository.create({ ...transaction, isDeleted: false });
                })
            );
            console.log(`Lote de transacciones guardado exitosamente en Firestore. Total de registros: ${transactions.length}`);
        } catch (error) {
            console.error('Error al guardar el lote de transacciones en Firestore:', error);
        }
    },
    // Crear una nueva transacción solo si no existe
    async createTransaction(transactionData: Transaction, messageId: string) {
        try {
            const exists = await transactionRepository.findById(messageId).then(() => true).catch(() => false);
            if (exists) {
                console.log(`La transacción con ID ${messageId} ya existe en Firestore, no se guardará nuevamente.`);
            } else {
                await transactionRepository.create({ ...transactionData, id: messageId, isDeleted: false });
                console.log('Transacción guardada en Firestore:', transactionData);
            }
        } catch (error) {
            console.error('Error al guardar la transacción en Firestore:', error);
        }
    },
    // Actualizar una transacción por su ID, si no está eliminada
    async updateTransaction(id: string, updatedData: Partial<Transaction>) {
        try {
            const transaction = await transactionRepository.findById(id);
            if (!transaction.isDeleted) {
                const updatedTransaction = { ...transaction, ...updatedData };
                await transactionRepository.update(updatedTransaction);
                console.log(`Transacción ${id} actualizada exitosamente.`);
            } else {
                console.log(`No se puede actualizar la transacción ${id} porque está eliminada.`);
            }
        } catch (error) {
            console.error(`Error al actualizar la transacción ${id}:`, error);
            throw error;
        }
    },
    // Soft delete de una transacción por su ID
    async deleteTransactionById(transactionId: string): Promise<void> {
        try {
            const transaction = await transactionRepository.findById(transactionId);
            transaction.isDeleted = true;
            await transactionRepository.update(transaction);
            console.log(`Transacción con ID ${transactionId} marcada como eliminada (soft delete).`);
        } catch (error) {
            console.error('Error al eliminar la transacción:', error);
            throw error;
        }
    },
    // ... otras funciones del modelo
};

