import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { Category, Prisma } from "@prisma/client";
import puppeteer from "puppeteer";
import { AppError } from "../errors/app-error";
import { prisma } from "../prisma/client";
import { logAudit } from "./audit.service";

const CATEGORY_ORDER: Category[] = [
  Category.CONCRETE_WORKS,
  Category.MASONRY_WORKS,
  Category.PAINTING_WORKS,
  Category.FORMWORKS,
  Category.STEEL_WORKS,
  Category.CARPENTRY,
  Category.DOORS_AND_WINDOWS,
  Category.WATERPROOFING,
  Category.GENERAL_REQUIREMENTS,
];

type PdfJobStatus = "pending" | "complete" | "failed";

type EstimatePdfJob = {
  id: string;
  organizationId: string;
  estimateId: string;
  requestedBy: string;
  cacheKey: string;
  status: PdfJobStatus;
  filePath?: string;
  fileName?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

type PdfCacheEntry = {
  filePath: string;
  fileName: string;
};

type EnqueueEstimatePdfInput = {
  organizationId: string;
  estimateId: string;
  requestedBy: string;
};

type GetPdfJobStatusInput = {
  organizationId: string;
  jobId: string;
};

type GetPdfJobDownloadInput = {
  organizationId: string;
  jobId: string;
};

export type EnqueueEstimatePdfResult = {
  jobId: string;
  status: PdfJobStatus;
};

export type GetPdfJobStatusResult = {
  jobId: string;
  status: PdfJobStatus;
  downloadUrl?: string;
  message?: string;
};

export type GetPdfJobDownloadResult = {
  filePath: string;
  fileName: string;
};

type EstimatePdfData = {
  id: string;
  label: string | null;
  versionNumber: number;
  subtotal: Prisma.Decimal;
  markupRate: Prisma.Decimal;
  markupAmount: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
  organizationName: string;
  project: {
    name: string;
    location: string;
    projectType: string;
  };
  lineItems: Array<{
    id: string;
    category: Category;
    description: string;
    quantity: Prisma.Decimal;
    unit: string;
    unitMaterialCost: Prisma.Decimal;
    unitLaborCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    calculationSource: string;
  }>;
  computations: Array<{
    id: string;
    formulaName: string;
    formulaVersion: number;
    lineItemDescription: string;
    computedAt: Date;
  }>;
};

const estimatePdfJobs = new Map<string, EstimatePdfJob>();
const estimatePdfCache = new Map<string, PdfCacheEntry>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: Prisma.Decimal): string {
  const amount = Number(value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString());
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatQuantity(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toString();
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

function formatCategory(category: Category): string {
  return category
    .split("_")
    .map((segment) => `${segment[0]}${segment.slice(1).toLowerCase()}`)
    .join(" ");
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildEstimateCacheKey(estimateId: string, updatedAt: Date): string {
  return `${estimateId}:${updatedAt.getTime()}`;
}

async function getPdfOutputDirectory(): Promise<string> {
  const directory = path.join(os.tmpdir(), "estimatepro-ph", "pdf-jobs");
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

function mapErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to generate PDF";
}

async function getEstimateMetadataOrThrow(input: {
  organizationId: string;
  estimateId: string;
}): Promise<{
  estimateId: string;
  versionNumber: number;
  updatedAt: Date;
  projectName: string;
}> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      versionNumber: true,
      updatedAt: true,
      project: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  return {
    estimateId: estimate.id,
    versionNumber: estimate.versionNumber,
    updatedAt: estimate.updatedAt,
    projectName: estimate.project.name,
  };
}

async function getEstimatePdfDataOrThrow(input: {
  organizationId: string;
  estimateId: string;
}): Promise<EstimatePdfData> {
  const estimate = await prisma.estimate.findFirst({
    where: {
      id: input.estimateId,
      deletedAt: null,
      project: {
        organizationId: input.organizationId,
      },
    },
    select: {
      id: true,
      label: true,
      versionNumber: true,
      subtotal: true,
      markupRate: true,
      markupAmount: true,
      vatRate: true,
      vatAmount: true,
      totalAmount: true,
      createdAt: true,
      updatedAt: true,
      project: {
        select: {
          name: true,
          location: true,
          projectType: true,
          organization: {
            select: {
              name: true,
            },
          },
        },
      },
      lineItems: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          category: true,
          description: true,
          quantity: true,
          unit: true,
          unitMaterialCost: true,
          unitLaborCost: true,
          totalCost: true,
          calculationSource: true,
        },
      },
      computations: {
        orderBy: [{ computedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          formulaVersion: true,
          computedAt: true,
          formula: {
            select: {
              name: true,
            },
          },
          lineItem: {
            select: {
              description: true,
            },
          },
        },
      },
    },
  });

  if (!estimate) {
    throw new AppError(404, "ESTIMATE_NOT_FOUND", "Estimate not found");
  }

  const categoryRank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
  const sortedLineItems = [...estimate.lineItems].sort((left, right) => {
    const leftRank = categoryRank.get(left.category) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = categoryRank.get(right.category) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.id.localeCompare(right.id);
  });

  return {
    id: estimate.id,
    label: estimate.label,
    versionNumber: estimate.versionNumber,
    subtotal: estimate.subtotal,
    markupRate: estimate.markupRate,
    markupAmount: estimate.markupAmount,
    vatRate: estimate.vatRate,
    vatAmount: estimate.vatAmount,
    totalAmount: estimate.totalAmount,
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
    organizationName: estimate.project.organization.name,
    project: {
      name: estimate.project.name,
      location: estimate.project.location,
      projectType: estimate.project.projectType,
    },
    lineItems: sortedLineItems.map((lineItem) => ({
      ...lineItem,
      calculationSource: lineItem.calculationSource,
    })),
    computations: estimate.computations.map((computation) => ({
      id: computation.id,
      formulaName: computation.formula.name,
      formulaVersion: computation.formulaVersion,
      lineItemDescription: computation.lineItem.description,
      computedAt: computation.computedAt,
    })),
  };
}

function buildPdfHtml(data: EstimatePdfData): string {
  const groupedItems = new Map<Category, EstimatePdfData["lineItems"]>();
  for (const item of data.lineItems) {
    const group = groupedItems.get(item.category) ?? [];
    group.push(item);
    groupedItems.set(item.category, group);
  }

  const itemRows = CATEGORY_ORDER.filter((category) => groupedItems.has(category))
    .map((category) => {
      const group = groupedItems.get(category) ?? [];
      const subtotal = group.reduce(
        (accumulator, lineItem) => accumulator.plus(lineItem.totalCost),
        new Prisma.Decimal(0),
      );

      const rows = group
        .map(
          (lineItem) => `
          <tr>
            <td>${escapeHtml(lineItem.description)}</td>
            <td class="text-right">${escapeHtml(formatQuantity(lineItem.quantity))}</td>
            <td>${escapeHtml(lineItem.unit)}</td>
            <td class="text-right">${escapeHtml(formatMoney(lineItem.unitMaterialCost))}</td>
            <td class="text-right">${escapeHtml(formatMoney(lineItem.unitLaborCost))}</td>
            <td class="text-right">${escapeHtml(formatMoney(lineItem.totalCost))}</td>
            <td>${escapeHtml(lineItem.calculationSource)}</td>
          </tr>`,
        )
        .join("");

      return `
        <tr class="category-row">
          <td colspan="7">${escapeHtml(formatCategory(category))}</td>
        </tr>
        ${rows}
        <tr class="subtotal-row">
          <td colspan="5">Category Subtotal</td>
          <td class="text-right">${escapeHtml(formatMoney(subtotal))}</td>
          <td></td>
        </tr>`;
    })
    .join("");

  const formulaUsageRows =
    data.computations.length === 0
      ? `<tr><td colspan="4">No formula computations recorded.</td></tr>`
      : data.computations
          .map(
            (computation) => `
            <tr>
              <td>${escapeHtml(computation.formulaName)}</td>
              <td>v${computation.formulaVersion}</td>
              <td>${escapeHtml(computation.lineItemDescription)}</td>
              <td>${escapeHtml(formatDateTime(computation.computedAt))}</td>
            </tr>`,
          )
          .join("");

  const estimateTitle = data.label?.trim().length
    ? `Estimate ${escapeHtml(data.label.trim())}`
    : `Estimate v${data.versionNumber}`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      @page {
        size: A4;
        margin: 24mm 12mm 20mm 12mm;
      }

      body {
        margin: 0;
        font-family: Geist, "Segoe UI", Arial, sans-serif;
        font-size: 10pt;
        color: #111827;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      .header {
        border-bottom: 1px solid #d1d5db;
        padding-bottom: 12px;
        margin-bottom: 14px;
      }

      .header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }

      .org-name {
        font-size: 14pt;
        font-weight: 700;
      }

      .logo-placeholder {
        font-size: 9pt;
        color: #6b7280;
        border: 1px dashed #9ca3af;
        border-radius: 4px;
        padding: 6px 10px;
      }

      .project-meta {
        margin-top: 10px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        row-gap: 6px;
        column-gap: 16px;
      }

      .table {
        width: 100%;
        border-collapse: collapse;
      }

      .table th,
      .table td {
        border: 1px solid #d1d5db;
        padding: 6px 8px;
        vertical-align: top;
      }

      .table th {
        background: #f9fafb;
        text-align: left;
        font-weight: 600;
      }

      .category-row td {
        background: #f3f4f6;
        font-weight: 700;
      }

      .subtotal-row td {
        background: #f9fafb;
        font-weight: 600;
      }

      .text-right {
        text-align: right;
      }

      .totals {
        margin-top: 12px;
        margin-left: auto;
        width: 50%;
        border-collapse: collapse;
      }

      .totals td {
        border: 1px solid #d1d5db;
        padding: 6px 8px;
      }

      .totals .grand-total td {
        font-weight: 700;
        font-size: 11pt;
      }

      .formula-page {
        page-break-before: always;
      }
    </style>
  </head>
  <body>
    <section class="header">
      <div class="header-top">
        <div>
          <h1 class="org-name">${escapeHtml(data.organizationName)}</h1>
          <p>${estimateTitle}</p>
        </div>
        <div class="logo-placeholder">Logo</div>
      </div>
      <div class="project-meta">
        <p><strong>Project:</strong> ${escapeHtml(data.project.name)}</p>
        <p><strong>Location:</strong> ${escapeHtml(data.project.location)}</p>
        <p><strong>Type:</strong> ${escapeHtml(data.project.projectType)}</p>
        <p><strong>Estimate Version:</strong> ${data.versionNumber}</p>
        <p><strong>Generation Date:</strong> ${escapeHtml(formatDate(data.updatedAt))}</p>
      </div>
    </section>

    <table class="table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>Unit Material Cost</th>
          <th>Unit Labor Cost</th>
          <th>Total Cost</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <table class="totals">
      <tbody>
        <tr>
          <td>Estimate Subtotal</td>
          <td class="text-right">${escapeHtml(formatMoney(data.subtotal))}</td>
        </tr>
        <tr>
          <td>Markup (${data.markupRate.toString()}%)</td>
          <td class="text-right">${escapeHtml(formatMoney(data.markupAmount))}</td>
        </tr>
        <tr>
          <td>VAT (${data.vatRate.toString()}%)</td>
          <td class="text-right">${escapeHtml(formatMoney(data.vatAmount))}</td>
        </tr>
        <tr class="grand-total">
          <td>Grand Total</td>
          <td class="text-right">${escapeHtml(formatMoney(data.totalAmount))}</td>
        </tr>
      </tbody>
    </table>

    <section class="formula-page">
      <h2>Formula Usage Summary</h2>
      <table class="table" style="margin-top: 10px;">
        <thead>
          <tr>
            <th>Formula</th>
            <th>Version</th>
            <th>Line Item</th>
            <th>Computation Date</th>
          </tr>
        </thead>
        <tbody>
          ${formulaUsageRows}
        </tbody>
      </table>
    </section>
  </body>
</html>`;
}

function buildFooterTemplate(data: EstimatePdfData): string {
  return `
  <div style="width:100%;font-size:9px;color:#6b7280;padding:0 16px;display:flex;justify-content:space-between;box-sizing:border-box;">
    <span>${escapeHtml(data.organizationName)}</span>
    <span>Estimate v${data.versionNumber}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}

async function renderPdfBuffer(input: { html: string; footerTemplate: string }): Promise<Buffer> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(input.html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: input.footerTemplate,
      margin: {
        top: "24mm",
        right: "12mm",
        bottom: "20mm",
        left: "12mm",
      },
      preferCSSPageSize: true,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function getPdfJobOrThrow(input: GetPdfJobStatusInput): EstimatePdfJob {
  const job = estimatePdfJobs.get(input.jobId);
  if (!job || job.organizationId !== input.organizationId) {
    throw new AppError(404, "PDF_JOB_NOT_FOUND", "PDF job not found");
  }

  return job;
}

async function processEstimatePdfJob(jobId: string): Promise<void> {
  const job = estimatePdfJobs.get(jobId);
  if (!job || job.status !== "pending") {
    return;
  }

  try {
    const data = await getEstimatePdfDataOrThrow({
      organizationId: job.organizationId,
      estimateId: job.estimateId,
    });

    const html = buildPdfHtml(data);
    const footerTemplate = buildFooterTemplate(data);
    const pdfBuffer = await renderPdfBuffer({ html, footerTemplate });
    const outputDirectory = await getPdfOutputDirectory();
    const filePath = path.join(outputDirectory, `${job.id}.pdf`);
    await fs.writeFile(filePath, pdfBuffer);

    const projectToken = sanitizeFilename(data.project.name) || "project";
    const fileName = `${projectToken}-estimate-v${data.versionNumber}.pdf`;

    job.status = "complete";
    job.filePath = filePath;
    job.fileName = fileName;
    job.updatedAt = new Date();
    estimatePdfCache.set(job.cacheKey, { filePath, fileName });

    await logAudit({
      organizationId: job.organizationId,
      entityType: "Estimate",
      entityId: data.id,
      action: "ESTIMATE_PDF_GENERATED",
      beforeState: {},
      afterState: {
        jobId: job.id,
        fileName,
      },
      performedBy: job.requestedBy,
    });
  } catch (error) {
    job.status = "failed";
    job.errorMessage = mapErrorMessage(error);
    job.updatedAt = new Date();
  }
}

export async function enqueueEstimatePdfJob(
  input: EnqueueEstimatePdfInput,
): Promise<EnqueueEstimatePdfResult> {
  const metadata = await getEstimateMetadataOrThrow({
    organizationId: input.organizationId,
    estimateId: input.estimateId,
  });

  const cacheKey = buildEstimateCacheKey(metadata.estimateId, metadata.updatedAt);
  const cached = estimatePdfCache.get(cacheKey);
  const jobId = randomUUID();
  const now = new Date();

  const job: EstimatePdfJob = {
    id: jobId,
    organizationId: input.organizationId,
    estimateId: metadata.estimateId,
    requestedBy: input.requestedBy,
    cacheKey,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  if (cached && (await fileExists(cached.filePath))) {
    job.status = "complete";
    job.filePath = cached.filePath;
    job.fileName = cached.fileName;
  } else {
    setImmediate(() => {
      void processEstimatePdfJob(jobId);
    });
  }

  estimatePdfJobs.set(jobId, job);

  return {
    jobId,
    status: job.status,
  };
}

export function getPdfJobStatus(input: GetPdfJobStatusInput): GetPdfJobStatusResult {
  const job = getPdfJobOrThrow(input);

  return {
    jobId: job.id,
    status: job.status,
    ...(job.status === "complete" ? { downloadUrl: `/pdf-jobs/${job.id}/download` } : {}),
    ...(job.status === "failed" && job.errorMessage ? { message: job.errorMessage } : {}),
  };
}

export async function getPdfJobDownload(
  input: GetPdfJobDownloadInput,
): Promise<GetPdfJobDownloadResult> {
  const job = getPdfJobOrThrow(input);

  if (job.status === "pending") {
    throw new AppError(409, "PDF_JOB_NOT_READY", "PDF job is still processing");
  }

  if (job.status === "failed") {
    throw new AppError(409, "PDF_JOB_FAILED", job.errorMessage ?? "PDF generation failed");
  }

  if (!job.filePath || !job.fileName) {
    throw new AppError(500, "PDF_JOB_FILE_MISSING", "PDF file is not available");
  }

  if (!(await fileExists(job.filePath))) {
    throw new AppError(410, "PDF_JOB_FILE_MISSING", "PDF file is no longer available");
  }

  return {
    filePath: job.filePath,
    fileName: job.fileName,
  };
}
