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

type ProjectEstimatesResponse = {
  items: Array<{
    id: string;
    status: "DRAFT" | "FINAL" | "ARCHIVED";
  }>;
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

async function fetchJson<T>(
  request: APIRequestContext,
  path: string,
  accessToken: string,
): Promise<T> {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  expect(response.ok(), `Request failed: ${path}`).toBeTruthy();
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function resolveDraftEstimateIds(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ projectId: string; estimateId: string }> {
  const projects = await fetchJson<{ items: ProjectSummary[] }>(
    request,
    "/projects?page=1&pageSize=100",
    accessToken,
  );

  for (const project of projects.items) {
    const estimates = await fetchJson<ProjectEstimatesResponse>(
      request,
      `/projects/${project.id}/estimates?page=1&pageSize=100`,
      accessToken,
    );
    const draft = estimates.items.find((estimate) => estimate.status === "DRAFT");
    if (draft) {
      return {
        projectId: project.id,
        estimateId: draft.id,
      };
    }
  }

  throw new Error("No draft estimate found for auto-save verification.");
}

test("Milestone 16: auto-save indicator behaves correctly on slow network", async ({ page, request }) => {
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

  const { projectId, estimateId } = await resolveDraftEstimateIds(request, accessToken);

  let patchAttempts = 0;
  await page.route(`**/estimates/${estimateId}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }

    patchAttempts += 1;

    if (patchAttempts === 1) {
      await page.waitForTimeout(1200);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          code: "SIMULATED_SLOW_FAILURE",
          message: "Simulated slow network failure",
          requestId: "autosave-slow-network-test",
        }),
      });
      return;
    }

    await page.waitForTimeout(2500);
    await route.continue();
  });

  await page.goto(`/projects/${projectId}/estimates/${estimateId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Estimate Editor", { exact: true })).toBeVisible();

  await expect(page.getByText(/^Saved/)).toBeVisible();

  const markupRateInput = page.locator("#markupRate");
  await expect(markupRateInput).toBeEditable();
  const currentMarkupRate = await markupRateInput.inputValue();
  const nextMarkupRate = Number.isFinite(Number(currentMarkupRate))
    ? `${Number(currentMarkupRate) + 0.25}`
    : "10.25";
  await markupRateInput.fill(nextMarkupRate);

  await expect(page.getByText("Saving...", { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Save failed. Retrying...", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText(/^Saved/)).toBeVisible({ timeout: 15_000 });

  expect(patchAttempts).toBeGreaterThanOrEqual(2);
});
