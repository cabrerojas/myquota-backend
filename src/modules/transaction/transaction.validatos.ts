import { Quota } from "../quota/quota.model";

export const validateQuotaData = (data: Quota) => {
    if (!data.transactionId || !data.amount || !data.due_date || !data.currency) {
        throw new Error('Faltan campos requeridos para crear cuotas.');
    }
};