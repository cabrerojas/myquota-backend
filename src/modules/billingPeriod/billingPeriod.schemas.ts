import { z } from "zod";

export const createBillingPeriodSchema = z
  .object({
    creditCardId: z.string().min(1),
    month: z.string().min(1),
    startDate: z.string().or(z.coerce.date()),
    endDate: z.string().or(z.coerce.date()),
    dueDate: z.string().or(z.coerce.date()),
  })
  .strict();

export const updateBillingPeriodSchema = createBillingPeriodSchema.partial();
