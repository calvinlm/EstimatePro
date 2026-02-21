import { expect, test, type APIRequestContext, type Page, type Route } from "@playwright/test";

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

async function resolveEstimateIds(
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
    const candidate = estimates.items.find((estimate) => estimate.status !== "ARCHIVED");
    if (candidate) {
      return {
        projectId: project.id,
        estimateId: candidate.id,
      };
    }
  }

  throw new Error("No estimate found for PDF polling verification.");
}

function jsonEnvelope(route: Route, payload: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      data: payload,
    }),
  });
}

test("Milestone 16: PDF polling UI handles long generation times gracefully", async ({ page, request }) => {
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

  const { projectId, estimateId } = await resolveEstimateIds(request, accessToken);
  const jobId = "slow-job-test";
  let jobStatusPollCount = 0;

  await page.route(`**/estimates/${estimateId}/pdf`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          jobId,
          status: "pending",
        },
      }),
    });
  });

  await page.route(`**/pdf-jobs/${jobId}`, async (route) => {
    jobStatusPollCount += 1;

    if (jobStatusPollCount < 3) {
      await jsonEnvelope(route, {
        jobId,
        status: "pending",
      });
      return;
    }

    await jsonEnvelope(route, {
      jobId,
      status: "complete",
      downloadUrl: `/pdf-jobs/${jobId}/download`,
    });
  });

  await page.route(`**/pdf-jobs/${jobId}/download`, async (route) => {
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF");
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: {
        "content-disposition": `attachment; filename=\"estimate-${jobId}.pdf\"`,
      },
      body: pdfBytes,
    });
  });

  await page.goto(`/projects/${projectId}/estimates/${estimateId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Estimate Editor", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Preview PDF|Preparing Preview.../ }).click();
  await expect(page.getByRole("heading", { name: "PDF Preview" })).toBeVisible();

  await expect(page.getByText("Generating PDF...")).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => jobStatusPollCount, { timeout: 12_000 }).toBeGreaterThanOrEqual(3);
  await expect(page.locator('iframe[title="Estimate PDF Preview"]')).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("Generating PDF...")).toBeHidden();
  await expect(
    page.getByRole("dialog", { name: "PDF Preview" }).getByRole("button", { name: "Download PDF" }),
  ).toBeEnabled();
});
