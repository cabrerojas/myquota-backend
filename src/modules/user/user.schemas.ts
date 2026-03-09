import { z } from "zod";

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    picture: z.string().url().optional(),
  })
  .strict();
