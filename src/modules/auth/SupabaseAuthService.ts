// src/modules/auth/SupabaseAuthService.ts
// Supabase Auth integration — replaces Firebase Admin Google OAuth verification.
// Used when USE_SUPABASE=true.

import { getSupabaseAnon } from '@/config/supabase';
import { getEnv } from '@config/env.validation';
import { AuthError } from '@shared/errors/custom.error';
import * as jwt from 'jsonwebtoken';

export class SupabaseAuthService {
  /**
   * signInWithEmail — email + password login via Supabase Auth.
   */
  async signInWithEmail(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      throw new AuthError('Credenciales inválidas', 401);
    }

    return this.buildTokens(data.user.id, data.user.email ?? email);
  }

  /**
   * signUpWithEmail — register new user via Supabase Auth.
   */
  async signUpWithEmail(
    email: string,
    password: string,
    metadata?: { name?: string; picture?: string },
  ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata ?? {},
      },
    });

    if (error || !data.user) {
      throw new AuthError(`Error al registrar: ${error?.message ?? 'Unknown'}`, 400);
    }

    return this.buildTokens(data.user.id, data.user.email ?? email);
  }

  /**
   * signInWithGoogle — verify Google ID token via Supabase.
   * Replaces OAuth2Client.verifyIdToken from google-auth-library.
   */
  async signInWithGoogle(
    idToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error || !data.user) {
      console.error('[SupabaseAuthService] Google signInWithIdToken error:', error?.message);
      throw new AuthError('Token de Google inválido o expirado', 401);
    }

    return this.buildTokens(data.user.id, data.user.email ?? '');
  }

/**
   * signOut — placeholder for token revocation.
   * Actual revocation is handled by the caller via RevokedTokenRepository.
   */
  async signOut(): Promise<void> {
    // No-op: revocation is handled in auth.middleware.ts and auth.service.ts
  }

  /**
   * refreshSession — refresh access token using Supabase session refresh.
   * Replaces the manual JWT verification + rotation.
   */
  async refreshSession(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.user || !data.session) {
      throw new AuthError('Refresh token inválido o expirado', 401);
    }

    const env = getEnv();
    const jwtSecret = env.JWT_SECRET as jwt.Secret;
    const refreshSecret = env.JWT_REFRESH_SECRET as jwt.Secret;

    // Issue custom JWTs wrapping the Supabase session
    const newAccessToken = jwt.sign(
      { userId: data.user.id, email: data.user.email, type: 'access' },
      jwtSecret,
      { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN } as jwt.SignOptions,
    );

    const newRefreshToken = jwt.sign(
      { userId: data.user.id, type: 'refresh' },
      refreshSecret,
      { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions,
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /**
   * getUser — retrieve user info from Supabase by access token.
   * Used by auth.middleware.ts to validate tokens.
   */
  async getUser(accessToken: string): Promise<{ id: string; email?: string } | null> {
    const supabase = getSupabaseAnon();

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email,
    };
  }

  /**
   * buildTokens — generate custom JWT access + refresh tokens.
   * Supabase manages the session; we issue our own JWTs for API authorization.
   */
  private buildTokens(
    userId: string,
    email: string,
  ): { accessToken: string; refreshToken: string; userId: string } {
    const env = getEnv();
    const jwtSecret = env.JWT_SECRET as jwt.Secret;
    const refreshSecret = env.JWT_REFRESH_SECRET as jwt.Secret;

    const accessToken = jwt.sign(
      { userId, email, type: 'access' },
      jwtSecret,
      { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN } as jwt.SignOptions,
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      refreshSecret,
      { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions,
    );

    return { accessToken, refreshToken, userId };
  }
}