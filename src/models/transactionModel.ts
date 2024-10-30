import { db } from '../config/firebase';
import { FieldPath } from 'firebase-admin/firestore';
import { chunkArray } from '../utils/arrayUtils';

export type Transaction = {
    id?: string;
    amount: number;            // Monto de la transacción
    currency: string;
    card_type: string;          // Tipo de tarjeta, por ejemplo, "Tarjeta de Crédito"
    card_last_digits: string;   // Últimos cuatro dígitos de la tarjeta utilizada
    merchant: string;           // Nombre del comercio donde se realizó la transacción
    transaction_date: string;   // Fecha y hora de la transacción
    bank: string;               // Nombre del banco emisor
    email: string;              // Correo desde el cual se envió el mensaje
};


export const transactionModel = {
    async getTransactionById(transactionId: string): Promise<Transaction | null> {
        try {
            const transactionRef = db.collection('transactions').doc(transactionId);
            const doc = await transactionRef.get();

            if (!doc.exists) {
                console.log(`Transacción con ID ${transactionId} no encontrada.`);
                return null;
            }

            // Valida el contenido del documento para evitar errores de tipo
            const transactionData = doc.data();
            if (!transactionData) {
                console.log(`El documento con ID ${transactionId} no contiene datos válidos.`);
                return null;
            }

            return transactionData as Transaction;
        } catch (error) {
            console.error(`Error al obtener la transacción con ID ${transactionId}:`, error);
            throw new Error(`No se pudo obtener la transacción con ID ${transactionId}`);
        }
    },
    async getExistingTransactionIds(ids: string[]): Promise<string[]> {
        const existingIds: string[] = [];
        const idChunks = chunkArray(ids, 30); // Divide los IDs en lotes de 30

        for (const chunk of idChunks) {
            const snapshots = await db.collection('transactions')
                .where(FieldPath.documentId(), 'in', chunk)
                .get();

            snapshots.forEach(doc => {
                existingIds.push(doc.id);
            });
        }

        return existingIds;
    },
    async saveBatch(transactions: Transaction[]) {
        const batch = db.batch();

        // Agrega todas las transacciones al batch directamente, sin verificar la existencia
        transactions.forEach(transaction => {
            const transactionRef = db.collection('transactions').doc(transaction.id!);
            batch.set(transactionRef, transaction);
        });

        try {
            await batch.commit();
            console.log(`Lote de transacciones guardado exitosamente en Firestore. Total de registros: ${transactions.length}`);
        } catch (error) {
            console.error('Error al guardar el lote de transacciones en Firestore:', error);
        }
    },
    async createTransaction(transactionData: Transaction, messageId: string) {
        try {
            // Crea una referencia al documento usando el messageId
            const transactionRef = db.collection('transactions').doc(messageId);

            // Verifica si el documento ya existe en Firestore
            const doc = await transactionRef.get();

            if (doc.exists) {
                console.log(`La transacción con ID ${messageId} ya existe en Firestore, no se guardará nuevamente.`);
            } else {
                // Guarda la transacción en Firestore ya que no existe previamente
                await transactionRef.set(transactionData, { merge: true });
                console.log('Transacción guardada en Firestore:', transactionData);
            }
        } catch (error) {
            console.error('Error al guardar la transacción en Firestore:', error);
        }
    },
    async getAllTransactions(): Promise<Transaction[]> {
        const snapshot = await db.collection('transactions').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
    },
    async updateTransaction(id: string, updatedData: Partial<Transaction>) {
        try {
            const transactionRef = db.collection('transactions').doc(id);
            await transactionRef.update(updatedData);
            console.log(`Transacción ${id} actualizada exitosamente.`);
        } catch (error) {
            console.error(`Error al actualizar la transacción ${id}:`, error);
            throw error;
        }
    },
    async deleteTransactionById(transactionId: string): Promise<void> {
        try {
            const transactionRef = db.collection('transactions').doc(transactionId);
            await transactionRef.delete();
            console.log(`Transacción con ID ${transactionId} eliminada correctamente.`);
        } catch (error) {
            console.error('Error al eliminar la transacción:', error);
            throw error;
        }
    },


    // ... otras funciones del modelo
};

