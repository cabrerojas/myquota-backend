import { Router, Request, Response, NextFunction } from "express";
import { CreditCardController } from "./creditCard.controller";
import { CreditCardRepository } from "./creditCard.repository";
import { CreditCardService } from "./creditCard.service";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createCreditCardRouter = (): Router => {
  const router = Router();

  // 📌 Middleware para autenticación y configuración de dependencias
  router.use(
    "/creditCards",
    authenticate,
    (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?.userId;

      if (!userId) {
         res.status(400).json({ message: "❌ userId es requerido." });
         return;
      }

      try {
        // 📌 Crear repositorio con `userId`
        const repository = new CreditCardRepository(userId);
        const service = new CreditCardService(repository);
        const controller = new CreditCardController(service);

        // 📌 Guardar en `res.locals`
        res.locals.creditCardController = controller;
        next(); // 🔥 Continuar con la ejecución
      } catch (error) {
        console.error("❌ Error en el middleware de CreditCard:", error);
        res
          .status(500)
          .json({
            message: "❌ Error interno en la configuración de CreditCard.",
          });
      }
    }
  );

  // 📌 Definir rutas usando `res.locals.creditCardController`
  router.get("/creditCards", (req: Request, res: Response) => {
    return res.locals.creditCardController.getCreditCards(req, res);
  });

  router.post("/creditCards", (req: Request, res: Response) => {
    return res.locals.creditCardController.addCreditCard(req, res);
  });

  router.get("/creditCards/:creditCardId", (req: Request, res: Response) => {
    return res.locals.creditCardController.getCreditCard(req, res);
  });

  router.put("/creditCards/:creditCardId", (req: Request, res: Response) => {
    return res.locals.creditCardController.updateCreditCard(req, res);
  });

  router.delete("/creditCards/:creditCardId", (req: Request, res: Response) => {
    return res.locals.creditCardController.deleteCreditCard(req, res);
  });

  return router;
};

export default createCreditCardRouter;
