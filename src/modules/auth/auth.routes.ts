import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { validate } from '@shared/middlewares/validate.middleware';
import { loginGoogleSchema, refreshTokenSchema } from './auth.schemas';

const createAuthRouter = (): Router => {
  const router = Router();
  // AuthService now manages its own dependencies (SupabaseAuthService, RevokedTokenRepositorySupabase)
  const authService = new AuthService();
  const controller = new AuthController(authService);

  router.post(
    '/login/google',
    validate(loginGoogleSchema),
    controller.loginWithGoogle.bind(controller),
  );
  router.post(
    '/refresh',
    validate(refreshTokenSchema),
    controller.refresh.bind(controller),
  );
  router.post(
    '/logout',
    validate(refreshTokenSchema),
    controller.logout.bind(controller),
  );

  return router;
};

export default createAuthRouter;