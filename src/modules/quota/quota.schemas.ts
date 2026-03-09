import { z } from "zod";

export const createQuotaSchema = z
  .object({
    transactionId: z.string().min(1),
    amount: z.number().min(0),
    due_date: z.string().or(z.coerce.date()),
    status: z.enum(["pending", "paid"]),
    currency: z.string().min(1),
    payment_date: z.string().or(z.coerce.date()).nullable().optional(),
  })
  .strict();

export const updateQuotaSchema = createQuotaSchema.partial();

export const splitQuotasSchema = z
  .object({
    numberOfQuotas: z.number().int().min(1),
  })
  .strict();
