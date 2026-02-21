import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "demo.admin@estimatepro.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "DemoAdmin123!";
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";

type ApiEnvelope<T> = {
  data: T;
};

type LoginResponse = {
  accessToken: string;
};

type ProjectSummary = {
  id: string;
};

type EstimateSummary = {
  id: string;
  status: "DRAFT" | "FINAL" | "ARCHIVED";
  subtotal: string;
  markupRate: string;
  markupAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
};

type FormulaSummary = {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
};

type FormulaDetail = {
  id: string;
  category: string;
  inputs: Array<{
    variable: string;
    type: "number" | "integer";
    min?: number;
    max?: number;
    defaultValue?: number;
  }>;
  outputs: Array<{
    variable: string;
    unit: string;
  }>;
};

type CreateLineItemResponse = {
  lineItem: {
    id: string;
  };
};

type EstimateDetails = {
  estimate: EstimateSummary;
  lineItems: Array<{
    id: string;
    quantity: string;
    unit: string;
    unitMaterialCost: string;
    unitLaborCost: string;
    totalCost: string;
    calculationSource: "MANUAL" | "COMPUTED" | "ADJUSTED";
  }>;
  formulaUsage: Array<{
    lineItemId: string;
    formulaId: string;
    formulaSnapshot: unknown;
    inputValues: Record<string, unknown>;
    computedResults: Record<string, unknown>;
  }>;
};

function parseNumber(value: string): number {
  return Number.parseFloat(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function requestJson<T>(
  request: APIRequestContext,
  path: string,
  init?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    accessToken?: string;
    body?: unknown;
    expectedStatus?: number;
  },
): Promise<T> {
  const method = init?.method ?? "GET";
  const expectedStatus = init?.expectedStatus ?? 200;
  const response = await request.fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(init?.accessToken
        ? {
            Authorization: `Bearer ${init.accessToken}`,
          }
        : {}),
      ...(init?.body !== undefined
        ? {
            "Content-Type": "application/json",
          }
        : {}),
    },
    data: init?.body,
  });

  expect(response.status(), `${method} ${path} failed`).toBe(expectedStatus);
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

function buildInputValue(input: FormulaDetail["inputs"][number]): number {
  let candidate: number;

  if (typeof input.defaultValue === "number") {
    candidate = input.defaultValue;
  } else if (typeof input.min === "number") {
    candidate = input.min === 0 ? (input.type === "integer" ? 1 : 1.25) : input.min;
  } else {
    candidate = input.type === "integer" ? 1 : 1.25;
  }

  if (typeof input.max === "number" && candidate > input.max) {
    candidate = input.max;
  }

  if (input.type === "integer") {
    return Math.trunc(candidate);
  }

  return Number(candidate.toFixed(4));
}

test("Milestone 17: formula outputs are explainable from inputs to totals", async ({ request }) => {
  const runSuffix = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  const login = await requestJson<LoginResponse>(request, "/auth/login", {
    method: "POST",
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });
  const accessToken = login.accessToken;

  const project = await requestJson<ProjectSummary>(request, "/projects", {
    method: "POST",
    accessToken,
    expectedStatus: 201,
    body: {
      name: `Milestone 17 Explainability ${runSuffix}`,
      location: "Quezon City",
      projectType: "Commercial",
    },
  });

  const estimate = await requestJson<EstimateSummary>(request, `/projects/${project.id}/estimates`, {
    method: "POST",
    accessToken,
    expectedStatus: 201,
    body: {
      label: `Explainability ${runSuffix}`,
      markupRate: 10,
      vatRate: 12,
    },
  });

  const manualLineItems = [
    {
      category: "GENERAL_REQUIREMENTS",
      description: "Temporary facilities",
      quantity: 1,
      unit: "lot",
      unitMaterialCost: 9500,
      unitLaborCost: 6500,
    },
    {
      category: "FORMWORKS",
      description: "Shuttering work",
      quantity: 18,
      unit: "m2",
      unitMaterialCost: 170,
      unitLaborCost: 115,
    },
  ];

  for (const payload of manualLineItems) {
    await requestJson<CreateLineItemResponse>(request, `/estimates/${estimate.id}/line-items`, {
      method: "POST",
      accessToken,
      expectedStatus: 201,
      body: payload,
    });
  }

  const formulas = await requestJson<{ items: FormulaSummary[] }>(request, "/formulas?page=1&pageSize=100", {
    accessToken,
  });
  const formulaCategories = ["CONCRETE_WORKS", "MASONRY_WORKS", "PAINTING_WORKS"] as const;
  const expectedOutputByLineItemId = new Map<string, string>();

  for (const category of formulaCategories) {
    const formula = formulas.items.find((item) => item.category === category && item.isActive);
    expect(formula, `Missing active formula for category ${category}`).toBeTruthy();
    if (!formula) {
      throw new Error(`No active formula found for ${category}`);
    }

    const detail = await requestJson<FormulaDetail>(request, `/formulas/${formula.id}`, {
      accessToken,
    });
    expect(detail.outputs.length).toBeGreaterThan(0);
    const selectedOutput = detail.outputs[0];
    const inputValues = Object.fromEntries(
      detail.inputs.map((input) => [input.variable, buildInputValue(input)]),
    );

    const lineItem = await requestJson<CreateLineItemResponse>(request, `/estimates/${estimate.id}/line-items`, {
      method: "POST",
      accessToken,
      expectedStatus: 201,
      body: {
        category,
        description: `${formula.name} explainability item ${runSuffix}`,
        quantity: 1,
        unit: selectedOutput.unit,
        unitMaterialCost: 220,
        unitLaborCost: 160,
      },
    });

    expectedOutputByLineItemId.set(lineItem.lineItem.id, selectedOutput.variable);

    await requestJson(request, `/line-items/${lineItem.lineItem.id}/compute`, {
      method: "POST",
      accessToken,
      body: {
        formulaId: formula.id,
        outputVariable: selectedOutput.variable,
        inputValues,
      },
    });
  }

  await requestJson<EstimateSummary>(request, `/estimates/${estimate.id}/finalize`, {
    method: "POST",
    accessToken,
  });

  const finalEstimate = await requestJson<EstimateDetails>(request, `/estimates/${estimate.id}`, {
    accessToken,
  });

  const computedLineItems = finalEstimate.lineItems.filter((item) => item.calculationSource === "COMPUTED");
  expect(computedLineItems.length).toBe(3);
  expect(finalEstimate.formulaUsage.length).toBe(3);

  for (const usage of finalEstimate.formulaUsage) {
    expect(usage.formulaSnapshot).toBeTruthy();
    expect(Object.keys(usage.inputValues).length).toBeGreaterThan(0);
    expect(Object.keys(usage.computedResults).length).toBeGreaterThan(0);

    const lineItem = finalEstimate.lineItems.find((item) => item.id === usage.lineItemId);
    expect(lineItem).toBeTruthy();
    if (!lineItem) {
      throw new Error(`Missing line item ${usage.lineItemId}`);
    }

    const expectedOutputVariable = expectedOutputByLineItemId.get(usage.lineItemId);
    expect(expectedOutputVariable).toBeTruthy();
    if (!expectedOutputVariable) {
      throw new Error(`Missing expected output mapping for line item ${usage.lineItemId}`);
    }

    const computedOutput = usage.computedResults[expectedOutputVariable];
    expect(typeof computedOutput).toBe("number");
    if (typeof computedOutput !== "number") {
      throw new Error(`Computed output ${expectedOutputVariable} is not numeric`);
    }

    expect(parseNumber(lineItem.quantity)).toBeCloseTo(computedOutput, 4);

    const expectedLineTotal = round2(
      parseNumber(lineItem.quantity) *
        (parseNumber(lineItem.unitMaterialCost) + parseNumber(lineItem.unitLaborCost)),
    );
    expect(parseNumber(lineItem.totalCost)).toBeCloseTo(expectedLineTotal, 2);
  }

  const subtotalFromLines = round2(
    finalEstimate.lineItems.reduce((sum, lineItem) => sum + parseNumber(lineItem.totalCost), 0),
  );
  const estimateSubtotal = parseNumber(finalEstimate.estimate.subtotal);
  const markupRate = parseNumber(finalEstimate.estimate.markupRate);
  const vatRate = parseNumber(finalEstimate.estimate.vatRate);
  const expectedMarkup = round2(subtotalFromLines * (markupRate / 100));
  const expectedVat = round2((subtotalFromLines + expectedMarkup) * (vatRate / 100));
  const expectedGrandTotal = round2(subtotalFromLines + expectedMarkup + expectedVat);

  expect(estimateSubtotal).toBeCloseTo(subtotalFromLines, 2);
  expect(parseNumber(finalEstimate.estimate.markupAmount)).toBeCloseTo(expectedMarkup, 2);
  expect(parseNumber(finalEstimate.estimate.vatAmount)).toBeCloseTo(expectedVat, 2);
  expect(parseNumber(finalEstimate.estimate.totalAmount)).toBeCloseTo(expectedGrandTotal, 2);
});
