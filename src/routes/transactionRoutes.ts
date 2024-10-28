import { Router } from 'express';
import { addTransaction, getTransactions, importBankTransactions } from '../controllers/transactionController';

const router = Router();

router.get('/transactions', getTransactions);
router.post('/transaction', addTransaction);
router.get('/import-bank-transactions', importBankTransactions);


export default router;
