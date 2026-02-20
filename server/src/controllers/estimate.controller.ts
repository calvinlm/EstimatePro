import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type {
  CreateProjectEstimateBodyInput,
  EstimateIdParamInput,
  GetProjectEstimatesQueryInput,
  ProjectEstimatesParamInput,
  UpdateEstimateBodyInput,
} from "../schemas/estimate.schemas";
import {
  archiveEstimate,
  createProjectEstimate,
  duplicateEstimate,
  finalizeEstimate,
  getEstimateById,
  getProjectEstimates,
  restoreEstimate,
  softDeleteEstimate,
  updateEstimate,
} from "../services/estimate.service";
import type { RequestWithAuth } from "../types/auth";

export async function getProjectEstimatesController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as ProjectEstimatesParamInput;
    const query = req.query as unknown as GetProjectEstimatesQueryInput;

    const result = await getProjectEstimates({
      organizationId: req.organizationId,
      projectId: params.projectId,
      page: query.page,
      pageSize: query.pageSize,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function createProjectEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as ProjectEstimatesParamInput;
    const body = req.body as CreateProjectEstimateBodyInput;

    const result = await createProjectEstimate({
      organizationId: req.organizationId,
      projectId: params.projectId,
      label: body.label,
      markupRate: body.markupRate,
      vatRate: body.vatRate,
      performedBy: req.auth.userId,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getEstimateByIdController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await getEstimateById({
      organizationId: req.organizationId,
      estimateId: params.id,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const body = req.body as UpdateEstimateBodyInput;

    const result = await updateEstimate({
      organizationId: req.organizationId,
      estimateId: params.id,
      markupRate: body.markupRate,
      vatRate: body.vatRate,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function duplicateEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await duplicateEstimate({
      organizationId: req.organizationId,
      estimateId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function finalizeEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await finalizeEstimate({
      organizationId: req.organizationId,
      estimateId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function archiveEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await archiveEstimate({
      organizationId: req.organizationId,
      estimateId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function softDeleteEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await softDeleteEstimate({
      organizationId: req.organizationId,
      estimateId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function restoreEstimateController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateIdParamInput;
    const result = await restoreEstimate({
      organizationId: req.organizationId,
      estimateId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
