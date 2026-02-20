import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type {
  AcceptInviteBodyInput,
  GetUsersQueryInput,
  InviteUserBodyInput,
  UpdateUserRoleBodyInput,
  UserIdParamInput,
} from "../schemas/user.schemas";
import { acceptInvite, deactivateUser, getUsers, inviteUser, updateUserRole } from "../services/user.service";
import type { RequestWithAuth } from "../types/auth";

export async function getUsersController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const query = req.query as unknown as GetUsersQueryInput;
    const result = await getUsers({
      organizationId: req.organizationId,
      page: query.page,
      pageSize: query.pageSize,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function inviteUserController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const body = req.body as InviteUserBodyInput;
    const result = await inviteUser({
      organizationId: req.organizationId,
      email: body.email,
      role: body.role,
      performedBy: req.auth.userId,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function acceptInviteController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as AcceptInviteBodyInput;
    const result = await acceptInvite({
      token: body.token,
      newPassword: body.newPassword,
      name: body.name,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateUserRoleController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as UserIdParamInput;
    const body = req.body as UpdateUserRoleBodyInput;
    const result = await updateUserRole({
      organizationId: req.organizationId,
      userId: params.id,
      role: body.role,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function deactivateUserController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as UserIdParamInput;
    const result = await deactivateUser({
      organizationId: req.organizationId,
      userId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
