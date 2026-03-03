import { Router, Request, Response, NextFunction } from "express";
import { BillingPeriodController } from "./billingPeriod.controller";
import { BillingPeriodRepository } from "./billingPeriod.repository";
import { BillingPeriodService } from "./billingPeriod.service";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createBillingPeriodRouter = (): Router => {
  const router = Router();

  router.use(
    "/creditCards/:creditCardId/billingPeriods",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const { creditCardId } = req.params;
      const userId = req.user?.userId;

      if (!userId || !creditCardId) {
        res.status(400).json({
          message: "creditCardId es requerido en la URL.",
        });
        return;
      }

      try {
        const repository = new BillingPeriodRepository(userId, creditCardId);
        const transactionRepository = new TransactionRepository(
          userId,
          creditCardId,
        );
        const service = new BillingPeriodService(
          repository,
          transactionRepository,
          creditCardId,
        );
        const controller = new BillingPeriodController(service);

        res.locals.billingPeriodController = controller;
        next();
      } catch (error) {
        console.error("Error en el middleware de BillingPeriod:", error);
        res.status(500).json({ message: "Error interno en BillingPeriod." });
      }
    },
  );

  router.get(
    "/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.getBillingPeriods(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.addBillingPeriod(req, res);
    },
  );

  router.get(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.getBillingPeriod(req, res);
    },
  );

  router.put(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.updateBillingPeriod(req, res);
    },
  );

  router.delete(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.deleteBillingPeriod(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId/pay",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.payBillingPeriod(req, res);
    },
  );

  return router;
};

export default createBillingPeriodRouter;
