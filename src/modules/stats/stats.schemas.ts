import { z } from "zod";

export const WhatIfProductSchema = z.object({
  merchant: z.string().min(1),
  amount: z.number().gt(0),
  currency: z.enum(["CLP", "USD"]),
  totalInstallments: z.number().int().min(1),
  firstDueDate: z.string().refine((s) => !isNaN(Date.parse(s)), {
    message: "Invalid ISO date string",
  }),
  creditCardId: z.string().optional(),
});

export const WhatIfRequestSchema = z.object({
  products: z.array(WhatIfProductSchema).min(1).max(50),
});

export const MonthProjectionSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  amountCLP: z.number(),
  amountUSD: z.number(),
  breakdown: z.any().optional(),
});

export const WhatIfResponseSchema = z.object({
  projection: z.array(MonthProjectionSchema),
  meta: z.object({ months: z.number().int() }),
});

export type WhatIfProduct = z.infer<typeof WhatIfProductSchema>;
export type WhatIfRequest = z.infer<typeof WhatIfRequestSchema>;
export type WhatIfResponse = z.infer<typeof WhatIfResponseSchema>;
