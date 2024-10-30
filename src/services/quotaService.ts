import { quotaModel } from '../models/quotaModel';
import { Quota } from '../models/quotaModel';
import { transactionModel } from '../models/transactionModel';

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
    },
    async initializeQuota(transactionId: string) {
        const transaction = await transactionModel.getTransactionById(transactionId);

        if (!transaction) {
            throw new Error('Transacción no encontrada');
        }

        const quotaData = {
            transactionId: transactionId,
            amount: transaction.amount,
            due_date: new Date().toISOString(),  // Fecha estimada de vencimiento
            status: 'pending' as const,
            currency: transaction.currency
        };

        await quotaModel.createQuotaByTransaction(transactionId, quotaData);
        return quotaData;
    },

};
