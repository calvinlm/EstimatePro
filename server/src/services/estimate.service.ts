import { EstimateStatus, Prisma, type Category } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { prisma } from "../prisma/client";
import { logAudit } from "./audit.service";

type GetProjectEstimatesInput = {
  organizationId: string;
  projectId: string;
  page: number;
  pageSize: number;
};

type CreateProjectEstimateInput = {
  organizationId: string;
  projectId: string;
  label?: string;
  markupRate: number;
  vatRate: number;
  performedBy: string;
};

type GetEstimateByIdInput = {
  organizationId: string;
  estimateId: string;
};

type UpdateEstimateInput = {
  organizationId: string;
  estimateId: string;
  markupRate: number;
  vatRate: number;
  performedBy: string;
};

type DuplicateEstimateInput = {
  organizationId: string;
  estimateId: string;
  performedBy: string;
};

type FinalizeEstimateInput = {
  organizationId: string;
  estimateId: string;
  performedBy: string;
};

type ArchiveEstimateInput = {
  organizationId: string;
  estimateId: string;
  performedBy: string;
};

type SoftDeleteEstimateInput = {
  organizationId: string;
  estimateId: string;
  performedBy: string;
};

type RestoreEstimateInput = {
  organizationId: string;
  estimateId: string;
  performedBy: string;
};

export type GetProjectEstimatesResult = {
  items: Array<{
    id: string;
    projectId: string;
    versionNumber: number;
    label: string | null;
    status: EstimateStatus;
    subtotal: Prisma.Decimal;
    markupRate: Prisma.Decimal;
    markupAmount: Prisma.Decimal;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: string;
      name: string;
    };
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type GetEstimateByIdResult = {
  estimate: {
    id: string;
    projectId: string;
    versionNumber: number;
    label: string | null;
    status: EstimateStatus;
    subtotal: Prisma.Decimal;
    markupRate: Prisma.Decimal;
    markupAmount: Prisma.Decimal;
    vatRate: Prisma.Decimal;
    vatAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: string;
      name: string;
    };
  };
  lineItems: Array<{
    id: string;
    category: string;
    description: string;
    quantity: Prisma.Decimal;
    unit: string;
    unitMaterialCost: Prisma.Decimal;
    unitLaborCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    calculationSource: string;
    originalComputedQuantity: Prisma.Decimal | null;
    originalComputedCost: Prisma.Decimal | null;
    overrideReason: string | null;
    locked: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  formulaUsage: Array<{
    id: string;
    lineItemId: string;
    formulaId: string;
    formulaVersion: number;
    formulaSnapshot: Prisma.JsonValue;
    inputValues: Prisma.JsonValue;
    computedResults: Prisma.JsonValue;
    computedAt: Date;
    computedBy: {
      id: string;
      name: string;
    };
    formula: {
      id: string;
      name: string;
      category: string;
      version: number;
      isActive: boolean;
      createdAt: Date;
    };
    lineItem: {
      id: string;
      description: string;
      category: string;
    };
  }>;
};

const HUNDRED = new Prisma.Decimal(100);

function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

type EstimateLineItemForTotals = {
  id: string;
  category: Category;
  quantity: Prisma.Decimal;
  unitMaterialCost: Prisma.Decimal;
  unitLaborCost: Prisma.Decimal;
};

export type EstimateTotalsResult = {
  lineItemTotals: Record<string, Prisma.Decimal>;
  categorySubtotals: Record<string, Prisma.Decimal>;
  subtotal: Prisma.Decimal;
  markupAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

export function calculateTotals(input: {
  lineItems: EstimateLineItemForTotals[];
  markupRate: Prisma.Decimal;
  vatRate: Prisma.Decimal;
}): EstimateTotalsResult {
  const lineItemTotals: Record<string, Prisma.Decimal> = {};
  const categorySubtotals = new Map<Category, Prisma.Decimal>();

  for (const lineItem of input.lineItems) {
    const unitCost = lineItem.unitMaterialCost.plus(lineItem.unitLaborCost);
    const lineTotal = roundMoney(lineItem.quantity.mul(unitCost));
    lineItemTotals[lineItem.id] = lineTotal;

    const runningCategorySubtotal = categorySubtotals.get(lineItem.category) ?? new Prisma.Decimal(0);
    categorySubtotals.set(lineItem.category, roundMoney(runningCategorySubtotal.plus(lineTotal)));
  }

  const subtotal = roundMoney(
    Array.from(categorySubtotals.values()).reduce(
      (accumulator, categorySubtotal) => accumulator.plus(categorySubtotal),
      new Prisma.Decimal(0),
    ),
  );
  const markupAmount = roundMoney(subtotal.mul(input.markupRate).div(HUNDRED));
  const vatAmount = roundMoney(subtotal.plus(markupAmount).mul(input.vatRate).div(HUNDRED));
  const totalAmount = roundMoney(subtotal.plus(markupAmount).plus(vatAmount));

  return {
    lineItemTotals,
    categorySubtotals: Object.fromEntries(categorySubtotals.entries()),
    subtotal,
    markupAmount,
    vatAmount,
    totalAmount,
  };
}

export async function getProjectEstimates(
  input: GetProjectEstimatesInput,
): Promise<GetProjectEstimatesResult> {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const where = {
    projectId: input.projectId,
    deletedAt: null,
  };

  const skip = (input.page - 1) * input.pageSize;

  const [items, totalItems] = await prisma.$transaction([
    prisma.estimate.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        label: true,
        status: true,
        subtotal: true,
        markupRate: true,
        markupAmount: true,
        vatRate: true,
        vatAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.estimate.count({ where }),
  ]);

  return {
    items: items.map((estimate) => ({
      id: estimate.id,
      projectId: estimate.projectId,
      versionNumber: estimate.versionNumber,
      label: estimate.label,
      status: estimate.status,
      subtotal: estimate.subtotal,
      markupRate: estimate.markupRate,
      markupAmount: estimate.markupAmount,
      vatRate: estimate.vatRate,
      vatAmount: estimate.vatAmount,
      totalAmount: estimate.totalAmount,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      createdBy: estimate.createdByUser,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function createProjectEstimate(input: CreateProjectEstimateInput): Promise<{
  id: string;
  projectId: string;
  versionNumber: number;
  label: string | null;
  status: EstimateStatus;
  subtotal: Prisma.Decimal;
  markupRate: Prisma.Decimal;
  markupAmount: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}> {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  });

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const created = await prisma.$transaction(async (tx) => {
    const latestEstimate = await tx.estimate.findFirst({
      where: { projectId: input.projectId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const nextVersion = (latestEstimate?.versionNumber ?? 0) + 1;
    const estimate = await tx.estimate.create({
      data: {
        projectId: input.projectId,
        versionNumber: nextVersion,
        label: input.label?.trim() || null,
        status: EstimateStatus.DRAFT,
        subtotal: new Prisma.Decimal(0),
        markupRate: new Prisma.Decimal(input.markupRate),
        markupAmount: new Prisma.Decimal(0),
        vatRate: new Prisma.Decimal(input.vatRate),
        vatAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
        createdBy: input.performedBy,
      },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        label: true,
        status: true,
        subtotal: true,
        markupRate: true,
        markupAmount: true,
        vatRate: true,
        vatAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "Estimate",
        entityId: estimate.id,
        action: "ESTIMATE_CREATED",
        beforeState: {},
        afterState: {
          projectId: estimate.projectId,
          versionNumber: estimate.versionNumber,
          status: estimate.status,
          markupRate: estimate.markupRate.toString(),
          vatRate: estimate.vatRate.toString(),
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return estimate;
  });

  return created;
}

export async function getEstimateById(input: GetEstimateByIdInput): Promise<GetEstimateByIdResult> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
      lineItems: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
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
      },
      computations: {
        orderBy: { computedAt: "desc" },
        select: {
          id: true,
          lineItemId: true,
          formulaId: true,
          formulaVersion: true,
          formulaSnapshot: true,
          inputValues: true,
          computedResults: true,
          computedAt: true,
          computedByUser: {
            select: {
              id: true,
              name: true,
            },
          },
          formula: {
            select: {
              id: true,
              name: true,
              category: true,
              version: true,
              isActive: true,
              createdAt: true,
            },
          },
          lineItem: {
            select: {
              id: true,
              description: true,
              category: true,
            },
          },
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  return {
    estimate: {
      id: estimate.id,
      projectId: estimate.projectId,
      versionNumber: estimate.versionNumber,
      label: estimate.label,
      status: estimate.status,
      subtotal: estimate.subtotal,
      markupRate: estimate.markupRate,
      markupAmount: estimate.markupAmount,
      vatRate: estimate.vatRate,
      vatAmount: estimate.vatAmount,
      totalAmount: estimate.totalAmount,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      createdBy: estimate.createdByUser,
    },
    lineItems: estimate.lineItems.map((lineItem) => ({
      ...lineItem,
      category: lineItem.category,
      calculationSource: lineItem.calculationSource,
    })),
    formulaUsage: estimate.computations.map((computation) => ({
      id: computation.id,
      lineItemId: computation.lineItemId,
      formulaId: computation.formulaId,
      formulaVersion: computation.formulaVersion,
      formulaSnapshot: computation.formulaSnapshot,
      inputValues: computation.inputValues,
      computedResults: computation.computedResults,
      computedAt: computation.computedAt,
      computedBy: computation.computedByUser,
      formula: {
        id: computation.formula.id,
        name: computation.formula.name,
        category: computation.formula.category,
        version: computation.formula.version,
        isActive: computation.formula.isActive,
        createdAt: computation.formula.createdAt,
      },
      lineItem: {
        id: computation.lineItem.id,
        description: computation.lineItem.description,
        category: computation.lineItem.category,
      },
    })),
  };
}

export async function updateEstimate(
  input: UpdateEstimateInput,
): Promise<GetEstimateByIdResult["estimate"]> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
      lineItems: {
        select: {
          id: true,
          category: true,
          quantity: true,
          unitMaterialCost: true,
          unitLaborCost: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  if (estimate.status !== EstimateStatus.DRAFT) {
    throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be updated");
  }

  const markupRate = new Prisma.Decimal(input.markupRate);
  const vatRate = new Prisma.Decimal(input.vatRate);
  const totals = calculateTotals({
    lineItems: estimate.lineItems,
    markupRate,
    vatRate,
  });

  const updated = await prisma.$transaction(async (tx) => {
    for (const [lineItemId, totalCost] of Object.entries(totals.lineItemTotals)) {
      await tx.lineItem.update({
        where: { id: lineItemId },
        data: { totalCost },
      });
    }

    const nextEstimate = await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        subtotal: totals.subtotal,
        markupRate,
        markupAmount: totals.markupAmount,
        vatRate,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
      },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        label: true,
        status: true,
        subtotal: true,
        markupRate: true,
        markupAmount: true,
        vatRate: true,
        vatAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "Estimate",
        entityId: nextEstimate.id,
        action: "ESTIMATE_UPDATED",
        beforeState: {
          markupRate: estimate.markupRate.toString(),
          vatRate: estimate.vatRate.toString(),
          subtotal: estimate.subtotal.toString(),
          markupAmount: estimate.markupAmount.toString(),
          vatAmount: estimate.vatAmount.toString(),
          totalAmount: estimate.totalAmount.toString(),
        },
        afterState: {
          markupRate: nextEstimate.markupRate.toString(),
          vatRate: nextEstimate.vatRate.toString(),
          subtotal: nextEstimate.subtotal.toString(),
          markupAmount: nextEstimate.markupAmount.toString(),
          vatAmount: nextEstimate.vatAmount.toString(),
          totalAmount: nextEstimate.totalAmount.toString(),
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return nextEstimate;
  });

  return {
    id: updated.id,
    projectId: updated.projectId,
    versionNumber: updated.versionNumber,
    label: updated.label,
    status: updated.status,
    subtotal: updated.subtotal,
    markupRate: updated.markupRate,
    markupAmount: updated.markupAmount,
    vatRate: updated.vatRate,
    vatAmount: updated.vatAmount,
    totalAmount: updated.totalAmount,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    createdBy: updated.createdByUser,
  };
}

export async function duplicateEstimate(
  input: DuplicateEstimateInput,
): Promise<GetEstimateByIdResult["estimate"]> {
  const sourceEstimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      label: true,
      markupRate: true,
      vatRate: true,
      lineItems: {
        select: {
          id: true,
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
        },
      },
    },
  });

  if (!sourceEstimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  const duplicated = await prisma.$transaction(async (tx) => {
    const latestEstimate = await tx.estimate.findFirst({
      where: { projectId: sourceEstimate.projectId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const nextVersion = (latestEstimate?.versionNumber ?? 0) + 1;
    const lineItemsForTotals = sourceEstimate.lineItems.map((lineItem) => ({
      id: lineItem.id,
      category: lineItem.category,
      quantity: lineItem.quantity,
      unitMaterialCost: lineItem.unitMaterialCost,
      unitLaborCost: lineItem.unitLaborCost,
    }));

    const totals = calculateTotals({
      lineItems: lineItemsForTotals,
      markupRate: sourceEstimate.markupRate,
      vatRate: sourceEstimate.vatRate,
    });

    const createdEstimate = await tx.estimate.create({
      data: {
        projectId: sourceEstimate.projectId,
        versionNumber: nextVersion,
        label: sourceEstimate.label,
        status: EstimateStatus.DRAFT,
        subtotal: totals.subtotal,
        markupRate: sourceEstimate.markupRate,
        markupAmount: totals.markupAmount,
        vatRate: sourceEstimate.vatRate,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
        createdBy: input.performedBy,
      },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        label: true,
        status: true,
        subtotal: true,
        markupRate: true,
        markupAmount: true,
        vatRate: true,
        vatAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (sourceEstimate.lineItems.length > 0) {
      await tx.lineItem.createMany({
        data: sourceEstimate.lineItems.map((lineItem) => ({
          estimateId: createdEstimate.id,
          category: lineItem.category,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unit: lineItem.unit,
          unitMaterialCost: lineItem.unitMaterialCost,
          unitLaborCost: lineItem.unitLaborCost,
          totalCost: totals.lineItemTotals[lineItem.id] ?? lineItem.totalCost,
          calculationSource: lineItem.calculationSource,
          originalComputedQuantity: lineItem.originalComputedQuantity,
          originalComputedCost: lineItem.originalComputedCost,
          overrideReason: lineItem.overrideReason,
          locked: false,
          createdBy: input.performedBy,
        })),
      });
    }

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "Estimate",
        entityId: createdEstimate.id,
        action: "ESTIMATE_DUPLICATED",
        beforeState: {
          sourceEstimateId: sourceEstimate.id,
        },
        afterState: {
          duplicatedEstimateId: createdEstimate.id,
          versionNumber: createdEstimate.versionNumber,
          status: createdEstimate.status,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return createdEstimate;
  });

  return {
    id: duplicated.id,
    projectId: duplicated.projectId,
    versionNumber: duplicated.versionNumber,
    label: duplicated.label,
    status: duplicated.status,
    subtotal: duplicated.subtotal,
    markupRate: duplicated.markupRate,
    markupAmount: duplicated.markupAmount,
    vatRate: duplicated.vatRate,
    vatAmount: duplicated.vatAmount,
    totalAmount: duplicated.totalAmount,
    createdAt: duplicated.createdAt,
    updatedAt: duplicated.updatedAt,
    createdBy: duplicated.createdByUser,
  };
}

export async function finalizeEstimate(
  input: FinalizeEstimateInput,
): Promise<GetEstimateByIdResult["estimate"]> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
      lineItems: {
        select: {
          id: true,
          category: true,
          quantity: true,
          unitMaterialCost: true,
          unitLaborCost: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  if (estimate.status !== EstimateStatus.DRAFT) {
    throw new AppError(409, "ESTIMATE_NOT_EDITABLE", "Only draft estimates can be finalized");
  }

  const totals = calculateTotals({
    lineItems: estimate.lineItems,
    markupRate: estimate.markupRate,
    vatRate: estimate.vatRate,
  });

  const finalized = await prisma.$transaction(async (tx) => {
    for (const [lineItemId, totalCost] of Object.entries(totals.lineItemTotals)) {
      await tx.lineItem.update({
        where: { id: lineItemId },
        data: {
          totalCost,
          locked: true,
        },
      });
    }

    const updatedEstimate = await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        status: EstimateStatus.FINAL,
        subtotal: totals.subtotal,
        markupAmount: totals.markupAmount,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
      },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        label: true,
        status: true,
        subtotal: true,
        markupRate: true,
        markupAmount: true,
        vatRate: true,
        vatAmount: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await logAudit(
      {
        organizationId: input.organizationId,
        entityType: "Estimate",
        entityId: updatedEstimate.id,
        action: "ESTIMATE_FINALIZED",
        beforeState: {
          status: estimate.status,
          totalAmount: estimate.totalAmount.toString(),
        },
        afterState: {
          status: updatedEstimate.status,
          totalAmount: updatedEstimate.totalAmount.toString(),
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return updatedEstimate;
  });

  return {
    id: finalized.id,
    projectId: finalized.projectId,
    versionNumber: finalized.versionNumber,
    label: finalized.label,
    status: finalized.status,
    subtotal: finalized.subtotal,
    markupRate: finalized.markupRate,
    markupAmount: finalized.markupAmount,
    vatRate: finalized.vatRate,
    vatAmount: finalized.vatAmount,
    totalAmount: finalized.totalAmount,
    createdAt: finalized.createdAt,
    updatedAt: finalized.updatedAt,
    createdBy: finalized.createdByUser,
  };
}

export async function archiveEstimate(
  input: ArchiveEstimateInput,
): Promise<GetEstimateByIdResult["estimate"]> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  if (estimate.status === EstimateStatus.ARCHIVED) {
    return {
      id: estimate.id,
      projectId: estimate.projectId,
      versionNumber: estimate.versionNumber,
      label: estimate.label,
      status: estimate.status,
      subtotal: estimate.subtotal,
      markupRate: estimate.markupRate,
      markupAmount: estimate.markupAmount,
      vatRate: estimate.vatRate,
      vatAmount: estimate.vatAmount,
      totalAmount: estimate.totalAmount,
      createdAt: estimate.createdAt,
      updatedAt: estimate.updatedAt,
      createdBy: estimate.createdByUser,
    };
  }

  const archived = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: EstimateStatus.ARCHIVED },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    organizationId: input.organizationId,
    entityType: "Estimate",
    entityId: archived.id,
    action: "ESTIMATE_ARCHIVED",
    beforeState: {
      status: estimate.status,
    },
    afterState: {
      status: archived.status,
    },
    performedBy: input.performedBy,
  });

  return {
    id: archived.id,
    projectId: archived.projectId,
    versionNumber: archived.versionNumber,
    label: archived.label,
    status: archived.status,
    subtotal: archived.subtotal,
    markupRate: archived.markupRate,
    markupAmount: archived.markupAmount,
    vatRate: archived.vatRate,
    vatAmount: archived.vatAmount,
    totalAmount: archived.totalAmount,
    createdAt: archived.createdAt,
    updatedAt: archived.updatedAt,
    createdBy: archived.createdByUser,
  };
}

export async function softDeleteEstimate(
  input: SoftDeleteEstimateInput,
): Promise<GetEstimateByIdResult["estimate"]> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  const now = new Date();
  const deleted = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { deletedAt: now },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    organizationId: input.organizationId,
    entityType: "Estimate",
    entityId: deleted.id,
    action: "ESTIMATE_SOFT_DELETED",
    beforeState: {
      deletedAt: null,
    },
    afterState: {
      deletedAt: now.toISOString(),
    },
    performedBy: input.performedBy,
  });

  return {
    id: deleted.id,
    projectId: deleted.projectId,
    versionNumber: deleted.versionNumber,
    label: deleted.label,
    status: deleted.status,
    subtotal: deleted.subtotal,
    markupRate: deleted.markupRate,
    markupAmount: deleted.markupAmount,
    vatRate: deleted.vatRate,
    vatAmount: deleted.vatAmount,
    totalAmount: deleted.totalAmount,
    createdAt: deleted.createdAt,
    updatedAt: deleted.updatedAt,
    createdBy: deleted.createdByUser,
  };
}

export async function restoreEstimate(
  input: RestoreEstimateInput,
): Promise<GetEstimateByIdResult["estimate"]> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: {
        not: null,
      },
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  const restored = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { deletedAt: null },
    select: {
      id: true,
      projectId: true,
      versionNumber: true,
      label: true,
      status: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    organizationId: input.organizationId,
    entityType: "Estimate",
    entityId: restored.id,
    action: "ESTIMATE_RESTORED",
    beforeState: {
      deletedAt: estimate.deletedAt?.toISOString() ?? null,
    },
    afterState: {
      deletedAt: null,
    },
    performedBy: input.performedBy,
  });

  return {
    id: restored.id,
    projectId: restored.projectId,
    versionNumber: restored.versionNumber,
    label: restored.label,
    status: restored.status,
    subtotal: restored.subtotal,
    markupRate: restored.markupRate,
    markupAmount: restored.markupAmount,
    vatRate: restored.vatRate,
    vatAmount: restored.vatAmount,
    totalAmount: restored.totalAmount,
    createdAt: restored.createdAt,
    updatedAt: restored.updatedAt,
    createdBy: restored.createdByUser,
  };
}
