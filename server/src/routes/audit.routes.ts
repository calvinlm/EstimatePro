import { UserRole } from "@prisma/client";
import { Router } from "express";
import { getAuditLogsController } from "../controllers/audit.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import { getAuditLogsQuerySchema } from "../schemas/audit.schemas";

const auditRouter = Router();

auditRouter.use(authenticate, scopeToOrg);

auditRouter.get(
  "/",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ query: getAuditLogsQuerySchema }),
  getAuditLogsController,
);

export { auditRouter };
