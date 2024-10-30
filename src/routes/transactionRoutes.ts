import { Router } from 'express';
import { addTransaction, getTransaction, getTransactions, importBankTransactions } from '../controllers/transactionController';

const router = Router();

router.get('/transactions', getTransactions);
router.post('/transaction', addTransaction);
router.get('/transactions/:transactionId', getTransaction);
router.post('/import-bank-transactions', importBankTransactions);

export default router;
