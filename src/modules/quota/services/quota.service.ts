
import { Quota } from '../models/quota.model';
import { QuotaRepository } from '../repositories/quota.repository';
import { convertUtcToChileTime } from '@/shared/utils/date.utils';
import { format } from 'date-fns-tz';
import { BaseService } from '@/shared/classes/base.service';


export class QuotaService extends BaseService<Quota> {
    // Cambiar el tipo del repository para acceder a los métodos específicos
    protected repository: QuotaRepository;

    constructor(repository: QuotaRepository) {
        super(repository);
        // Guardar la referencia al repository tipado
        this.repository = repository;
    }

    // Otros métodos específicos del servicio

    async initializeQuotasForAllTransactions() {
        // Obtener todas las transacciones que no están eliminadas
        const transactions = await this.repository.findAll();

        console.log('transactions', transactions);

        if (transactions.length === 0) {
            console.log('No se encontraron transacciones para procesar.');
            return;
        }

        // Obtener los IDs de las transacciones que ya tienen cuotas creadas
        const existingQuotas = await this.repository.findAll();
        const existingQuotaIds = existingQuotas.map(quota => quota.transactionId);

        // Filtrar las transacciones que no tienen cuotas creadas
        const transactionsWithoutQuotas = transactions.filter(
            transaction => !existingQuotaIds.includes(transaction.id)
        );

        if (transactionsWithoutQuotas.length === 0) {
            console.log('Todas las transacciones ya tienen cuotas creadas.');
            return;
        }

        // Crear cuotas en paralelo usando Promise.all
        await Promise.all(
            transactionsWithoutQuotas.map(async (transaction) => {
                const quotaData: Quota = {
                    transactionId: transaction.id,
                    amount: transaction.amount,
                    due_date: new Date(), // Fecha estimada de vencimiento
                    status: 'pending' as const,
                    currency: transaction.currency,
                    id: '',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Crear la cuota para la transacción
                await this.repository.create(quotaData);
                console.log(`Cuota creada para la transacción con ID ${transaction.id}`);
            })
        );

        console.log(`Cuotas creadas para ${transactionsWithoutQuotas.length} transacciones.`);
    }

    async getMonthlyQuotaSum(): Promise<{ month: string, totalAmount: number }[]> {
        try {

            console.log('Obteniendo sumatoria de cuotas por mes...');

            // Obtener todas las cuotas
            const quotas = await this.repository.findAll();

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
    }

    async getQuotasByTransaction(transactionId: string) {
        return await this.repository.getQuotasByTransactionId(transactionId);
    }
}
