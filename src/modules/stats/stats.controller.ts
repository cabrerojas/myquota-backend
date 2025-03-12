import { Request, Response } from "express";
import { StatsService } from "./stats.service";

export class StatsController {
  constructor(private readonly service: StatsService) {}

  // 📌 Obtener estadísticas de gastos por mes
  getMonthlyStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId; // 🔥 Obtener `userId` del JWT
      const { creditCardId } = req.params;

      if (!userId || !creditCardId) {
        res.status(400).json({ message: "❌ Falta userId o creditCardId." });
        return;
      }

      const stats = await this.service.getMonthlyStats(userId, creditCardId);
      res.status(200).json(stats);
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      res.status(500).json({ message: "Error obteniendo estadísticas." });
    }
  };
}
