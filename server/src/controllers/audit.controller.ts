import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type { GetAuditLogsQueryInput } from "../schemas/audit.schemas";
import { getAuditLogs } from "../services/audit-log.service";
import type { RequestWithAuth } from "../types/auth";

export async function getAuditLogsController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const query = req.query as unknown as GetAuditLogsQueryInput;
    const result = await getAuditLogs({
      organizationId: req.organizationId,
      page: query.page,
      pageSize: query.pageSize,
      from: query.from,
      to: query.to,
      userId: query.userId,
      entityType: query.entityType,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
