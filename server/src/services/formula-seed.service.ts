import { Category, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";

type FormulaDbClient = Pick<PrismaClient, "formula"> | Prisma.TransactionClient;

type SeedFormulaInput = {
  organizationId: string;
  createdBy: string;
};

const MVP_FORMULAS = [
  {
    name: "Concrete Slab",
    description: "Computes concrete slab material quantities from slab dimensions.",
    category: Category.CONCRETE_WORKS,
    inputs: [
      { variable: "length", label: "Length", unit: "m", type: "number", min: 0 },
      { variable: "width", label: "Width", unit: "m", type: "number", min: 0 },
      { variable: "thickness", label: "Thickness", unit: "m", type: "number", min: 0 },
      {
        variable: "waste_factor",
        label: "Waste Factor",
        unit: "%",
        type: "number",
        min: 0,
        defaultValue: 10,
      },
    ],
    expressions: [
      { variable: "volume", expression: "length * width * thickness * (1 + waste_factor / 100)" },
      { variable: "cement_bags", expression: "ceil(volume * 8.07)" },
      { variable: "sand_volume", expression: "volume * 0.50" },
      { variable: "gravel_volume", expression: "volume * 1.00" },
    ],
    outputs: [
      { variable: "cement_bags", lineItemField: "quantity", unit: "bags" },
      { variable: "sand_volume", lineItemField: "quantity", unit: "m3" },
      { variable: "gravel_volume", lineItemField: "quantity", unit: "m3" },
    ],
  },
  {
    name: "CHB Wall",
    description: "Computes CHB wall quantities based on wall dimensions and openings.",
    category: Category.MASONRY_WORKS,
    inputs: [
      { variable: "length", label: "Length", unit: "m", type: "number", min: 0 },
      { variable: "height", label: "Height", unit: "m", type: "number", min: 0 },
      {
        variable: "openings_area",
        label: "Openings Area",
        unit: "m2",
        type: "number",
        min: 0,
        defaultValue: 0,
      },
      {
        variable: "chb_size",
        label: "CHB Size",
        unit: "in",
        type: "number",
        min: 4,
        defaultValue: 4,
      },
    ],
    expressions: [
      { variable: "wall_area", expression: "(length * height) - openings_area" },
      { variable: "chb_count", expression: "ceil(wall_area * 12.5)" },
      { variable: "cement_bags", expression: "ceil(wall_area * 0.50)" },
      { variable: "sand_volume", expression: "wall_area * 0.04" },
    ],
    outputs: [
      { variable: "chb_count", lineItemField: "quantity", unit: "pcs" },
      { variable: "cement_bags", lineItemField: "quantity", unit: "bags" },
      { variable: "sand_volume", lineItemField: "quantity", unit: "m3" },
    ],
  },
  {
    name: "Painting Works",
    description: "Computes painting requirements from area, coats, and coverage.",
    category: Category.PAINTING_WORKS,
    inputs: [
      { variable: "area", label: "Area", unit: "m2", type: "number", min: 0 },
      { variable: "coats", label: "Coats", unit: "count", type: "number", min: 1, defaultValue: 2 },
      {
        variable: "coverage_rate",
        label: "Coverage Rate",
        unit: "m2/L",
        type: "number",
        min: 0.0001,
        defaultValue: 10,
      },
    ],
    expressions: [
      { variable: "primer_liters", expression: "ceil(area / coverage_rate)" },
      { variable: "paint_liters", expression: "ceil((area * coats) / coverage_rate)" },
    ],
    outputs: [
      { variable: "primer_liters", lineItemField: "quantity", unit: "L" },
      { variable: "paint_liters", lineItemField: "quantity", unit: "L" },
    ],
  },
] satisfies Array<{
  name: string;
  description: string;
  category: Category;
  inputs: Prisma.InputJsonValue;
  expressions: Prisma.InputJsonValue;
  outputs: Prisma.InputJsonValue;
}>;

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
    data: MVP_FORMULAS.map((formula) => ({
      organizationId: input.organizationId,
      name: formula.name,
      description: formula.description,
      category: formula.category,
      version: 1,
      inputs: formula.inputs,
      expressions: formula.expressions,
      outputs: formula.outputs,
      isActive: true,
      createdBy: input.createdBy,
    })),
  });

  return created.count;
}
