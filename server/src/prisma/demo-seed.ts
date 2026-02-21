import bcrypt from "bcrypt";
import {
  CalculationSource,
  Category,
  EstimateStatus,
  Prisma,
  ProjectStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { MVP_FORMULA_SEEDS } from "../formulas/seeds";
import { evaluateFormula } from "../formulas/evaluator";
import type { FormulaSeedDefinition } from "../formulas/types";
import { prisma } from "./client";
import { seedMvpFormulasForOrganization } from "../services/formula-seed.service";
import { calculateTotals } from "../services/estimate.service";
import { enqueueEstimatePdfJob, getPdfJobDownload, getPdfJobStatus } from "../services/pdf.service";
import { logAudit } from "../services/audit.service";

const DEMO_ORGANIZATION_NAME = "Demo Construction Co.";
const BCRYPT_COST_FACTOR = 12;
const VAT_RATE = 12;

const DEMO_USERS = {
  admin: {
    name: "Demo Admin",
    email: "demo.admin@estimatepro.local",
    password: "DemoAdmin123!",
    role: UserRole.ADMIN,
  },
  estimator: {
    name: "Demo Estimator",
    email: "demo.estimator@estimatepro.local",
    password: "DemoEstimator123!",
    role: UserRole.ESTIMATOR,
  },
  viewer: {
    name: "Demo Viewer",
    email: "demo.viewer@estimatepro.local",
    password: "DemoViewer123!",
    role: UserRole.VIEWER,
  },
} as const;

type FormulaRecord = {
  id: string;
  name: string;
  description: string;
  category: Category;
  version: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
};

type ManualLineItemSeed = {
  kind: "manual";
  category: Category;
  description: string;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLaborCost: number;
};

type FormulaLineItemSeed = {
  kind: "formula";
  category: Category;
  description: string;
  formulaName: string;
  outputVariable: string;
  inputValues: Record<string, number>;
  unitMaterialCost: number;
  unitLaborCost: number;
  overrideQuantity?: number;
  overrideReason?: string;
};

type LineItemSeed = ManualLineItemSeed | FormulaLineItemSeed;

type CreateEstimateSeedInput = {
  organizationId: string;
  projectId: string;
  versionNumber: number;
  label: string;
  status: EstimateStatus;
  markupRate: number;
  vatRate: number;
  createdBy: string;
  lineItems: LineItemSeed[];
  formulasByName: Map<string, FormulaRecord>;
};

function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function decimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function getFormulaSeedByName(formulaName: string): FormulaSeedDefinition {
  const found = MVP_FORMULA_SEEDS.find((seed) => seed.name === formulaName);
  if (!found) {
    throw new Error(`Formula seed not found for ${formulaName}`);
  }

  return found;
}

function buildFormulaSnapshot(
  formula: FormulaRecord,
  definition: FormulaSeedDefinition,
): Prisma.InputJsonValue {
  return {
    id: formula.id,
    name: formula.name,
    description: formula.description,
    category: formula.category,
    version: formula.version,
    inputs: definition.inputs,
    expressions: definition.expressions,
    outputs: definition.outputs,
    isActive: formula.isActive,
    createdBy: formula.createdBy,
    createdAt: formula.createdAt.toISOString(),
  } as Prisma.InputJsonValue;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForPdfJobCompletion(
  organizationId: string,
  jobId: string,
): Promise<"complete" | "failed"> {
  const maxAttempts = 120;
  const pollIntervalMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = getPdfJobStatus({
      organizationId,
      jobId,
    });

    if (status.status === "complete") {
      return "complete";
    }

    if (status.status === "failed") {
      return "failed";
    }

    await sleep(pollIntervalMs);
  }

  return "failed";
}

async function createEstimateSeed(input: CreateEstimateSeedInput): Promise<{ estimateId: string }> {
  const markupRate = decimal(input.markupRate);
  const vatRate = decimal(input.vatRate);
  const shouldLockLineItems = input.status !== EstimateStatus.DRAFT;

  const created = await prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.create({
      data: {
        projectId: input.projectId,
        versionNumber: input.versionNumber,
        label: input.label,
        status: EstimateStatus.DRAFT,
        subtotal: decimal(0),
        markupRate,
        markupAmount: decimal(0),
        vatRate,
        vatAmount: decimal(0),
        totalAmount: decimal(0),
        createdBy: input.createdBy,
      },
      select: {
        id: true,
        projectId: true,
        versionNumber: true,
        status: true,
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
        },
        performedBy: input.createdBy,
      },
      tx,
    );

    const itemsForTotals: Array<{
      id: string;
      category: Category;
      quantity: Prisma.Decimal;
      unitMaterialCost: Prisma.Decimal;
      unitLaborCost: Prisma.Decimal;
    }> = [];

    for (const lineItemSeed of input.lineItems) {
      const unitMaterialCost = decimal(lineItemSeed.unitMaterialCost);
      const unitLaborCost = decimal(lineItemSeed.unitLaborCost);
      const unitCost = unitMaterialCost.plus(unitLaborCost);

      if (lineItemSeed.kind === "manual") {
        const quantity = decimal(lineItemSeed.quantity);
        const totalCost = roundMoney(quantity.mul(unitCost));
        const lineItem = await tx.lineItem.create({
          data: {
            estimateId: estimate.id,
            category: lineItemSeed.category,
            description: lineItemSeed.description,
            quantity,
            unit: lineItemSeed.unit,
            unitMaterialCost,
            unitLaborCost,
            totalCost,
            calculationSource: CalculationSource.MANUAL,
            originalComputedQuantity: null,
            originalComputedCost: null,
            overrideReason: null,
            locked: shouldLockLineItems,
            createdBy: input.createdBy,
          },
          select: {
            id: true,
            category: true,
            quantity: true,
            unitMaterialCost: true,
            unitLaborCost: true,
            totalCost: true,
          },
        });

        await logAudit(
          {
            organizationId: input.organizationId,
            entityType: "LineItem",
            entityId: lineItem.id,
            action: "LINE_ITEM_CREATED",
            beforeState: {},
            afterState: {
              estimateId: estimate.id,
              description: lineItemSeed.description,
              quantity: quantity.toString(),
              totalCost: lineItem.totalCost.toString(),
            },
            performedBy: input.createdBy,
          },
          tx,
        );

        itemsForTotals.push({
          id: lineItem.id,
          category: lineItem.category,
          quantity: lineItem.quantity,
          unitMaterialCost: lineItem.unitMaterialCost,
          unitLaborCost: lineItem.unitLaborCost,
        });
        continue;
      }

      const formula = input.formulasByName.get(lineItemSeed.formulaName);
      if (!formula) {
        throw new Error(`Formula ${lineItemSeed.formulaName} not found in demo organization`);
      }

      const definition = getFormulaSeedByName(lineItemSeed.formulaName);
      const output = definition.outputs.find((item) => item.variable === lineItemSeed.outputVariable);
      if (!output) {
        throw new Error(
          `Output variable ${lineItemSeed.outputVariable} not found in formula ${lineItemSeed.formulaName}`,
        );
      }

      const evaluation = evaluateFormula(definition, lineItemSeed.inputValues);
      const outputValue = evaluation.outputValues[lineItemSeed.outputVariable];
      if (outputValue === undefined) {
        throw new Error(
          `Formula ${lineItemSeed.formulaName} did not compute output ${lineItemSeed.outputVariable}`,
        );
      }

      const computedQuantity = decimal(outputValue);
      const computedCost = roundMoney(computedQuantity.mul(unitCost));
      const hasOverride = lineItemSeed.overrideQuantity !== undefined && lineItemSeed.overrideReason !== undefined;
      const quantity = hasOverride ? decimal(lineItemSeed.overrideQuantity as number) : computedQuantity;
      const totalCost = roundMoney(quantity.mul(unitCost));
      const calculationSource = hasOverride ? CalculationSource.ADJUSTED : CalculationSource.COMPUTED;
      const overrideReason = hasOverride ? lineItemSeed.overrideReason ?? null : null;

      const lineItem = await tx.lineItem.create({
        data: {
          estimateId: estimate.id,
          category: lineItemSeed.category,
          description: lineItemSeed.description,
          quantity,
          unit: output.unit,
          unitMaterialCost,
          unitLaborCost,
          totalCost,
          calculationSource,
          originalComputedQuantity: hasOverride ? computedQuantity : null,
          originalComputedCost: hasOverride ? computedCost : null,
          overrideReason,
          locked: shouldLockLineItems,
          createdBy: input.createdBy,
        },
        select: {
          id: true,
          category: true,
          quantity: true,
          unitMaterialCost: true,
          unitLaborCost: true,
          totalCost: true,
        },
      });

      await tx.computationInstance.create({
        data: {
          estimateId: estimate.id,
          lineItemId: lineItem.id,
          formulaId: formula.id,
          formulaVersion: formula.version,
          formulaSnapshot: buildFormulaSnapshot(formula, definition),
          inputValues: lineItemSeed.inputValues as Prisma.InputJsonValue,
          computedResults: evaluation.computedResults as Prisma.InputJsonValue,
          computedBy: input.createdBy,
        },
      });

      await logAudit(
        {
          organizationId: input.organizationId,
          entityType: "LineItem",
          entityId: lineItem.id,
          action: hasOverride ? "LINE_ITEM_OVERRIDDEN" : "LINE_ITEM_COMPUTED",
          beforeState: hasOverride
            ? {
                quantity: computedQuantity.toString(),
                totalCost: computedCost.toString(),
              }
            : {},
          afterState: {
            estimateId: estimate.id,
            description: lineItemSeed.description,
            quantity: quantity.toString(),
            totalCost: lineItem.totalCost.toString(),
            calculationSource,
            overrideReason,
          },
          performedBy: input.createdBy,
        },
        tx,
      );

      itemsForTotals.push({
        id: lineItem.id,
        category: lineItem.category,
        quantity: lineItem.quantity,
        unitMaterialCost: lineItem.unitMaterialCost,
        unitLaborCost: lineItem.unitLaborCost,
      });
    }

    const totals = calculateTotals({
      lineItems: itemsForTotals,
      markupRate,
      vatRate,
    });

    for (const [lineItemId, lineTotal] of Object.entries(totals.lineItemTotals)) {
      await tx.lineItem.update({
        where: { id: lineItemId },
        data: {
          totalCost: lineTotal,
          locked: shouldLockLineItems,
        },
      });
    }

    const updatedEstimate = await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        status: input.status,
        subtotal: totals.subtotal,
        markupAmount: totals.markupAmount,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
      },
    });

    if (input.status === EstimateStatus.FINAL) {
      await logAudit(
        {
          organizationId: input.organizationId,
          entityType: "Estimate",
          entityId: updatedEstimate.id,
          action: "ESTIMATE_FINALIZED",
          beforeState: { status: EstimateStatus.DRAFT },
          afterState: {
            status: EstimateStatus.FINAL,
            totalAmount: updatedEstimate.totalAmount.toString(),
          },
          performedBy: input.createdBy,
        },
        tx,
      );
    } else if (input.status === EstimateStatus.ARCHIVED) {
      await logAudit(
        {
          organizationId: input.organizationId,
          entityType: "Estimate",
          entityId: updatedEstimate.id,
          action: "ESTIMATE_ARCHIVED",
          beforeState: { status: EstimateStatus.DRAFT },
          afterState: {
            status: EstimateStatus.ARCHIVED,
            totalAmount: updatedEstimate.totalAmount.toString(),
          },
          performedBy: input.createdBy,
        },
        tx,
      );
    }

    return {
      estimateId: updatedEstimate.id,
    };
  });

  return created;
}

async function main(): Promise<void> {
  const existingDemoOrganization = await prisma.organization.findFirst({
    where: {
      name: DEMO_ORGANIZATION_NAME,
    },
    select: {
      id: true,
    },
  });

  if (existingDemoOrganization) {
    await prisma.organization.delete({
      where: {
        id: existingDemoOrganization.id,
      },
    });
    console.info("Deleted existing demo organization for a clean reseed.");
  }

  const [adminPasswordHash, estimatorPasswordHash, viewerPasswordHash] = await Promise.all([
    bcrypt.hash(DEMO_USERS.admin.password, BCRYPT_COST_FACTOR),
    bcrypt.hash(DEMO_USERS.estimator.password, BCRYPT_COST_FACTOR),
    bcrypt.hash(DEMO_USERS.viewer.password, BCRYPT_COST_FACTOR),
  ]);

  const organization = await prisma.organization.create({
    data: {
      name: DEMO_ORGANIZATION_NAME,
    },
    select: {
      id: true,
      name: true,
    },
  });

  const [adminUser, estimatorUser] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: DEMO_USERS.admin.name,
        email: DEMO_USERS.admin.email,
        passwordHash: adminPasswordHash,
        role: DEMO_USERS.admin.role,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: DEMO_USERS.estimator.name,
        email: DEMO_USERS.estimator.email,
        passwordHash: estimatorPasswordHash,
        role: DEMO_USERS.estimator.role,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organization.id,
        name: DEMO_USERS.viewer.name,
        email: DEMO_USERS.viewer.email,
        passwordHash: viewerPasswordHash,
        role: DEMO_USERS.viewer.role,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    }),
  ]);

  await seedMvpFormulasForOrganization({
    organizationId: organization.id,
    createdBy: adminUser.id,
  });

  const formulas = await prisma.formula.findMany({
    where: {
      organizationId: organization.id,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      version: true,
      isActive: true,
      createdBy: true,
      createdAt: true,
    },
  });
  const formulasByName = new Map(formulas.map((formula) => [formula.name, formula]));

  for (const formulaSeed of MVP_FORMULA_SEEDS) {
    if (!formulasByName.has(formulaSeed.name)) {
      throw new Error(`Expected seeded formula ${formulaSeed.name} was not found`);
    }
  }

  const [activeProject, archivedProject] = await Promise.all([
    prisma.project.create({
      data: {
        organizationId: organization.id,
        name: "Rizal Residence Phase 1",
        location: "Cainta, Rizal",
        projectType: "Residential",
        status: ProjectStatus.ACTIVE,
        createdBy: adminUser.id,
      },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.project.create({
      data: {
        organizationId: organization.id,
        name: "Quezon Commercial Fit-out",
        location: "Quezon City, Metro Manila",
        projectType: "Commercial",
        status: ProjectStatus.ARCHIVED,
        createdBy: estimatorUser.id,
      },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  await logAudit({
    organizationId: organization.id,
    entityType: "Project",
    entityId: activeProject.id,
    action: "PROJECT_CREATED",
    beforeState: {},
    afterState: {
      name: activeProject.name,
      status: ProjectStatus.ACTIVE,
    },
    performedBy: adminUser.id,
  });
  await logAudit({
    organizationId: organization.id,
    entityType: "Project",
    entityId: archivedProject.id,
    action: "PROJECT_CREATED",
    beforeState: {},
    afterState: {
      name: archivedProject.name,
      status: ProjectStatus.ARCHIVED,
    },
    performedBy: estimatorUser.id,
  });

  const finalizedEstimate = await createEstimateSeed({
    organizationId: organization.id,
    projectId: activeProject.id,
    versionNumber: 1,
    label: "Baseline Quote",
    status: EstimateStatus.FINAL,
    markupRate: 10,
    vatRate: VAT_RATE,
    createdBy: estimatorUser.id,
    formulasByName,
    lineItems: [
      {
        kind: "formula",
        category: Category.CONCRETE_WORKS,
        description: "Concrete - Portland Cement",
        formulaName: "Concrete Slab",
        outputVariable: "cement_bags",
        inputValues: {
          length: 12,
          width: 9,
          thickness: 0.15,
          waste_factor: 8,
        },
        unitMaterialCost: 285,
        unitLaborCost: 18,
      },
      {
        kind: "formula",
        category: Category.MASONRY_WORKS,
        description: "CHB 4in Blocks",
        formulaName: "CHB Wall",
        outputVariable: "chb_count",
        inputValues: {
          length: 24,
          height: 3,
          openings_area: 6.5,
          chb_size: 4,
        },
        unitMaterialCost: 18.5,
        unitLaborCost: 2.5,
      },
      {
        kind: "formula",
        category: Category.PAINTING_WORKS,
        description: "Wall Topcoat Paint",
        formulaName: "Painting Works",
        outputVariable: "paint_liters",
        inputValues: {
          area: 330,
          coats: 2,
          coverage_rate: 11,
        },
        unitMaterialCost: 245,
        unitLaborCost: 32,
        overrideQuantity: 65,
        overrideReason: "Adjusted for on-site texture and wastage allowance.",
      },
      {
        kind: "manual",
        category: Category.GENERAL_REQUIREMENTS,
        description: "Temporary Site Signages",
        quantity: 8,
        unit: "pcs",
        unitMaterialCost: 450,
        unitLaborCost: 50,
      },
      {
        kind: "manual",
        category: Category.GENERAL_REQUIREMENTS,
        description: "Post-Work Site Cleanup",
        quantity: 1,
        unit: "lot",
        unitMaterialCost: 2500,
        unitLaborCost: 1800,
      },
    ],
  });

  await createEstimateSeed({
    organizationId: organization.id,
    projectId: activeProject.id,
    versionNumber: 2,
    label: "Client Revision A",
    status: EstimateStatus.DRAFT,
    markupRate: 12.5,
    vatRate: VAT_RATE,
    createdBy: estimatorUser.id,
    formulasByName,
    lineItems: [
      {
        kind: "formula",
        category: Category.CONCRETE_WORKS,
        description: "Concrete - Portland Cement",
        formulaName: "Concrete Slab",
        outputVariable: "cement_bags",
        inputValues: {
          length: 14,
          width: 10,
          thickness: 0.15,
          waste_factor: 10,
        },
        unitMaterialCost: 285,
        unitLaborCost: 18,
      },
      {
        kind: "manual",
        category: Category.GENERAL_REQUIREMENTS,
        description: "Mobilization and Demobilization",
        quantity: 1,
        unit: "lot",
        unitMaterialCost: 5000,
        unitLaborCost: 1200,
      },
    ],
  });

  await createEstimateSeed({
    organizationId: organization.id,
    projectId: archivedProject.id,
    versionNumber: 1,
    label: "Issued Tender Pack",
    status: EstimateStatus.ARCHIVED,
    markupRate: 8,
    vatRate: VAT_RATE,
    createdBy: adminUser.id,
    formulasByName,
    lineItems: [
      {
        kind: "manual",
        category: Category.CARPENTRY,
        description: "Gypsum Ceiling Framing",
        quantity: 120,
        unit: "m2",
        unitMaterialCost: 410,
        unitLaborCost: 95,
      },
      {
        kind: "manual",
        category: Category.DOORS_AND_WINDOWS,
        description: "Aluminum Window Supply and Install",
        quantity: 18,
        unit: "set",
        unitMaterialCost: 4650,
        unitLaborCost: 620,
      },
    ],
  });

  let pdfGenerationStatus = "not-attempted";
  try {
    const queued = await enqueueEstimatePdfJob({
      organizationId: organization.id,
      estimateId: finalizedEstimate.estimateId,
      requestedBy: adminUser.id,
    });

    const completedStatus =
      queued.status === "complete"
        ? "complete"
        : await waitForPdfJobCompletion(organization.id, queued.jobId);

    if (completedStatus === "complete") {
      const download = await getPdfJobDownload({
        organizationId: organization.id,
        jobId: queued.jobId,
      });
      pdfGenerationStatus = `complete (${download.fileName})`;
    } else {
      pdfGenerationStatus = "failed";
    }
  } catch (error) {
    pdfGenerationStatus = `failed (${error instanceof Error ? error.message : "unknown error"})`;
  }

  console.info(`Demo seed complete for organization: ${organization.name}`);
  console.info("Demo users:");
  console.info(`  Admin    -> ${DEMO_USERS.admin.email} / ${DEMO_USERS.admin.password}`);
  console.info(`  Estimator-> ${DEMO_USERS.estimator.email} / ${DEMO_USERS.estimator.password}`);
  console.info(`  Viewer   -> ${DEMO_USERS.viewer.email} / ${DEMO_USERS.viewer.password}`);
  console.info(`PDF generation status for finalized estimate: ${pdfGenerationStatus}`);
  console.info("Projects created: 2");
  console.info("Estimates created: 3 (FINAL, DRAFT, ARCHIVED)");
}

main()
  .catch((error: unknown) => {
    console.error("Demo seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
