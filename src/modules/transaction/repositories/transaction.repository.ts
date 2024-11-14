import { FirestoreRepository } from '@/shared/classes/firestore.repository';
import { Transaction } from '../models/transaction.model';
import { chunkArray } from '@/shared/utils/array.utils';

export class TransactionRepository extends FirestoreRepository<Transaction> {

    constructor() {
        super('transactions'); // Define el nombre de la colección aquí
    }

    // Puedes agregar métodos específicos de repositorio aquí si es necesario

    // Obtener IDs de transacciones existentes en Firestore
    async getExistingTransactionIds(ids: string[]): Promise<string[]> {
        const chunks = chunkArray(ids, 10);
        const results = await Promise.all(
            chunks.map(async (chunk) => {
                const transactions = await this.repository
                    .whereIn('id', chunk)
                    .whereEqualTo('deletedAt', null)
                    .find();
                return transactions.map(transaction => transaction.id);
            })
        );
        return results.flat();
    }

    // Guardar un lote de transacciones
    async saveBatch(transactions: Transaction[]): Promise<void> {
        try {
            await Promise.all(
                transactions.map(async (transaction) => {
                    await this.create({ ...transaction });
                })
            );
            console.warn(`Lote de transacciones guardado exitosamente en Firestore. Total de registros: ${transactions.length}`);
        } catch (error) {
            console.error('Error al guardar el lote de transacciones en Firestore:', error);
            throw error; // Propaga el error para manejo en niveles superiores
        }
    }
}