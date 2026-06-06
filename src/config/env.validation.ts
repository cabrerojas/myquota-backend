// src/config/env.validation.ts
// Environment variable validation using Zod.
// Supabase mode is always active in production (USE_SUPABASE=true).

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // --- Feature Flag ---
  // Always 'true' in production — Firestore code has been removed.
  USE_SUPABASE: z.string().default('true'),

  // --- Supabase (required) ---
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- JWT (always required) ---
  JWT_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),

  // --- Google OAuth (always required) ---
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CREDENTIALS_JSON: z.string().optional(),

  // --- Server ---
  PORT: z.coerce.number().int().positive().default(3000),
  ALLOWED_ORIGINS: z.string().default(''),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // --- Encryption (AES-256 for Gmail tokens) ---
  ENCRYPTION_KEY: z.string().length(64),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  _env = result.data;

  // Additional validation for Supabase mode
  if (!_env.SUPABASE_URL) {
    console.error('SUPABASE_URL is required');
    process.exit(1);
  }
  if (!_env.SUPABASE_ANON_KEY) {
    console.error('SUPABASE_ANON_KEY is required');
    process.exit(1);
  }
  if (!_env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
  }
  // ENCRYPTION_KEY is required for Gmail OAuth token encryption at rest
  if (!_env.ENCRYPTION_KEY) {
    console.error(
      'ENCRYPTION_KEY is required. Generate one with: openssl rand -hex 32',
    );
    process.exit(1);
  }
  if (_env.ENCRYPTION_KEY.length !== 64) {
    console.error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32',
    );
    process.exit(1);
  }
}

export function getEnv(): Env {
  if (!_env) {
    throw new Error('Environment not validated. Call validateEnv() first.');
  }
  return _env;
}