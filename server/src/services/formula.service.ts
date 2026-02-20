import { type Category, type Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { evaluateFormula, FormulaEvaluationError } from "../formulas/evaluator";
import { FormulaValidationError, validateFormula } from "../formulas/validator";
import type {
  FormulaDefinition,
  FormulaExpressionDefinition,
  FormulaInputDefinition,
  FormulaOutputDefinition,
} from "../formulas/types";
import { prisma } from "../prisma/client";
import { logAudit } from "./audit.service";
import { z } from "zod";

type GetFormulasInput = {
  organizationId: string;
  page: number;
  pageSize: number;
};

type FormulaStatus = "ACTIVE" | "INACTIVE";

type FormulaSummary = {
  id: string;
  name: string;
  description: string;
  category: Category;
  currentVersion: number;
  status: FormulaStatus;
  isActive: boolean;
  lastModifiedAt: Date;
  lastModifiedBy: {
    id: string;
    name: string;
  };
};

export type GetFormulasResult = {
  items: FormulaSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

type GetFormulaByIdInput = {
  organizationId: string;
  formulaId: string;
};

type GetFormulaVersionsInput = {
  organizationId: string;
  formulaId: string;
};

type CreateFormulaInput = {
  organizationId: string;
  name: string;
  description: string;
  category: Category;
  inputs: FormulaInputDefinition[];
  expressions: FormulaExpressionDefinition[];
  outputs: FormulaOutputDefinition[];
  performedBy: string;
};

type UpdateFormulaInput = {
  organizationId: string;
  formulaId: string;
  name: string;
  description: string;
  category: Category;
  inputs: FormulaInputDefinition[];
  expressions: FormulaExpressionDefinition[];
  outputs: FormulaOutputDefinition[];
  performedBy: string;
};

type DeactivateFormulaInput = {
  organizationId: string;
  formulaId: string;
  performedBy: string;
};

type TestFormulaInput = {
  organizationId: string;
  formulaId: string;
  inputValues: Record<string, unknown>;
};

export type GetFormulaByIdResult = {
  id: string;
  name: string;
  description: string;
  category: Category;
  version: number;
  isActive: boolean;
  previousVersionId: string | null;
  inputs: unknown;
  expressions: unknown;
  outputs: unknown;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
  };
};

type FormulaVersionItem = {
  id: string;
  name: string;
  description: string;
  category: Category;
  version: number;
  isActive: boolean;
  previousVersionId: string | null;
  createdAt: Date;
  createdBy: {
    id: string;
    name: string;
  };
};

export type GetFormulaVersionsResult = {
  rootFormulaId: string;
  latestFormulaId: string;
  versions: FormulaVersionItem[];
};

export type CreateFormulaResult = GetFormulaByIdResult;
export type UpdateFormulaResult = GetFormulaByIdResult;
export type DeactivateFormulaResult = GetFormulaByIdResult;
export type TestFormulaResult = {
  formula: {
    id: string;
    name: string;
    category: Category;
    version: number;
    isActive: boolean;
  };
  resolvedInputs: Record<string, number>;
  computedResults: Record<string, number>;
  outputValues: Record<string, number>;
};

const storedFormulaDefinitionSchema = z.object({
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

function mapFormulaValidationError(error: FormulaValidationError): AppError {
  return new AppError(400, error.code, error.message, error.details);
}

function buildFormulaDefinition(input: {
  inputs: FormulaInputDefinition[];
  expressions: FormulaExpressionDefinition[];
  outputs: FormulaOutputDefinition[];
}): FormulaDefinition {
  return {
    inputs: input.inputs,
    expressions: input.expressions,
    outputs: input.outputs,
  };
}

function parseStoredFormulaDefinition(formula: {
  id: string;
  inputs: Prisma.JsonValue;
  expressions: Prisma.JsonValue;
  outputs: Prisma.JsonValue;
}): FormulaDefinition {
  const parsed = storedFormulaDefinitionSchema.safeParse({
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

async function ensureLatestFormulaNameIsUnique(input: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  name: string;
  excludeFormulaId?: string;
}): Promise<void> {
  const existingFormula = await input.tx.formula.findFirst({
    where: {
      organizationId: input.organizationId,
      nextVersions: {
        none: {},
      },
      ...(input.excludeFormulaId
        ? {
            id: {
              not: input.excludeFormulaId,
            },
          }
        : {}),
      name: {
        equals: input.name,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (existingFormula) {
    throw new AppError(
      409,
      "FORMULA_NAME_CONFLICT",
      "A formula with this name already exists in your organization",
    );
  }
}

export async function createFormula(input: CreateFormulaInput): Promise<CreateFormulaResult> {
  const name = input.name.trim();
  const description = input.description.trim();
  const formulaDefinition = buildFormulaDefinition({
    inputs: input.inputs,
    expressions: input.expressions,
    outputs: input.outputs,
  });

  try {
    validateFormula(formulaDefinition);
  } catch (error) {
    if (error instanceof FormulaValidationError) {
      throw mapFormulaValidationError(error);
    }

    throw error;
  }

  const created = await prisma.$transaction(async (tx) => {
    await ensureLatestFormulaNameIsUnique({
      tx,
      organizationId: input.organizationId,
      name,
    });

    const formula = await tx.formula.create({
      data: {
        organizationId: input.organizationId,
        name,
        description,
        category: input.category,
        version: 1,
        inputs: formulaDefinition.inputs as Prisma.InputJsonValue,
        expressions: formulaDefinition.expressions as Prisma.InputJsonValue,
        outputs: formulaDefinition.outputs ?? ([] as FormulaOutputDefinition[]),
        isActive: true,
        createdBy: input.performedBy,
        previousVersionId: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        version: true,
        isActive: true,
        previousVersionId: true,
        inputs: true,
        expressions: true,
        outputs: true,
        createdAt: true,
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
        entityType: "Formula",
        entityId: formula.id,
        action: "FORMULA_VERSION_CREATED",
        beforeState: {},
        afterState: {
          name: formula.name,
          description: formula.description,
          category: formula.category,
          version: formula.version,
          isActive: formula.isActive,
          previousVersionId: formula.previousVersionId,
          inputs: formula.inputs,
          expressions: formula.expressions,
          outputs: formula.outputs,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return formula;
  });

  return {
    id: created.id,
    name: created.name,
    description: created.description,
    category: created.category,
    version: created.version,
    isActive: created.isActive,
    previousVersionId: created.previousVersionId,
    inputs: created.inputs,
    expressions: created.expressions,
    outputs: created.outputs,
    createdAt: created.createdAt,
    createdBy: created.createdByUser,
  };
}

export async function updateFormula(input: UpdateFormulaInput): Promise<UpdateFormulaResult> {
  const name = input.name.trim();
  const description = input.description.trim();
  const formulaDefinition = buildFormulaDefinition({
    inputs: input.inputs,
    expressions: input.expressions,
    outputs: input.outputs,
  });

  try {
    validateFormula(formulaDefinition);
  } catch (error) {
    if (error instanceof FormulaValidationError) {
      throw mapFormulaValidationError(error);
    }

    throw error;
  }

  const createdVersion = await prisma.$transaction(async (tx) => {
    const requestedVersion = await tx.formula.findFirst({
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
        isActive: true,
        previousVersionId: true,
        inputs: true,
        expressions: true,
        outputs: true,
      },
    });

    if (!requestedVersion) {
      throw new AppError(404, "FORMULA_NOT_FOUND", "Formula not found");
    }

    let latestVersion = requestedVersion;
    const visited = new Set<string>();

    while (true) {
      if (visited.has(latestVersion.id)) {
        throw new AppError(500, "FORMULA_VERSION_CHAIN_INVALID", "Formula version chain is invalid");
      }

      visited.add(latestVersion.id);

      const nextVersion = await tx.formula.findFirst({
        where: {
          organizationId: input.organizationId,
          previousVersionId: latestVersion.id,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          version: true,
          isActive: true,
          previousVersionId: true,
          inputs: true,
          expressions: true,
          outputs: true,
        },
      });

      if (!nextVersion) {
        break;
      }

      latestVersion = nextVersion;
    }

    if (latestVersion.id !== requestedVersion.id) {
      throw new AppError(
        409,
        "FORMULA_VERSION_CONFLICT",
        "Only the latest formula version can be edited",
      );
    }

    await ensureLatestFormulaNameIsUnique({
      tx,
      organizationId: input.organizationId,
      name,
      excludeFormulaId: latestVersion.id,
    });

    const formula = await tx.formula.create({
      data: {
        organizationId: input.organizationId,
        name,
        description,
        category: input.category,
        version: latestVersion.version + 1,
        inputs: formulaDefinition.inputs as Prisma.InputJsonValue,
        expressions: formulaDefinition.expressions as Prisma.InputJsonValue,
        outputs: formulaDefinition.outputs as Prisma.InputJsonValue,
        isActive: latestVersion.isActive,
        createdBy: input.performedBy,
        previousVersionId: latestVersion.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        version: true,
        isActive: true,
        previousVersionId: true,
        inputs: true,
        expressions: true,
        outputs: true,
        createdAt: true,
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
        entityType: "Formula",
        entityId: formula.id,
        action: "FORMULA_VERSION_CREATED",
        beforeState: {
          id: latestVersion.id,
          name: latestVersion.name,
          description: latestVersion.description,
          category: latestVersion.category,
          version: latestVersion.version,
          isActive: latestVersion.isActive,
          previousVersionId: latestVersion.previousVersionId,
          inputs: latestVersion.inputs,
          expressions: latestVersion.expressions,
          outputs: latestVersion.outputs,
        },
        afterState: {
          id: formula.id,
          name: formula.name,
          description: formula.description,
          category: formula.category,
          version: formula.version,
          isActive: formula.isActive,
          previousVersionId: formula.previousVersionId,
          inputs: formula.inputs,
          expressions: formula.expressions,
          outputs: formula.outputs,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return formula;
  });

  return {
    id: createdVersion.id,
    name: createdVersion.name,
    description: createdVersion.description,
    category: createdVersion.category,
    version: createdVersion.version,
    isActive: createdVersion.isActive,
    previousVersionId: createdVersion.previousVersionId,
    inputs: createdVersion.inputs,
    expressions: createdVersion.expressions,
    outputs: createdVersion.outputs,
    createdAt: createdVersion.createdAt,
    createdBy: createdVersion.createdByUser,
  };
}

export async function deactivateFormula(
  input: DeactivateFormulaInput,
): Promise<DeactivateFormulaResult> {
  const updatedVersion = await prisma.$transaction(async (tx) => {
    const requestedVersion = await tx.formula.findFirst({
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
        isActive: true,
        previousVersionId: true,
        inputs: true,
        expressions: true,
        outputs: true,
        createdAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!requestedVersion) {
      throw new AppError(404, "FORMULA_NOT_FOUND", "Formula not found");
    }

    let latestVersion = requestedVersion;
    const visited = new Set<string>();

    while (true) {
      if (visited.has(latestVersion.id)) {
        throw new AppError(500, "FORMULA_VERSION_CHAIN_INVALID", "Formula version chain is invalid");
      }

      visited.add(latestVersion.id);

      const nextVersion = await tx.formula.findFirst({
        where: {
          organizationId: input.organizationId,
          previousVersionId: latestVersion.id,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          version: true,
          isActive: true,
          previousVersionId: true,
          inputs: true,
          expressions: true,
          outputs: true,
          createdAt: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!nextVersion) {
        break;
      }

      latestVersion = nextVersion;
    }

    if (latestVersion.id !== requestedVersion.id) {
      throw new AppError(
        409,
        "FORMULA_VERSION_CONFLICT",
        "Only the latest formula version can be deactivated",
      );
    }

    if (!latestVersion.isActive) {
      return latestVersion;
    }

    const deactivated = await tx.formula.update({
      where: { id: latestVersion.id },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        version: true,
        isActive: true,
        previousVersionId: true,
        inputs: true,
        expressions: true,
        outputs: true,
        createdAt: true,
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
        entityType: "Formula",
        entityId: deactivated.id,
        action: "FORMULA_DEACTIVATED",
        beforeState: {
          id: latestVersion.id,
          name: latestVersion.name,
          description: latestVersion.description,
          category: latestVersion.category,
          version: latestVersion.version,
          isActive: latestVersion.isActive,
          previousVersionId: latestVersion.previousVersionId,
          inputs: latestVersion.inputs,
          expressions: latestVersion.expressions,
          outputs: latestVersion.outputs,
        },
        afterState: {
          id: deactivated.id,
          name: deactivated.name,
          description: deactivated.description,
          category: deactivated.category,
          version: deactivated.version,
          isActive: deactivated.isActive,
          previousVersionId: deactivated.previousVersionId,
          inputs: deactivated.inputs,
          expressions: deactivated.expressions,
          outputs: deactivated.outputs,
        },
        performedBy: input.performedBy,
      },
      tx,
    );

    return deactivated;
  });

  return {
    id: updatedVersion.id,
    name: updatedVersion.name,
    description: updatedVersion.description,
    category: updatedVersion.category,
    version: updatedVersion.version,
    isActive: updatedVersion.isActive,
    previousVersionId: updatedVersion.previousVersionId,
    inputs: updatedVersion.inputs,
    expressions: updatedVersion.expressions,
    outputs: updatedVersion.outputs,
    createdAt: updatedVersion.createdAt,
    createdBy: updatedVersion.createdByUser,
  };
}

export async function testFormula(input: TestFormulaInput): Promise<TestFormulaResult> {
  const formula = await prisma.formula.findFirst({
    where: {
      id: input.formulaId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      name: true,
      category: true,
      version: true,
      isActive: true,
      inputs: true,
      expressions: true,
      outputs: true,
    },
  });

  if (!formula) {
    throw new AppError(404, "FORMULA_NOT_FOUND", "Formula not found");
  }

  const formulaDefinition = parseStoredFormulaDefinition(formula);

  try {
    const result = evaluateFormula(formulaDefinition, input.inputValues);
    return {
      formula: {
        id: formula.id,
        name: formula.name,
        category: formula.category,
        version: formula.version,
        isActive: formula.isActive,
      },
      resolvedInputs: result.resolvedInputs,
      computedResults: result.computedResults,
      outputValues: result.outputValues,
    };
  } catch (error) {
    if (error instanceof FormulaEvaluationError) {
      throw new AppError(400, error.code, error.message, error.details);
    }

    throw error;
  }
}

export async function getFormulas(input: GetFormulasInput): Promise<GetFormulasResult> {
  const where = {
    organizationId: input.organizationId,
    nextVersions: {
      none: {},
    },
  };

  const skip = (input.page - 1) * input.pageSize;

  const [items, totalItems] = await prisma.$transaction([
    prisma.formula.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        version: true,
        isActive: true,
        createdAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.formula.count({ where }),
  ]);

  return {
    items: items.map((formula) => ({
      id: formula.id,
      name: formula.name,
      description: formula.description,
      category: formula.category,
      currentVersion: formula.version,
      status: formula.isActive ? "ACTIVE" : "INACTIVE",
      isActive: formula.isActive,
      lastModifiedAt: formula.createdAt,
      lastModifiedBy: formula.createdByUser,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function getFormulaById(input: GetFormulaByIdInput): Promise<GetFormulaByIdResult> {
  const formula = await prisma.formula.findFirst({
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
      isActive: true,
      previousVersionId: true,
      inputs: true,
      expressions: true,
      outputs: true,
      createdAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!formula) {
    throw new AppError(404, "FORMULA_NOT_FOUND", "Formula not found");
  }

  return {
    id: formula.id,
    name: formula.name,
    description: formula.description,
    category: formula.category,
    version: formula.version,
    isActive: formula.isActive,
    previousVersionId: formula.previousVersionId,
    inputs: formula.inputs,
    expressions: formula.expressions,
    outputs: formula.outputs,
    createdAt: formula.createdAt,
    createdBy: formula.createdByUser,
  };
}

async function findFormulaVersionOrThrow(input: {
  organizationId: string;
  formulaId: string;
}): Promise<{
  id: string;
  previousVersionId: string | null;
}> {
  const formula = await prisma.formula.findFirst({
    where: {
      id: input.formulaId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      previousVersionId: true,
    },
  });

  if (!formula) {
    throw new AppError(404, "FORMULA_NOT_FOUND", "Formula not found");
  }

  return formula;
}

async function resolveRootFormulaId(input: {
  organizationId: string;
  formulaId: string;
}): Promise<string> {
  let current = await findFormulaVersionOrThrow(input);

  while (current.previousVersionId) {
    current = await findFormulaVersionOrThrow({
      organizationId: input.organizationId,
      formulaId: current.previousVersionId,
    });
  }

  return current.id;
}

export async function getFormulaVersions(
  input: GetFormulaVersionsInput,
): Promise<GetFormulaVersionsResult> {
  const rootFormulaId = await resolveRootFormulaId({
    organizationId: input.organizationId,
    formulaId: input.formulaId,
  });

  const versions: Array<{
    id: string;
    name: string;
    description: string;
    category: Category;
    version: number;
    isActive: boolean;
    previousVersionId: string | null;
    createdAt: Date;
    createdByUser: {
      id: string;
      name: string;
    };
  }> = [];
  const visited = new Set<string>();
  const queue: string[] = [rootFormulaId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    const current = await prisma.formula.findFirst({
      where: {
        id: currentId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        version: true,
        isActive: true,
        previousVersionId: true,
        createdAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!current) {
      continue;
    }

    versions.push(current);

    const nextVersions = await prisma.formula.findMany({
      where: {
        organizationId: input.organizationId,
        previousVersionId: currentId,
      },
      orderBy: [{ version: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    for (const next of nextVersions) {
      if (!visited.has(next.id)) {
        queue.push(next.id);
      }
    }
  }

  versions.sort((a, b) => a.version - b.version || a.createdAt.getTime() - b.createdAt.getTime());

  return {
    rootFormulaId,
    latestFormulaId: versions[versions.length - 1]?.id ?? rootFormulaId,
    versions: versions.map((version) => ({
      id: version.id,
      name: version.name,
      description: version.description,
      category: version.category,
      version: version.version,
      isActive: version.isActive,
      previousVersionId: version.previousVersionId,
      createdAt: version.createdAt,
      createdBy: version.createdByUser,
    })),
  };
}
