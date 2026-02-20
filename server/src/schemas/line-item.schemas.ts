import { Category } from "@prisma/client";
import { z } from "zod";
import { idParamSchema, uuidSchema } from "./common.schemas";

export const estimateLineItemsParamSchema = z.object({
  estimateId: uuidSchema,
});

const lineItemTextField = z.string().trim().min(1);

export const createEstimateLineItemBodySchema = z.object({
  category: z.nativeEnum(Category),
  description: lineItemTextField,
  quantity: z.coerce.number().min(0),
  unit: lineItemTextField,
  unitMaterialCost: z.coerce.number().min(0),
  unitLaborCost: z.coerce.number().min(0),
});

export const lineItemIdParamSchema = idParamSchema;

export const updateLineItemBodySchema = z
  .object({
    category: z.nativeEnum(Category).optional(),
    description: lineItemTextField.optional(),
    quantity: z.coerce.number().min(0).optional(),
    unit: lineItemTextField.optional(),
    unitMaterialCost: z.coerce.number().min(0).optional(),
    unitLaborCost: z.coerce.number().min(0).optional(),
  })
  .refine(
    (body) =>
      body.category !== undefined ||
      body.description !== undefined ||
      body.quantity !== undefined ||
      body.unit !== undefined ||
      body.unitMaterialCost !== undefined ||
      body.unitLaborCost !== undefined,
    {
      message: "At least one field must be provided",
      path: ["root"],
    },
  );

export const overrideLineItemBodySchema = z.object({
  quantity: z.coerce.number().min(0),
  overrideReason: z.string().trim().min(10),
});

export const computeLineItemBodySchema = z
  .object({
    formulaId: uuidSchema.optional(),
    formulaName: z.string().trim().min(1).optional(),
    outputVariable: z.string().trim().min(1).optional(),
    inputValues: z.record(z.string(), z.unknown()),
  })
  .refine((body) => body.formulaId !== undefined || body.formulaName !== undefined, {
    message: "Either formulaId or formulaName must be provided",
    path: ["formulaId"],
  });

export type EstimateLineItemsParamInput = z.infer<typeof estimateLineItemsParamSchema>;
export type CreateEstimateLineItemBodyInput = z.infer<typeof createEstimateLineItemBodySchema>;
export type LineItemIdParamInput = z.infer<typeof lineItemIdParamSchema>;
export type UpdateLineItemBodyInput = z.infer<typeof updateLineItemBodySchema>;
export type OverrideLineItemBodyInput = z.infer<typeof overrideLineItemBodySchema>;
export type ComputeLineItemBodyInput = z.infer<typeof computeLineItemBodySchema>;
