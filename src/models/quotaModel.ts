import { db } from "../config/firebase";

export type Quota = {
    id?: string;
    transactionId: string;       // ID de la transacción asociada
    amount: number;              // Monto de la cuota
    due_date: string;            // Fecha de vencimiento de la cuota
    status: 'pending' | 'paid';  // Estado de la cuota
    currency: string;            // Moneda de la cuota
    payment_date?: string;       // Fecha de pago de la cuota (opcional)
};

export const quotaModel = {
    async createQuota(quotaData: Quota) {
        const quotaRef = db.collection('quotas').doc();
        await quotaRef.set(quotaData);
        return quotaRef.id;
    },

    async getQuotasByTransactionId(transactionId: string) {
        const quotasSnapshot = await db.collection('quotas')
            .where('transactionId', '==', transactionId)
            .get();
        return quotasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async updateQuotaStatus(quotaId: string, status: 'pending' | 'paid', paymentDate?: string) {
        const quotaRef = db.collection('quotas').doc(quotaId);
        const updateData = paymentDate ? { status, payment_date: paymentDate } : { status };
        await quotaRef.update(updateData);
    },
    async createQuotaByTransaction(transactionId: string, quotaData: Quota) {
        const quotaRef = db.collection('quotas').doc();
        await quotaRef.set({
            ...quotaData,
            transactionId,
            createdAt: new Date()
        });
    },

};
