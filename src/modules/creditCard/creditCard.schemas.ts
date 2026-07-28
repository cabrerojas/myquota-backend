import { z } from "zod";

const creditCardBaseSchema = z
  .object({
    cardType: z.string().min(1),
    cardLastDigits: z.string().min(1).max(4),
    status: z.string().min(1),
    cardHolderName: z.string().min(1),
    billingPeriodStart: z.string().or(z.coerce.date()).optional(),
    billingPeriodEnd: z.string().or(z.coerce.date()).optional(),
    dueDate: z.string().or(z.coerce.date()).optional(),
    closingDay: z.number().int().min(1).max(31).optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
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

export const createCreditCardSchema = creditCardBaseSchema.refine(
  (data) =>
    (data.closingDay !== undefined && data.dueDay !== undefined) ||
    (data.billingPeriodStart !== undefined &&
      data.billingPeriodEnd !== undefined &&
      data.dueDate !== undefined),
  {
    message:
      "Debe proporcionar closingDay+dueDay o billingPeriodStart+billingPeriodEnd+dueDate",
    path: ["closingDay"],
  },
);

export const updateCreditCardSchema = creditCardBaseSchema.partial();
