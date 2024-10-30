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
    async updateQuotaById(id: string, updatedData: Partial<Quota>) {
        // Validación de la cuota o lógica adicional si es necesaria
        if (!id || !updatedData) {
            throw new Error('ID de cuota y datos actualizados son requeridos.');
        }
        return await quotaModel.updateQuota(id, updatedData);
    },
    async getAllQuotas(): Promise<Quota[]> {
        return await quotaModel.getAllQuotas();
    },
    async deleteQuotaById(quotaId: string): Promise<void> {
        await quotaModel.deleteQuotaById(quotaId);
    },




};
