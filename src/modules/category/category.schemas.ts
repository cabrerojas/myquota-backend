import { z } from "zod";

export const createCategorySchema = z
  .object({
    name: z.string().min(1),
    normalizedName: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial();

export const matchMerchantSchema = z
  .object({
    merchantName: z.string().min(1, "merchantName es requerido"),
  })
  .strict();

export const createCategoryWithMerchantSchema = z
  .object({
    name: z.string().min(1),
    color: z.string().optional(),
    icon: z.string().optional(),
    isGlobal: z.boolean().optional(),
    merchantName: z.string().min(1),
    pattern: z.string().optional(),
    userId: z.string().optional(),
  })
  .strict();

export const addMerchantToCategorySchema = z
  .object({
    merchantName: z.string().min(1),
    pattern: z.string().optional(),
  })
  .strict();
