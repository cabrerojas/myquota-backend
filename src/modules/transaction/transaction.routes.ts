import { Router } from 'express';
import { addTransaction, deleteTransaction, getTransaction, getTransactions, importBankTransactions, updateTransaction } from './transaction.controller';

const transactionRouter = Router();

transactionRouter.get('/transactions', getTransactions);
transactionRouter.post('/transaction', addTransaction);
transactionRouter.get('/transactions/:transactionId', getTransaction);
transactionRouter.put('/transactions/:id', updateTransaction);
transactionRouter.delete('/transactions/:id', deleteTransaction);
transactionRouter.post('/import-bank-transactions', importBankTransactions);

export default transactionRouter;
