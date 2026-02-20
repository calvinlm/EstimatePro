import {
  CalculationSource,
  EstimateStatus,
  Prisma,
  type Category,
} from "@prisma/client";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { evaluateFormula, FormulaEvaluationError } from "../formulas/evaluator";
import type { FormulaDefinition, FormulaOutputDefinition } from "../formulas/types";
import { prisma } from "../prisma/client";
import { logAudit } from "./audit.service";
import { calculateTotals } from "./estimate.service";

type CreateEstimateLineItemInput = {
  organizationId: string;
  estimateId: string;
  category: Category;
  description: string;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLaborCost: number;
  performedBy: string;
};

type UpdateLineItemInput = {
  organizationId: string;
  lineItemId: string;
  category?: Category;
  description?: string;
  quantity?: number;
  unit?: string;
  unitMaterialCost?: number;
  unitLaborCost?: number;
  performedBy: string;
};

type OverrideLineItemInput = {
  organizationId: string;
  lineItemId: string;
  quantity: number;
  overrideReason: string;
  performedBy: string;
};

type DeleteLineItemInput = {
  organizationId: string;
  lineItemId: string;
  performedBy: string;
};

type ComputeLineItemInput = {
  organizationId: string;
  lineItemId: string;
  formulaId?: string;
  formulaName?: string;
  outputVariable?: string;
  inputValues: Record<string, unknown>;
  performedBy: string;
};

export type CreateEstimateLineItemResult = {
  lineItem: {
    id: string;
    estimateId: string;
    category: Category;
    description: string;
    quantity: Prisma.Decimal;
    unit: string;
    unitMaterialCost: Prisma.Decimal;
    unitLaborCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    calculationSource: CalculationSource;
    originalComputedQuantity: Prisma.Decimal | null;
    originalComputedCost: Prisma.Decimal | null;
    overrideReason: string | null;
    locked: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  estimate: {
    id: string;
    subtotal: Prisma.Decimal;
    markupAmount: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    updatedAt: Date;
  };
};

type ComputeLineItemResult = CreateEstimateLineItemResult & {
  computation: {
    id: string;
    formulaId: string;
    formulaVersion: number;
  };
};

type LineItemWithTotals = {
  id: string;
  estimateId: string;
  category: Category;
  description: string;
  quantity: Prisma.Decimal;
  unit: string;
  unitMaterialCost: Prisma.Decimal;
  unitLaborCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  calculationSource: CalculationSource;
  originalComputedQuantity: Prisma.Decimal | null;
  originalComputedCost: Prisma.Decimal | null;
  overrideReason: string | null;
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const formulaDefinitionSchema = z.object({
  inputs: z.array(
    z.object({
      variable: z.string().min(1),
      label: z.string().min(1),
      unit: z.string().min(1),
      type: z.enum(["number", "integer"]),
      min: z.number().optional(),
      max: z.number().optional(),
      defaultValue: z.number().optional(),
    }),
  ),
  expressions: z.array(
    z.object({
      variable: z.string().min(1),
      expression: z.string().min(1),
    }),
  ),
  outputs: z
    .array(
      z.object({
        variable: z.string().min(1),
        lineItemField: z.string().min(1),
        unit: z.string().min(1),
      }),
    )
    .optional(),
});

type StoredFormula = {
  id: string;
  name: string;
  description: string;
  category: Category;
  version: number;
  inputs: Prisma.JsonValue;
  expressions: Prisma.JsonValue;
  outputs: Prisma.JsonValue;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
};

function parseStoredFormulaDefinition(formula: StoredFormula): FormulaDefinition {
  const parsed = formulaDefinitionSchema.safeParse({
    inputs: formula.inputs,
    expressions: formula.expressions,
    outputs: formula.outputs,
  });

  if (!parsed.success) {
    throw new AppError(500, "FORMULA_DEFINITION_INVALID", "Stored formula definition is invalid", {
      formulaId: formula.id,
    });
  }

  return parsed.data;
}

function resolveOutputMapping(
  formulaOutputs: FormulaOutputDefinition[],
  lineItemUnit: string,
  requestedOutputVariable?: string,
): FormulaOutputDefinition {
  if (formulaOutputs.length === 0) {
    throw new AppError(
      409,
      "FORMULA_OUTPUT_MAPPING_MISSING",
      "Formula does not define any output mappings",
    );
  }

  if (requestedOutputVariable) {
    const mapping = formulaOutputs.find((output) => output.variable === requestedOutputVariable);
    if (!mapping) {
      throw new AppError(
        400,
        "FORMULA_OUTPUT_NOT_FOUND",
        `Output variable ${requestedOutputVariable} is not available for this formula`,
      );
    }

    return mapping;
  }

  if (formulaOutputs.length === 1) {
    return formulaOutputs[0];
  }

  const normalizedLineItemUnit = lineItemUnit.trim().toLowerCase();
  const unitMatches = formulaOutputs.filter(
    (output) => output.lineItemField === "quantity" && output.unit.trim().toLowerCase() === normalizedLineItemUnit,
  );

  if (unitMatches.length === 1) {
    return unitMatches[0];
  }

  throw new AppError(
    400,
    "FORMULA_OUTPUT_SELECTION_REQUIRED",
    "Formula has multiple outputs; specify outputVariable",
  );
}

async function recalculateEstimateTotals(
  tx: Prisma.TransactionClient,
  estimateId: string,
  markupRate: Prisma.Decimal,
  vatRate: Prisma.Decimal,
): Promise<CreateEstimateLineItemResult["estimate"]> {
  const allLineItems = await tx.lineItem.findMany({
    where: { estimateId },
    select: {
      id: true,
      category: true,
      quantity: true,
      unitMaterialCost: true,
      unitLaborCost: true,
    },
  });

  const totals = calculateTotals({
    lineItems: allLineItems,
    markupRate,
    vatRate,
  });

  for (const [lineItemId, totalCost] of Object.entries(totals.lineItemTotals)) {
    await tx.lineItem.update({
      where: { id: lineItemId },
      data: { totalCost },
    });
  }

  return tx.estimate.update({
    where: { id: estimateId },
    data: {
      subtotal: totals.subtotal,
      markupAmount: totals.markupAmount,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
    },
    select: {
      id: true,
      subtotal: true,
      markupAmount: true,
      vatAmount: true,
      totalAmount: true,
      updatedAt: true,
    },
  });
}

async function getLineItemWithTotals(
  tx: Prisma.TransactionClient,
  lineItemId: string,
): Promise<LineItemWithTotals> {
  return tx.lineItem.findUniqueOrThrow({
    where: { id: lineItemId },
    select: {
      id: true,
      estimateId: true,
      category: true,
      description: true,
      quantity: true,
      unit: true,
      unitMaterialCost: true,
      unitLaborCost: true,
      totalCost: true,
      calculationSource: true,
      originalComputedQuantity: true,
      originalComputedCost: true,
      overrideReason: true,
      locked: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createEstimateLineItem(
  input: CreateEstimateLineItemInput,
): Promise<CreateEstimateLineItemResult> {
  const created = await prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.findFirst({
      where: {
        id: input.estimateId,
        deletedAt: null,
        project: {
          organizationId: input.organizationId,
        },
      },
      select: {
        id: true,
        status: true,
        markupRate: true,
        vatRate: true,
      },
    });

    if (!estimate) {
      throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
    }

    if (estimate.status !== EstimateStatus.DRAFT) {
      throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be edited");
    }

    const lineItem = await tx.lineItem.create({
      data: {
        estimateId: estimate.id,
        category: input.category,
        description: input.description.trim(),
        quantity: new Prisma.Decimal(input.quantity),
        unit: input.unit.trim(),
        unitMaterialCost: new Prisma.Decimal(input.unitMaterialCost),
        unitLaborCost: new Prisma.Decimal(input.unitLaborCost),
        totalCost: new Prisma.Decimal(0),
        calculationSource: CalculationSource.MANUAL,
        originalComputedQuantity: null,
        originalComputedCost: null,
        overrideReason: null,
        locked: false,
        createdBy: input.performedBy,
      },
      select: {
        id: true,
        estimateId: true,
        category: true,
        description: true,
        quantity: true,
        unit: true,
        unitMaterialCost: true,
        unitLaborCost: true,
        totalCost: true,
        calculationSource: true,
        originalComputedQuantity: true,
        originalComputedCost: true,
        overrideReason: true,
        locked: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const updatedEstimate = await recalculateEstimateTotals(
      tx,
      estimate.id,
      estimate.markupRate,
      estimate.vatRate,
    );

    const refreshedLineItem = await getLineItemWithTotals(tx, lineItem.id);

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "LineItem",
        entityId: lineItem.id,
        action: "LINE_ITEM_CREATED",
        beforeState: {},
        afterState: {
          estimateId: lineItem.estimateId,
          category: lineItem.category,
          description: lineItem.description,
          quantity: refreshedLineItem.quantity.toString(),
          unit: refreshedLineItem.unit,
          unitMaterialCost: refreshedLineItem.unitMaterialCost.toString(),
          unitLaborCost: refreshedLineItem.unitLaborCost.toString(),
          totalCost: refreshedLineItem.totalCost.toString(),
          calculationSource: refreshedLineItem.calculationSource,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return {
      lineItem: {
        ...refreshedLineItem,
        category: refreshedLineItem.category,
        calculationSource: refreshedLineItem.calculationSource,
      },
      estimate: updatedEstimate,
    };
  });

  return created;
}

export async function updateLineItem(input: UpdateLineItemInput): Promise<CreateEstimateLineItemResult> {
  const updated = await prisma.$transaction(async (tx) => {
    const lineItem = await tx.lineItem.findFirst({
      where: {
        id: input.lineItemId,
        estimate: {
          deletedAt: null,
          project: {
            organizationId: input.organizationId,
          },
        },
      },
      select: {
        id: true,
        estimateId: true,
        category: true,
        description: true,
        quantity: true,
        unit: true,
        unitMaterialCost: true,
        unitLaborCost: true,
        totalCost: true,
        calculationSource: true,
        originalComputedQuantity: true,
        originalComputedCost: true,
        overrideReason: true,
        locked: true,
        estimate: {
          select: {
            id: true,
            status: true,
            markupRate: true,
            vatRate: true,
          },
        },
      },
    });

    if (!lineItem) {
      throw new AppError(404, "LINE_ITEM_NOT_FOUND", "Line item not found");
    }

    if (lineItem.estimate.status !== EstimateStatus.DRAFT || lineItem.locked) {
      throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be edited");
    }

    if (input.quantity !== undefined && lineItem.calculationSource !== CalculationSource.MANUAL) {
      throw new AppError(
        409,
        "LINE_ITEM_QUANTITY_OVERRIDE_REQUIRED",
        "Use the override endpoint to modify quantity for computed line items",
      );
    }

    const data: Prisma.LineItemUpdateInput = {};
    if (input.category !== undefined) {
      data.category = input.category;
    }
    if (input.description !== undefined) {
      data.description = input.description.trim();
    }
    if (input.quantity !== undefined) {
      data.quantity = new Prisma.Decimal(input.quantity);
    }
    if (input.unit !== undefined) {
      data.unit = input.unit.trim();
    }
    if (input.unitMaterialCost !== undefined) {
      data.unitMaterialCost = new Prisma.Decimal(input.unitMaterialCost);
    }
    if (input.unitLaborCost !== undefined) {
      data.unitLaborCost = new Prisma.Decimal(input.unitLaborCost);
    }

    await tx.lineItem.update({
      where: { id: lineItem.id },
      data,
    });

    const updatedEstimate = await recalculateEstimateTotals(
      tx,
      lineItem.estimate.id,
      lineItem.estimate.markupRate,
      lineItem.estimate.vatRate,
    );

    const updatedLineItem = await getLineItemWithTotals(tx, lineItem.id);

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "LineItem",
        entityId: lineItem.id,
        action: "LINE_ITEM_UPDATED",
        beforeState: {
          category: lineItem.category,
          description: lineItem.description,
          quantity: lineItem.quantity.toString(),
          unit: lineItem.unit,
          unitMaterialCost: lineItem.unitMaterialCost.toString(),
          unitLaborCost: lineItem.unitLaborCost.toString(),
          totalCost: lineItem.totalCost.toString(),
          calculationSource: lineItem.calculationSource,
          originalComputedQuantity: lineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: lineItem.originalComputedCost?.toString() ?? null,
          overrideReason: lineItem.overrideReason,
        },
        afterState: {
          category: updatedLineItem.category,
          description: updatedLineItem.description,
          quantity: updatedLineItem.quantity.toString(),
          unit: updatedLineItem.unit,
          unitMaterialCost: updatedLineItem.unitMaterialCost.toString(),
          unitLaborCost: updatedLineItem.unitLaborCost.toString(),
          totalCost: updatedLineItem.totalCost.toString(),
          calculationSource: updatedLineItem.calculationSource,
          originalComputedQuantity: updatedLineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: updatedLineItem.originalComputedCost?.toString() ?? null,
          overrideReason: updatedLineItem.overrideReason,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return {
      lineItem: updatedLineItem,
      estimate: updatedEstimate,
    };
  });

  return updated;
}

export async function overrideLineItem(
  input: OverrideLineItemInput,
): Promise<CreateEstimateLineItemResult> {
  const overridden = await prisma.$transaction(async (tx) => {
    const lineItem = await tx.lineItem.findFirst({
      where: {
        id: input.lineItemId,
        estimate: {
          deletedAt: null,
          project: {
            organizationId: input.organizationId,
          },
        },
      },
      select: {
        id: true,
        estimateId: true,
        category: true,
        description: true,
        quantity: true,
        unit: true,
        unitMaterialCost: true,
        unitLaborCost: true,
        totalCost: true,
        calculationSource: true,
        originalComputedQuantity: true,
        originalComputedCost: true,
        overrideReason: true,
        locked: true,
        estimate: {
          select: {
            id: true,
            status: true,
            markupRate: true,
            vatRate: true,
          },
        },
      },
    });

    if (!lineItem) {
      throw new AppError(404, "LINE_ITEM_NOT_FOUND", "Line item not found");
    }

    if (lineItem.estimate.status !== EstimateStatus.DRAFT || lineItem.locked) {
      throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be edited");
    }

    const preservedOriginalQuantity =
      lineItem.calculationSource === CalculationSource.MANUAL
        ? lineItem.originalComputedQuantity
        : (lineItem.originalComputedQuantity ?? lineItem.quantity);
    const preservedOriginalCost =
      lineItem.calculationSource === CalculationSource.MANUAL
        ? lineItem.originalComputedCost
        : (lineItem.originalComputedCost ?? lineItem.totalCost);

    await tx.lineItem.update({
      where: { id: lineItem.id },
      data: {
        quantity: new Prisma.Decimal(input.quantity),
        calculationSource: CalculationSource.ADJUSTED,
        overrideReason: input.overrideReason.trim(),
        originalComputedQuantity: preservedOriginalQuantity,
        originalComputedCost: preservedOriginalCost,
      },
    });

    const updatedEstimate = await recalculateEstimateTotals(
      tx,
      lineItem.estimate.id,
      lineItem.estimate.markupRate,
      lineItem.estimate.vatRate,
    );

    const updatedLineItem = await getLineItemWithTotals(tx, lineItem.id);

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "LineItem",
        entityId: lineItem.id,
        action: "LINE_ITEM_OVERRIDDEN",
        beforeState: {
          quantity: lineItem.quantity.toString(),
          totalCost: lineItem.totalCost.toString(),
          calculationSource: lineItem.calculationSource,
          originalComputedQuantity: lineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: lineItem.originalComputedCost?.toString() ?? null,
          overrideReason: lineItem.overrideReason,
        },
        afterState: {
          quantity: updatedLineItem.quantity.toString(),
          totalCost: updatedLineItem.totalCost.toString(),
          calculationSource: updatedLineItem.calculationSource,
          originalComputedQuantity: updatedLineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: updatedLineItem.originalComputedCost?.toString() ?? null,
          overrideReason: updatedLineItem.overrideReason,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return {
      lineItem: updatedLineItem,
      estimate: updatedEstimate,
    };
  });

  return overridden;
}

export async function deleteLineItem(input: DeleteLineItemInput): Promise<{
  deletedLineItemId: string;
  estimate: CreateEstimateLineItemResult["estimate"];
}> {
  const deleted = await prisma.$transaction(async (tx) => {
    const lineItem = await tx.lineItem.findFirst({
      where: {
        id: input.lineItemId,
        estimate: {
          deletedAt: null,
          project: {
            organizationId: input.organizationId,
          },
        },
      },
      select: {
        id: true,
        estimateId: true,
        category: true,
        description: true,
        quantity: true,
        unit: true,
        unitMaterialCost: true,
        unitLaborCost: true,
        totalCost: true,
        calculationSource: true,
        originalComputedQuantity: true,
        originalComputedCost: true,
        overrideReason: true,
        locked: true,
        estimate: {
          select: {
            id: true,
            status: true,
            markupRate: true,
            vatRate: true,
          },
        },
      },
    });

    if (!lineItem) {
      throw new AppError(404, "LINE_ITEM_NOT_FOUND", "Line item not found");
    }

    if (lineItem.estimate.status !== EstimateStatus.DRAFT || lineItem.locked) {
      throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be edited");
    }

    await tx.lineItem.delete({
      where: { id: lineItem.id },
    });

    const updatedEstimate = await recalculateEstimateTotals(
      tx,
      lineItem.estimate.id,
      lineItem.estimate.markupRate,
      lineItem.estimate.vatRate,
    );

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "LineItem",
        entityId: lineItem.id,
        action: "LINE_ITEM_DELETED",
        beforeState: {
          estimateId: lineItem.estimateId,
          category: lineItem.category,
          description: lineItem.description,
          quantity: lineItem.quantity.toString(),
          unit: lineItem.unit,
          unitMaterialCost: lineItem.unitMaterialCost.toString(),
          unitLaborCost: lineItem.unitLaborCost.toString(),
          totalCost: lineItem.totalCost.toString(),
          calculationSource: lineItem.calculationSource,
          originalComputedQuantity: lineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: lineItem.originalComputedCost?.toString() ?? null,
          overrideReason: lineItem.overrideReason,
        },
        afterState: {
          deleted: true,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return {
      deletedLineItemId: lineItem.id,
      estimate: updatedEstimate,
    };
  });

  return deleted;
}

export async function computeLineItem(input: ComputeLineItemInput): Promise<ComputeLineItemResult> {
  const computed = await prisma.$transaction(async (tx) => {
    const lineItem = await tx.lineItem.findFirst({
      where: {
        id: input.lineItemId,
        estimate: {
          deletedAt: null,
          project: {
            organizationId: input.organizationId,
          },
        },
      },
      select: {
        id: true,
        estimateId: true,
        category: true,
        description: true,
        quantity: true,
        unit: true,
        unitMaterialCost: true,
        unitLaborCost: true,
        totalCost: true,
        calculationSource: true,
        originalComputedQuantity: true,
        originalComputedCost: true,
        overrideReason: true,
        locked: true,
        estimate: {
          select: {
            id: true,
            status: true,
            markupRate: true,
            vatRate: true,
          },
        },
      },
    });

    if (!lineItem) {
      throw new AppError(404, "LINE_ITEM_NOT_FOUND", "Line item not found");
    }

    if (lineItem.estimate.status !== EstimateStatus.DRAFT || lineItem.locked) {
      throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be edited");
    }

    const formula = input.formulaId
      ? await tx.formula.findFirst({
          where: {
            id: input.formulaId,
            organizationId: input.organizationId,
          },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            version: true,
            inputs: true,
            expressions: true,
            outputs: true,
            isActive: true,
            createdBy: true,
            createdAt: true,
          },
        })
      : await tx.formula.findFirst({
          where: {
            organizationId: input.organizationId,
            name: input.formulaName,
            isActive: true,
          },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            version: true,
            inputs: true,
            expressions: true,
            outputs: true,
            isActive: true,
            createdBy: true,
            createdAt: true,
          },
        });

    if (!formula) {
      throw new AppError(404, "FORMULA_NOT_FOUND", "Formula not found");
    }

    if (formula.category !== lineItem.category) {
      throw new AppError(
        409,
        "FORMULA_CATEGORY_MISMATCH",
        "Selected formula category does not match the line item category",
      );
    }

    const formulaDefinition = parseStoredFormulaDefinition(formula);
    const formulaOutputs = formulaDefinition.outputs ?? [];
    const selectedOutput = resolveOutputMapping(formulaOutputs, lineItem.unit, input.outputVariable);

    let evaluationResult: ReturnType<typeof evaluateFormula>;
    try {
      evaluationResult = evaluateFormula(formulaDefinition, input.inputValues);
    } catch (error) {
      if (error instanceof FormulaEvaluationError) {
        throw new AppError(400, error.code, error.message, error.details);
      }

      throw error;
    }

    const outputValue = evaluationResult.outputValues[selectedOutput.variable];
    if (outputValue === undefined) {
      throw new AppError(
        500,
        "FORMULA_OUTPUT_NOT_COMPUTED",
        `Output variable ${selectedOutput.variable} did not produce a value`,
      );
    }

    if (selectedOutput.lineItemField !== "quantity") {
      throw new AppError(
        400,
        "FORMULA_UNSUPPORTED_OUTPUT_FIELD",
        `Unsupported output mapping target: ${selectedOutput.lineItemField}`,
      );
    }

    await tx.lineItem.update({
      where: { id: lineItem.id },
      data: {
        quantity: new Prisma.Decimal(outputValue),
        unit: selectedOutput.unit,
        calculationSource: CalculationSource.COMPUTED,
        overrideReason: null,
        originalComputedQuantity: null,
        originalComputedCost: null,
      },
    });

    const computation = await tx.computationInstance.create({
      data: {
        estimateId: lineItem.estimate.id,
        lineItemId: lineItem.id,
        formulaId: formula.id,
        formulaVersion: formula.version,
        formulaSnapshot: {
          id: formula.id,
          name: formula.name,
          description: formula.description,
          category: formula.category,
          version: formula.version,
          inputs: formulaDefinition.inputs,
          expressions: formulaDefinition.expressions,
          outputs: formulaDefinition.outputs ?? [],
          isActive: formula.isActive,
          createdBy: formula.createdBy,
          createdAt: formula.createdAt.toISOString(),
        } as Prisma.InputJsonValue,
        inputValues: input.inputValues as Prisma.InputJsonValue,
        computedResults: evaluationResult.computedResults as Prisma.InputJsonValue,
        computedBy: input.performedBy,
      },
      select: {
        id: true,
        formulaId: true,
        formulaVersion: true,
      },
    });

    const updatedEstimate = await recalculateEstimateTotals(
      tx,
      lineItem.estimate.id,
      lineItem.estimate.markupRate,
      lineItem.estimate.vatRate,
    );

    const updatedLineItem = await getLineItemWithTotals(tx, lineItem.id);

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "LineItem",
        entityId: lineItem.id,
        action: "LINE_ITEM_COMPUTED",
        beforeState: {
          quantity: lineItem.quantity.toString(),
          unit: lineItem.unit,
          totalCost: lineItem.totalCost.toString(),
          calculationSource: lineItem.calculationSource,
          originalComputedQuantity: lineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: lineItem.originalComputedCost?.toString() ?? null,
          overrideReason: lineItem.overrideReason,
        },
        afterState: {
          quantity: updatedLineItem.quantity.toString(),
          unit: updatedLineItem.unit,
          totalCost: updatedLineItem.totalCost.toString(),
          calculationSource: updatedLineItem.calculationSource,
          originalComputedQuantity: updatedLineItem.originalComputedQuantity?.toString() ?? null,
          originalComputedCost: updatedLineItem.originalComputedCost?.toString() ?? null,
          overrideReason: updatedLineItem.overrideReason,
          formulaId: formula.id,
          formulaVersion: formula.version,
          outputVariable: selectedOutput.variable,
          inputValues: input.inputValues as Prisma.InputJsonValue,
          computedResults: evaluationResult.computedResults as Prisma.InputJsonValue,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return {
      lineItem: updatedLineItem,
      estimate: updatedEstimate,
      computation,
    };
  });

  return computed;
}
