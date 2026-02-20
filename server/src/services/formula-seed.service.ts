import type { Prisma, PrismaClient } from "@prisma/client";
import { MVP_FORMULA_SEEDS } from "../formulas/seeds";
import { prisma } from "../prisma/client";

type FormulaDbClient = Pick<PrismaClient, "formula"> | Prisma.TransactionClient;

type SeedFormulaInput = {
  organizationId: string;
  createdBy: string;
};

export async function seedMvpFormulasForOrganization(
  input: SeedFormulaInput,
  db?: FormulaDbClient,
): Promise<number> {
  const client = db ?? prisma;
  const existingFormulaCount = await client.formula.count({
    where: { organizationId: input.organizationId },
  });

  if (existingFormulaCount > 0) {
    return 0;
  }

  const created = await client.formula.createMany({
    data: MVP_FORMULA_SEEDS.map((formula) => ({
      organizationId: input.organizationId,
      name: formula.name,
      description: formula.description,
      category: formula.category,
      version: 1,
      inputs: formula.inputs as Prisma.InputJsonValue,
      expressions: formula.expressions as Prisma.InputJsonValue,
      outputs: formula.outputs as Prisma.InputJsonValue,
      isActive: true,
      createdBy: input.createdBy,
    })),
  });

  return created.count;
}
