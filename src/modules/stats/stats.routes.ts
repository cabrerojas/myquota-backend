import { Router, Request, Response, NextFunction } from "express";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";
import { TransactionRepository } from "@/modules/transaction/transaction.repository";
import { authenticate } from "@/shared/middlewares/auth.middleware";
import { BillingPeriodRepository } from "../billingPeriod/billingPeriod.repository";

const createStatsRouter = (): Router => {
  const router = Router();

  // 📌 Ruta global: resumen de deuda (todas las tarjetas)
  router.get(
    "/stats/debt-summary",
    authenticate,
    (req: Request, res: Response) => {
      return StatsController.getDebtSummary(req, res);
    },
  );

  router.use(
    "/creditCards/:creditCardId/stats",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;
      const { creditCardId } = req.params;

      if (!userId || !creditCardId) {
        res.status(400).json({ message: "❌ Falta userId o creditCardId." });
        return;
      }

      try {
        const transactionRepository = new TransactionRepository(
          userId,
          creditCardId,
        );

        const billingPeriodRepository = new BillingPeriodRepository(
          userId,
          creditCardId,
        );

        const service = new StatsService(
          transactionRepository,
          billingPeriodRepository,
        );
        const controller = new StatsController(service);
        res.locals.statsController = controller;
        next();
      } catch (error) {
        console.error("❌ Error en el middleware de Stats:", error);
        res.status(500).json({ message: "❌ Error interno en Stats." });
      }
    },
  );

  router.get(
    "/creditCards/:creditCardId/stats/monthly",
    (req: Request, res: Response) => {
      return res.locals.statsController.getMonthlyStats(req, res);
    },
  );

  return router;
};

export default createStatsRouter;
