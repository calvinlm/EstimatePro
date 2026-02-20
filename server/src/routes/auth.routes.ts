import { Router } from "express";
import {
  forgotPasswordController,
  loginController,
  logoutController,
  resetPasswordController,
  refreshController,
} from "../controllers/auth.controller";
import { rateLimitByIp } from "../middleware/rateLimiter";

const authRouter = Router();
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const loginRateLimiter = rateLimitByIp({ windowMs: FIFTEEN_MINUTES_MS, maxRequests: 10 });
const forgotPasswordRateLimiter = rateLimitByIp({
  windowMs: FIFTEEN_MINUTES_MS,
  maxRequests: 5,
});

authRouter.post("/login", loginRateLimiter, loginController);
authRouter.post("/refresh", refreshController);
authRouter.post("/logout", logoutController);
authRouter.post("/forgot-password", forgotPasswordRateLimiter, forgotPasswordController);
authRouter.post("/reset-password", resetPasswordController);

export { authRouter };
