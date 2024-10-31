import { transactionModel } from "../transaction/transaction.model";
import { Quota, quotaModel } from "./quota.model";



export const quotaService = {
    async createQuotasForTransaction(transactionId: string, amount: number, numQuotas: number, dueDates: Date[], currency: string) {
        const quotaAmount = amount / numQuotas;

        const quotas: Quota[] = dueDates.map((dueDate, index) => ({
            id: `${transactionId}-${index}`, // Generate a unique id for each quota
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
    async markQuotaAsPaid(quotaId: string, paymentDate: Date) {
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
            due_date: new Date(),  // Fecha estimada de vencimiento
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
