import { Router } from 'express';
import { createQuotas, deleteQuota, getAllQuotas, getQuotas, initializeQuota, markQuotaAsPaid, updateQuota } from '../controllers/quotaController';

const router = Router();

router.get('/quotas', getAllQuotas);
router.post('/quotas', createQuotas);
router.get('/quotas/:transactionId', getQuotas);
router.put('/quotas/:id', updateQuota);
router.delete('/quotas/:id', deleteQuota);
router.post('/quotas/initialize-by-transaction/:transactionId', initializeQuota);
router.patch('/quotas/:quotaId/pay', markQuotaAsPaid);

export default router;
