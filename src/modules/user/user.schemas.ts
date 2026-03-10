import { z } from "zod";

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    picture: z.string().url().optional(),
    monthlyBudgetCLP: z.number().min(0).optional(),
    monthlyBudgetUSD: z.number().min(0).optional(),
  })
  .strict();
