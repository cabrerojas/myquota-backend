import { Router } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UserRepository } from "@modules/user/user.repository";

const createAuthRouter = (): Router => {
  const router = Router();
  const userRepository = new UserRepository();
  const authService = new AuthService(userRepository);
  const controller = new AuthController(authService);

  router.post("/login/google", controller.loginWithGoogle.bind(controller));
  router.post("/refresh", controller.refresh.bind(controller));

  return router;
};

export default createAuthRouter;
