import { z } from "zod";

export const loginGoogleSchema = z.object({
  token: z.string().optional(),
  code: z.string().optional(),
  codeVerifier: z.string().optional(),
  redirectUri: z.string().optional(),
  serverAuthCode: z.string().optional(),
  nonce: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken es requerido"),
});
