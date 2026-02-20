import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type {
  CreateFormulaBodyInput,
  FormulaIdParamInput,
  GetFormulasQueryInput,
  TestFormulaBodyInput,
  UpdateFormulaBodyInput,
} from "../schemas/formula.schemas";
import {
  createFormula,
  deactivateFormula,
  getFormulaById,
  getFormulas,
  getFormulaVersions,
  testFormula,
  updateFormula,
} from "../services/formula.service";
import type { RequestWithAuth } from "../types/auth";

export async function getFormulasController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const query = req.query as unknown as GetFormulasQueryInput;
    const result = await getFormulas({
      organizationId: req.organizationId,
      page: query.page,
      pageSize: query.pageSize,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getFormulaByIdController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as FormulaIdParamInput;
    const result = await getFormulaById({
      organizationId: req.organizationId,
      formulaId: params.id,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getFormulaVersionsController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as FormulaIdParamInput;
    const result = await getFormulaVersions({
      organizationId: req.organizationId,
      formulaId: params.id,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function createFormulaController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const body = req.body as CreateFormulaBodyInput;
    const result = await createFormula({
      organizationId: req.organizationId,
      name: body.name,
      description: body.description,
      category: body.category,
      inputs: body.inputs,
      expressions: body.expressions,
      outputs: body.outputs,
      performedBy: req.auth.userId,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateFormulaController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as FormulaIdParamInput;
    const body = req.body as UpdateFormulaBodyInput;
    const result = await updateFormula({
      organizationId: req.organizationId,
      formulaId: params.id,
      name: body.name,
      description: body.description,
      category: body.category,
      inputs: body.inputs,
      expressions: body.expressions,
      outputs: body.outputs,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function deactivateFormulaController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as FormulaIdParamInput;
    const result = await deactivateFormula({
      organizationId: req.organizationId,
      formulaId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function testFormulaController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as FormulaIdParamInput;
    const body = req.body as TestFormulaBodyInput;
    const result = await testFormula({
      organizationId: req.organizationId,
      formulaId: params.id,
      inputValues: body.inputValues,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
