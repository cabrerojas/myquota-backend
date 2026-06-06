// src/modules/auth/revokedToken.repository.supabase.ts
// Supabase (Postgres) implementation of the RevokedToken repository.
// Replaces Firestore collection-based storage with a dedicated table.

import { getSupabaseAdmin } from '@/config/supabase';
import crypto from 'crypto';

export class RevokedTokenRepositorySupabase {
  private readonly tableName = 'revoked_tokens';

  /**
   * isRevoked — checks if a token hash exists in the revoked_tokens table.
   * O(1) lookup via primary key on token_hash.
   */
  async isRevoked(tokenHash: string): Promise<boolean> {
    const { data, error } = await getSupabaseAdmin()
      .from(this.tableName)
      .select('token_hash')
      .eq('token_hash', tokenHash)
      .single();

    if (error?.code === 'PGRST116') return false; // Not found = not revoked
    if (error) {
      throw new Error(`Error checking revoked token: ${error.message}`);
    }

    return !!data;
  }

  /**
   * revoke — inserts a token hash into the revoked_tokens table.
   * Also purges expired tokens to keep the table lean.
   */
  async revoke(token: string, expiresAt: Date): Promise<void> {
    const supabase = getSupabaseAdmin();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Upsert: insert or update if already exists
    const { error: insertError } = await supabase
      .from(this.tableName)
      .upsert(
        {
          token_hash: tokenHash,
          revoked_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'token_hash' },
      );

    if (insertError) {
      throw new Error(`Error revoking token: ${insertError.message}`);
    }

    // Purge expired tokens (cleanup old entries)
    const { error: deleteError } = await supabase
      .from(this.tableName)
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (deleteError) {
      // Non-fatal: log but don't fail the revocation
      console.error('Error purging expired tokens:', deleteError.message);
    }
  }

  /**
   * purgeExpired — removes all tokens past their expiry date.
   * Called periodically (e.g., nightly cron) to keep the table small.
   */
  async purgeExpired(): Promise<number> {
    // Get count before deleting
    const { count: beforeCount } = await getSupabaseAdmin()
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    // Execute delete
    const { error } = await getSupabaseAdmin()
      .from(this.tableName)
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      throw new Error(`Error purging expired tokens: ${error.message}`);
    }

    return beforeCount ?? 0;
  }

  /**
   * isRevokedToken — convenience wrapper that hashes the token first.
   */
  async isRevokedToken(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return this.isRevoked(tokenHash);
  }
}