import { Router } from 'express';
import { quotaController } from '../controllers/quotaController';

const router = Router();

router.post('/quotas', quotaController.createQuotas);
router.get('/quotas/:transactionId', quotaController.getQuotas);
router.patch('/quotas/:quotaId/pay', quotaController.markQuotaAsPaid);

export default router;
