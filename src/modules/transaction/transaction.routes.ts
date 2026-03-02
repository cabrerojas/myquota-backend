import { Router, Request, Response, NextFunction } from "express";
import { TransactionController } from "./transaction.controller";
import { TransactionRepository } from "./transaction.repository";
import { TransactionService } from "./transaction.service";
import { authenticate } from "@/shared/middlewares/auth.middleware";
import { BillingPeriodRepository } from "../billingPeriod/billingPeriod.repository";

const createTransactionRouter = (): Router => {
  const router = Router();

  // 📌 Middleware para validar JWT y extraer `creditCardId` de la URL
  router.use(
    "/creditCards/:creditCardId/transactions",
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
        // 📌 Crear repositorios con `userId` desde JWT
        const transactionRepository = new TransactionRepository(
          userId,
          creditCardId,
        );
        const billingPeriodRepository = new BillingPeriodRepository(
          userId,
          creditCardId,
        );
        const service = new TransactionService(
          transactionRepository,
          billingPeriodRepository,
        );
        const controller = new TransactionController(service);

        res.locals.transactionController = controller;
        next();
      } catch (error) {
        console.error("❌ Error en el middleware de Transaction:", error);
        res.status(500).json({
          message: "❌ Error interno en la configuración de Transaction.",
        });
      }
    },
  );

  // 📌 Definir rutas usando `res.locals.transactionController`
  router.get(
    "/creditCards/:creditCardId/transactions",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getTransactions(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/transactions",
    (req: Request, res: Response) => {
      return res.locals.transactionController.addTransaction(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/transactions/manual",
    (req: Request, res: Response) => {
      return res.locals.transactionController.createManualTransaction(req, res);
    },
  );

  router.get(
    "/creditCards/:creditCardId/transactions/manual",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getManualTransactions(req, res);
    },
  );

  router.put(
    "/creditCards/:creditCardId/transactions/manual/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.updateManualTransaction(req, res);
    },
  );

  router.delete(
    "/creditCards/:creditCardId/transactions/manual/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.deleteManualTransaction(req, res);
    },
  );

  router.get(
    "/creditCards/:creditCardId/transactions/monthly-sum",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getMonthlyQuotaSum(req, res);
    },
  );

  router.get(
    "/creditCards/:creditCardId/transactions/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getTransaction(req, res);
    },
  );

  router.put(
    "/creditCards/:creditCardId/transactions/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.updateTransaction(req, res);
    },
  );

  router.delete(
    "/creditCards/:creditCardId/transactions/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.deleteTransaction(req, res);
    },
  );

  router.post(
    "/creditCards/:creditCardId/transactions/initialize-quotas",
    (req: Request, res: Response) => {
      return res.locals.transactionController.initializeQuotasForAllTransactions(
        req,
        res,
      );
    },
  );

  router.post(
    "/creditCards/:creditCardId/transactions/import-bank-transactions",
    (req: Request, res: Response) => {
      return res.locals.transactionController.importBankTransactions(req, res);
    },
  );

  return router;
};

export default createTransactionRouter;
