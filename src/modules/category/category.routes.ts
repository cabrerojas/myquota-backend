import { Router, Request, Response, NextFunction } from "express";
import { CategoryController } from "./category.controller";
import { CategoryService } from "./category.service";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createCategoryRouter = (): Router => {
  const router = Router();

  // Middleware para validar JWT y crear el controller con el userId
  router.use(
    "/",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;
      const service = new CategoryService(userId);
      const controller = new CategoryController(service);
      res.locals.categoryController = controller;
      next();
    },
  );

  router.get("/", (req: Request, res: Response) => {
    return res.locals.categoryController.getCategories(req, res);
  });

  router.post("/", (req: Request, res: Response) => {
    return res.locals.categoryController.addCategory(req, res);
  });

  router.put("/:id", (req: Request, res: Response) => {
    return res.locals.categoryController.updateCategory(req, res);
  });

  router.delete("/:id", (req: Request, res: Response) => {
    return res.locals.categoryController.deleteCategory(req, res);
  });

  return router;
};

export default createCategoryRouter;
