import { Router } from 'express';
import { createQuotas, deleteQuota, getAllQuotas, getMonthlyQuota, getQuotas, initializeQuota, initializeQuotasForAllTransactions, markQuotaAsPaid, updateQuota } from './quota.controller';

const quotaRoutes = Router();

quotaRoutes.get('/quotas', getAllQuotas);
quotaRoutes.post('/quotas', createQuotas);
/**
 * @route GET /api/quotas/monthly-sum
 * @desc Endpoint para obtener la sumatoria de cuotas por mes
 * @access Público
 */
quotaRoutes.get('/quotas/monthly-sum', getMonthlyQuota);
quotaRoutes.get('/quotas/:transactionId', getQuotas);
quotaRoutes.put('/quotas/:id', updateQuota);
quotaRoutes.delete('/quotas/:id', deleteQuota);
quotaRoutes.post('/quotas/initialize-by-transaction/:transactionId', initializeQuota);
quotaRoutes.patch('/quotas/:quotaId/pay', markQuotaAsPaid);
quotaRoutes.post('/quotas/initialize-quotas', initializeQuotasForAllTransactions);


export default quotaRoutes;
