import { UserRole } from "@prisma/client";
import { Router } from "express";
import {
  createFormulaController,
  deactivateFormulaController,
  getFormulaByIdController,
  getFormulasController,
  getFormulaVersionsController,
  testFormulaController,
  updateFormulaController,
} from "../controllers/formula.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import {
  createFormulaBodySchema,
  formulaIdParamSchema,
  getFormulasQuerySchema,
  testFormulaBodySchema,
  updateFormulaBodySchema,
} from "../schemas/formula.schemas";

const formulasRouter = Router();

formulasRouter.use(authenticate, scopeToOrg);

formulasRouter.get(
  "/",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ query: getFormulasQuerySchema }),
  getFormulasController,
);

formulasRouter.post(
  "/",
  authorize([UserRole.ADMIN]),
  validate({ body: createFormulaBodySchema }),
  createFormulaController,
);

formulasRouter.put(
  "/:id",
  authorize([UserRole.ADMIN]),
  validate({ params: formulaIdParamSchema, body: updateFormulaBodySchema }),
  updateFormulaController,
);

formulasRouter.post(
  "/:id/deactivate",
  authorize([UserRole.ADMIN]),
  validate({ params: formulaIdParamSchema }),
  deactivateFormulaController,
);

formulasRouter.post(
  "/:id/test",
  authorize([UserRole.ADMIN]),
  validate({ params: formulaIdParamSchema, body: testFormulaBodySchema }),
  testFormulaController,
);

formulasRouter.get(
  "/:id/versions",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ params: formulaIdParamSchema }),
  getFormulaVersionsController,
);

formulasRouter.get(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ params: formulaIdParamSchema }),
  getFormulaByIdController,
);

export { formulasRouter };
