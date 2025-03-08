import { Router } from "express";
import { UserController } from "./user.controller";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

const createUserRouter = (): Router => {
  const router = Router();
  const repository = new UserRepository();
  const service = new UserService(repository);
  const controller = new UserController(service);

  router.get("/users", controller.getUsers.bind(controller));
  router.post("/user", controller.createUser.bind(controller));
  router.get("/users/:userId", controller.getUserById.bind(controller));
  router.get("/users/email/:email", controller.getUserByEmail.bind(controller));
  router.put("/users/:userId", controller.updateUser.bind(controller));
  router.delete("/users/:userId", controller.deleteUser.bind(controller));

  return router;
};

export default createUserRouter;
