import { Router } from "express";
import { downloadPdfJobController, getPdfJobStatusController } from "../controllers/pdf.controller";
import { authenticate } from "../middleware/authenticate";
import { scopeToOrg } from "../middleware/scopeToOrg";
import { validate } from "../middleware/validate";
import { pdfJobIdParamSchema } from "../schemas/pdf.schemas";

const pdfJobsRouter = Router();

pdfJobsRouter.use(authenticate, scopeToOrg);

pdfJobsRouter.get("/:jobId", validate({ params: pdfJobIdParamSchema }), getPdfJobStatusController);
pdfJobsRouter.get(
  "/:jobId/download",
  validate({ params: pdfJobIdParamSchema }),
  downloadPdfJobController,
);

export { pdfJobsRouter };
