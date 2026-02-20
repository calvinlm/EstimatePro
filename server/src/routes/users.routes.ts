import { UserRole } from "@prisma/client";
import { Router } from "express";
import {
  acceptInviteController,
  deactivateUserController,
  getUsersController,
  inviteUserController,
  updateUserRoleController,
} from "../controllers/user.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import {
  acceptInviteBodySchema,
  getUsersQuerySchema,
  inviteUserBodySchema,
  updateUserRoleBodySchema,
  userIdParamSchema,
} from "../schemas/user.schemas";

const usersRouter = Router();

usersRouter.post("/accept-invite", validate({ body: acceptInviteBodySchema }), acceptInviteController);

usersRouter.use(authenticate, scopeToOrg);

usersRouter.get(
  "/",
  authorize([UserRole.ADMIN]),
  validate({ query: getUsersQuerySchema }),
  getUsersController,
);

usersRouter.post(
  "/invite",
  authorize([UserRole.ADMIN]),
  validate({ body: inviteUserBodySchema }),
  inviteUserController,
);

usersRouter.patch(
  "/:id/role",
  authorize([UserRole.ADMIN]),
  validate({ params: userIdParamSchema, body: updateUserRoleBodySchema }),
  updateUserRoleController,
);

usersRouter.patch(
  "/:id/deactivate",
  authorize([UserRole.ADMIN]),
  validate({ params: userIdParamSchema }),
  deactivateUserController,
);

export { usersRouter };
