import { Request, Response } from "express";
import { UserService } from "./user.service";

export class UserController {
  constructor(private readonly service: UserService) {}

  getMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "No autorizado" });
        return;
      }

      const user = await this.service.findById(userId);
      if (!user) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Error getting user profile:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  updateMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "No autorizado" });
        return;
      }

      const updatedUser = await this.service.update(userId, req.body);
      if (!updatedUser) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };

  deleteMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "No autorizado" });
        return;
      }

      const result = await this.service.softDelete(userId);
      if (!result) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
      console.error("Error deleting user profile:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  };
}
