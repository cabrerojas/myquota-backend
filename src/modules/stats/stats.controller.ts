import { Request, Response } from "express";
import { StatsService } from "./stats.service";
import { WhatIfRequestSchema } from "./stats.schemas";
import { WhatIfService } from "./stats.service";

export class StatsController {
  constructor(private readonly service: StatsService) {}

  // Obtener estadísticas de gastos por mes
  getMonthlyStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { creditCardId } = req.params;

      if (!userId || !creditCardId) {
        res.status(400).json({ message: "Falta userId o creditCardId." });
        return;
      }

      const stats = await this.service.getMonthlyStats(userId, creditCardId);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      res.status(500).json({ message: "Error obteniendo estadísticas." });
    }
  };

  whatIf = async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = WhatIfRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
        return;
      }

      const products = parsed.data.products;
      if (products.length > 50) {
        res.status(413).json({ error: "Payload too large: max 50 products" });
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        res.status(400).json({ error: "Missing userId" });
        return;
      }

      const service = new WhatIfService();
      const projection = await service.calculateWhatIf(products);
      res.status(200).json({ projection, meta: { months: projection.months.length } });
    } catch (error) {
      console.error("Error in whatIf endpoint:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Error desconocido" });
    }
  };

  // Obtener sumatoria de cuotas por período de facturación
  getMonthlyQuotaSum = async (req: Request, res: Response): Promise<void> => {
    const { creditCardId } = req.params;

    try {
      const monthlyQuotaSum =
        await this.service.getMonthlyQuotaSum(creditCardId);
      res.status(200).json(monthlyQuotaSum);
    } catch (error) {
      console.error("Error al obtener la sumatoria de cuotas por mes:", error);
      res.status(500).json({
        message: "Error al obtener la sumatoria de cuotas por mes",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  // Obtener resumen de deuda global (todas las tarjetas)
  static getDebtSummary = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(400).json({ message: "Falta userId." });
        return;
      }

      const summary = await StatsService.getGlobalDebtSummary(userId);
      res.status(200).json(summary);
    } catch (error) {
      console.error("Error obteniendo resumen de deuda:", error);
      res.status(500).json({ message: "Error obteniendo resumen de deuda." });
    }
  };
}
