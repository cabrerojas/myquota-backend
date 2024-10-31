import './config/firebase'; // Esto inicializa Firebase y fireorm
import express from 'express';
import dotenv from 'dotenv';
import transactionRouter from './modules/transaction/transaction.routes';
import quotaRoutes from './modules/quota/quota.routes';
import { errorHandler } from './middlewares/errorHandler';


dotenv.config();
const app = express();

app.use(express.json());
app.use('/api', transactionRouter);
app.use('/api', quotaRoutes);


app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
