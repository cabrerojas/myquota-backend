export function validateTransactionData(data: any) {
    // Implementa aquí validaciones como fechas, montos, etc.
    return true; // Retorna true si es válido o lanza un error
}

export const validateQuotaData = (data: any) => {
    if (!data.transactionId || !data.amount || !data.dueDates || !data.currency) {
        throw new Error('Faltan campos requeridos para crear cuotas.');
    }
};