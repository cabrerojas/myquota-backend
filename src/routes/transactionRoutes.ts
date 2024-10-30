import { Router } from 'express';
import { addTransaction, deleteTransaction, getTransaction, getTransactions, importBankTransactions, updateTransaction } from '../controllers/transactionController';

const router = Router();

router.get('/transactions', getTransactions);
router.post('/transaction', addTransaction);
router.get('/transactions/:transactionId', getTransaction);
router.put('/transactions/:id', updateTransaction);
router.delete('/transactions/:id', deleteTransaction);
router.post('/import-bank-transactions', importBankTransactions);

export default router;
