
import { format } from 'date-fns-tz';
import { transactionModel } from "../transaction/transaction.model";
import { Quota, quotaModel } from "./quota.model";
import { convertUtcToChileTime } from '../../utils/date.utils';



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
    async initializeQuotasForAllTransactions() {
        // Obtener todas las transacciones que no están eliminadas
        const transactions = await transactionModel.getAllTransactions();

        if (transactions.length === 0) {
            console.log('No se encontraron transacciones para procesar.');
            return;
        }

        // Obtener los IDs de las transacciones que ya tienen cuotas creadas
        const existingQuotas = await quotaModel.getAllQuotas();
        const existingTransactionIds = existingQuotas.map(quota => quota.transactionId);

        // Filtrar las transacciones que no tienen cuotas creadas
        const transactionsWithoutQuotas = transactions.filter(
            transaction => !existingTransactionIds.includes(transaction.id)
        );

        if (transactionsWithoutQuotas.length === 0) {
            console.log('Todas las transacciones ya tienen cuotas creadas.');
            return;
        }

        // Crear cuotas en paralelo usando Promise.all
        await Promise.all(
            transactionsWithoutQuotas.map(async (transaction) => {
                const quotaData = {
                    transactionId: transaction.id,
                    amount: transaction.amount,
                    due_date: new Date(), // Fecha estimada de vencimiento
                    status: 'pending' as const,
                    currency: transaction.currency
                };

                // Crear la cuota para la transacción
                await quotaModel.createQuotaByTransaction(transaction.id, quotaData);
                console.log(`Cuota creada para la transacción con ID ${transaction.id}`);
            })
        );

        console.log(`Cuotas creadas para ${transactionsWithoutQuotas.length} transacciones.`);
    },
    async getMonthlyQuotaSum(): Promise<{ month: string, totalAmount: number }[]> {
        try {

            console.log('Obteniendo sumatoria de cuotas por mes...');

            // Obtener todas las cuotas
            const quotas = await this.getAllQuotas();

            const monthlySumMap: { [month: string]: number } = {};


            quotas.forEach((quota: Quota) => {
                if (quota.due_date) {
                    const dueDate = Array.isArray(quota.due_date) ? quota.due_date[0] : quota.due_date;
                    const localDueDate = convertUtcToChileTime(dueDate);

                    const monthKey = format(localDueDate, 'yyyy-MM');

                    if (!monthlySumMap[monthKey]) {
                        monthlySumMap[monthKey] = 0;
                    }
                    monthlySumMap[monthKey] += quota.amount;
                }
            });

            // Convertir el objeto de sumas mensuales a un array de resultados
            const monthlySumArray = Object.entries(monthlySumMap).map(([month, totalAmount]) => ({
                month,
                totalAmount,
            }));

            return monthlySumArray;
        } catch (error) {
            console.error('Error al obtener la sumatoria de las cuotas por mes:', error);
            throw error;
        }
    },




};
