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

export const createManualTransactionSchema = z
  .object({
    merchant: z.string().min(1),
    purchaseDate: z.string().or(z.coerce.date()),
    quotaAmount: z.number().min(0),
    totalInstallments: z.number().int().min(1),
    paidInstallments: z.number().int().min(0),
    lastPaidMonth: z.string().optional(),
    currency: z.string().min(1),
  })
  .strict();

export const updateManualTransactionSchema =
  createManualTransactionSchema.partial();
