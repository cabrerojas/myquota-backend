import { Request, Response } from 'express';
import { quotaService } from '../services/quotaService';

export const quotaController = {
    async createQuotas(req: Request, res: Response) {
        const { transactionId, amount, numQuotas, dueDates, currency } = req.body;
        await quotaService.createQuotasForTransaction(transactionId, amount, numQuotas, dueDates, currency);
        res.status(201).json({ message: 'Cuotas creadas exitosamente.' });
    },

    async getQuotas(req: Request, res: Response) {
        const { transactionId } = req.params;
        const quotas = await quotaService.getQuotasByTransaction(transactionId);
        res.status(200).json(quotas);
    },

    async markQuotaAsPaid(req: Request, res: Response) {
        const { quotaId } = req.params;
        const { paymentDate } = req.body;
        await quotaService.markQuotaAsPaid(quotaId, paymentDate);
        res.status(200).json({ message: 'Cuota marcada como pagada.' });
    }
};
