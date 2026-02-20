import type { NextFunction, Response } from "express";
import { AppError } from "../errors/app-error";
import type {
  ComputeLineItemBodyInput,
  CreateEstimateLineItemBodyInput,
  EstimateLineItemsParamInput,
  LineItemIdParamInput,
  OverrideLineItemBodyInput,
  UpdateLineItemBodyInput,
} from "../schemas/line-item.schemas";
import {
  createEstimateLineItem,
  computeLineItem,
  deleteLineItem,
  overrideLineItem,
  updateLineItem,
} from "../services/line-item.service";
import type { RequestWithAuth } from "../types/auth";

export async function createEstimateLineItemController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as EstimateLineItemsParamInput;
    const body = req.body as CreateEstimateLineItemBodyInput;

    const result = await createEstimateLineItem({
      organizationId: req.organizationId,
      estimateId: params.estimateId,
      category: body.category,
      description: body.description,
      quantity: body.quantity,
      unit: body.unit,
      unitMaterialCost: body.unitMaterialCost,
      unitLaborCost: body.unitLaborCost,
      performedBy: req.auth.userId,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateLineItemController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as LineItemIdParamInput;
    const body = req.body as UpdateLineItemBodyInput;

    const result = await updateLineItem({
      organizationId: req.organizationId,
      lineItemId: params.id,
      category: body.category,
      description: body.description,
      quantity: body.quantity,
      unit: body.unit,
      unitMaterialCost: body.unitMaterialCost,
      unitLaborCost: body.unitLaborCost,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function overrideLineItemController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as LineItemIdParamInput;
    const body = req.body as OverrideLineItemBodyInput;

    const result = await overrideLineItem({
      organizationId: req.organizationId,
      lineItemId: params.id,
      quantity: body.quantity,
      overrideReason: body.overrideReason,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteLineItemController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as LineItemIdParamInput;

    const result = await deleteLineItem({
      organizationId: req.organizationId,
      lineItemId: params.id,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function computeLineItemController(
  req: RequestWithAuth,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.organizationId || !req.auth?.userId) {
      throw new AppError(401, "AUTH_UNAUTHORIZED", "Authentication required");
    }

    const params = req.params as unknown as LineItemIdParamInput;
    const body = req.body as ComputeLineItemBodyInput;

    const result = await computeLineItem({
      organizationId: req.organizationId,
      lineItemId: params.id,
      formulaId: body.formulaId,
      formulaName: body.formulaName,
      outputVariable: body.outputVariable,
      inputValues: body.inputValues,
      performedBy: req.auth.userId,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}
