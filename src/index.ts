import './config/firebase'; // Esto inicializa Firebase y fireorm
import express from 'express';
import dotenv from 'dotenv';

import { errorHandler } from './shared/middlewares/errorHandler';
import createTransactionRouter from './modules/transaction/routes/transaction.routes';
import createQuotaRouter from './modules/quota/routes/quota.routes';
import createCreditCardRouter from './modules/creditCard/routes/creditCard.routes';
import createUserRouter from './modules/user/routes/user.routes';
import createAuthRouter from './modules/auth/routes/auth.routes';


dotenv.config();
const app = express();

app.use(express.json());
app.use('/api', createCreditCardRouter());
app.use('/api', createTransactionRouter());
app.use('/api', createQuotaRouter());
app.use("/api", createUserRouter());
app.use("/api", createAuthRouter());


app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.warn(`Servidor ejecutándose en el puerto ${PORT}`);
});
