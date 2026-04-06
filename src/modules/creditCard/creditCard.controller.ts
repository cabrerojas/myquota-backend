import { Request, Response } from "express";
import { CreditCardService } from "./creditCard.service";
import { StatsService } from "@/modules/stats/stats.service";

export class CreditCardController {
  constructor(private readonly service: CreditCardService) {}

  // Usar métodos de clase arrow functions para evitar problemas con el this
  getCreditCards = async (req: Request, res: Response): Promise<void> => {
    try {
      // Check for pagination query params
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const startAfter = req.query.startAfter as string | undefined;
      
      const result = await this.service.findAll(
        undefined, // no filters
        limit || startAfter ? { limit, startAfter } : undefined
      );
      res.status(200).json({ items: result.items, metadata: result.metadata });
    } catch (error) {
      console.error("Error getting CreditCards:", error);
      res.status(500).json({
        message: "Error al obtener CreditCards",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  addCreditCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const CreditCard = await this.service.create(req.body);
      const userId = req.user?.userId;
      if (userId) StatsService.triggerRecompute(userId);
      res.status(201).json(CreditCard);
    } catch (error) {
      console.error("Error adding CreditCard:", error);
      res.status(500).json({
        message: "Error al agregar CreditCard",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  getCreditCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { creditCardId } = req.params;
      const CreditCard = await this.service.findById(creditCardId);

      if (!CreditCard) {
        res.status(404).json({ message: "CreditCard no encontrada" });
        return;
      }

      res.status(200).json(CreditCard);
    } catch (error) {
      console.error("Error getting CreditCard:", error);
      res.status(500).json({
        message: "Error al obtener la CreditCard",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  updateCreditCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { creditCardId } = req.params;
      const updatedData = req.body;
      const updatedCreditCard = await this.service.update(
        creditCardId,
        updatedData,
      );

      if (!updatedCreditCard) {
        res.status(404).json({ message: "CreditCard no encontrada" });
        return;
      }

      const userId = req.user?.userId;
      if (userId) StatsService.triggerRecompute(userId);

      res.status(200).json({
        message: "CreditCard actualizada exitosamente",
        data: updatedCreditCard,
      });
    } catch (error) {
      console.error("Error updating CreditCard:", error);
      res.status(500).json({
        message: "Error al actualizar la CreditCard",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  deleteCreditCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const { creditCardId } = req.params;
      const result = await this.service.softDelete(creditCardId);

      if (!result) {
        res.status(404).json({ message: "CreditCard no encontrada" });
        return;
      }

      const userId = req.user?.userId;
      if (userId) StatsService.triggerRecompute(userId);

      res.status(200).json({ message: "CreditCard eliminada correctamente" });
    } catch (error) {
      console.error("Error deleting CreditCard:", error);
      res.status(500).json({
        message: "Error al eliminar la CreditCard",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Returns the count of transactions without a categoryId across all
   * credit cards for the authenticated user.
   */
  getUncategorizedCount = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(400).json({ message: "userId es requerido." });
        return;
      }
      const count = await this.service.getUncategorizedCount(userId);
      res.status(200).json({ uncategorizedCount: count });
    } catch (error) {
      console.error("Error getting uncategorized count:", error);
      res.status(500).json({
        message: "Error al obtener transacciones sin categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
