import { UserRole } from "@prisma/client";
import { Router } from "express";
import {
  archiveEstimateController,
  duplicateEstimateController,
  finalizeEstimateController,
  getEstimateByIdController,
  restoreEstimateController,
  softDeleteEstimateController,
  updateEstimateController,
} from "../controllers/estimate.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import { estimateIdParamSchema, updateEstimateBodySchema } from "../schemas/estimate.schemas";

const estimatesRouter = Router();

estimatesRouter.use(authenticate, scopeToOrg);

estimatesRouter.get(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ params: estimateIdParamSchema }),
  getEstimateByIdController,
);

estimatesRouter.patch(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: estimateIdParamSchema, body: updateEstimateBodySchema }),
  updateEstimateController,
);

estimatesRouter.post(
  "/:id/duplicate",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: estimateIdParamSchema }),
  duplicateEstimateController,
);

estimatesRouter.post(
  "/:id/finalize",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: estimateIdParamSchema }),
  finalizeEstimateController,
);

estimatesRouter.patch(
  "/:id/archive",
  authorize([UserRole.ADMIN]),
  validate({ params: estimateIdParamSchema }),
  archiveEstimateController,
);

estimatesRouter.delete(
  "/:id",
  authorize([UserRole.ADMIN]),
  validate({ params: estimateIdParamSchema }),
  softDeleteEstimateController,
);

estimatesRouter.post(
  "/:id/restore",
  authorize([UserRole.ADMIN]),
  validate({ params: estimateIdParamSchema }),
  restoreEstimateController,
);

export { estimatesRouter };
