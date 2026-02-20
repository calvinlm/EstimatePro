import { Category } from "@prisma/client";
import type { FormulaSeedDefinition } from "../types";

export const paintingWorksSeed: FormulaSeedDefinition = {
  name: "Painting Works",
  description: "Computes painting requirements from area, coats, and coverage.",
  category: Category.PAINTING_WORKS,
  inputs: [
    { variable: "area", label: "Area", unit: "m2", type: "number", min: 0 },
    { variable: "coats", label: "Coats", unit: "count", type: "integer", min: 1, defaultValue: 2 },
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
};
