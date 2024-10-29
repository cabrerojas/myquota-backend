import { quotaModel } from '../models/quotaModel';
import { Quota } from '../models/quotaModel';

export const quotaService = {
    async createQuotasForTransaction(transactionId: string, amount: number, numQuotas: number, dueDates: string[], currency: string) {
        const quotaAmount = amount / numQuotas;

        const quotas: Quota[] = dueDates.map(dueDate => ({
            transactionId,
            amount: quotaAmount,
            due_date: dueDate,
            status: 'pending',
            currency
        }));

        for (const quota of quotas) {
            await quotaModel.createQuota(quota);
        }
    },

    async getQuotasByTransaction(transactionId: string) {
        return await quotaModel.getQuotasByTransactionId(transactionId);
    },

    async markQuotaAsPaid(quotaId: string, paymentDate: string) {
        await quotaModel.updateQuotaStatus(quotaId, 'paid', paymentDate);
    }
};
