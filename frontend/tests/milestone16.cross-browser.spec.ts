import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "demo.admin@estimatepro.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "DemoAdmin123!";
const API_BASE_URL = process.env.E2E_API_BASE_URL ?? "http://localhost:4000";
const THEME_STORAGE_KEY = "estimatepro_theme";
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

type ApiListResponse<T> = {
  data: {
    items: T[];
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
};

async function fetchList<T>(
  request: APIRequestContext,
  path: string,
  accessToken: string,
): Promise<T[]> {
  const response = await request.get(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  expect(response.ok(), `Request failed: ${path}`).toBeTruthy();
  const payload = (await response.json()) as ApiListResponse<T>;
  return payload.data.items;
}

async function resolveProjectAndEstimateIds(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ projectId: string; estimateId: string }> {
  const projects = await fetchList<ProjectSummary>(
    request,
    "/projects?page=1&pageSize=100",
    accessToken,
  );

  for (const project of projects) {
    const estimates = await fetchList<EstimateSummary>(
      request,
      `/projects/${project.id}/estimates?page=1&pageSize=100`,
      accessToken,
    );
    if (estimates.length > 0) {
      return {
        projectId: project.id,
        estimateId: estimates[0].id,
      };
    }
  }

  throw new Error("No project with estimates found for Milestone 16 screen testing.");
}

async function resolveFormulaId(request: APIRequestContext, accessToken: string): Promise<string> {
  const formulas = await fetchList<FormulaSummary>(request, "/formulas?page=1&pageSize=100", accessToken);
  if (formulas.length === 0) {
    throw new Error("No formulas found for Formula Editor edit route coverage.");
  }

  return formulas[0].id;
}

async function navigateAndAssertHeading(
  page: Page,
  path: string,
  headingName: string,
): Promise<void> {
  const heading = page.getByRole("heading", { name: headingName });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("interrupted by another navigation")) {
        throw error;
      }
    }

    try {
      await expect(heading).toBeVisible({ timeout: 7_500 });
      return;
    } catch {
      if (attempt === 3) {
        throw new Error(`Unable to load ${path} with heading "${headingName}" after retries.`);
      }
    }
  }
}

async function navigate(page: Page, path: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("interrupted by another navigation")) {
        throw error;
      }

      if (attempt === 3) {
        throw error;
      }
    }
  }
}

async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate(
    ({ storageKey, nextTheme }) => {
      localStorage.setItem(storageKey, nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme);
    },
    {
      storageKey: THEME_STORAGE_KEY,
      nextTheme: theme,
    },
  );
}

async function expectTheme(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function applyThemeAndReload(
  page: Page,
  theme: Theme,
  path: string,
  headingName: string,
): Promise<void> {
  await navigateAndAssertHeading(page, path, headingName);
  await setTheme(page, theme);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: headingName })).toBeVisible();
  await expectTheme(page, theme);
}

test("Milestone 16: all 13 screens render across browsers in light and dark modes", async ({ page, request }) => {
  await page.context().clearCookies();
  for (const theme of THEMES) {
    await applyThemeAndReload(page, theme, "/login", "Login");

    await navigateAndAssertHeading(page, "/forgot-password", "Forgot Password");
    await expectTheme(page, theme);

    await navigateAndAssertHeading(page, "/reset-password?token=milestone16-check", "Reset Password");
    await expectTheme(page, theme);

    await page.goto("/setup");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await expectTheme(page, theme);
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  }

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

  const { projectId, estimateId } = await resolveProjectAndEstimateIds(request, accessToken);
  const formulaId = await resolveFormulaId(request, accessToken);

  for (const theme of THEMES) {
    await applyThemeAndReload(page, theme, "/", "Projects");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expectTheme(page, theme);

    await navigate(page, `/projects/${projectId}`);
    await expect(page.getByText("Project Detail", { exact: true })).toBeVisible();
    await expectTheme(page, theme);

    await navigate(page, `/projects/${projectId}/estimates/${estimateId}`);
    await expect(page.getByText("Estimate Editor", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Line Items" })).toBeVisible();
    await expectTheme(page, theme);

    await page.getByRole("tab", { name: "Formula Usage" }).click();
    await expect(page.getByRole("tab", { name: "Formula Usage" })).toHaveAttribute("aria-selected", "true");
    await expectTheme(page, theme);

    await page.getByRole("button", { name: /Preview PDF|Preparing Preview.../ }).click();
    await expect(page.getByRole("heading", { name: "PDF Preview" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expectTheme(page, theme);

    await navigate(page, "/formulas");
    await expect(page.getByRole("heading", { name: "Formulas" })).toBeVisible();
    await expectTheme(page, theme);

    await navigate(page, "/formulas/new");
    await expect(page.getByRole("heading", { name: "New Formula" })).toBeVisible();
    await expectTheme(page, theme);

    await navigate(page, `/formulas/${formulaId}/edit`);
    await expect(page.getByRole("heading", { name: "Edit Formula" })).toBeVisible();
    await expectTheme(page, theme);

    await navigate(page, "/settings/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expectTheme(page, theme);

    await navigate(page, "/audit");
    await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
    await expectTheme(page, theme);
  }
});
