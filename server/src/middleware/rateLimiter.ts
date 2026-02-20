import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimitByIp(options: RateLimitOptions) {
  const buckets = new Map<string, RateLimitBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = getClientIp(req);
    const current = buckets.get(ip);

    if (!current || now >= current.resetAt) {
      buckets.set(ip, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      next(new AppError(429, "RATE_LIMIT_EXCEEDED", "Too many requests. Please try again later."));
      return;
    }

    current.count += 1;
    buckets.set(ip, current);
    next();
  };
}
