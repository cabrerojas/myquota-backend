import { Request, Response } from "express";
import { AuthError, RepositoryError } from "@shared/errors/custom.error";
import { TransactionService } from "./transaction.service";
export class TransactionController {
  constructor(private readonly service: TransactionService) {}

  // Usar métodos de clase arrow functions para evitar problemas con el this
  getTransactions = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.listTransactions({
        limit: req.query.limit as string | undefined,
        startAfter: req.query.startAfter as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting transactions:", error);
      res.status(500).json({
        message: "Error al obtener transacciones",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  addTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const transaction = await this.service.createTransaction(req.body, req.user?.userId);

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error adding transaction:", error);
      res.status(500).json({
        message: "Error al agregar transacción",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  getTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const transaction = await this.service.getTransactionDetails(transactionId);

      if (!transaction) {
        res.status(404).json({ message: "Transacción no encontrada" });
        return;
      }

      res.status(200).json(transaction);
    } catch (error) {
      console.error("Error getting transaction:", error);
      res.status(500).json({
        message: "Error al obtener la transacción",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  updateTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const updatedTransaction = await this.service.updateTransaction(
        transactionId,
        req.body,
        req.user?.userId,
      );

      if (!updatedTransaction) {
        res.status(404).json({ message: "Transacción no encontrada" });
        return;
      }

      res.status(200).json({
        message: "Transacción actualizada exitosamente",
        data: updatedTransaction,
      });
    } catch (error) {
      console.error("Error updating transaction:", error);
      res.status(500).json({
        message: "Error al actualizar la transacción",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  createRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const result = await this.service.createRefund(transactionId, req.body, req.user?.userId);

      res.status(201).json({
        message: "Refund creado exitosamente",
        data: result,
      });
    } catch (error) {
      console.error("Error creating refund:", error);
      const status = error instanceof RepositoryError ? error.statusCode : 500;
      res.status(status).json({
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  deleteTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const result = await this.service.deleteTransaction(transactionId, req.user?.userId);

      if (!result) {
        res.status(404).json({ message: "Transacción no encontrada" });
        return;
      }

      res.status(200).json({ message: "Transacción eliminada correctamente" });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({
        message: "Error al eliminar la transacción",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  createManualTransaction = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { creditCardId } = req.params;

      if (!creditCardId) {
        res.status(400).json({ message: "Falta creditCardId." });
        return;
      }

      const result = await this.service.createManualTransaction(
        creditCardId,
        req.body,
        req.user?.userId,
      );

      res.status(201).json({
        message: `Transacción manual creada con ${result.quotasCreated} cuotas.`,
        transaction: result.transaction,
        quotasCreated: result.quotasCreated,
      });
    } catch (error) {
      console.error("Error creating manual transaction:", error);
      res.status(500).json({
        message: "Error al crear transacción manual",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  deleteManualTransaction = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { creditCardId, transactionId } = req.params;
      const result = await this.service.deleteManualTransaction(
        creditCardId,
        transactionId,
        req.user?.userId,
      );

      res.status(200).json({
        message: `Transacción eliminada con ${result.deletedQuotas} cuotas.`,
        deletedQuotas: result.deletedQuotas,
      });
    } catch (error) {
      console.error("Error deleting manual transaction:", error);
      const status = error instanceof RepositoryError ? error.statusCode : 500;
      res.status(status).json({
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  updateManualTransaction = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { creditCardId, transactionId } = req.params;
      const result = await this.service.updateManualTransaction(
        creditCardId,
        transactionId,
        req.body,
        req.user?.userId,
      );

      res.status(200).json({
        message: `Transacción actualizada con ${result.quotasCreated} cuotas.`,
        transaction: result.transaction,
        quotasCreated: result.quotasCreated,
      });
    } catch (error) {
      console.error("Error updating manual transaction:", error);
      const status = error instanceof RepositoryError ? error.statusCode : 500;
      res.status(status).json({
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  getManualTransactionsWithQuotas = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await this.service.getManualTransactionsWithQuotas();
      res.status(200).json(result);
    } catch (error) {
      console.error("Error getting manual transactions with quotas:", error);
      res.status(500).json({
        message: "Error al obtener transacciones manuales con cuotas",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  getManualTransactions = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const transactions = await this.service.getManualTransactions();

      res.status(200).json(transactions);
    } catch (error) {
      console.error("Error getting manual transactions:", error);
      res.status(500).json({
        message: "Error al obtener transacciones manuales",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  importBankTransactions = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(400).json({ message: "Token invalido." });
        return;
      }

      const { creditCardId } = req.params;

      // runImportFlow: fetchBankEmails + initializeQuotas + checkOrphans
      // compartiendo un único findAll(), optimizando reads vs llamadas separadas
      const {
        importedCount,
        quotasCreated,
        orphanedTransactions,
        suggestedPeriod,
      } = await this.service.runImportFlow(userId, creditCardId);

      res.status(200).json({
        message: "Transacciones importadas exitosamente",
        importedCount,
        quotasCreated,
        orphanedCount: orphanedTransactions.length,
        orphanedTransactions: orphanedTransactions.slice(0, 5),
        suggestedPeriod,
      });
    } catch (error) {
      console.error("Error importing transactions:", error);
      if (error instanceof AuthError) {
        // treat as unauthenticated so frontend can redirect to login
        res.status(error.statusCode).json({ message: error.message });
        return;
      }

      res.status(500).json({
        message: "Error al importar transacciones",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
      return;
    }
  };

  initializeQuotasForAllTransactions = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { creditCardId } = req.params; // Obtener userId y creditCardId de la URL

    try {
      const quotasCreated = await this.service.initializeQuotasForAllTransactions(
        creditCardId,
        undefined,
        req.user?.userId,
      );
      res.status(200).json({
        message:
          "Cuotas creadas para todas las transacciones que no las tenían previamente.",
        quotasCreated,
      });
    } catch (error) {
      console.error(
        "Error al inicializar cuotas para todas las transacciones:",
        error,
      );
      res.status(500).json({
        message: "Error al inicializar cuotas para todas las transacciones",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };
}
