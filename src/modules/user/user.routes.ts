import { Router } from "express";
import { UserController } from "./user.controller";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";
import { authenticate } from "@/shared/middlewares/auth.middleware"; // 📌 Middleware para validar JWT

const createUserRouter = (): Router => {
  const router = Router();
  const repository = new UserRepository();
  const service = new UserService(repository);
  const controller = new UserController(service);

  // 📌 Rutas protegidas (requieren JWT válido)
  router.get("/users", authenticate, (req, res) =>
    controller.getUsers(req, res)
  );
  router.get("/users/:userId", authenticate, (req, res) =>
    controller.getUserById(req, res)
  );
  router.get("/users/email/:email", authenticate, (req, res) =>
    controller.getUserByEmail(req, res)
  );
  router.put("/users/:userId", authenticate, (req, res) =>
    controller.updateUser(req, res)
  );
  router.delete("/users/:userId", authenticate, (req, res) =>
    controller.deleteUser(req, res)
  );

  // 📌 Registro de usuario (no requiere autenticación)
  router.post("/user", (req, res) => controller.createUser(req, res));

  return router;
};

export default createUserRouter;
