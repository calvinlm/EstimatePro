import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type { RequestWithAuth } from "../types/auth";

export function scopeToOrg(req: RequestWithAuth, _res: Response, next: NextFunction): void {
  if (!req.auth?.organizationId) {
    next(new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required"));
    return;
  }

  req.organizationId = req.auth.organizationId;
  next();
}
