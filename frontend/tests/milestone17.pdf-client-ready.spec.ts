import { expect, test, type APIRequestContext } from "@playwright/test";
import { PDFParse } from "pdf-parse";

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

type EstimateListItem = {
  id: string;
  status: "DRAFT" | "FINAL" | "ARCHIVED";
};

type EstimateDetails = {
  formulaUsage: unknown[];
  lineItems: unknown[];
};

type PdfJobResponse = {
  jobId: string;
  status: "pending" | "complete" | "failed";
  message?: string;
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

async function findFinalEstimateWithFormulaUsage(
  request: APIRequestContext,
  accessToken: string,
): Promise<string> {
  const projects = await requestJson<{ items: ProjectSummary[] }>(request, "/projects?page=1&pageSize=100", {
    accessToken,
  });

  for (const project of projects.items) {
    const estimates = await requestJson<{ items: EstimateListItem[] }>(
      request,
      `/projects/${project.id}/estimates?page=1&pageSize=100`,
      { accessToken },
    );

    const finals = estimates.items.filter((item) => item.status === "FINAL");
    for (const estimate of finals) {
      const detail = await requestJson<EstimateDetails>(request, `/estimates/${estimate.id}`, { accessToken });
      if (detail.formulaUsage.length > 0 && detail.lineItems.length > 0) {
        return estimate.id;
      }
    }
  }

  throw new Error("No finalized estimate with formula usage found for PDF verification.");
}

test("Milestone 17: PDF output is professional and client-ready", async ({ request }) => {
  const login = await requestJson<LoginResponse>(request, "/auth/login", {
    method: "POST",
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });
  const accessToken = login.accessToken;

  const estimateId = await findFinalEstimateWithFormulaUsage(request, accessToken);

  const job = await requestJson<PdfJobResponse>(request, `/estimates/${estimateId}/pdf`, {
    method: "POST",
    accessToken,
    expectedStatus: 202,
  });

  let currentStatus = job.status;
  let pollGuard = 0;
  while (currentStatus === "pending") {
    pollGuard += 1;
    expect(pollGuard).toBeLessThan(60);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const polled = await requestJson<PdfJobResponse>(request, `/pdf-jobs/${job.jobId}`, {
      accessToken,
    });
    currentStatus = polled.status;
    if (currentStatus === "failed") {
      throw new Error(polled.message ?? "PDF generation failed");
    }
  }

  const download = await request.fetch(`${API_BASE_URL}/pdf-jobs/${job.jobId}/download`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/pdf");

  const buffer = Buffer.from(await download.body());
  expect(buffer.length).toBeGreaterThan(10_000);
  expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");

  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();

  expect(parsed.total).toBeGreaterThanOrEqual(2);

  const text = parsed.text.replace(/\s+/g, " ").trim();
  expect(text).toContain("Project:");
  expect(text).toContain("Estimate Subtotal");
  expect(text).toContain("Markup");
  expect(text).toContain("VAT");
  expect(text).toContain("Grand Total");
  expect(text).toContain("Formula Usage Summary");
  expect(text).toContain("Computation Date");
});
