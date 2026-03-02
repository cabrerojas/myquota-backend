import { Request, Response } from "express";
import { CategoryRuleService } from "./categoryRule.service";

export class CategoryRuleController {
  constructor(private readonly service: CategoryRuleService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const rules = await this.service.getRulesSorted();
      res.status(200).json(rules);
    } catch (error) {
      console.error("Error getting category rules:", error);
      res.status(500).json({
        message: "Error al obtener reglas de categorización",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;
      const rule = await this.service.findById(ruleId);

      if (!rule) {
        res.status(404).json({ message: "Regla no encontrada" });
        return;
      }

      res.status(200).json(rule);
    } catch (error) {
      console.error("Error getting category rule:", error);
      res.status(500).json({
        message: "Error al obtener la regla",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { name, merchantPattern, keywords, categoryId, action, priority } =
        req.body;

      if (!name || !merchantPattern || !categoryId) {
        res.status(400).json({
          message: "name, merchantPattern y categoryId son requeridos",
        });
        return;
      }

      const rule = await this.service.createRule({
        userId: userId ?? "",
        name,
        merchantPattern,
        keywords: keywords ?? [],
        categoryId,
        action: action ?? "suggest",
        priority: priority ?? 0,
      });

      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating category rule:", error);
      res.status(500).json({
        message: "Error al crear regla de categorización",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;
      const updated = await this.service.update(ruleId, req.body);

      if (!updated) {
        res.status(404).json({ message: "Regla no encontrada" });
        return;
      }

      res.status(200).json({
        message: "Regla actualizada exitosamente",
        data: updated,
      });
    } catch (error) {
      console.error("Error updating category rule:", error);
      res.status(500).json({
        message: "Error al actualizar regla",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;
      const deleted = await this.service.softDelete(ruleId);

      if (!deleted) {
        res.status(404).json({ message: "Regla no encontrada" });
        return;
      }

      res.status(200).json({ message: "Regla eliminada exitosamente" });
    } catch (error) {
      console.error("Error deleting category rule:", error);
      res.status(500).json({
        message: "Error al eliminar regla",
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };
}
