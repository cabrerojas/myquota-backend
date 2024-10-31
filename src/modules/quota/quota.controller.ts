import { Request, Response } from 'express';
import { quotaService } from './quota.service';

export const createQuotas = async (req: Request, res: Response) => {
    const { transactionId, amount, numQuotas, dueDates, currency } = req.body;
    await quotaService.createQuotasForTransaction(transactionId, amount, numQuotas, dueDates, currency);
    res.status(201).json({ message: 'Cuotas creadas exitosamente.' });
}

export const getQuotas = async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const quotas = await quotaService.getQuotasByTransaction(transactionId);
    res.status(200).json(quotas);
}

export const markQuotaAsPaid = async (req: Request, res: Response) => {
    const { quotaId } = req.params;
    const { paymentDate } = req.body;
    await quotaService.markQuotaAsPaid(quotaId, paymentDate);
    res.status(200).json({ message: 'Cuota marcada como pagada.' });
}

export const initializeQuota = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.params;
        const quotaData = await quotaService.initializeQuota(transactionId);

        res.status(200).json({ message: 'Cuota inicializada y guardada en la colección de cuotas', quota: quotaData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al inicializar la cuota', error });
    }
};

export const updateQuota = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        await quotaService.updateQuotaById(id, updatedData);
        res.status(200).json({ message: 'Cuota actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar la cuota', error });
    }
};

export const getAllQuotas = async (req: Request, res: Response) => {
    try {
        const quotas = await quotaService.getAllQuotas();
        res.status(200).json(quotas);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener las cuotas', error });
    }
};

export const deleteQuota = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await quotaService.deleteQuotaById(id);
        res.status(200).json({ message: 'Cuota eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar la cuota', error });
    }
};




