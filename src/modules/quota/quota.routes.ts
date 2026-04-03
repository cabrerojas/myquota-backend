import { Router, Request, Response, NextFunction } from "express";
import { QuotaController } from "./quota.controller";
import { QuotaRepository } from "./quota.repository";
import { QuotaService } from "./quota.service";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { authenticate } from "@/shared/middlewares/auth.middleware";
import { validate } from "@shared/middlewares/validate.middleware";
import {
  createQuotaSchema,
  updateQuotaSchema,
  splitQuotasSchema,
} from "./quota.schemas";

const createQuotaRouter = (): Router => {
  const router = Router();

  router.use(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const { creditCardId, transactionId } = req.params;
      const userId = req.user?.userId;

      if (!userId || !creditCardId || !transactionId) {
        res.status(400).json({
          message: "creditCardId y transactionId son requeridos en la URL.",
        });
        return;
      }

      try {
        const transactionRepository = new TransactionRepository(
          userId,
          creditCardId,
        );
        const quotaRepository = new QuotaRepository(
          userId,
          creditCardId,
          transactionId,
        );
        const service = new QuotaService(
          quotaRepository,
          transactionRepository,
        );
        const controller = new QuotaController(service);
        res.locals.quotaController = controller;
        next();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        console.error("Error en el middleware de Quota:", errorMessage);
        res.status(500).json({
          message: "Error interno en la configuración de Quota.",
        });
      }
    },
  );

  router.get(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas",
    (req: Request, res: Response) => {
      return res.locals.quotaController.getQuotas(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas",
    validate(createQuotaSchema),
    (req: Request, res: Response) => {
      return res.locals.quotaController.addQuota(req, res);
    },
  );

  router.get(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.getQuota(req, res);
    },
  );

  router.put(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    validate(updateQuotaSchema),
    (req: Request, res: Response) => {
      return res.locals.quotaController.updateQuota(req, res);
    },
  );

  router.delete(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/:quotaId",
    (req: Request, res: Response) => {
      return res.locals.quotaController.deleteQuota(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/transactions/:transactionId/quotas/split",
    validate(splitQuotasSchema),
    (req: Request, res: Response) => {
      return res.locals.quotaController.splitQuotas(req, res);
    },
  );

  return router;
};

export default createQuotaRouter;
