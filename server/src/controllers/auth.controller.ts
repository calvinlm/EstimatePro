import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  resetPasswordSchema,
  refreshSchema,
} from "../schemas/auth.schemas";
import { forgotPassword, login, logout, refresh, resetPassword } from "../services/auth.service";

function mapValidationIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.status(200).json({ data: result });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, "VALIDATION_ERROR", "Validation failed", mapValidationIssues(error)));
      return;
    }

    next(error);
  }
}

export async function refreshController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = refreshSchema.parse(req.body);
    const result = await refresh(input);
    res.status(200).json({ data: result });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, "VALIDATION_ERROR", "Validation failed", mapValidationIssues(error)));
      return;
    }

    next(error);
  }
}

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = logoutSchema.parse(req.body);
    await logout(input);
    res.status(200).json({ data: { success: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, "VALIDATION_ERROR", "Validation failed", mapValidationIssues(error)));
      return;
    }

    next(error);
  }
}

export async function forgotPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    await forgotPassword(input);
    res.status(200).json({
      data: {
        success: true,
        message: "If an account exists for that email, a reset link has been sent.",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, "VALIDATION_ERROR", "Validation failed", mapValidationIssues(error)));
      return;
    }

    next(error);
  }
}

export async function resetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = resetPasswordSchema.parse(req.body);
    await resetPassword(input);
    res.status(200).json({ data: { success: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      next(new AppError(400, "VALIDATION_ERROR", "Validation failed", mapValidationIssues(error)));
      return;
    }

    next(error);
  }
}
