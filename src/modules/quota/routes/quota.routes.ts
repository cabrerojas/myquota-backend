import { Router } from "express";
import { QuotaController } from "../controllers/quota.controller";
import { QuotaRepository } from "../repositories/quota.repository";
import { QuotaService } from "../services/quota.service";


// Crear una función factory para la inicialización de dependencias
const createQuotaRouter = (): Router => {
    // Inicialización de dependencias
    const repository = new QuotaRepository();
    const service = new QuotaService(repository);
    const controller = new QuotaController(service);

    const router = Router();

    // Definir rutas
    router
        .get('/quotas', controller.getQuotas.bind(controller))
        .post('/quota', controller.addQuota.bind(controller))
        .get('/quotas/transaction/:transactionId', controller.getQuotasByTransactionId.bind(controller))
        .get('/quotas/monthly-sum', controller.getMonthlyQuota.bind(controller))
        .get('/quotas/:quotaId', controller.getQuota.bind(controller))
        .put('/quotas/:id', controller.updateQuota.bind(controller))
        .delete('/quotas/:id', controller.deleteQuota.bind(controller))
        .post('/quotas/initialize-quotas', controller.initializeQuotasForAllTransactions.bind(controller))

    return router;
};

export default createQuotaRouter;
