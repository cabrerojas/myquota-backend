import { Router } from 'express';
import { createQuotas, getQuotas, initializeQuota, markQuotaAsPaid } from '../controllers/quotaController';

const router = Router();

router.post('/quotas', createQuotas);
router.get('/quotas/:transactionId', getQuotas);
router.patch('/quotas/:quotaId/pay', markQuotaAsPaid);
router.post('/quotas/initialize-by-transaction/:transactionId', initializeQuota);



export default router;
