import { z } from "zod";

export const loginGoogleSchema = z.object({
  token: z.string().min(1, "Token es requerido"),
  serverAuthCode: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken es requerido"),
});
