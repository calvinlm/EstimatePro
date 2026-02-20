import type { FormulaSeedDefinition } from "../types";
import { chbWallSeed } from "./chbWall";
import { concreteSlabSeed } from "./concreteSlab";
import { paintingWorksSeed } from "./paintingWorks";

export const MVP_FORMULA_SEEDS: FormulaSeedDefinition[] = [
  concreteSlabSeed,
  chbWallSeed,
  paintingWorksSeed,
];
