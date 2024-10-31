
import { Collection, getRepository } from 'fireorm';

@Collection('quotas')
export class Quota {
    id!: string; // Fireorm requiere un ID explícito
    transactionId!: string;       // ID de la transacción asociada
    amount!: number;              // Monto de la cuota
    due_date!: Date | Date[];            // Fecha de vencimiento de la cuota
    status!: 'pending' | 'paid';  // Estado de la cuota
    currency!: string;            // Moneda de la cuota
    payment_date?: Date;        // Fecha de pago de la cuota (opcional)
    createdAt?: Date;             // Fecha de creación
    isDeleted?: boolean;          // Soft delete flag

}

// Obtener el repositorio para Quota
const quotaRepository = getRepository(Quota);

export const quotaModel = {
    async createQuota(quotaData: Omit<Quota, 'id'>) {
        const quota = await quotaRepository.create({ ...quotaData, createdAt: new Date(), isDeleted: false });
        return quota.id;
    },

    async getQuotasByTransactionId(transactionId: string) {
        const quotas = await quotaRepository
            .whereEqualTo('transactionId', transactionId)
            .whereEqualTo('isDeleted', false) // Filtrar por cuotas que no están eliminadas
            .find();
        return quotas;
    },

    async updateQuotaStatus(quotaId: string, status: 'pending' | 'paid', paymentDate?: Date) {
        const quota = await quotaRepository.findById(quotaId);
        if (quota && !quota.isDeleted) {
            quota.status = status;
            if (paymentDate) quota.payment_date = paymentDate;
            await quotaRepository.update(quota);
        }
    },
    async createQuotaByTransaction(transactionId: string, quotaData: Omit<Quota, 'id' | 'transactionId' | 'createdAt'>) {
        await quotaRepository.create({
            ...quotaData,
            transactionId,
            createdAt: new Date(),
            isDeleted: false
        });
    },
    async updateQuota(id: string, updatedData: Partial<Omit<Quota, 'id'>>) {
        try {
            const quota = await quotaRepository.findById(id);
            if (quota && !quota.isDeleted) {
                Object.assign(quota, updatedData);
                await quotaRepository.update(quota);
                console.log(`Cuota ${id} actualizada exitosamente.`);
            }
        } catch (error) {
            console.error(`Error al actualizar la cuota ${id}:`, error);
            throw error;
        }
    },
    async getAllQuotas(): Promise<Quota[]> {
        try {
            const quotas = await quotaRepository.whereEqualTo('isDeleted', false).find();
            return quotas;
        } catch (error) {
            console.error('Error al obtener todas las cuotas:', error);
            throw error;
        }
    },
    async deleteQuotaById(quotaId: string): Promise<void> {
        try {
            const quota = await quotaRepository.findById(quotaId);
            if (quota) {
                quota.isDeleted = true;
                await quotaRepository.update(quota);
                console.log(`Cuota con ID ${quotaId} marcada como eliminada (soft delete).`);
            }
        } catch (error) {
            console.error('Error al eliminar la cuota:', error);
            throw error;
        }
    },


};
