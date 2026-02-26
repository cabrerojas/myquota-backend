import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthError } from "@shared/errors/custom.error";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  loginWithGoogle = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, serverAuthCode } = req.body;
      if (!token) {
        res.status(400).json({ message: "Token no proporcionado" });
        return;
      }

      // 🔹 Enviar el idToken y serverAuthCode al servicio
      const tokens = await this.service.loginWithGoogle(token, serverAuthCode);

      res.status(200).json(tokens);
    } catch (error) {
      if (error instanceof AuthError) {
        console.error(`AuthError [${error.statusCode}]:`, error.message);
        res.status(error.statusCode).json({ message: error.message });
        return;
      }
      console.error("Error en login con Google:", error);
      res.status(500).json({ message: "Error interno en autenticación" });
    }
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ message: "refreshToken no proporcionado" });
        return;
      }

      const tokens = await this.service.refreshTokens(refreshToken);
      res.status(200).json(tokens);
    } catch (error) {
      console.error("Error en refresh controller:", error);
      res.status(401).json({ message: "Refresh token inválido o expirado" });
    }
  };
}
