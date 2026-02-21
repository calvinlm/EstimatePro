import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "demo.admin@estimatepro.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "DemoAdmin123!";
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

type ApiEnvelope<T> = {
  data: T;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    organizationId: string;
  };
};

type ProjectSummary = {
  id: string;
};

type EstimateSummary = {
  id: string;
  status: "DRAFT" | "FINAL" | "ARCHIVED";
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
  }>;
};

type CreateLineItemResponse = {
  lineItem: {
    id: string;
  };
};

type EstimateDetailResponse = {
  estimate: EstimateSummary;
  lineItems: Array<{
    id: string;
    category: string;
    calculationSource: "MANUAL" | "COMPUTED" | "ADJUSTED";
  }>;
};

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

test("Milestone 17: baseline quote flow completes under 15 minutes (3 computed + 2 manual)", async ({
  request,
}) => {
  const startedAt = Date.now();
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
      name: `Milestone 17 Baseline ${runSuffix}`,
      location: "Metro Manila",
      projectType: "Residential",
    },
  });

  const estimate = await requestJson<EstimateSummary>(request, `/projects/${project.id}/estimates`, {
    method: "POST",
    accessToken,
    expectedStatus: 201,
    body: {
      label: `Baseline ${runSuffix}`,
      markupRate: 10,
      vatRate: 12,
    },
  });

  const manualLineItems = [
    {
      category: "GENERAL_REQUIREMENTS",
      description: "Site mobilization and permits",
      quantity: 1,
      unit: "lot",
      unitMaterialCost: 12000,
      unitLaborCost: 8000,
    },
    {
      category: "FORMWORKS",
      description: "Temporary formwork setup",
      quantity: 24,
      unit: "m2",
      unitMaterialCost: 180,
      unitLaborCost: 120,
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
  for (const category of formulaCategories) {
    const formula = formulas.items.find((item) => item.category === category && item.isActive);
    expect(formula, `Missing active formula for category ${category}`).toBeTruthy();
    if (!formula) {
      throw new Error(`No active formula found for ${category}`);
    }

    const detail = await requestJson<FormulaDetail>(request, `/formulas/${formula.id}`, {
      accessToken,
    });
    expect(detail.outputs.length, `Formula ${formula.id} has no outputs`).toBeGreaterThan(0);
    const selectedOutput = detail.outputs[0];

    const computeInputValues = Object.fromEntries(
      detail.inputs.map((input) => [input.variable, buildInputValue(input)]),
    );

    const createdLineItem = await requestJson<CreateLineItemResponse>(request, `/estimates/${estimate.id}/line-items`, {
      method: "POST",
      accessToken,
      expectedStatus: 201,
      body: {
        category,
        description: `${formula.name} computed line item ${runSuffix}`,
        quantity: 1,
        unit: "unit",
        unitMaterialCost: 250,
        unitLaborCost: 175,
      },
    });

    await requestJson(request, `/line-items/${createdLineItem.lineItem.id}/compute`, {
      method: "POST",
      accessToken,
      body: {
        formulaId: formula.id,
        outputVariable: selectedOutput.variable,
        inputValues: computeInputValues,
      },
    });
  }

  await requestJson<EstimateSummary>(request, `/estimates/${estimate.id}/finalize`, {
    method: "POST",
    accessToken,
  });

  const finalEstimate = await requestJson<EstimateDetailResponse>(request, `/estimates/${estimate.id}`, {
    accessToken,
  });

  const manualCount = finalEstimate.lineItems.filter((item) => item.calculationSource === "MANUAL").length;
  const computedCount = finalEstimate.lineItems.filter((item) => item.calculationSource === "COMPUTED").length;
  const totalCount = finalEstimate.lineItems.length;

  expect(totalCount).toBe(5);
  expect(manualCount).toBe(2);
  expect(computedCount).toBe(3);
  expect(finalEstimate.estimate.status).toBe("FINAL");

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(FIFTEEN_MINUTES_MS);

  test.info().annotations.push({
    type: "timing",
    description: `Baseline quote flow duration: ${(elapsedMs / 1000).toFixed(2)}s`,
  });
});
