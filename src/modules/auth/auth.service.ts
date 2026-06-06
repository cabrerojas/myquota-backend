// src/modules/auth/auth.service.ts
// Authentication service — handles Google OAuth login, token refresh, and logout.
// When USE_SUPABASE=true: uses Supabase Auth for identity verification.
// When USE_SUPABASE=false: uses Firebase Admin + google-auth-library.

import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { getEnv } from '@config/env.validation';
import { AuthError } from '@shared/errors/custom.error';
import { SupabaseAuthService } from './SupabaseAuthService';
import { RevokedTokenRepositorySupabase } from './revokedToken.repository.supabase';

export class AuthService {
  private supabaseAuth: SupabaseAuthService;
  private revokedTokenRepository: RevokedTokenRepositorySupabase;

  constructor() {
    this.supabaseAuth = new SupabaseAuthService();
    this.revokedTokenRepository = new RevokedTokenRepositorySupabase();
  }

  /**
   * loginWithGoogle — verifies Google ID token and returns access + refresh tokens.
   * When USE_SUPABASE=true: uses Supabase signInWithIdToken (provider: 'google').
   * When USE_SUPABASE=false: uses OAuth2Client.verifyIdToken (Firebase path).
   */
  async loginWithGoogle(
    idToken: string,
    _serverAuthCode?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const env = getEnv();

    if (env.USE_SUPABASE === 'true') {
      // Supabase path: signInWithIdToken handles Google identity verification
      return this.supabaseAuth.signInWithGoogle(idToken).then((result) => ({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }));
    }

    // Firestore path: use google-auth-library OAuth2Client
    const clientId = env.GOOGLE_CLIENT_ID;
    const client = new OAuth2Client(clientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      console.error('Error verificando idToken de Google:', error);
      throw new AuthError('Token de Google inválido o expirado', 401);
    }

    if (!payload || !payload.email) {
      throw new AuthError(
        'Token no contiene información válida del usuario',
        401,
      );
    }

    const { email } = payload;

    // Issue JWTs (Firestore path — Supabase path returns its own tokens)
    const jwtSecret = env.JWT_SECRET as jwt.Secret;
    const accessToken = jwt.sign(
      { userId: email, email, type: 'access' },
      jwtSecret,
      { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN } as jwt.SignOptions,
    );

    const refreshSecret = env.JWT_REFRESH_SECRET as jwt.Secret;
    const refreshToken = jwt.sign(
      { userId: email, type: 'refresh' },
      refreshSecret,
      { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions,
    );

    return { accessToken, refreshToken };
  }

  /**
   * refreshTokens — validates refresh token and returns new access + refresh tokens.
   * When USE_SUPABASE=true: uses SupabaseAuthService.refreshSession.
   * When USE_SUPABASE=false: uses manual JWT verification + rotation.
   */
  async refreshTokens(refreshToken: string) {
    const env = getEnv();

    if (env.USE_SUPABASE === 'true') {
      return this.supabaseAuth.refreshSession(refreshToken);
    }

    // Firestore path: manual JWT verification
    try {
      const refreshSecret = env.JWT_REFRESH_SECRET;
      const decoded = jwt.verify(refreshToken, refreshSecret) as {
        userId: string;
        type?: string;
        exp?: number;
      };

      if (!decoded || decoded.type !== 'refresh' || !decoded.userId) {
        throw new Error('Refresh token inválido');
      }

      // Check if token is revoked
      const isRevoked = await this.revokedTokenRepository.isRevokedToken(refreshToken);
      if (isRevoked) {
        throw new Error('Refresh token revocado');
      }

      const jwtSecret = env.JWT_SECRET as jwt.Secret;
      const accessToken = jwt.sign(
        { userId: decoded.userId, email: decoded.userId, type: 'access' },
        jwtSecret,
        {
          expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
        } as jwt.SignOptions,
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, type: 'refresh' },
        refreshSecret,
        {
          expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
        } as jwt.SignOptions,
      );

      // Revoke the old refresh token
      const expiresAt = decoded.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.revokedTokenRepository.revoke(refreshToken, expiresAt);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * logout — revokes the refresh token by inserting its hash into revoked_tokens.
   * Works with both Supabase and Firestore paths.
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const refreshSecret = getEnv().JWT_REFRESH_SECRET;
      let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      try {
        const decoded = jwt.verify(refreshToken, refreshSecret) as {
          exp?: number;
        };
        if (decoded.exp) {
          expiresAt = new Date(decoded.exp * 1000);
        }
      } catch {
        // Token invalid/expired — use default expiry
      }

      await this.revokedTokenRepository.revoke(refreshToken, expiresAt);
    } catch (error) {
      console.error('[AuthService] logout error:', error);
      // Don't fail logout if revocation fails — token may already be expired
    }
  }
}