import { Category } from "@prisma/client";
import type { FormulaSeedDefinition } from "../types";

export const concreteSlabSeed: FormulaSeedDefinition = {
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
};
