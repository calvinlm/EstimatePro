import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "demo.admin@estimatepro.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "DemoAdmin123!";
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";

type ApiEnvelope<T> = {
  data: T;
};

type ProjectSummary = {
  id: string;
};

type EstimateListItem = {
  id: string;
};

type EstimateDetails = {
  formulaUsage: unknown[];
};

async function navigateAndAssertHeading(page: Page, path: string, headingName: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: headingName })).toBeVisible({ timeout: 7_500 });
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

async function requestJson<T>(
  request: APIRequestContext,
  path: string,
  accessToken: string,
): Promise<T> {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  expect(response.ok(), `GET ${path} failed`).toBeTruthy();
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function resolveEstimateWithFormulaUsage(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ projectId: string; estimateId: string }> {
  const projects = await requestJson<{ items: ProjectSummary[] }>(
    request,
    "/projects?page=1&pageSize=100",
    accessToken,
  );

  for (const project of projects.items) {
    const estimates = await requestJson<{ items: EstimateListItem[] }>(
      request,
      `/projects/${project.id}/estimates?page=1&pageSize=100`,
      accessToken,
    );

    for (const estimate of estimates.items) {
      const detail = await requestJson<EstimateDetails>(request, `/estimates/${estimate.id}`, accessToken);
      if (detail.formulaUsage.length > 0) {
        return {
          projectId: project.id,
          estimateId: estimate.id,
        };
      }
    }
  }

  throw new Error("No estimate with formula usage data found.");
}

test("Milestone 17: Formula Usage panel displays full provenance details", async ({ page, request }) => {
  await page.context().clearCookies();
  await navigateAndAssertHeading(page, "/login", "Login");

  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

  const accessToken = await page.evaluate(() => localStorage.getItem("estimatepro_access_token"));
  expect(accessToken).toBeTruthy();
  if (!accessToken) {
    throw new Error("Login did not produce an access token in localStorage.");
  }

  const { projectId, estimateId } = await resolveEstimateWithFormulaUsage(request, accessToken);

  await page.goto(`/projects/${projectId}/estimates/${estimateId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Estimate Editor", { exact: true })).toBeVisible();

  const formulaTab = page.getByRole("tab", { name: "Formula Usage" });
  await formulaTab.click();
  await expect(formulaTab).toHaveAttribute("aria-selected", "true");

  await expect(page.getByText("Version author:").first()).toBeVisible();
  await expect(page.getByText("Version date:").first()).toBeVisible();
  await expect(page.getByText("Affected Line Item").first()).toBeVisible();
  await expect(page.getByText("Input Values").first()).toBeVisible();
  await expect(page.getByText("Computed Output Values").first()).toBeVisible();

  const provenanceBadge = page.getByText(/Up to date|Newer version available/).first();
  await expect(provenanceBadge).toBeVisible();
});
