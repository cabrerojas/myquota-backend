import { Router, Request, Response, NextFunction } from "express";
import { CreditCardController } from "./creditCard.controller";
import { CreditCardRepository } from "./creditCard.repository";
import { CreditCardService } from "./creditCard.service";

const createCreditCardRouter = (): Router => {
  const router = Router();

  // Middleware para extraer `userId` de la URL y configurar las dependencias
  router.use(
    "/:userId/creditCards",
    (req: Request, res: Response, next: NextFunction) => {
      const { userId } = req.params;

      if (!userId) {
         res
          .status(400)
          .json({ message: "❌ userId es requerido en la URL." });
      }

      try {
        // 📌 Crear repositorio con `userId`
        const repository = new CreditCardRepository(userId);
        const service = new CreditCardService(repository);
        const controller = new CreditCardController(service);

        // 📌 Guardar en `res.locals` en lugar de `req`
        res.locals.creditCardController = controller;
        next(); // 🔥 Asegurar que `next()` se llama para continuar con la ejecución
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
  router.get("/:userId/creditCards", (req: Request, res: Response) => {
    return res.locals.creditCardController.getCreditCards(req, res);
  });

  router.post("/:userId/creditCards", (req: Request, res: Response) => {
    return res.locals.creditCardController.addCreditCard(req, res);
  });

  router.get(
    "/:userId/creditCards/:creditCardId",
    (req: Request, res: Response) => {
      return res.locals.creditCardController.getCreditCard(req, res);
    }
  );

  router.put(
    "/:userId/creditCards/:creditCardId",
    (req: Request, res: Response) => {
      return res.locals.creditCardController.updateCreditCard(req, res);
    }
  );

  router.delete(
    "/:userId/creditCards/:creditCardId",
    (req: Request, res: Response) => {
      return res.locals.creditCardController.deleteCreditCard(req, res);
    }
  );

  return router;
};

export default createCreditCardRouter;
