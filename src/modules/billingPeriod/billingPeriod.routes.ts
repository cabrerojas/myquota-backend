import { Router, Request, Response, NextFunction } from "express";
import { BillingPeriodController } from "./billingPeriod.controller";
import { BillingPeriodRepository } from "./billingPeriod.repository";
import { BillingPeriodService } from "./billingPeriod.service";
import { authenticate } from "@/shared/middlewares/auth.middleware"; // 📌 Middleware para validar JWT

const createBillingPeriodRouter = (): Router => {
  const router = Router();

  // 📌 Middleware para validar JWT y extraer `creditCardId` de la URL
  router.use(
    "/creditCards/:creditCardId/billingPeriods",
    authenticate, // 🔥 Primero validamos el JWT
    (req: Request, res: Response, next: NextFunction) => {
      const { creditCardId } = req.params;
      const userId = req.user?.userId; // 🔥 Extraer `userId` del JWT

      if (!userId || !creditCardId) {
         res.status(400).json({
          message: "❌ creditCardId es requerido en la URL.",
        });
        return;
      }

      try {
        // 📌 Crear repositorio con `userId` desde JWT
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
    "/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.getBillingPeriods(req, res);
    }
  );

  router.post(
    "/creditCards/:creditCardId/billingPeriods",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.addBillingPeriod(req, res);
    }
  );

  router.get(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.getBillingPeriod(req, res);
    }
  );

  router.put(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.updateBillingPeriod(req, res);
    }
  );

  router.delete(
    "/creditCards/:creditCardId/billingPeriods/:billingPeriodId",
    (req: Request, res: Response) => {
      return res.locals.billingPeriodController.deleteBillingPeriod(req, res);
    }
  );

  return router;
};

export default createBillingPeriodRouter;
