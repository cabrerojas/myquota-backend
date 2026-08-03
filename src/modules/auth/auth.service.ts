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
import { UserTokenRepository } from './userToken.repository';
import { google } from 'googleapis';

export class AuthService {
  private supabaseAuth: SupabaseAuthService;
  private revokedTokenRepository: RevokedTokenRepositorySupabase;
  private userTokenRepository: UserTokenRepository;

  constructor() {
    this.supabaseAuth = new SupabaseAuthService();
    this.revokedTokenRepository = new RevokedTokenRepositorySupabase();
    this.userTokenRepository = new UserTokenRepository();
  }

  /**
   * loginWithGoogle — verifies Google ID token and returns access + refresh tokens.
   *
   * Two flows supported:
   * 1. Native (token): receives id_token directly → verifies via Supabase/Firestore
   * 2. Web (code + codeVerifier): receives authorization code → exchanges for id_token
   *    via Google token endpoint (PKCE) → verifies via Supabase/Firestore
   */
  async loginWithGoogle(
    idToken?: string,
    serverAuthCode?: string,
    nonce?: string,
    code?: string,
    codeVerifier?: string,
    redirectUri?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const env = getEnv();

    // ── Web flow: exchange authorization code for id_token ──
    if (code) {
      const clientId = env.GOOGLE_CLIENT_ID;

      // Exchange code for tokens via Google's token endpoint
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          redirect_uri: redirectUri ?? '',
          grant_type: 'authorization_code',
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        console.error('[AuthService] Google token exchange error:', err);
        throw new AuthError('Error al intercambiar código de autorización', 401);
      }

      const tokenData = await tokenRes.json();
      idToken = tokenData.id_token;

      if (!idToken) {
        throw new AuthError('Google no devolvió id_token en el intercambio', 401);
      }

      // If Gmail scope was requested, Google returns access_token + refresh_token
      if (tokenData.access_token) {
        // We'll save Gmail tokens after Supabase login
        serverAuthCode = undefined; // Don't double-exchange; we already have tokens
      }
    }

    if (!idToken) {
      throw new AuthError('Token o código de autorización requerido', 400);
    }

    if (env.USE_SUPABASE === 'true') {
      // Supabase path: signInWithIdToken handles Google identity verification
      const result = await this.supabaseAuth.signInWithGoogle(idToken, nonce);

      // If serverAuthCode is provided, exchange it for Gmail tokens and save them
      if (serverAuthCode) {
        try {
          await this.saveGmailTokens(result.userId, serverAuthCode);
        } catch (error) {
          console.error('[AuthService] Error saving Gmail tokens:', error);
          // Don't fail login if Gmail token save fails
        }
      }

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
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
   * saveGmailTokens — exchanges serverAuthCode for Gmail tokens and saves them encrypted.
   */
  private async saveGmailTokens(userId: string, serverAuthCode: string): Promise<void> {
    const env = getEnv();
    
    // Use the same GOOGLE_CLIENT_ID that the frontend used to obtain serverAuthCode.
    // CREDENTIALS_JSON has a different client_id — mixing them causes exchange failure.
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn('[AuthService] GOOGLE_CLIENT_ID/CLIENT_SECRET not configured, skipping Gmail token save');
      return;
    }

    // No redirect_uri needed for serverAuthCode exchange from mobile apps
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);

    const { tokens } = await oAuth2Client.getToken(serverAuthCode);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain Gmail tokens from serverAuthCode');
    }

    await this.userTokenRepository.upsertToken(
      userId,
      'gmail',
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    );

    console.log(`[AuthService] Gmail tokens saved for user ${userId}`);
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