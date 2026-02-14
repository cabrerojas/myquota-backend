import { Request, Response } from "express";
import { TransactionService } from "./transaction.service";

export class TransactionController {
  constructor(private readonly service: TransactionService) {}

  // Usar métodos de clase arrow functions para evitar problemas con el this
  getTransactions = async (_: Request, res: Response): Promise<void> => {
    try {
      const transactions = await this.service.findAll();
      res.status(200).json(transactions);
    } catch (error) {
      console.error("Error getting transactions:", error);
      res.status(500).json({
        message: "Error al obtener transacciones",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  addTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const transaction = await this.service.create(req.body);

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error adding transaction:", error);
      res.status(500).json({
        message: "Error al agregar transacción",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  getTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const transaction = await this.service.findById(transactionId);

      if (!transaction) {
        res.status(404).json({ message: "Transacción no encontrada" });
        return;
      }

      res.status(200).json(transaction);
    } catch (error) {
      console.error("Error getting transaction:", error);
      res.status(500).json({
        message: "Error al obtener la transacción",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  updateTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const updatedData = req.body;
      console.log(
        `[TransactionController] updateTransaction called for id=${transactionId} user=${req.user?.userId} body=`,
        updatedData,
      );
      const updatedTransaction = await this.service.update(
        transactionId,
        updatedData,
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
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  deleteTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const result = await this.service.softDelete(transactionId);

      if (!result) {
        res.status(404).json({ message: "Transacción no encontrada" });
        return;
      }

      res.status(200).json({ message: "Transacción eliminada correctamente" });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({
        message: "Error al eliminar la transacción",
        error: error instanceof Error ? error.message : "Unknown error",
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
        res.status(400).json({ message: "❌ Falta creditCardId." });
        return;
      }

      const {
        merchant,
        purchaseDate,
        quotaAmount,
        totalInstallments,
        paidInstallments,
        lastPaidMonth,
        currency,
      } = req.body;

      if (
        !merchant ||
        !purchaseDate ||
        !quotaAmount ||
        !totalInstallments ||
        paidInstallments === undefined ||
        !lastPaidMonth ||
        !currency
      ) {
        res.status(400).json({ message: "❌ Faltan campos requeridos." });
        return;
      }

      const result = await this.service.createManualTransaction(creditCardId, {
        merchant,
        purchaseDate,
        quotaAmount,
        totalInstallments,
        paidInstallments,
        lastPaidMonth,
        currency,
      });

      res.status(201).json({
        message: `✅ Transacción manual creada con ${result.quotasCreated} cuotas.`,
        transaction: result.transaction,
        quotasCreated: result.quotasCreated,
      });
    } catch (error) {
      console.error("Error creating manual transaction:", error);
      res.status(500).json({
        message: "Error al crear transacción manual",
        error: error instanceof Error ? error.message : "Unknown error",
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
      );

      res.status(200).json({
        message: `✅ Transacción eliminada con ${result.deletedQuotas} cuotas.`,
        deletedQuotas: result.deletedQuotas,
      });
    } catch (error) {
      console.error("Error deleting manual transaction:", error);
      const status =
        error instanceof Error && error.message.includes("Solo se pueden")
          ? 400
          : 500;
      res.status(status).json({
        message: error instanceof Error ? error.message : "Error al eliminar",
      });
    }
  };

  updateManualTransaction = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { creditCardId, transactionId } = req.params;
      const {
        merchant,
        purchaseDate,
        quotaAmount,
        totalInstallments,
        paidInstallments,
        lastPaidMonth,
        currency,
      } = req.body;

      if (
        !merchant ||
        !quotaAmount ||
        !totalInstallments ||
        paidInstallments === undefined ||
        !lastPaidMonth ||
        !currency
      ) {
        res.status(400).json({ message: "❌ Faltan campos requeridos." });
        return;
      }

      const result = await this.service.updateManualTransaction(
        creditCardId,
        transactionId,
        {
          merchant,
          purchaseDate,
          quotaAmount,
          totalInstallments,
          paidInstallments,
          lastPaidMonth,
          currency,
        },
      );

      res.status(200).json({
        message: `✅ Transacción actualizada con ${result.quotasCreated} cuotas.`,
        transaction: result.transaction,
        quotasCreated: result.quotasCreated,
      });
    } catch (error) {
      console.error("Error updating manual transaction:", error);
      const status =
        error instanceof Error && error.message.includes("Solo se pueden")
          ? 400
          : 500;
      res.status(status).json({
        message: error instanceof Error ? error.message : "Error al actualizar",
      });
    }
  };

  getManualTransactions = async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const transactions = await this.service.getManualTransactions();
      res.status(200).json(transactions);
    } catch (error) {
      console.error("Error getting manual transactions:", error);
      res
        .status(500)
        .json({ message: "Error al obtener transacciones manuales" });
    }
  };

  importBankTransactions = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId; // 📌 Ahora el `userId` viene del JWT

      if (!userId) {
        res.status(400).json({ message: "❌ Token invalido." });
        return;
      }

      const { importedCount } = await this.service.fetchBankEmails(userId);

      // 🔹 Auto-inicializar quotas para transacciones que no las tengan (idempotente)
      const { creditCardId } = req.params;
      const quotasCreated =
        await this.service.initializeQuotasForAllTransactions(creditCardId);

      // 🔹 Verificar transacciones huérfanas (sin período de facturación)
      const { orphanedTransactions, suggestedPeriod } =
        await this.service.checkOrphanedTransactions();

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
      res.status(500).json({
        message: "Error al importar transacciones",
        error: error instanceof Error ? error.message : "Unknown error",
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
      const quotasCreated =
        await this.service.initializeQuotasForAllTransactions(creditCardId);
      res.status(200).json({
        message:
          "✅ Cuotas creadas para todas las transacciones que no las tenían previamente.",
        quotasCreated,
      });
    } catch (error) {
      console.error(
        "❌ Error al inicializar cuotas para todas las transacciones:",
        error,
      );
      res.status(500).json({
        message: "❌ Error al inicializar cuotas para todas las transacciones",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Controlador para obtener la sumatoria de las cuotas por mes.
   */
  getMonthlyQuotaSum = async (req: Request, res: Response): Promise<void> => {
    const { creditCardId } = req.params;

    try {
      const monthlyQuotaSum =
        await this.service.getMonthlyQuotaSum(creditCardId);
      res.status(200).json(monthlyQuotaSum);
    } catch (error) {
      console.error(
        "❌ Error al obtener la sumatoria de cuotas por mes:",
        error,
      );
      res.status(500).json({
        message: "❌ Error al obtener la sumatoria de cuotas por mes",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
