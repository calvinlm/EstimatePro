import { UserRole } from "@prisma/client";
import { Router } from "express";
import {
  archiveProjectController,
  createProjectController,
  getProjectByIdController,
  getProjectsController,
  updateProjectController,
} from "../controllers/project.controller";
import {
  createProjectEstimateController,
  getProjectEstimatesController,
} from "../controllers/estimate.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import {
  createProjectEstimateBodySchema,
  getProjectEstimatesQuerySchema,
  projectEstimatesParamSchema,
} from "../schemas/estimate.schemas";
import {
  createProjectBodySchema,
  getProjectsQuerySchema,
  projectIdParamSchema,
  updateProjectBodySchema,
} from "../schemas/project.schemas";

const projectsRouter = Router();

projectsRouter.use(authenticate, scopeToOrg);

projectsRouter.get(
  "/",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ query: getProjectsQuerySchema }),
  getProjectsController,
);

projectsRouter.post(
  "/",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ body: createProjectBodySchema }),
  createProjectController,
);

projectsRouter.get(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ params: projectIdParamSchema }),
  getProjectByIdController,
);

projectsRouter.patch(
  "/:id",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: projectIdParamSchema, body: updateProjectBodySchema }),
  updateProjectController,
);

projectsRouter.patch(
  "/:id/archive",
  authorize([UserRole.ADMIN]),
  validate({ params: projectIdParamSchema }),
  archiveProjectController,
);

projectsRouter.get(
  "/:projectId/estimates",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR, UserRole.VIEWER]),
  validate({ params: projectEstimatesParamSchema, query: getProjectEstimatesQuerySchema }),
  getProjectEstimatesController,
);

projectsRouter.post(
  "/:projectId/estimates",
  authorize([UserRole.ADMIN, UserRole.ESTIMATOR]),
  validate({ params: projectEstimatesParamSchema, body: createProjectEstimateBodySchema }),
  createProjectEstimateController,
);

export { projectsRouter };
