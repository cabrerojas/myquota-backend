import { Request, Response } from 'express';
import { QuotaService } from '../services/quota.service';

export class QuotaController {
    constructor(private readonly service: QuotaService) { }


    addQuota = async (req: Request, res: Response): Promise<void> => {
        try {
            const quota = await this.service.create(req.body);
            res.status(201).json(quota);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error al agregar transacción', error });
        }
    }

    getQuotas = async (_: Request, res: Response): Promise<void> => {
        try {
            const quotas = await this.service.findAll();
            res.status(200).json(quotas);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error al obtener transacciones', error });
        }
    }

    getQuota = async (req: Request, res: Response): Promise<void> => {
        try {
            const { quotaId } = req.params;
            const quota = await this.service.findById(quotaId);
            if (!quota) {
                res.status(404).json({ message: 'Cuota no encontrada' });
            } else {
                res.status(200).json(quota);
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error al obtener la transacción', error });
        }
    }

    updateQuota = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const updatedData = req.body;
            const updatedQuota = await this.service.update(id, updatedData);
            if (updatedQuota) {
                res.status(200).json({ message: 'Cuota actualizada exitosamente' });
            } else {
                res.status(404).json({ message: 'Cuota no encontrada' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error al actualizar la transacción', error });
        }
    }

    deleteQuota = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const result = await this.service.softDelete(id);
            if (result) {
                res.status(200).json({ message: 'Cuota eliminada correctamente' });
            } else {
                res.status(404).json({ message: 'Cuota no encontrada' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Error al eliminar la transacción', error });
        }
    }

    initializeQuotasForAllTransactions = async (_: Request, res: Response): Promise<void> => {
        try {
            await this.service.initializeQuotasForAllTransactions();
            res.status(200).json({ message: 'Cuotas creadas para todas las transacciones que no tenían previamente.' });
        } catch (error) {
            console.error('Error al inicializar cuotas para todas las transacciones:', error);
            res.status(500).json({ message: 'Error al inicializar cuotas para todas las transacciones', error });
        }
    };

    /**
     * Controlador para obtener la sumatoria de las cuotas por mes.
     */
    getMonthlyQuota = async (_: Request, res: Response): Promise<void> => {
        try {
            console.warn('Obteniendo sumatoria de cuotas por mes...');
            const monthlySum = await this.service.getMonthlyQuotaSum();
            res.status(200).json({ monthlySum });
        } catch (error) {
            console.error('Error al obtener la sumatoria de cuotas por mes:', error);
            res.status(500).json({ message: 'Error al obtener la sumatoria de cuotas por mes', error });
        }
    };

    getQuotasByTransactionId = async (req: Request, res: Response): Promise<void> => {
        const { transactionId } = req.params;
        const quotas = await this.service.getQuotasByTransaction(transactionId);
        res.status(200).json(quotas);
    }

}