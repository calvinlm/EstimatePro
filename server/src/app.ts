import cors from "cors";
import express from "express";
import helmet from "helmet";
import { v4 as uuidv4 } from "uuid";
import type { Application, NextFunction, Request, Response } from "express";
import { auditRouter } from "./routes/audit.routes";
import { authRouter } from "./routes/auth.routes";
import { estimatesRouter } from "./routes/estimates.routes";
import { formulasRouter } from "./routes/formulas.routes";
import { lineItemsRouter } from "./routes/line-items.routes";
import { pdfJobsRouter } from "./routes/pdf-jobs.routes";
import { projectsRouter } from "./routes/projects.routes";
import { setupRouter } from "./routes/setup.routes";
import { usersRouter } from "./routes/users.routes";

type RequestWithId = Request & { requestId?: string };

type ApiError = Error & {
  statusCode?: number;
  code?: string;
  details?: unknown;
};

function buildCorsOrigins(): string[] {
  const raw = process.env.FRONTEND_URL ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function createApp(): Application {
  const app = express();
  const allowedOrigins = buildCorsOrigins();

  app.use((req: RequestWithId, res: Response, next: NextFunction) => {
    const requestId = uuidv4();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by CORS policy"));
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/audit", auditRouter);
  app.use("/estimates", estimatesRouter);
  app.use("/formulas", formulasRouter);
  app.use("/line-items", lineItemsRouter);
  app.use("/pdf-jobs", pdfJobsRouter);
  app.use("/projects", projectsRouter);
  app.use("/setup", setupRouter);
  app.use("/users", usersRouter);

  app.use((req: RequestWithId, res: Response) => {
    res.status(404).json({
      status: "error",
      code: "NOT_FOUND",
      message: "Route not found",
      requestId: req.requestId ?? "unknown",
    });
  });

  app.use((error: ApiError, req: RequestWithId, res: Response, _next: NextFunction) => {
    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? "INTERNAL_SERVER_ERROR";
    const message = statusCode >= 500 ? "Internal server error" : error.message;

    res.status(statusCode).json({
      status: "error",
      code,
      message,
      requestId: req.requestId ?? "unknown",
      ...(error.details ? { details: error.details } : {}),
    });
  });

  return app;
}
