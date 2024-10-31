import { Router } from 'express';
import { createQuotas, deleteQuota, getAllQuotas, getQuotas, initializeQuota, markQuotaAsPaid, updateQuota } from './quota.controller';

const quotaRoutes = Router();

quotaRoutes.get('/quotas', getAllQuotas);
quotaRoutes.post('/quotas', createQuotas);
quotaRoutes.get('/quotas/:transactionId', getQuotas);
quotaRoutes.put('/quotas/:id', updateQuota);
quotaRoutes.delete('/quotas/:id', deleteQuota);
quotaRoutes.post('/quotas/initialize-by-transaction/:transactionId', initializeQuota);
quotaRoutes.patch('/quotas/:quotaId/pay', markQuotaAsPaid);

export default quotaRoutes;
