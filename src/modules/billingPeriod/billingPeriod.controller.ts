import { Request, Response } from 'express';
import { BillingPeriodService } from './billingPeriod.service';

export class BillingPeriodController {
  constructor(private readonly service: BillingPeriodService) {}

  // Usar métodos de clase arrow functions para evitar problemas con el this
  getBillingPeriods = async (_: Request, res: Response): Promise<void> => {
    try {
      const BillingPeriods = await this.service.findAll();
      res.status(200).json(BillingPeriods);
    } catch (error) {
      console.error("Error getting BillingPeriods:", error);
      res.status(500).json({
        message: "Error al obtener periodos de facturación",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  addBillingPeriod = async (req: Request, res: Response): Promise<void> => {
    try {
      const BillingPeriod = await this.service.create(req.body);

      res.status(201).json(BillingPeriod);
    } catch (error) {
      console.error("Error adding BillingPeriod:", error);
      res.status(500).json({
        message: "Error al agregar periodo de facturación",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  getBillingPeriod = async (req: Request, res: Response): Promise<void> => {
    try {
      const { billingPeriodId } = req.params;
      const BillingPeriod = await this.service.findById(billingPeriodId);

      if (!BillingPeriod) {
        res
          .status(404)
          .json({ message: "Periodo de facturación no encontrada" });
        return;
      }

      res.status(200).json(BillingPeriod);
    } catch (error) {
      console.error("Error getting BillingPeriod:", error);
      res.status(500).json({
        message: "Error al obtener el periodo de facturación",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  updateBillingPeriod = async (req: Request, res: Response): Promise<void> => {
    try {
      const { billingPeriodId } = req.params;
      const updatedData = req.body;
      const updatedBillingPeriod = await this.service.update(
        billingPeriodId,
        updatedData
      );

      if (!updatedBillingPeriod) {
        res
          .status(404)
          .json({ message: "Periodo de facturación no encontrado" });
        return;
      }

      res.status(200).json({
        message: "Periodo de facturación actualizado exitosamente",
        data: updatedBillingPeriod,
      });
    } catch (error) {
      console.error("Error updating BillingPeriod:", error);
      res.status(500).json({
        message: "Error al actualizar la periodo de facturación",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  deleteBillingPeriod = async (req: Request, res: Response): Promise<void> => {
    try {
      const { billingPeriodId } = req.params;
      const result = await this.service.softDelete(billingPeriodId);

      if (!result) {
        res
          .status(404)
          .json({ message: "Periodo de facturación no encontrado" });
        return;
      }

      res
        .status(200)
        .json({ message: "Periodo de facturación eliminado correctamente" });
    } catch (error) {
      console.error("Error deleting BillingPeriod:", error);
      res.status(500).json({
        message: "Error al eliminar el periodo de facturación",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  payBillingPeriod = async (req: Request, res: Response): Promise<void> => {
    try {
      const { creditCardId, billingPeriodId } = req.params;
      const result = await this.service.payBillingPeriod(
        creditCardId,
        billingPeriodId,
      );

      res.status(200).json({
        message: `${result.paidCount} cuotas marcadas como pagadas`,
        ...result,
      });
    } catch (error) {
      console.error("Error paying billing period:", error);
      res.status(500).json({
        message: "Error al pagar el período",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}