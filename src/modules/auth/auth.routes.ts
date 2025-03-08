import { Router } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

const createAuthRouter = (): Router => {
  const router = Router();
  const controller = new AuthController(new AuthService());

  router.post("/login/google", controller.loginWithGoogle.bind(controller));

  return router;
};

export default createAuthRouter;
