import { OAuth2Client } from "google-auth-library";
import * as jwt from "jsonwebtoken";
import { UserRepository } from "@modules/user/user.repository";
import { User } from "@modules/user/user.model";
import { AuthError } from "@shared/errors/custom.error";
import { saveTokenToFirestore } from "@/config/gmailAuth";
import { RevokedTokenRepository } from "./revokedToken.repository";
import { getEnv } from "@config/env.validation";

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly revokedTokenRepository: RevokedTokenRepository,
  ) {}

  async loginWithGoogle(
    idToken: string,
    serverAuthCode?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const env = getEnv();
    const clientId = env.GOOGLE_CLIENT_ID;

    // Verificar el `idToken` con Google
    const client = new OAuth2Client(clientId);
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      console.error("Error verificando idToken de Google:", error);
      throw new AuthError("Token de Google inválido o expirado", 401);
    }

    if (!payload || !payload.email) {
      throw new AuthError(
        "Token no contiene información válida del usuario",
        401,
      );
    }

    const { email, name, picture } = payload;

    // Buscar o crear usuario usando el repositorio
    let user = await this.userRepository.findOne({ email });
    let userId: string;

    if (!user) {
      const newUser: User = {
        id: "",
        email,
        name: name || "",
        picture: picture || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      user = await this.userRepository.create(newUser);
      userId = user.id;
    } else {
      userId = user.id;

      // Actualizar picture si cambió
      if (picture && picture !== user.picture) {
        await this.userRepository.update(userId, {
          picture,
          updatedAt: new Date(),
        });
      }
    }

    // Si hay serverAuthCode, intercambiar por tokens de Gmail y guardarlos
    if (serverAuthCode) {
      try {
        const oAuth2Client = new OAuth2Client(
          clientId,
          env.GOOGLE_CLIENT_SECRET,
          "", // redirect_uri vacío para mobile
        );
        const { tokens } = await oAuth2Client.getToken(serverAuthCode);

        await saveTokenToFirestore(userId, tokens);
      } catch (error) {
        // No fallar el login si falla el guardado de tokens de Gmail
        console.error("Error al guardar tokens de Gmail:", error);
      }
    }

    // Generar access token (corto) y refresh token (largo)
    const jwtSecret = env.JWT_SECRET as jwt.Secret;
    const accessToken = jwt.sign({ userId, email, type: "access" }, jwtSecret, {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    } as jwt.SignOptions);

    const refreshSecret = env.JWT_REFRESH_SECRET as jwt.Secret;
    const refreshToken = jwt.sign({ userId, type: "refresh" }, refreshSecret, {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const env = getEnv();
      const refreshSecret = env.JWT_REFRESH_SECRET;
      const decoded = jwt.verify(refreshToken, refreshSecret) as {
        userId: string;
        type?: string;
        exp?: number;
      };
      if (!decoded || decoded.type !== "refresh" || !decoded.userId) {
        throw new Error("Refresh token inválido");
      }

      // Verificar si el token fue revocado
      const isRevoked =
        await this.revokedTokenRepository.isRevoked(refreshToken);
      if (isRevoked) {
        throw new Error("Refresh token revocado");
      }

      const user = await this.userRepository.findById(decoded.userId);
      if (!user) throw new Error("Usuario no encontrado");

      const jwtSecret = env.JWT_SECRET as jwt.Secret;
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email, type: "access" },
        jwtSecret,
        {
          expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
        } as jwt.SignOptions,
      );

      const newRefreshToken = jwt.sign(
        { userId: user.id, type: "refresh" },
        refreshSecret,
        {
          expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
        } as jwt.SignOptions,
      );

      // Revocar el refresh token anterior
      const expiresAt = decoded.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.revokedTokenRepository.revoke(refreshToken, expiresAt);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      console.error("Error refreshing token:", error);
      throw error;
    }
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const refreshSecret = getEnv().JWT_REFRESH_SECRET;
      const decoded = jwt.verify(refreshToken, refreshSecret) as {
        exp?: number;
      };
      const expiresAt = decoded.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.revokedTokenRepository.revoke(refreshToken, expiresAt);
    } catch {
      // Si el token ya expiró o es inválido, no importa — igualmente revocamos el hash
      await this.revokedTokenRepository.revoke(
        refreshToken,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      );
    }
  }
}
