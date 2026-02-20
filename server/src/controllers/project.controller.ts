import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type {
  CreateProjectBodyInput,
  GetProjectsQueryInput,
  ProjectIdParamInput,
  UpdateProjectBodyInput,
} from "../schemas/project.schemas";
import {
  archiveProject,
  createProject,
  getProjectById,
  getProjects,
  updateProject,
} from "../services/project.service";
import type { RequestWithAuth } from "../types/auth";

export async function getProjectsController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const query = req.query as unknown as GetProjectsQueryInput;
    const result = await getProjects({
      organizationId: req.organizationId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function createProjectController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const body = req.body as CreateProjectBodyInput;
    const result = await createProject({
      organizationId: req.organizationId,
      name: body.name,
      location: body.location,
      projectType: body.projectType,
      performedBy: req.auth.userId,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getProjectByIdController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as ProjectIdParamInput;
    const result = await getProjectById({
      organizationId: req.organizationId,
      projectId: params.id,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateProjectController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as ProjectIdParamInput;
    const body = req.body as UpdateProjectBodyInput;

    const result = await updateProject({
      organizationId: req.organizationId,
      projectId: params.id,
      name: body.name,
      location: body.location,
      projectType: body.projectType,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function archiveProjectController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as ProjectIdParamInput;
    const result = await archiveProject({
      organizationId: req.organizationId,
      projectId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
