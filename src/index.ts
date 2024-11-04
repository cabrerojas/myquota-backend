import './config/firebase'; // Esto inicializa Firebase y fireorm
import express from 'express';
import dotenv from 'dotenv';

import { errorHandler } from './shared/middlewares/errorHandler';
import createTransactionRouter from './modules/transaction/routes/transaction.routes';
import createQuotaRouter from './modules/quota/routes/quota.routes';


dotenv.config();
const app = express();

app.use(express.json());
app.use('/api', createTransactionRouter());
app.use('/api', createQuotaRouter());

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.warn(`Servidor ejecutándose en el puerto ${PORT}`);
});
