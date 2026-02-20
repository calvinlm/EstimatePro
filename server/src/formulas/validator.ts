import { all, create, type MathNode } from "mathjs";
import { evaluateFormula, FormulaEvaluationError } from "./evaluator";
import type { FormulaDefinition, FormulaInputDefinition, FormulaInputValues } from "./types";

const math = create(all, {});
const ALLOWED_FUNCTIONS = new Set(["ceil", "floor", "round", "sqrt", "abs", "max", "min"]);

export class FormulaValidationError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "FormulaValidationError";
    this.code = code;
    this.details = details;
  }
}

function isFunctionNameNode(node: MathNode, parent: MathNode | null): boolean {
  if (!parent || !("isFunctionNode" in parent) || !parent.isFunctionNode) {
    return false;
  }

  return "fn" in parent && parent.fn === node;
}

function validateInputConstraints(formula: FormulaDefinition): void {
  for (const input of formula.inputs) {
    if (input.min !== undefined && input.max !== undefined && input.min > input.max) {
      throw new FormulaValidationError(
        "FORMULA_INVALID_INPUT_RANGE",
        `Input ${input.variable} has min greater than max`,
      );
    }
  }
}

function validateSingleExpression(
  expression: string,
  expressionVariable: string,
  availableVariables: Set<string>,
): void {
  let parsedNode: MathNode;

  try {
    parsedNode = math.parse(expression);
  } catch (error) {
    throw new FormulaValidationError(
      "FORMULA_INVALID_EXPRESSION",
      `Expression for ${expressionVariable} has invalid syntax`,
      error,
    );
  }

  parsedNode.traverse((node, _path, parent) => {
    if ("isAssignmentNode" in node && node.isAssignmentNode) {
      throw new FormulaValidationError(
        "FORMULA_UNSAFE_EXPRESSION",
        `Assignments are not allowed in expression for ${expressionVariable}`,
      );
    }

    if ("isFunctionAssignmentNode" in node && node.isFunctionAssignmentNode) {
      throw new FormulaValidationError(
        "FORMULA_UNSAFE_EXPRESSION",
        `Function assignments are not allowed in expression for ${expressionVariable}`,
      );
    }

    if ("isSymbolNode" in node && node.isSymbolNode) {
      const symbolName = String((node as unknown as { name: string }).name);

      if (isFunctionNameNode(node, parent)) {
        if (!ALLOWED_FUNCTIONS.has(symbolName)) {
          throw new FormulaValidationError(
            "FORMULA_UNSAFE_FUNCTION",
            `Function ${symbolName} is not allowed`,
          );
        }

        return;
      }

      if (!availableVariables.has(symbolName)) {
        throw new FormulaValidationError(
          "FORMULA_UNDEFINED_VARIABLE",
          `Expression for ${expressionVariable} references undefined variable ${symbolName}`,
        );
      }
    }
  });
}

function resolveBoundaryValue(definition: FormulaInputDefinition, mode: "min" | "max"): number {
  if (mode === "min") {
    if (definition.min !== undefined) {
      return definition.min;
    }

    if (definition.defaultValue !== undefined) {
      return definition.defaultValue;
    }

    return 0;
  }

  if (definition.max !== undefined) {
    return definition.max;
  }

  if (definition.defaultValue !== undefined) {
    return definition.defaultValue;
  }

  if (definition.min !== undefined) {
    return definition.min;
  }

  return 1;
}

function buildBoundaryInputs(formula: FormulaDefinition, mode: "min" | "max"): FormulaInputValues {
  return formula.inputs.reduce<FormulaInputValues>((accumulator, input) => {
    const rawValue = resolveBoundaryValue(input, mode);
    accumulator[input.variable] = input.type === "integer" ? Math.round(rawValue) : rawValue;
    return accumulator;
  }, {});
}

function dryRunBoundaryEvaluation(formula: FormulaDefinition): void {
  try {
    evaluateFormula(formula, buildBoundaryInputs(formula, "min"));
    evaluateFormula(formula, buildBoundaryInputs(formula, "max"));
  } catch (error) {
    if (error instanceof FormulaEvaluationError) {
      throw new FormulaValidationError("FORMULA_DRY_RUN_FAILED", error.message, error.details);
    }

    throw error;
  }
}

export function validateFormula(formula: FormulaDefinition): void {
  validateInputConstraints(formula);

  const availableVariables = new Set(formula.inputs.map((input) => input.variable));

  for (const expression of formula.expressions) {
    if (availableVariables.has(expression.variable)) {
      throw new FormulaValidationError(
        "FORMULA_DUPLICATE_VARIABLE",
        `Variable ${expression.variable} is already defined`,
      );
    }

    validateSingleExpression(expression.expression, expression.variable, availableVariables);
    availableVariables.add(expression.variable);
  }

  dryRunBoundaryEvaluation(formula);
}
