import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFormula, FormulaEvaluationError } from "./evaluator";
import { validateFormula, FormulaValidationError } from "./validator";
import type { FormulaDefinition } from "./types";

const validFormula: FormulaDefinition = {
  inputs: [
    { variable: "length", label: "Length", unit: "m", type: "number", min: 0, max: 100 },
    { variable: "width", label: "Width", unit: "m", type: "number", min: 0, max: 100 },
  ],
  expressions: [
    { variable: "area", expression: "length * width" },
    { variable: "double_area", expression: "area * 2" },
  ],
  outputs: [{ variable: "double_area", lineItemField: "quantity", unit: "m2" }],
};

test("evaluateFormula handles basic arithmetic and sequential variables", () => {
  const result = evaluateFormula(validFormula, {
    length: 2,
    width: 3,
  });

  assert.equal(result.computedResults.area, 6);
  assert.equal(result.computedResults.double_area, 12);
  assert.equal(result.outputValues.double_area, 12);
});

test("evaluateFormula enforces min/max input constraints", () => {
  assert.throws(
    () => evaluateFormula(validFormula, { length: -1, width: 3 }),
    (error: unknown) =>
      error instanceof FormulaEvaluationError && error.code === "FORMULA_INPUT_OUT_OF_RANGE",
  );
});

test("evaluateFormula rounds expression results to four decimals", () => {
  const result = evaluateFormula(
    {
      inputs: [{ variable: "value", label: "Value", unit: "u", type: "number" }],
      expressions: [{ variable: "fraction", expression: "value / 3" }],
    },
    { value: 1 },
  );

  assert.equal(result.computedResults.fraction, 0.3333);
});

test("validateFormula rejects invalid expression syntax", () => {
  assert.throws(
    () =>
      validateFormula({
        inputs: [{ variable: "length", label: "Length", unit: "m", type: "number" }],
        expressions: [{ variable: "area", expression: "length **" }],
      }),
    (error: unknown) =>
      error instanceof FormulaValidationError && error.code === "FORMULA_INVALID_EXPRESSION",
  );
});

test("validateFormula rejects undefined variable references", () => {
  assert.throws(
    () =>
      validateFormula({
        inputs: [{ variable: "length", label: "Length", unit: "m", type: "number" }],
        expressions: [{ variable: "area", expression: "length * width" }],
      }),
    (error: unknown) =>
      error instanceof FormulaValidationError && error.code === "FORMULA_UNDEFINED_VARIABLE",
  );
});

test("validateFormula supports boundary-value dry-run for valid formulas", () => {
  assert.doesNotThrow(() => validateFormula(validFormula));
});
