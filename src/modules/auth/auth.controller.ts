import { Request, Response } from "express";
import { AuthService } from "./auth.service";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  loginWithGoogle = async (_: Request, res: Response): Promise<void> => {
    try {
      // 🔹 Iniciar sesión con Google, generar JWT y verificar emailTokens
      const token = await this.service.loginWithGoogle();
      res.status(200).json({ token });
    } catch (error) {
      console.error("Error en login con Google:", error);
      res.status(500).json({ message: "Error en autenticación" });
    }
  };
}
