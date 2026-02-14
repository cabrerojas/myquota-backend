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

  // Endpoint para crear categoría global o personal y asociar comercio
  router.post("/with-merchant", (req: Request, res: Response) => {
    return res.locals.categoryController.createCategoryWithMerchant(req, res);
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

  // Endpoint para sugerir categoría por comercio
  router.post("/match-merchant", (req: Request, res: Response) => {
    return res.locals.categoryController.matchMerchant(req, res);
  });

  // Endpoint para copiar una categoría global a las categorías del usuario
  router.post("/:categoryId/add-to-user", (req: Request, res: Response) => {
    return res.locals.categoryController.addGlobalCategoryToUser(req, res);
  });

  // Endpoint para asociar comercio a una categoría global existente
  router.post("/:categoryId/add-merchant", (req: Request, res: Response) => {
    return res.locals.categoryController.addMerchantToCategory(req, res);
  });

  // Endpoint para listar patrones de comercios de una categoría global
  router.get("/:categoryId/merchants", (req: Request, res: Response) => {
    return res.locals.categoryController.getMerchantsForCategory(req, res);
  });

  return router;
};

export default createCategoryRouter;
