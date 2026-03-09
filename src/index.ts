import { validateEnv } from "./config/env.validation";
validateEnv();

import "./config/firebase";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { errorHandler } from "./shared/middlewares/errorHandler";
import createTransactionRouter from "./modules/transaction/transaction.routes";
import createQuotaRouter from "./modules/quota/quota.routes";
import createCreditCardRouter from "./modules/creditCard/creditCard.routes";
import createUserRouter from "./modules/user/user.routes";
import createAuthRouter from "./modules/auth/auth.routes";
import createBillingPeriodRouter from "./modules/billingPeriod/billingPeriod.routes";
import createStatsRouter from "./modules/stats/stats.routes";
import createCategoryRouter from "./modules/category";

const app = express();

// Behind reverse proxy (Render, etc.) — needed for rate limiting & correct client IP
app.set("trust proxy", 1);

// --- Security middleware ---
app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// Rate limiting global: 100 requests per 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});
app.use("/api", globalLimiter);

// Rate limiting estricto para auth: 10 requests per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Demasiados intentos de autenticación, intenta más tarde",
  },
});
app.use("/api/login", authLimiter);
app.use("/api/refresh", authLimiter);

app.use(express.json({ limit: "1mb" }));

// --- Routes ---
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
