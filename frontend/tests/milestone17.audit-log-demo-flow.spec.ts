import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "demo.admin@estimatepro.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "DemoAdmin123!";
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";

type ApiEnvelope<T> = {
  data: T;
};

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
  };
};

type ProjectSummary = {
  id: string;
};

type EstimateSummary = {
  id: string;
};

type FormulaSummary = {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
};

type FormulaDetail = {
  id: string;
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

type AuditEntry = {
  entityType: "Project" | "Estimate" | "LineItem" | "Formula" | "User";
  entityId: string;
  action: string;
};

type AuditResponse = {
  items: AuditEntry[];
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

test("Milestone 17: audit log captures all key actions in demo quote flow", async ({ request }) => {
  const startedAtIso = new Date().toISOString();
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
      name: `Milestone 17 Audit Flow ${runSuffix}`,
      location: "Makati",
      projectType: "Mixed Use",
    },
  });

  const estimate = await requestJson<EstimateSummary>(request, `/projects/${project.id}/estimates`, {
    method: "POST",
    accessToken,
    expectedStatus: 201,
    body: {
      label: `Audit ${runSuffix}`,
      markupRate: 10,
      vatRate: 12,
    },
  });

  const createdLineItemIds: string[] = [];
  const computedLineItemIds: string[] = [];

  const manualLineItems = [
    {
      category: "GENERAL_REQUIREMENTS",
      description: "Safety provisions",
      quantity: 1,
      unit: "lot",
      unitMaterialCost: 7000,
      unitLaborCost: 4000,
    },
    {
      category: "FORMWORKS",
      description: "Form lining",
      quantity: 14,
      unit: "m2",
      unitMaterialCost: 165,
      unitLaborCost: 110,
    },
  ];

  for (const payload of manualLineItems) {
    const created = await requestJson<CreateLineItemResponse>(request, `/estimates/${estimate.id}/line-items`, {
      method: "POST",
      accessToken,
      expectedStatus: 201,
      body: payload,
    });
    createdLineItemIds.push(created.lineItem.id);
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
    expect(detail.outputs.length).toBeGreaterThan(0);
    const selectedOutput = detail.outputs[0];
    const inputValues = Object.fromEntries(
      detail.inputs.map((input) => [input.variable, buildInputValue(input)]),
    );

    const created = await requestJson<CreateLineItemResponse>(request, `/estimates/${estimate.id}/line-items`, {
      method: "POST",
      accessToken,
      expectedStatus: 201,
      body: {
        category,
        description: `${formula.name} audit flow item ${runSuffix}`,
        quantity: 1,
        unit: "unit",
        unitMaterialCost: 240,
        unitLaborCost: 170,
      },
    });
    createdLineItemIds.push(created.lineItem.id);
    computedLineItemIds.push(created.lineItem.id);

    await requestJson(request, `/line-items/${created.lineItem.id}/compute`, {
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

  const audit = await requestJson<AuditResponse>(
    request,
    `/audit?page=1&pageSize=100&from=${encodeURIComponent(startedAtIso)}&userId=${encodeURIComponent(login.user.id)}`,
    {
      accessToken,
    },
  );

  const projectCreate = audit.items.find(
    (entry) =>
      entry.entityType === "Project" &&
      entry.entityId === project.id &&
      entry.action === "PROJECT_CREATED",
  );
  expect(projectCreate).toBeTruthy();

  const estimateCreate = audit.items.find(
    (entry) =>
      entry.entityType === "Estimate" &&
      entry.entityId === estimate.id &&
      entry.action === "ESTIMATE_CREATED",
  );
  expect(estimateCreate).toBeTruthy();

  const estimateFinalize = audit.items.find(
    (entry) =>
      entry.entityType === "Estimate" &&
      entry.entityId === estimate.id &&
      entry.action === "ESTIMATE_FINALIZED",
  );
  expect(estimateFinalize).toBeTruthy();

  const lineItemCreatedCount = audit.items.filter(
    (entry) =>
      entry.entityType === "LineItem" &&
      createdLineItemIds.includes(entry.entityId) &&
      entry.action === "LINE_ITEM_CREATED",
  ).length;
  expect(lineItemCreatedCount).toBe(5);

  const lineItemComputedCount = audit.items.filter(
    (entry) =>
      entry.entityType === "LineItem" &&
      computedLineItemIds.includes(entry.entityId) &&
      entry.action === "LINE_ITEM_COMPUTED",
  ).length;
  expect(lineItemComputedCount).toBe(3);
});
