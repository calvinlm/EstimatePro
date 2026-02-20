import jwt from "jsonwebtoken";
import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type { RequestWithAuth } from "../types/auth";

type AccessTokenPayload = {
  sub: string;
  organizationId: string;
  role: string;
  type: "access";
};

function parseAuthorizationHeader(value: string | undefined): string {
  if (!value) {
    throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
  }

  const [scheme, token] = value.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
  }

  return token;
}

export function authenticate(req: RequestWithAuth, _res: Response, next: NextFunction): void {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next(new AppError(500, "SERVER_MISCONFIGURED", "Internal server error"));
    return;
  }

  try {
    const token = parseAuthorizationHeader(req.headers.authorization);
    const decoded = jwt.verify(token, secret);

    if (
      !decoded ||
      typeof decoded !== "object" ||
      decoded.type !== "access" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.organizationId !== "string" ||
      typeof decoded.role !== "string"
    ) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const payload: AccessTokenPayload = {
      sub: decoded.sub,
      organizationId: decoded.organizationId,
      role: decoded.role,
      type: "access",
    };

    req.auth = {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required"));
  }
}
