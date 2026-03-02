import "./config/firebase"; // Esto inicializa Firebase y fireorm
import express from "express";
import dotenv from "dotenv";

import { errorHandler } from "./shared/middlewares/errorHandler";
import createTransactionRouter from "./modules/transaction/transaction.routes";
import createQuotaRouter from "./modules/quota/quota.routes";
import createCreditCardRouter from "./modules/creditCard/creditCard.routes";
import createUserRouter from "./modules/user/user.routes";
import createAuthRouter from "./modules/auth/auth.routes";
import createBillingPeriodRouter from "./modules/billingPeriod/billingPeriod.routes";

import createStatsRouter from "./modules/stats/stats.routes";
import createCategoryRouter from "./modules/category";

dotenv.config();
const app = express();

app.use(express.json());
app.use("/api", createCreditCardRouter());
app.use("/api", createTransactionRouter());
app.use("/api", createQuotaRouter());
app.use("/api", createUserRouter());
app.use("/api", createAuthRouter());
app.use("/api", createBillingPeriodRouter());
app.use("/api", createStatsRouter());

app.use("/api/categories", createCategoryRouter());

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.warn(`Servidor ejecutándose en el puerto ${PORT}`);
});
