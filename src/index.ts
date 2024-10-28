import express from 'express';
import dotenv from 'dotenv';
import transactionRoutes from './routes/transactionRoutes';
import { errorHandler } from './middlewares/errorHandler';

dotenv.config();
const app = express();

app.use(express.json());
app.use('/api', transactionRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
