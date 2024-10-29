import { db } from "../config/firebase";

export type Quota = {
    id?: string;
    transactionId: string;
    amount: number;
    due_date: string;
    status: 'pending' | 'paid';
    currency: string;
    payment_date?: string;
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
    }
};
