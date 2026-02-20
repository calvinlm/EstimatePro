import { UserRole } from "@prisma/client";
import { Router } from "express";
import {
  computeLineItemController,
  deleteLineItemController,
  overrideLineItemController,
  updateLineItemController,
} from "../controllers/line-item.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import {
  lineItemIdParamSchema,
  computeLineItemBodySchema,
  overrideLineItemBodySchema,
  updateLineItemBodySchema,
} from "../schemas/line-item.schemas";

const lineItemsRouter = Router();

lineItemsRouter.use(authenticate, scopeToOrg);

lineItemsRouter.patch(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: lineItemIdParamSchema, body: updateLineItemBodySchema }),
  updateLineItemController,
);

lineItemsRouter.post(
  "/:id/override",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: lineItemIdParamSchema, body: overrideLineItemBodySchema }),
  overrideLineItemController,
);

lineItemsRouter.delete(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: lineItemIdParamSchema }),
  deleteLineItemController,
);

lineItemsRouter.post(
  "/:id/compute",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: lineItemIdParamSchema, body: computeLineItemBodySchema }),
  computeLineItemController,
);

export { lineItemsRouter };
