import { z } from "zod";

const billingPeriodMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use the YYYY-MM format");

export const createBillingPeriodSchema = z
  .object({
    creditCardId: z.string().min(1),
    month: billingPeriodMonthSchema,
    startDate: z.string().or(z.coerce.date()),
    endDate: z.string().or(z.coerce.date()),
    dueDate: z.string().or(z.coerce.date()),
  })
  .strict();

export const updateBillingPeriodSchema = createBillingPeriodSchema.partial();

export const payBillingPeriodSchema = z.object({}).strict();
