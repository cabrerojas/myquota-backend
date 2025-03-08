import { Request, Response } from "express";
import { UserService } from "./user.service";

export class UserController {
  constructor(private readonly service: UserService) {}

  // 📌 Obtener todos los usuarios
  getUsers = async (_: Request, res: Response): Promise<void> => {
    try {
      const users = await this.service.findAll();
      res.status(200).json(users);
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({
        message: "Error al obtener usuarios",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // 📌 Crear un nuevo usuario asegurando que el email sea único
  createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, name } = req.body;

      // 🔹 Validar que se envíen `email` y `name`
      if (!email || !name) {
         res
          .status(400)
          .json({ message: "❌ Email y nombre son requeridos." });
          return;
      }

      // 🔹 Crear el usuario
      const user = await this.service.createUser(email, name);
       res.status(201).json(user); // 🔥 Asegurar que la función termine aquí
       return;
    } catch (error) {
      console.error("❌ Error creating user:", error);

      if (
        error instanceof Error &&
        error.message.includes("Ya existe un usuario")
      ) {
         res.status(409).json({ message: error.message }); // 🔥 Agregar `return` aquí
        return;
      }

       res.status(500).json({
        message: "❌ Error al crear el usuario",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }
  };

  // 📌 Obtener un usuario por ID
  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const user = await this.service.findById(userId);

      if (!user) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Error getting user by ID:", error);
      res.status(500).json({
        message: "Error al obtener el usuario",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // 📌 Obtener un usuario por email
  getUserByEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.params;
      const user = await this.service.getUserByEmail(email);

      if (!user) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Error getting user by email:", error);
      res.status(500).json({
        message: "Error al obtener el usuario por email",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // 📌 Actualizar un usuario
  updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const updatedData = req.body;
      const updatedUser = await this.service.update(userId, updatedData);

      if (!updatedUser) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json({
        message: "Usuario actualizado exitosamente",
        data: updatedUser,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({
        message: "Error al actualizar el usuario",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // 📌 Eliminar un usuario (soft delete)
  deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const result = await this.service.softDelete(userId);

      if (!result) {
        res.status(404).json({ message: "Usuario no encontrado" });
        return;
      }

      res.status(200).json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({
        message: "Error al eliminar el usuario",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
