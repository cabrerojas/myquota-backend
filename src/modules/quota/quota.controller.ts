import { Request, Response } from "express";
import { QuotaService } from "./quota.service";

export class QuotaController {
  constructor(private readonly service: QuotaService) {}

  addQuota = async (req: Request, res: Response): Promise<void> => {
    try {
      const quota = await this.service.create(req.body);
      res.status(201).json(quota);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error al agregar transacción", error });
    }
  };

  getQuotas = async (_: Request, res: Response): Promise<void> => {
    try {
      const quotas = await this.service.findAll();
      res.status(200).json(quotas);
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error al obtener transacciones", error });
    }
  };

  getQuota = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quotaId } = req.params;
      const quota = await this.service.findById(quotaId);
      if (!quota) {
        res.status(404).json({ message: "Cuota no encontrada" });
      } else {
        res.status(200).json(quota);
      }
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error al obtener la transacción", error });
    }
  };

  updateQuota = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quotaId } = req.params;
      const updatedData = req.body;
      const updatedQuota = await this.service.update(quotaId, updatedData);
      if (updatedQuota) {
        res.status(200).json({ message: "Cuota actualizada exitosamente" });
      } else {
        res.status(404).json({ message: "Cuota no encontrada" });
      }
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error al actualizar la transacción", error });
    }
  };

  deleteQuota = async (req: Request, res: Response): Promise<void> => {
    try {
      const { quotaId } = req.params;
      const result = await this.service.softDelete(quotaId);
      if (result) {
        res.status(200).json({ message: "Cuota eliminada correctamente" });
      } else {
        res.status(404).json({ message: "Cuota no encontrada" });
      }
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error al eliminar la transacción", error });
    }
  };

  getQuotasByTransactionId = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { creditCardId, transactionId } = req.params;
    const quotas = await this.service.getQuotasByTransaction(
      creditCardId,
      transactionId,
    );
    res.status(200).json(quotas);
  };

  splitQuotas = async (req: Request, res: Response): Promise<void> => {
    try {
      const { creditCardId, transactionId } = req.params;
      const { numberOfQuotas } = req.body;

      if (!numberOfQuotas || typeof numberOfQuotas !== "number") {
        res.status(400).json({
          message: "numberOfQuotas es requerido y debe ser un número",
        });
        return;
      }

      const result = await this.service.splitTransactionIntoQuotas(
        creditCardId,
        transactionId,
        numberOfQuotas,
      );

      res.status(200).json({
        message: `Transacción dividida en ${result.created} cuotas exitosamente`,
        ...result,
      });
    } catch (error) {
      console.error("Error splitting quotas:", error);
      res.status(500).json({
        message: "Error al dividir en cuotas",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
