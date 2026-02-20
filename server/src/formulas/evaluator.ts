import { all, create } from "mathjs";
import type { FormulaDefinition, FormulaInputDefinition, FormulaInputValues } from "./types";

const math = create(all, {});
const ROUNDING_FACTOR = 10_000;

// Disable mutating/runtime-capable helpers to keep evaluation sandboxed to pure math.
math.import(
  {
    import: () => {
      throw new Error("Function import is disabled in formula evaluation");
    },
    createUnit: () => {
      throw new Error("Function createUnit is disabled in formula evaluation");
    },
  },
  { override: true },
);

export class FormulaEvaluationError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "FormulaEvaluationError";
    this.code = code;
    this.details = details;
  }
}

export type FormulaEvaluationResult = {
  resolvedInputs: FormulaInputValues;
  computedResults: Record<string, number>;
  outputValues: Record<string, number>;
};

function roundToFourDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

function resolveInputValue(definition: FormulaInputDefinition, rawValue: unknown): number {
  const value = rawValue ?? definition.defaultValue;

  if (value === undefined) {
    throw new FormulaEvaluationError(
      "FORMULA_MISSING_INPUT",
      `Missing required input: ${definition.variable}`,
    );
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new FormulaEvaluationError(
      "FORMULA_INVALID_INPUT",
      `Input ${definition.variable} must be a finite number`,
    );
  }

  if (definition.type === "integer" && !Number.isInteger(parsed)) {
    throw new FormulaEvaluationError(
      "FORMULA_INVALID_INPUT",
      `Input ${definition.variable} must be an integer`,
    );
  }

  if (definition.min !== undefined && parsed < definition.min) {
    throw new FormulaEvaluationError(
      "FORMULA_INPUT_OUT_OF_RANGE",
      `Input ${definition.variable} must be >= ${definition.min}`,
    );
  }

  if (definition.max !== undefined && parsed > definition.max) {
    throw new FormulaEvaluationError(
      "FORMULA_INPUT_OUT_OF_RANGE",
      `Input ${definition.variable} must be <= ${definition.max}`,
    );
  }

  return parsed;
}

function normalizeInputs(
  formula: FormulaDefinition,
  inputValues: Record<string, unknown>,
): FormulaInputValues {
  return formula.inputs.reduce<FormulaInputValues>((accumulator, input) => {
    accumulator[input.variable] = resolveInputValue(input, inputValues[input.variable]);
    return accumulator;
  }, {});
}

function resolveOutputValues(
  formula: FormulaDefinition,
  scope: Record<string, number>,
  computedResults: Record<string, number>,
): Record<string, number> {
  if (!formula.outputs || formula.outputs.length === 0) {
    return computedResults;
  }

  return formula.outputs.reduce<Record<string, number>>((accumulator, output) => {
    const value = scope[output.variable];
    if (value === undefined) {
      throw new FormulaEvaluationError(
        "FORMULA_INVALID_OUTPUT_MAPPING",
        `Output variable ${output.variable} is not defined in formula scope`,
      );
    }

    accumulator[output.variable] = value;
    return accumulator;
  }, {});
}

export function evaluateFormula(
  formula: FormulaDefinition,
  inputValues: Record<string, unknown>,
): FormulaEvaluationResult {
  const resolvedInputs = normalizeInputs(formula, inputValues);
  const scope: Record<string, number> = { ...resolvedInputs };
  const computedResults: Record<string, number> = {};

  for (const expression of formula.expressions) {
    let rawResult: unknown;

    try {
      rawResult = math.compile(expression.expression).evaluate(scope);
    } catch (error) {
      throw new FormulaEvaluationError(
        "FORMULA_EVALUATION_FAILED",
        `Failed to evaluate expression for ${expression.variable}`,
        error,
      );
    }

    const numericResult = Number(rawResult);
    if (!Number.isFinite(numericResult)) {
      throw new FormulaEvaluationError(
        "FORMULA_INVALID_RESULT",
        `Expression ${expression.variable} must resolve to a finite number`,
      );
    }

    const roundedResult = roundToFourDecimals(numericResult);
    scope[expression.variable] = roundedResult;
    computedResults[expression.variable] = roundedResult;
  }

  return {
    resolvedInputs,
    computedResults,
    outputValues: resolveOutputValues(formula, scope, computedResults),
  };
}
