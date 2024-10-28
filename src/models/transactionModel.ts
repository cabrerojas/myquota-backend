import { db } from '../config/firebase';

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

export async function saveBatch(transactions: Array<{ id: string;[key: string]: any }>) {
    const batch = db.batch();

    // Crea una lista de referencias a documentos usando los IDs de los correos
    const transactionRefs = transactions.map(transaction => db.collection('transactions').doc(transaction.id));

    // Verifica cuáles de esos documentos ya existen en Firestore
    const existingDocs = await db.getAll(...transactionRefs);
    const existingIds = existingDocs
        .filter(doc => doc.exists) // Filtra solo los documentos que existen
        .map(doc => doc.id);       // Obtiene los IDs de los documentos existentes

    // Filtra las transacciones que aún no existen en la colección
    const newTransactions = transactions.filter(transaction => !existingIds.includes(transaction.id));

    // Agrega las transacciones nuevas al batch
    newTransactions.forEach(transaction => {
        const transactionRef = db.collection('transactions').doc(transaction.id);
        batch.set(transactionRef, transaction);
    });

    try {
        await batch.commit();
        console.log(`Lote de transacciones guardado exitosamente en Firestore. Total de nuevos registros: ${newTransactions.length}`);
    } catch (error) {
        console.error('Error al guardar el lote de transacciones en Firestore:', error);
    }
};


// Función para guardar una transacción en Firestore solo si no existe el mensaje con el messageId como ID de documento
export async function createTransaction(transactionData: any, messageId: string) {
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
}

export async function getAllTransactions(): Promise<Transaction[]> {
    const snapshot = await db.collection('transactions').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
}
