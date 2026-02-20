import { createReadStream } from "fs";
import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type { EstimateIdParamInput } from "../schemas/estimate.schemas";
import type { PdfJobIdParamInput } from "../schemas/pdf.schemas";
import {
  enqueueEstimatePdfJob,
  getPdfJobDownload,
  getPdfJobStatus,
} from "../services/pdf.service";
import type { RequestWithAuth } from "../types/auth";

export async function requestEstimatePdfController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await enqueueEstimatePdfJob({
      organizationId: req.organizationId,
      estimateId: params.id,
      requestedBy: req.auth.userId,
    });

    res.status(202).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getPdfJobStatusController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as PdfJobIdParamInput;
    const result = getPdfJobStatus({
      organizationId: req.organizationId,
      jobId: params.jobId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function downloadPdfJobController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as PdfJobIdParamInput;
    const result = await getPdfJobDownload({
      organizationId: req.organizationId,
      jobId: params.jobId,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    createReadStream(result.filePath).pipe(res);
  } catch (error) {
    next(error);
  }
}
