import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { AuthError } from "@shared/errors/custom.error";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  loginWithGoogle = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ message: "Token no proporcionado" });
        return;
      }

      // 🔹 Enviar el idToken al servicio para validarlo y generar un JWT
      const jwtToken = await this.service.loginWithGoogle(token);

      res.status(200).json({ token: jwtToken });
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
}
