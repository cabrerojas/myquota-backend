// src/config/supabase.ts
// Supabase client singleton for admin and anon clients
// Used when USE_SUPABASE=true

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;
let supabaseAnon: SupabaseClient | null = null;

// Lazy initialization — clients are created on first use, not at import time.
// This avoids instantiating Supabase clients in environments where Firestore
// is the active backend (USE_SUPABASE=false at startup).

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set when USE_SUPABASE=true. ' +
        'Copy .env.supabase.template to .env and fill in the values.',
      );
    }

    supabaseAdmin = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

export function getSupabaseAnon(): SupabaseClient {
  if (!supabaseAnon) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY must be set when USE_SUPABASE=true. ' +
        'Copy .env.supabase.template to .env and fill in the values.',
      );
    }

    supabaseAnon = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAnon;
}

/**
 * Resets the cached clients (useful for testing or hot-reload scenarios).
 * In normal operation this should not be called.
 */
export function resetSupabaseClients(): void {
  supabaseAdmin = null;
  supabaseAnon = null;
}