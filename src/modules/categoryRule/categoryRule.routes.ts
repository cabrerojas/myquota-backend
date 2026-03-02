import { Router, Request, Response, NextFunction } from "express";
import { CategoryRuleController } from "./categoryRule.controller";
import { CategoryRuleRepository } from "./categoryRule.repository";
import { CategoryRuleService } from "./categoryRule.service";
import { CategoryService } from "@modules/category/category.service";
import { authenticate } from "@shared/middlewares/auth.middleware";

const createCategoryRuleRouter = (): Router => {
  const router = Router();

  router.use(
    "/categoryRules",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(400).json({ message: "userId es requerido." });
        return;
      }

      try {
        const repository = new CategoryRuleRepository(userId);
        const categoryService = new CategoryService(userId);
        const service = new CategoryRuleService(repository, categoryService);
        const controller = new CategoryRuleController(service);
        res.locals.categoryRuleController = controller;
        next();
      } catch (error) {
        console.error("Error en middleware de CategoryRule:", error);
        res.status(500).json({ message: "Error interno en CategoryRule." });
      }
    },
  );

  router.get("/categoryRules", (req: Request, res: Response) => {
    return res.locals.categoryRuleController.getAll(req, res);
  });

  router.post("/categoryRules", (req: Request, res: Response) => {
    return res.locals.categoryRuleController.create(req, res);
  });

  router.get("/categoryRules/:ruleId", (req: Request, res: Response) => {
    return res.locals.categoryRuleController.getById(req, res);
  });

  router.put("/categoryRules/:ruleId", (req: Request, res: Response) => {
    return res.locals.categoryRuleController.update(req, res);
  });

  router.delete("/categoryRules/:ruleId", (req: Request, res: Response) => {
    return res.locals.categoryRuleController.delete(req, res);
  });

  return router;
};

export default createCategoryRuleRouter;
