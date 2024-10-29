import express from 'express';
import dotenv from 'dotenv';
import transactionRoutes from './routes/transactionRoutes';
import quotaRoutes from './routes/quotaRoutes';

import { errorHandler } from './middlewares/errorHandler';

dotenv.config();
const app = express();

app.use(express.json());
app.use('/api', transactionRoutes);
app.use('/api', quotaRoutes);


app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
