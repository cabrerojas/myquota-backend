import { z } from "zod";

export const createTransactionSchema = z
  .object({
    amount: z.number().min(0),
    currency: z.string().min(1),
    cardType: z.string().min(1).optional(),
    cardLastDigits: z.string().max(4).optional(),
    merchant: z.string().min(1),
    categoryId: z.string().optional(),
    transactionDate: z.string().or(z.coerce.date()),
    bank: z.string().optional(),
    email: z.string().email().optional(),
    creditCardId: z.string().optional(),
    source: z.enum(["email", "manual"]).optional(),
    totalInstallments: z.number().int().min(1).optional(),
    paidInstallments: z.number().int().min(0).optional(),
  })
  .strict();

export const updateTransactionSchema = createTransactionSchema.partial();

export const createRefundSchema = z
  .object({
    amount: z.number().positive(),
    transactionDate: z.string().or(z.coerce.date()).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const initializeQuotasSchema = z.object({}).strict();

export const importBankTransactionsSchema = z.object({}).strict();

export const createManualTransactionSchema = z
  .object({
    merchant: z.string().min(1),
    purchaseDate: z.string().or(z.coerce.date()),
    quotaAmount: z.number().min(0),
    totalInstallments: z.number().int().min(1),
    paidInstallments: z.number().int().min(0),
    lastPaidMonth: z.string().regex(/^\d{4}-\d{2}$/),
    currency: z.string().min(1),
    categoryId: z.string().min(1).optional(),
  })
  .refine((data) => data.paidInstallments <= data.totalInstallments, {
    path: ["paidInstallments"],
    message: "paidInstallments no puede ser mayor a totalInstallments",
  })
  .strict();

export const updateManualTransactionSchema = createManualTransactionSchema;
