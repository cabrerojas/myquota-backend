import { Router } from 'express';
import { TransactionController } from '../controllers/transaction.controller';
import { TransactionRepository } from '../repositories/transaction.repository';
import { TransactionService } from '../services/transaction.service';

// Crear una función factory para la inicialización de dependencias
const createTransactionRouter = (): Router => {
    // Inicialización de dependencias
    const repository = new TransactionRepository();
    const service = new TransactionService(repository);
    const controller = new TransactionController(service);

    const router = Router();

    // Definir rutas
    router
        .get('/transactions', controller.getTransactions.bind(controller))
        .post('/transaction', controller.addTransaction.bind(controller))
        .get('/transactions/:transactionId', controller.getTransaction.bind(controller))
        .put('/transactions/:id', controller.updateTransaction.bind(controller))
        .delete('/transactions/:id', controller.deleteTransaction.bind(controller))
        .post('/transactions/import-bank-transactions', controller.importBankTransactions.bind(controller));

    return router;
};

export default createTransactionRouter;