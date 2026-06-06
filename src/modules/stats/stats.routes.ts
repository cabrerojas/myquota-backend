import { Router, Request, Response, NextFunction } from "express";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";
import { createTransactionRepository, createBillingPeriodRepository } from "@/shared/classes/repository.factory";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createStatsRouter = (): Router => {
  const router = Router();

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
        res.status(400).json({ message: "Falta userId o creditCardId." });
        return;
      }

      try {
        const transactionRepository = createTransactionRepository(
          userId,
          creditCardId,
        );

        const billingPeriodRepository = createBillingPeriodRepository(
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
        console.error("Error en el middleware de Stats:", error);
        res.status(500).json({ message: "Error interno en Stats." });
      }
    },
  );

  router.get(
    "/creditCards/:creditCardId/stats/monthly",
    (req: Request, res: Response) => {
      return res.locals.statsController.getMonthlyStats(req, res);
    },
  );

  router.get(
    "/creditCards/:creditCardId/stats/monthly-quota-sum",
    (req: Request, res: Response) => {
      return res.locals.statsController.getMonthlyQuotaSum(req, res);
    },
  );

  // POST /stats/what-if (global per-user endpoint)
  router.post(
    "/stats/what-if",
    authenticate,
    (req: Request, res: Response) => {
      // create a lightweight controller here for global endpoint
      const userId = req.user?.userId;
      if (!userId) {
        res.status(400).json({ message: "Falta userId." });
        return;
      }
      const controller = new (class {
        async handler(r: Request, s: Response) {
          // reuse StatsController.whatIf by instantiating a dummy StatsController
          const StatsControllerClass = require("./stats.controller").StatsController;
          const c = new StatsControllerClass(null);
          return c.whatIf(r, s);
        }
      })();
      return controller.handler(req, res);
    },
  );

  return router;
};

export default createStatsRouter;
