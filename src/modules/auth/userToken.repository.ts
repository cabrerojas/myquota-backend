// src/modules/auth/userToken.repository.ts
// Repository for user_tokens table — Gmail OAuth tokens stored encrypted at rest.
// Used when USE_SUPABASE=true.

import { SupabaseRepository } from '@/shared/classes/supabase.repository';
import { IBaseEntity } from '@/shared/interfaces/base.repository';
import { encrypt, decrypt, getEncryptionKey } from '@/shared/lib/crypto';
import { RepositoryError } from '@shared/errors/custom.error';

/**
 * UserToken entity — represents an encrypted OAuth token record.
 */
export interface UserToken extends IBaseEntity {
  userId: string;
  provider: string;
  accessToken?: string;
  refreshToken?: string; // Stored encrypted in DB as refresh_token_encrypted
  expiryDate?: Date;
}

export class UserTokenRepository extends SupabaseRepository<UserToken> {
  constructor() {
    super('user_tokens');
  }

  /**
   * Upsert a user token — encrypts refreshToken before writing to DB.
   */
  async upsertToken(
    userId: string,
    provider: string,
    accessToken: string,
    refreshToken: string,
    expiryDate?: Date,
  ): Promise<UserToken> {
    const encryptionKey = getEncryptionKey();
    const encryptedRefresh = encrypt(refreshToken, encryptionKey);

    const now = new Date().toISOString();

    const { data, error } = await this.client()
      .from(this.tableName)
      .upsert(
        {
          user_id: userId,
          provider,
          access_token: accessToken,
          refresh_token_encrypted: encryptedRefresh,
          expiry_date: expiryDate?.toISOString() ?? null,
          updated_at: now,
          deleted_at: null,
        },
        { onConflict: 'user_id,provider' },
      )
      .select()
      .single();

    if (error || !data) {
      throw new RepositoryError(`Error upserting user token: ${error?.message ?? 'no data'}`, 500);
    }

    return this.mapRowToEntity(data as unknown as Record<string, unknown>);
  }

  /**
   * Find a token record by userId + provider.
   * Decrypts refreshToken before returning.
   */
  async findByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<UserToken | null> {
    const { data, error } = await this.client()
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(`Error finding user token: ${error.message}`, 500);
    }

    return this.mapRowToEntity(data as unknown as Record<string, unknown>);
  }

  /**
   * Hard delete — removes the token record entirely.
   */
  async deleteToken(userId: string, provider: string): Promise<boolean> {
    const { error } = await this.client()
      .from(this.tableName)
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      throw new RepositoryError(`Error deleting user token: ${error.message}`, 500);
    }
    return true;
  }

  protected override mapRowToEntity(row: Record<string, unknown>): UserToken {
    // Decrypt refreshToken if present
    const encryptedRefresh = row.refresh_token_encrypted as string | null;
    let refreshToken: string | undefined;

    if (encryptedRefresh) {
      try {
        const encryptionKey = getEncryptionKey();
        refreshToken = decrypt(encryptedRefresh, encryptionKey);
      } catch (err) {
        // Log but don't fail — the record exists even if decryption fails
        console.error('[UserTokenRepository] Failed to decrypt refreshToken:', err);
        refreshToken = undefined;
      }
    }

    return {
      id: row.id as string,
      userId: row.user_id as string,
      provider: row.provider as string,
      accessToken: row.access_token as string | undefined,
      refreshToken,
      expiryDate: row.expiry_date ? new Date(row.expiry_date as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
    };
  }
}