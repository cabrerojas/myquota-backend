import { z } from "zod";

export const createCreditCardSchema = z
  .object({
    cardType: z.string().min(1),
    cardLastDigits: z.string().min(1).max(4),
    status: z.string().min(1),
    cardHolderName: z.string().min(1),
    billingPeriodStart: z.string().or(z.coerce.date()),
    billingPeriodEnd: z.string().or(z.coerce.date()),
    dueDate: z.string().or(z.coerce.date()),
    nationalAmountUsed: z.number().min(0).optional(),
    nationalAmountAvailable: z.number().min(0).optional(),
    nationalTotalLimit: z.number().min(0).optional(),
    nationalAdvanceAvailable: z.number().min(0).optional(),
    internationalAmountUsed: z.number().min(0).optional(),
    internationalAmountAvailable: z.number().min(0).optional(),
    internationalTotalLimit: z.number().min(0).optional(),
    internationalAdvanceAvailable: z.number().min(0).optional(),
  })
  .strict();

export const updateCreditCardSchema = createCreditCardSchema.partial();
