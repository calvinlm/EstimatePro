import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type { RequestWithAuth } from "../types/auth";

export function authorize(allowedRoles: string[]) {
  return (req: RequestWithAuth, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required"));
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      next(new AppError(403, "AUTH_FORBIDDEN", "Insufficient permissions"));
      return;
    }

    next();
  };
}
