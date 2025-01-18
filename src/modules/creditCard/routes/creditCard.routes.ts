import { Router } from 'express';
import { CreditCardController } from '../controllers/creditCard.controller';
import { CreditCardRepository } from '../repositories/creditCard.repository';
import { CreditCardService } from '../services/creditCard.service';

// Crear una función factory para la inicialización de dependencias
const createCreditCardRouter = (): Router => {
    // Inicialización de dependencias
    const repository = new CreditCardRepository();
    const service = new CreditCardService(repository);
    const controller = new CreditCardController(service);

    const router = Router();

    // Definir rutas
    router
      .get("/creditCards", controller.getCreditCard.bind(controller))
      .post("/creditCard", controller.addCreditCard.bind(controller))
      .get(
        "/creditCard/:CreditCardId",
        controller.getCreditCard.bind(controller)
      )
      .put("/creditCard/:id", controller.updateCreditCard.bind(controller))
      .delete("/creditCard/:id", controller.deleteCreditCard.bind(controller));

    return router;
};

export default createCreditCardRouter;