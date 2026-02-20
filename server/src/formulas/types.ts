import type { Category } from "@prisma/client";

export type FormulaInputDefinition = {
  variable: string;
  label: string;
  unit: string;
  type: "number" | "integer";
  min?: number;
  max?: number;
  defaultValue?: number;
};

export type FormulaExpressionDefinition = {
  variable: string;
  expression: string;
};

export type FormulaOutputDefinition = {
  variable: string;
  lineItemField: string;
  unit: string;
};

export type FormulaDefinition = {
  inputs: FormulaInputDefinition[];
  expressions: FormulaExpressionDefinition[];
  outputs?: FormulaOutputDefinition[];
};

export type FormulaSeedDefinition = FormulaDefinition & {
  name: string;
  description: string;
  category: Category;
  outputs: FormulaOutputDefinition[];
};

export type FormulaInputValues = Record<string, number>;
