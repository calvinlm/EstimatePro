"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  CATEGORY_VALUES,
  createFormula,
  getFormula,
  testFormula,
  updateFormula,
  type Category,
  type FormulaCreateOrUpdatePayload,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type FormulaEditorProps = {
  formulaId?: string;
};

type InputRow = {
  id: string;
  variable: string;
  label: string;
  unit: string;
  type: "number" | "integer";
  min: string;
  max: string;
  defaultValue: string;
};

type ExpressionRow = {
  id: string;
  variable: string;
  expression: string;
};

type OutputRow = {
  id: string;
  variable: string;
  unit: string;
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]";

function formatCategoryLabel(value: Category): string {
  return value
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }

  return parsed;
}

function createInputRow(id: string): InputRow {
  return {
    id,
    variable: "",
    label: "",
    unit: "",
    type: "number",
    min: "",
    max: "",
    defaultValue: "",
  };
}

function createExpressionRow(id: string): ExpressionRow {
  return {
    id,
    variable: "",
    expression: "",
  };
}

function createOutputRow(id: string): OutputRow {
  return {
    id,
    variable: "",
    unit: "",
  };
}

function parseExpressionErrorVariable(message: string): string | null {
  const match = message.match(/Expression for ([A-Za-z_][A-Za-z0-9_]*)/);
  return match?.[1] ?? null;
}

export function FormulaEditor({ formulaId }: FormulaEditorProps) {
  const router = useRouter();
  const rowCounterRef = useRef(0);
  const isEditMode = Boolean(formulaId);

  const [userRole, setUserRole] = useState("VIEWER");
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("CONCRETE_WORKS");
  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [expressions, setExpressions] = useState<ExpressionRow[]>([]);
  const [outputs, setOutputs] = useState<OutputRow[]>([]);

  const [testPanelOpen, setTestPanelOpen] = useState(true);
  const [testInputValues, setTestInputValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{
    resolvedInputs: Record<string, number>;
    computedResults: Record<string, number>;
    outputValues: Record<string, number>;
  } | null>(null);
  const [testError, setTestError] = useState("");

  const [expressionErrors, setExpressionErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");

  const isAdmin = useMemo(() => userRole === "ADMIN", [userRole]);

  function nextRowId(prefix: string): string {
    rowCounterRef.current += 1;
    return `${prefix}-${rowCounterRef.current}`;
  }

  useEffect(() => {
    setUserRole(readAuthUser()?.role ?? "VIEWER");
    setInputs([createInputRow(nextRowId("input"))]);
    setExpressions([createExpressionRow(nextRowId("expression"))]);
    setOutputs([createOutputRow(nextRowId("output"))]);
  }, []);

  useEffect(() => {
    if (!formulaId) {
      return;
    }
    const currentFormulaId: string = formulaId;

    let active = true;
    setIsLoading(true);
    setErrorMessage("");

    async function loadFormula(): Promise<void> {
      try {
        const formula = await getFormula(currentFormulaId);
        if (!active) {
          return;
        }

        setName(formula.name);
        setDescription(formula.description);
        setCategory(formula.category);
        setInputs(
          formula.inputs.map((input) => ({
            id: nextRowId("input"),
            variable: input.variable,
            label: input.label,
            unit: input.unit,
            type: input.type,
            min: input.min !== undefined ? `${input.min}` : "",
            max: input.max !== undefined ? `${input.max}` : "",
            defaultValue: input.defaultValue !== undefined ? `${input.defaultValue}` : "",
          })),
        );
        setExpressions(
          formula.expressions.map((expression) => ({
            id: nextRowId("expression"),
            variable: expression.variable,
            expression: expression.expression,
          })),
        );
        setOutputs(
          formula.outputs.map((output) => ({
            id: nextRowId("output"),
            variable: output.variable,
            unit: output.unit,
          })),
        );
        setTestInputValues(
          Object.fromEntries(
            formula.inputs.map((input) => [
              input.variable,
              input.defaultValue !== undefined ? `${input.defaultValue}` : "",
            ]),
          ),
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to load formula");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadFormula();

    return () => {
      active = false;
    };
  }, [formulaId]);

  function updateInputRow(id: string, field: keyof InputRow, value: string): void {
    setInputs((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  function updateExpressionRow(id: string, field: keyof ExpressionRow, value: string): void {
    setExpressions((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  function updateOutputRow(id: string, field: keyof OutputRow, value: string): void {
    setOutputs((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  function addInputRow(): void {
    setInputs((current) => [...current, createInputRow(nextRowId("input"))]);
  }

  function addExpressionRow(): void {
    setExpressions((current) => [...current, createExpressionRow(nextRowId("expression"))]);
  }

  function addOutputRow(): void {
    setOutputs((current) => [...current, createOutputRow(nextRowId("output"))]);
  }

  function removeInputRow(id: string): void {
    setInputs((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  }

  function removeExpressionRow(id: string): void {
    setExpressions((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  }

  function removeOutputRow(id: string): void {
    setOutputs((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  }

  function buildPayload(): FormulaCreateOrUpdatePayload {
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    if (!normalizedName || !normalizedDescription) {
      throw new Error("Name and description are required.");
    }

    if (inputs.length === 0 || expressions.length === 0 || outputs.length === 0) {
      throw new Error("At least one input, expression, and output is required.");
    }

    return {
      name: normalizedName,
      description: normalizedDescription,
      category,
      inputs: inputs.map((row) => {
        const variable = row.variable.trim();
        const label = row.label.trim();
        const unit = row.unit.trim();
        if (!variable || !label || !unit) {
          throw new Error("Each input row requires variable, label, and unit.");
        }

        return {
          variable,
          label,
          unit,
          type: row.type,
          min: parseOptionalNumber(row.min),
          max: parseOptionalNumber(row.max),
          defaultValue: parseOptionalNumber(row.defaultValue),
        };
      }),
      expressions: expressions.map((row) => {
        const variable = row.variable.trim();
        const expression = row.expression.trim();
        if (!variable || !expression) {
          throw new Error("Each expression row requires variable and expression.");
        }

        return {
          variable,
          expression,
        };
      }),
      outputs: outputs.map((row) => {
        const variable = row.variable.trim();
        const unit = row.unit.trim();
        if (!variable || !unit) {
          throw new Error("Each output row requires variable and unit.");
        }

        return {
          variable,
          lineItemField: "quantity",
          unit,
        };
      }),
    };
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage("");
    setExpressionErrors({});
    setIsSaving(true);

    try {
      const payload = buildPayload();
      if (formulaId) {
        await updateFormula(formulaId, payload);
      } else {
        await createFormula(payload);
      }

      router.push("/formulas");
    } catch (error) {
      if (error instanceof ApiError) {
        const parsedExpressionErrors: Record<string, string> = {};
        if (error.code !== "VALIDATION_ERROR") {
          const variable = parseExpressionErrorVariable(error.message);
          if (variable) {
            parsedExpressionErrors[variable] = error.message;
          }
        }

        const detailIssues = Array.isArray(error.details) ? error.details : [];
        for (const issue of detailIssues) {
          if (typeof issue !== "object" || issue === null) {
            continue;
          }

          const path = "path" in issue ? String(issue.path) : "";
          const message = "message" in issue ? String(issue.message) : "Validation failed";
          const match = path.match(/^expressions\.(\d+)\.expression$/);
          if (match) {
            const index = Number.parseInt(match[1], 10);
            const variable = expressions[index]?.variable.trim();
            if (variable) {
              parsedExpressionErrors[variable] = message;
            }
          }
        }

        setExpressionErrors(parsedExpressionErrors);
        setErrorMessage(error.message);
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Failed to save formula");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunTest(): Promise<void> {
    if (!formulaId) {
      setTestError("Save the formula first before running tests.");
      return;
    }

    const inputValues: Record<string, number> = {};
    for (const input of inputs) {
      const key = input.variable.trim();
      if (!key) {
        setTestError("All test input variables must be defined.");
        return;
      }

      const rawValue = (testInputValues[key] ?? "").trim();
      if (!rawValue) {
        setTestError(`Value required for ${key}.`);
        return;
      }

      const parsed = Number.parseFloat(rawValue);
      if (!Number.isFinite(parsed)) {
        setTestError(`Invalid number for ${key}.`);
        return;
      }

      inputValues[key] = parsed;
    }

    setIsTesting(true);
    setTestError("");
    setTestResult(null);

    try {
      const result = await testFormula(formulaId, { inputValues });
      setTestResult({
        resolvedInputs: result.resolvedInputs,
        computedResults: result.computedResults,
        outputValues: result.outputValues,
      });
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Formula test failed");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          Formula Editor
        </p>
        <h1 className="text-3xl font-semibold">{isEditMode ? "Edit Formula" : "New Formula"}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {isEditMode
            ? "Saving creates a new formula version. Existing versions remain immutable."
            : "Create a new formula version 1 for your organization."}
        </p>
      </div>

      {!isAdmin ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only Admin users can create or edit formulas.
        </p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
          <Spinner />
          <span>Loading formula...</span>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSave}>
          <div className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="formulaName">Name</Label>
              <Input
                id="formulaName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!isAdmin || isSaving}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="formulaDescription">Description</Label>
              <textarea
                id="formulaDescription"
                className="min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!isAdmin || isSaving}
              />
            </div>
            <div>
              <Label htmlFor="formulaCategory">Category</Label>
              <select
                id="formulaCategory"
                className={SELECT_CLASS}
                value={category}
                onChange={(event) => setCategory(event.target.value as Category)}
                disabled={!isAdmin || isSaving}
              >
                {CATEGORY_VALUES.map((item) => (
                  <option key={item} value={item}>
                    {formatCategoryLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Input Definitions</h2>
              <Button type="button" variant="secondary" onClick={addInputRow} disabled={!isAdmin || isSaving}>
                Add Input
              </Button>
            </div>
            <div className="space-y-3">
              {inputs.map((row) => (
                <div key={row.id} className="grid gap-2 rounded-md border border-[var(--color-border)] p-3 md:grid-cols-8">
                  <Input
                    value={row.variable}
                    onChange={(event) => updateInputRow(row.id, "variable", event.target.value)}
                    placeholder="variable"
                    disabled={!isAdmin || isSaving}
                  />
                  <Input
                    value={row.label}
                    onChange={(event) => updateInputRow(row.id, "label", event.target.value)}
                    placeholder="label"
                    disabled={!isAdmin || isSaving}
                  />
                  <Input
                    value={row.unit}
                    onChange={(event) => updateInputRow(row.id, "unit", event.target.value)}
                    placeholder="unit"
                    disabled={!isAdmin || isSaving}
                  />
                  <select
                    className={SELECT_CLASS}
                    value={row.type}
                    onChange={(event) => updateInputRow(row.id, "type", event.target.value)}
                    disabled={!isAdmin || isSaving}
                  >
                    <option value="number">number</option>
                    <option value="integer">integer</option>
                  </select>
                  <Input
                    value={row.min}
                    onChange={(event) => updateInputRow(row.id, "min", event.target.value)}
                    placeholder="min"
                    type="number"
                    disabled={!isAdmin || isSaving}
                  />
                  <Input
                    value={row.max}
                    onChange={(event) => updateInputRow(row.id, "max", event.target.value)}
                    placeholder="max"
                    type="number"
                    disabled={!isAdmin || isSaving}
                  />
                  <Input
                    value={row.defaultValue}
                    onChange={(event) => updateInputRow(row.id, "defaultValue", event.target.value)}
                    placeholder="default"
                    type="number"
                    disabled={!isAdmin || isSaving}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 text-xs"
                    onClick={() => removeInputRow(row.id)}
                    disabled={!isAdmin || isSaving || inputs.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Expression Definitions</h2>
              <Button type="button" variant="secondary" onClick={addExpressionRow} disabled={!isAdmin || isSaving}>
                Add Expression
              </Button>
            </div>
            <div className="space-y-3">
              {expressions.map((row) => (
                <div key={row.id} className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
                  <div className="grid gap-2 md:grid-cols-[220px_1fr_120px]">
                    <Input
                      value={row.variable}
                      onChange={(event) => updateExpressionRow(row.id, "variable", event.target.value)}
                      placeholder="variable"
                      disabled={!isAdmin || isSaving}
                    />
                    <Input
                      value={row.expression}
                      onChange={(event) => updateExpressionRow(row.id, "expression", event.target.value)}
                      placeholder="expression"
                      disabled={!isAdmin || isSaving}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 text-xs"
                      onClick={() => removeExpressionRow(row.id)}
                      disabled={!isAdmin || isSaving || expressions.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                  {row.variable.trim() && expressionErrors[row.variable.trim()] ? (
                    <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">
                      {expressionErrors[row.variable.trim()]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Output Mappings</h2>
              <Button type="button" variant="secondary" onClick={addOutputRow} disabled={!isAdmin || isSaving}>
                Add Output
              </Button>
            </div>
            <div className="space-y-3">
              {outputs.map((row) => (
                <div key={row.id} className="grid gap-2 rounded-md border border-[var(--color-border)] p-3 md:grid-cols-[1fr_1fr_180px_120px]">
                  <Input
                    value={row.variable}
                    onChange={(event) => updateOutputRow(row.id, "variable", event.target.value)}
                    placeholder="variable"
                    disabled={!isAdmin || isSaving}
                  />
                  <Input
                    value={row.unit}
                    onChange={(event) => updateOutputRow(row.id, "unit", event.target.value)}
                    placeholder="unit"
                    disabled={!isAdmin || isSaving}
                  />
                  <Input value="quantity" disabled aria-label="line item field" />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 text-xs"
                    onClick={() => removeOutputRow(row.id)}
                    disabled={!isAdmin || isSaving || outputs.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Live Test Panel</h2>
              <Button type="button" variant="ghost" onClick={() => setTestPanelOpen((open) => !open)}>
                {testPanelOpen ? "Collapse" : "Expand"}
              </Button>
            </div>
            {testPanelOpen ? (
              <div className="space-y-3">
                {!formulaId ? (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Save this formula first to enable server-side live tests.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      {inputs.map((input) => {
                        const key = input.variable.trim();
                        return (
                          <div key={input.id}>
                            <Label htmlFor={`test-input-${input.id}`}>
                              {input.label.trim() || key || "Input"} ({input.unit.trim() || "unit"})
                            </Label>
                            <Input
                              id={`test-input-${input.id}`}
                              type="number"
                              value={key ? testInputValues[key] ?? "" : ""}
                              onChange={(event) => {
                                if (!key) {
                                  return;
                                }
                                setTestInputValues((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }));
                              }}
                              disabled={isTesting}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {testError ? (
                      <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
                        {testError}
                      </p>
                    ) : null}
                    <div className="flex justify-end">
                      <Button type="button" onClick={() => void handleRunTest()} disabled={isTesting || !formulaId}>
                        {isTesting ? "Running Test..." : "Run Test"}
                      </Button>
                    </div>
                    {testResult ? (
                      <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            Resolved Inputs
                          </p>
                          <div className="mt-1 grid gap-1 md:grid-cols-2">
                            {Object.entries(testResult.resolvedInputs).map(([key, value]) => (
                              <p key={key} className="text-sm">
                                <span className="text-[var(--color-text-muted)]">{key}: </span>
                                {value}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            Computed Results
                          </p>
                          <div className="mt-1 grid gap-1 md:grid-cols-2">
                            {Object.entries(testResult.computedResults).map(([key, value]) => (
                              <p key={key} className="text-sm">
                                <span className="text-[var(--color-text-muted)]">{key}: </span>
                                {value}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            Output Values
                          </p>
                          <div className="mt-1 grid gap-1 md:grid-cols-2">
                            {Object.entries(testResult.outputValues).map(([key, value]) => (
                              <p key={key} className="text-sm">
                                <span className="text-[var(--color-text-muted)]">{key}: </span>
                                {value}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/formulas")} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isAdmin || isSaving}>
              {isSaving ? "Saving..." : isEditMode ? "Save New Version" : "Create Formula"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
