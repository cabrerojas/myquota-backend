import { Router, Request, Response, NextFunction } from "express";
import { TransactionController } from "../controllers/transaction.controller";
import { TransactionRepository } from "../repositories/transaction.repository";
import { TransactionService } from "../services/transaction.service";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createTransactionRouter = (): Router => {
  const router = Router();

  // 📌 Middleware para extraer `userId` y `creditCardId` de la URL y configurar las dependencias
  router.use(
    "/:userId/creditCards/:creditCardId/transactions",
    (req: Request, res: Response, next: NextFunction) => {
      const { userId, creditCardId } = req.params;

      if (!userId || !creditCardId) {
        res
          .status(400)
          .json({
            message: "❌ userId y creditCardId son requeridos en la URL.",
          });
      }

      try {
        // 📌 Crear repositorios con los IDs de usuario y tarjeta de crédito
        const transactionRepository = new TransactionRepository(
          userId,
          creditCardId
        );
        const service = new TransactionService(transactionRepository);
        const controller = new TransactionController(service);

        // 📌 Guardar en `res.locals` para que las rutas lo utilicen
        res.locals.transactionController = controller;
        next(); // 🔥 Asegurar que `next()` se llama para continuar con la ejecución
      } catch (error) {
        console.error("❌ Error en el middleware de Transaction:", error);
        res
          .status(500)
          .json({
            message: "❌ Error interno en la configuración de Transaction.",
          });
      }
    }
  );

  // 📌 Definir rutas usando `res.locals.transactionController`
  router.get(
    "/:userId/creditCards/:creditCardId/transactions",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getTransactions(req, res);
    }
  );

  router.post(
    "/:userId/creditCards/:creditCardId/transactions",
    (req: Request, res: Response) => {
      return res.locals.transactionController.addTransaction(req, res);
    }
  );

  router.get(
    "/:userId/creditCards/:creditCardId/transactions/monthly-sum",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getMonthlyQuotaSum(req, res);
    }
  );

  router.get(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.getTransaction(req, res);
    }
  );

  router.put(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.updateTransaction(req, res);
    }
  );

  router.delete(
    "/:userId/creditCards/:creditCardId/transactions/:transactionId",
    (req: Request, res: Response) => {
      return res.locals.transactionController.deleteTransaction(req, res);
    }
  );

  router.post(
    "/:userId/creditCards/:creditCardId/transactions/initialize-quotas",
    (req: Request, res: Response) => {
      return res.locals.transactionController.initializeQuotasForAllTransactions(
        req,
        res
      );
    }
  );

  router.post(
    "/:userId/creditCards/:creditCardId/transactions/import-bank-transactions",
    authenticate,
    (req: Request, res: Response) => {
      return res.locals.transactionController.importBankTransactions(req, res);
    }
  );

  return router;
};

export default createTransactionRouter;
