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
      res.status(200).json({
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

  matchMerchant = async (req: Request, res: Response): Promise<void> => {
    try {
      const { merchantName } = req.body;
      if (!merchantName) {
        res.status(400).json({ message: "merchantName es requerido" });
        return;
      }
      const match = await this.service.findCategoryByMerchant(merchantName);
      if (match) {
        res.status(200).json(match);
      } else {
        res.status(204).send();
      }
    } catch (error) {
      console.error("Error matching merchant:", error);
      res.status(500).json({
        message: "Error al buscar categoría por comercio",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Crea una categoría global o personal y asocia el comercio si se provee
   */
  createCategoryWithMerchant = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { name, color, icon, isGlobal, merchantName, pattern } = req.body;
      console.log(
        `[CategoryController] createCategoryWithMerchant user=${userId} body=`,
        { name, color, icon, isGlobal, merchantName, pattern },
      );
      const category = await this.service.createCategoryWithMerchant({
        name,
        color,
        icon,
        isGlobal,
        merchantName,
        pattern,
        userId,
      });
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creando categoría:", error);
      res.status(500).json({
        message: "Error al crear categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Asocia un comercio/patrón a una categoría global existente
   */
  addMerchantToCategory = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { categoryId } = req.params;
      const { merchantName, pattern } = req.body;
      if (!categoryId || !merchantName || !pattern || !userId) {
        res.status(400).json({
          message: "categoryId, merchantName, pattern y userId son requeridos",
        });
        return;
      }
      await this.service.addMerchantPatternToCategory(
        categoryId,
        merchantName,
        pattern,
        userId,
      );
      res.status(201).json({ message: "Comercio asociado correctamente" });
    } catch (error) {
      console.error("Error asociando comercio:", error);
      res.status(500).json({
        message: "Error al asociar comercio a la categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Lista los patrones de comercios asociados a una categoría global
   */
  getMerchantsForCategory = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { categoryId } = req.params;
      if (!categoryId) {
        res.status(400).json({ message: "categoryId es requerido" });
        return;
      }
      const merchantService =
        new (require("./merchant/merchant.service").MerchantPatternService)(
          categoryId,
        );
      const patterns = await merchantService.getAllPatterns();
      res.status(200).json(patterns);
    } catch (error) {
      console.error("Error obteniendo patrones de comercios:", error);
      res.status(500).json({
        message: "Error al obtener patrones de comercios",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Copia una categoría global a las categorías personales del usuario
   */
  addGlobalCategoryToUser = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { categoryId } = req.params;
      if (!userId) {
        res.status(401).json({ message: "Autenticación requerida" });
        return;
      }
      if (!categoryId) {
        res.status(400).json({ message: "categoryId es requerido" });
        return;
      }
      const newCategory = await this.service.addGlobalCategoryToUser(
        categoryId,
        userId,
      );
      res.status(201).json(newCategory);
    } catch (error) {
      console.error("Error copiando categoría global a usuario:", error);
      res.status(500).json({
        message: "Error al copiar categoría",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
