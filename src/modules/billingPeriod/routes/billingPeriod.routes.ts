import { Router, Request, Response, NextFunction } from "express";
import { BillingPeriodController } from "../controllers/billingPeriod.controller";
import { BillingPeriodRepository } from "../repositories/billingPeriod.repository";
import { BillingPeriodService } from "../services/billingPeriod.service";

const createBillingPeriodRouter = (): Router => {
  const router = Router();

  router.use(
    "/:userId/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response, next: NextFunction) => {
      const { userId, creditCardId } = req.params;

      if (!userId || !creditCardId) {
        res.status(400).json({
          message: "❌ userId y creditCardId son requeridos en la URL.",
        });
      }

      try {
        const repository = new BillingPeriodRepository(userId, creditCardId);
        const service = new BillingPeriodService(repository);
        const controller = new BillingPeriodController(service);

        res.locals.billingPeriodController = controller;
        next();
      } catch (error) {
        console.error("❌ Error en el middleware de BillingPeriod:", error);
        res.status(500).json({ message: "❌ Error interno en BillingPeriod." });
      }
    }
  );

  // 📌 Definir rutas usando `res.locals.billingPeriodController`
  router.get(
    "/:userId/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.getBillingPeriods(req, res);
    }
  );

  router.post(
    "/:userId/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.addBillingPeriod(req, res);
    }
  );

  router.get(
    "/:userId/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.getBillingPeriod(req, res);
    }
  );

  router.put(
    "/:userId/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.updateBillingPeriod(req, res);
    }
  );

  router.delete(
    "/:userId/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.deleteBillingPeriod(req, res);
    }
  );

  return router;
};

export default createBillingPeriodRouter;
