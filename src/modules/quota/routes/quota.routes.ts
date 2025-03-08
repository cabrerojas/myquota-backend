import { Router, Request, Response, NextFunction } from "express";
import { QuotaController } from "../controllers/quota.controller";
import { QuotaRepository } from "../repositories/quota.repository";
import { QuotaService } from "../services/quota.service";
import { TransactionRepository } from "@/modules/transaction/repositories/transaction.repository";
import { CreditCardRepository } from "@/modules/creditCard/repositories/creditCard.repository";

const createQuotaRouter = (): Router => {
  const router = Router();

  // 📌 Middleware para extraer `userId`, `creditCardId` y `transactionId` de la URL
  router.use(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId/quotas",
    (req: Request, res: Response, next: NextFunction) => {
      const { userId, creditCardId, transactionId } = req.params;

      if (!userId || !creditCardId || !transactionId) {
        res.status(400).json({
          message:
            "❌ userId, creditCardId y transactionId son requeridos en la URL.",
        });
      }

      try {
        // 📌 Crear repositorios con los IDs de usuario, tarjeta y transacción
        const creditCardRepository = new CreditCardRepository(userId);
        const transactionRepository = new TransactionRepository(
          userId,
          creditCardId
        );
        const quotaRepository = new QuotaRepository(
          userId,
          creditCardId,
          transactionId
        );
        const service = new QuotaService(
          quotaRepository,
          transactionRepository,
          creditCardRepository
        );
        const controller = new QuotaController(service);

        // 📌 Guardar en `res.locals` para que las rutas lo utilicen
        res.locals.quotaController = controller;
        next(); // 🔥 Asegurar que `next()` se llama para continuar con la ejecución
      } catch (error) {
        console.error("❌ Error en el middleware de Quota:", error);
        res
          .status(500)
          .json({ message: "❌ Error interno en la configuración de Quota." });
      }
    }
  );

  // 📌 Definir rutas usando `res.locals.quotaController`
  router.get(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId/quotas",
    (req: Request, res: Response) => {
      return res.locals.quotaController.getQuotas(req, res);
    }
  );

  router.post(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId/quotas",
    (req: Request, res: Response) => {
      return res.locals.quotaController.addQuota(req, res);
    }
  );

  router.get(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.getQuota(req, res);
    }
  );

  router.put(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.updateQuota(req, res);
    }
  );

  router.delete(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.deleteQuota(req, res);
    }
  );

  

  return router;
};

export default createQuotaRouter;
