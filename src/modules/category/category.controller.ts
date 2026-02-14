import { Request, Response } from "express";
import { CategoryService } from "./category.service";

export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  // Usar métodos de clase arrow functions para evitar problemas con el this
  getCategories = async (_: Request, res: Response): Promise<void> => {
    try {
      const categories = await this.service.getAllCategories();
      res.status(200).json(categories);
    } catch (error) {
      console.error("Error getting categories:", error);
      res.status(500).json({
        message: "Error al obtener categorías",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  addCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const category = await this.service.create(req.body);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error adding category:", error);
      res.status(500).json({
        message: "Error al agregar categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  updateCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const updatedCategory = await this.service.update(
        req.params.id,
        req.body,
      );
      if (!updatedCategory) {
        res.status(404).json({ message: "Categoría no encontrada" });
        return;
      }
      res
        .status(200)
        .json({
          message: "Categoría actualizada exitosamente",
          data: updatedCategory,
        });
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({
        message: "Error al actualizar la categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  deleteCategory = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.softDelete(req.params.id);
      if (!result) {
        res.status(404).json({ message: "Categoría no encontrada" });
        return;
      }
      res.status(200).json({ message: "Categoría eliminada correctamente" });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({
        message: "Error al eliminar la categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
