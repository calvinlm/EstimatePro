import { Category } from "@prisma/client";
import type { FormulaSeedDefinition } from "../types";

export const chbWallSeed: FormulaSeedDefinition = {
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
};
