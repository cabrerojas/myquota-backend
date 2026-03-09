import { Router } from "express";
import { UserController } from "./user.controller";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";
import { authenticate } from "@/shared/middlewares/auth.middleware";

const createUserRouter = (): Router => {
  const router = Router();
  const repository = new UserRepository();
  const service = new UserService(repository);
  const controller = new UserController(service);

  // El usuario solo puede acceder a su propio perfil (userId del JWT)
  router.get("/users/me", authenticate, (req, res) =>
    controller.getMyProfile(req, res),
  );
  router.put("/users/me", authenticate, (req, res) =>
    controller.updateMyProfile(req, res),
  );
  router.delete("/users/me", authenticate, (req, res) =>
    controller.deleteMyProfile(req, res),
  );

  return router;
};

export default createUserRouter;
