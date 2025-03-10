import { Router, Request, Response, NextFunction } from "express";
import { QuotaController } from "./quota.controller";
import { QuotaRepository } from "./quota.repository";
import { QuotaService } from "./quota.service";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { CreditCardRepository } from "@/modules/creditCard/creditCard.repository";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createQuotaRouter = (): Router => {
  const router = Router();

  // 📌 Middleware para validar JWT y extraer `creditCardId` y `transactionId`
  router.use(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas",
    authenticate, // 🔥 Primero validamos el JWT
    (req: Request, res: Response, next: NextFunction) => {
      const { creditCardId, transactionId } = req.params;
      const userId = req.user?.userId; // 🔥 Extraer `userId` del JWT

      if (!userId || !creditCardId || !transactionId) {
         res.status(400).json({
          message: "❌ creditCardId y transactionId son requeridos en la URL.",
        });
        return;
      }

      try {
        // 📌 Crear repositorios con `userId` desde JWT
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
        res.status(500).json({
          message: "❌ Error interno en la configuración de Quota.",
        });
      }
    }
  );

  // 📌 Definir rutas usando `res.locals.quotaController`
  router.get(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas",
    (req: Request, res: Response) => {
      return res.locals.quotaController.getQuotas(req, res);
    }
  );

  router.post(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas",
    (req: Request, res: Response) => {
      return res.locals.quotaController.addQuota(req, res);
    }
  );

  router.get(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.getQuota(req, res);
    }
  );

  router.put(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.updateQuota(req, res);
    }
  );

  router.delete(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.deleteQuota(req, res);
    }
  );

  return router;
};

export default createQuotaRouter;
