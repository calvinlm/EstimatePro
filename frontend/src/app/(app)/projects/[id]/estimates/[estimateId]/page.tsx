"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CATEGORY_VALUES,
  computeLineItem,
  createLineItem,
  downloadPdfJob,
  deleteLineItem,
  finalizeEstimate,
  getEstimate,
  getFormula,
  getFormulas,
  getFormulaVersions,
  getPdfJobStatus,
  getProject,
  overrideLineItem,
  requestEstimatePdf,
  type Category,
  type EstimateDetailsResponse,
  type EstimateLineItem,
  type FormulaDetail,
  type FormulaSummary,
  type FormulaUsageRecord,
  type FormulaVersion,
  type LineItemMutationResponse,
  type ProjectSummary,
  type UpdateLineItemRequest,
  updateEstimate,
  updateLineItem,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { formatCurrencyPhp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]";

type AutoSaveState = "saving" | "saved" | "retrying";
type EstimateEditorTab = "line-items" | "formula-usage";
type PdfFlowState = "idle" | "requesting" | "polling" | "ready" | "failed";

type LineItemFormState = {
  category: Category;
  description: string;
  quantity: string;
  unit: string;
  unitMaterialCost: string;
  unitLaborCost: string;
};

const INITIAL_LINE_ITEM_FORM: LineItemFormState = {
  category: "CONCRETE_WORKS",
  description: "",
  quantity: "",
  unit: "",
  unitMaterialCost: "",
  unitLaborCost: "",
};

function formatCategoryLabel(category: Category): string {
  return category
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function formatQuantity(value: string): string {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 4,
  }).format(parsed);
}

function normalizeRate(value: string): string {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? `${parsed}` : "0";
}

function parseRequiredNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSaveTime(value: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === "number") {
    return `${value}`;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null || value === undefined) {
    return "-";
  }

  if (Array.isArray(value) || isObjectRecord(value)) {
    return JSON.stringify(value);
  }

  return `${value}`;
}

function mergeMutation(
  current: EstimateDetailsResponse | null,
  mutation: LineItemMutationResponse,
): EstimateDetailsResponse | null {
  if (!current) {
    return current;
  }

  const items = [...current.lineItems];
  const index = items.findIndex((item) => item.id === mutation.lineItem.id);
  if (index === -1) {
    items.push(mutation.lineItem);
  } else {
    items[index] = mutation.lineItem;
  }

  return {
    ...current,
    estimate: {
      ...current.estimate,
      subtotal: mutation.estimate.subtotal,
      markupAmount: mutation.estimate.markupAmount,
      vatAmount: mutation.estimate.vatAmount,
      totalAmount: mutation.estimate.totalAmount,
      updatedAt: mutation.estimate.updatedAt,
    },
    lineItems: items,
  };
}

export default function EstimateEditorPage() {
  const params = useParams<{ id: string; estimateId: string }>();
  const projectId = params.id;
  const estimateId = params.estimateId;

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [estimateData, setEstimateData] = useState<EstimateDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [userRole, setUserRole] = useState("VIEWER");

  const [markupRateDraft, setMarkupRateDraft] = useState("");
  const [vatRateDraft, setVatRateDraft] = useState("");
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("saved");
  const [savedAtLabel, setSavedAtLabel] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const lastSavedRatesRef = useRef<{ markupRate: string; vatRate: string } | null>(null);
  const saveRequestIdRef = useRef(0);
  const isHydratingRatesRef = useRef(false);

  const [isLineItemModalOpen, setIsLineItemModalOpen] = useState(false);
  const [lineItemFormMode, setLineItemFormMode] = useState<"create" | "edit">("create");
  const [lineItemToEdit, setLineItemToEdit] = useState<EstimateLineItem | null>(null);
  const [lineItemForm, setLineItemForm] = useState<LineItemFormState>(INITIAL_LINE_ITEM_FORM);
  const [lineItemFormError, setLineItemFormError] = useState("");
  const [isSubmittingLineItem, setIsSubmittingLineItem] = useState(false);

  const [lineItemToDelete, setLineItemToDelete] = useState<EstimateLineItem | null>(null);
  const [isDeletingLineItem, setIsDeletingLineItem] = useState(false);

  const [lineItemToOverride, setLineItemToOverride] = useState<EstimateLineItem | null>(null);
  const [overrideQuantity, setOverrideQuantity] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState("");
  const [isOverriding, setIsOverriding] = useState(false);

  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [formulaTargetItem, setFormulaTargetItem] = useState<EstimateLineItem | null>(null);
  const [isLoadingFormulas, setIsLoadingFormulas] = useState(false);
  const [formulas, setFormulas] = useState<FormulaSummary[]>([]);
  const [formulaSearchTerm, setFormulaSearchTerm] = useState("");
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  const [formulaVersions, setFormulaVersions] = useState<FormulaVersion[]>([]);
  const [latestFormulaVersionId, setLatestFormulaVersionId] = useState("");
  const [selectedFormulaVersionId, setSelectedFormulaVersionId] = useState("");
  const [selectedFormulaDetail, setSelectedFormulaDetail] = useState<FormulaDetail | null>(null);
  const [formulaInputValues, setFormulaInputValues] = useState<Record<string, string>>({});
  const [selectedOutputVariable, setSelectedOutputVariable] = useState("");
  const [formulaFieldErrors, setFormulaFieldErrors] = useState<Record<string, string>>({});
  const [formulaServerError, setFormulaServerError] = useState("");
  const [formulaPreview, setFormulaPreview] = useState<{
    quantity: string;
    unit: string;
    totalCost: string;
    version: number;
  } | null>(null);
  const [isComputing, setIsComputing] = useState(false);

  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [activeTab, setActiveTab] = useState<EstimateEditorTab>("line-items");

  const [formulaUsageMeta, setFormulaUsageMeta] = useState<
    Record<string, { authorName: string; versionDate: string; latestVersion: number }>
  >({});
  const [isLoadingFormulaUsageMeta, setIsLoadingFormulaUsageMeta] = useState(false);
  const [formulaUsageMetaError, setFormulaUsageMetaError] = useState("");

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfFlowState, setPdfFlowState] = useState<PdfFlowState>("idle");
  const [pdfFlowMessage, setPdfFlowMessage] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState("estimate.pdf");
  const [isDownloadRequested, setIsDownloadRequested] = useState(false);
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const pdfRunIdRef = useRef(0);

  useEffect(() => {
    setUserRole(readAuthUser()?.role ?? "VIEWER");
  }, []);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrlRef.current) {
        URL.revokeObjectURL(pdfPreviewUrlRef.current);
      }
    };
  }, []);

  const canEditByRole = useMemo(() => userRole === "ADMIN" || userRole === "ESTIMATOR", [userRole]);
  const isDraftEstimate = estimateData?.estimate.status === "DRAFT";
  const isReadOnly = !canEditByRole || !isDraftEstimate;

  function hydrateRates(estimate: EstimateDetailsResponse["estimate"]): void {
    isHydratingRatesRef.current = true;

    const markupRate = normalizeRate(estimate.markupRate);
    const vatRate = normalizeRate(estimate.vatRate);

    setMarkupRateDraft(markupRate);
    setVatRateDraft(vatRate);
    lastSavedRatesRef.current = { markupRate, vatRate };
    setAutoSaveState("saved");
    setSavedAtLabel(formatSaveTime(new Date(estimate.updatedAt)));

    window.setTimeout(() => {
      isHydratingRatesRef.current = false;
    }, 0);
  }

  const loadEstimateData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [projectResult, estimateResult] = await Promise.all([getProject(projectId), getEstimate(estimateId)]);
      setProject(projectResult);
      setEstimateData(estimateResult);
      hydrateRates(estimateResult.estimate);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load estimate editor");
    } finally {
      setIsLoading(false);
    }
  }, [estimateId, projectId]);

  useEffect(() => {
    void loadEstimateData();
  }, [loadEstimateData]);

  useEffect(() => {
    if (!estimateData || isReadOnly || isHydratingRatesRef.current) {
      return;
    }

    const markupRate = parseRequiredNumber(markupRateDraft);
    const vatRate = parseRequiredNumber(vatRateDraft);
    if (markupRate === null || vatRate === null || markupRate < 0 || vatRate < 0) {
      return;
    }

    const normalizedMarkup = `${markupRate}`;
    const normalizedVat = `${vatRate}`;

    if (
      lastSavedRatesRef.current?.markupRate === normalizedMarkup &&
      lastSavedRatesRef.current?.vatRate === normalizedVat
    ) {
      return;
    }

    const requestId = ++saveRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      setAutoSaveState("saving");

      try {
        const updated = await updateEstimate(estimateId, { markupRate, vatRate });
        if (saveRequestIdRef.current !== requestId) {
          return;
        }

        const nextMarkupRate = normalizeRate(updated.markupRate);
        const nextVatRate = normalizeRate(updated.vatRate);
        lastSavedRatesRef.current = { markupRate: nextMarkupRate, vatRate: nextVatRate };

        setEstimateData((current) =>
          current
            ? {
                ...current,
                estimate: updated,
              }
            : current,
        );
        setMarkupRateDraft(nextMarkupRate);
        setVatRateDraft(nextVatRate);
        setAutoSaveState("saved");
        setSavedAtLabel(formatSaveTime(new Date()));
      } catch {
        if (saveRequestIdRef.current !== requestId) {
          return;
        }

        setAutoSaveState("retrying");
        window.setTimeout(() => setRetryNonce((value) => value + 1), 1500);
      }
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [estimateData, estimateId, isReadOnly, markupRateDraft, retryNonce, vatRateDraft]);

  const autoSaveText = useMemo(() => {
    if (isReadOnly) {
      return "Locked";
    }

    if (autoSaveState === "saving") {
      return "Saving...";
    }

    if (autoSaveState === "retrying") {
      return "Save failed. Retrying...";
    }

    return savedAtLabel ? `Saved ${savedAtLabel}` : "Saved";
  }, [autoSaveState, isReadOnly, savedAtLabel]);

  const groupedLineItems = useMemo(() => {
    if (!estimateData) {
      return [];
    }

    return CATEGORY_VALUES.map((category) => {
      const items = estimateData.lineItems.filter((lineItem) => lineItem.category === category);
      const subtotal = items.reduce((sum, lineItem) => sum + Number.parseFloat(lineItem.totalCost || "0"), 0);

      return {
        category,
        items,
        subtotal,
      };
    }).filter((group) => group.items.length > 0);
  }, [estimateData]);

  const formulaUsageRecords = useMemo<FormulaUsageRecord[]>(() => {
    return estimateData?.formulaUsage ?? [];
  }, [estimateData]);

  useEffect(() => {
    if (activeTab !== "formula-usage") {
      return;
    }

    const uniqueFormulaIds = Array.from(new Set(formulaUsageRecords.map((record) => record.formulaId)));
    if (uniqueFormulaIds.length === 0) {
      setFormulaUsageMeta({});
      setFormulaUsageMetaError("");
      return;
    }

    let active = true;
    setIsLoadingFormulaUsageMeta(true);
    setFormulaUsageMetaError("");

    async function loadFormulaUsageMeta(): Promise<void> {
      try {
        const result = await Promise.all(
          uniqueFormulaIds.map(async (formulaId) => {
            const [detail, versions] = await Promise.all([getFormula(formulaId), getFormulaVersions(formulaId)]);
            const latestVersion = versions.versions.reduce((latest, version) => {
              return Math.max(latest, version.version);
            }, 0);

            return {
              formulaId,
              authorName: detail.createdBy.name,
              versionDate: detail.createdAt,
              latestVersion,
            };
          }),
        );

        if (!active) {
          return;
        }

        setFormulaUsageMeta(
          Object.fromEntries(
            result.map((item) => [
              item.formulaId,
              {
                authorName: item.authorName,
                versionDate: item.versionDate,
                latestVersion: item.latestVersion,
              },
            ]),
          ),
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setFormulaUsageMetaError(
          error instanceof Error ? error.message : "Failed to load formula version metadata",
        );
      } finally {
        if (active) {
          setIsLoadingFormulaUsageMeta(false);
        }
      }
    }

    void loadFormulaUsageMeta();

    return () => {
      active = false;
    };
  }, [activeTab, formulaUsageRecords]);

  function openCreateLineItemModal(): void {
    setLineItemFormMode("create");
    setLineItemToEdit(null);
    setLineItemForm(INITIAL_LINE_ITEM_FORM);
    setLineItemFormError("");
    setIsLineItemModalOpen(true);
  }

  function openEditLineItemModal(lineItem: EstimateLineItem): void {
    setLineItemFormMode("edit");
    setLineItemToEdit(lineItem);
    setLineItemForm({
      category: lineItem.category,
      description: lineItem.description,
      quantity: lineItem.quantity,
      unit: lineItem.unit,
      unitMaterialCost: lineItem.unitMaterialCost,
      unitLaborCost: lineItem.unitLaborCost,
    });
    setLineItemFormError("");
    setIsLineItemModalOpen(true);
  }

  async function handleSubmitLineItem(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLineItemFormError("");

    const quantity = parseRequiredNumber(lineItemForm.quantity);
    const unitMaterialCost = parseRequiredNumber(lineItemForm.unitMaterialCost);
    const unitLaborCost = parseRequiredNumber(lineItemForm.unitLaborCost);

    if (!lineItemForm.description.trim() || !lineItemForm.unit.trim()) {
      setLineItemFormError("Description and unit are required.");
      return;
    }

    if (
      quantity === null ||
      quantity < 0 ||
      unitMaterialCost === null ||
      unitMaterialCost < 0 ||
      unitLaborCost === null ||
      unitLaborCost < 0
    ) {
      setLineItemFormError("Quantity and costs must be valid numbers >= 0.");
      return;
    }

    setIsSubmittingLineItem(true);

    try {
      if (lineItemFormMode === "create") {
        const created = await createLineItem(estimateId, {
          category: lineItemForm.category,
          description: lineItemForm.description.trim(),
          quantity,
          unit: lineItemForm.unit.trim(),
          unitMaterialCost,
          unitLaborCost,
        });

        setEstimateData((current) => mergeMutation(current, created));
      } else if (lineItemToEdit) {
        const payload: UpdateLineItemRequest = {
          category: lineItemForm.category,
          description: lineItemForm.description.trim(),
          unit: lineItemForm.unit.trim(),
          unitMaterialCost,
          unitLaborCost,
        };

        if (lineItemToEdit.calculationSource === "MANUAL") {
          payload.quantity = quantity;
        }

        const updated = await updateLineItem(lineItemToEdit.id, payload);
        setEstimateData((current) => mergeMutation(current, updated));
      }

      setIsLineItemModalOpen(false);
      setLineItemToEdit(null);
      setLineItemForm(INITIAL_LINE_ITEM_FORM);
    } catch (error) {
      setLineItemFormError(error instanceof Error ? error.message : "Failed to save line item");
    } finally {
      setIsSubmittingLineItem(false);
    }
  }

  async function handleDeleteLineItem(): Promise<void> {
    if (!lineItemToDelete || !estimateData) {
      return;
    }

    setIsDeletingLineItem(true);
    try {
      const result = await deleteLineItem(lineItemToDelete.id);
      setEstimateData({
        ...estimateData,
        estimate: {
          ...estimateData.estimate,
          subtotal: result.estimate.subtotal,
          markupAmount: result.estimate.markupAmount,
          vatAmount: result.estimate.vatAmount,
          totalAmount: result.estimate.totalAmount,
          updatedAt: result.estimate.updatedAt,
        },
        lineItems: estimateData.lineItems.filter((lineItem) => lineItem.id !== result.deletedLineItemId),
      });
      setLineItemToDelete(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete line item");
    } finally {
      setIsDeletingLineItem(false);
    }
  }

  function openOverrideModal(lineItem: EstimateLineItem): void {
    setLineItemToOverride(lineItem);
    setOverrideQuantity(lineItem.quantity);
    setOverrideReason("");
    setOverrideError("");
  }

  async function handleOverrideLineItem(): Promise<void> {
    if (!lineItemToOverride) {
      return;
    }

    const quantity = parseRequiredNumber(overrideQuantity);
    if (quantity === null || quantity < 0) {
      setOverrideError("Quantity must be a valid number >= 0.");
      return;
    }

    if (overrideReason.trim().length < 10) {
      setOverrideError("Override reason must be at least 10 characters.");
      return;
    }

    setIsOverriding(true);
    setOverrideError("");

    try {
      const result = await overrideLineItem(lineItemToOverride.id, {
        quantity,
        overrideReason: overrideReason.trim(),
      });
      setEstimateData((current) => mergeMutation(current, result));
      setLineItemToOverride(null);
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : "Failed to override line item");
    } finally {
      setIsOverriding(false);
    }
  }

  const filteredFormulas = useMemo(() => {
    const query = formulaSearchTerm.trim().toLowerCase();
    return formulas.filter((formula) => {
      if (formulaTargetItem && formula.category !== formulaTargetItem.category) {
        return false;
      }

      if (!query) {
        return true;
      }

      return formula.name.toLowerCase().includes(query);
    });
  }, [formulaSearchTerm, formulaTargetItem, formulas]);

  async function loadFormulasForItem(target: EstimateLineItem): Promise<void> {
    setIsLoadingFormulas(true);
    setFormulaServerError("");

    try {
      const result = await getFormulas({ page: 1, pageSize: 100 });
      setFormulas(result.items);

      const firstMatch = result.items.find((formula) => formula.category === target.category);
      setSelectedFormulaId(firstMatch?.id ?? "");
    } catch (error) {
      setFormulaServerError(error instanceof Error ? error.message : "Failed to load formulas");
    } finally {
      setIsLoadingFormulas(false);
    }
  }

  function openFormulaModal(lineItem: EstimateLineItem): void {
    setFormulaTargetItem(lineItem);
    setIsFormulaModalOpen(true);
    setFormulaSearchTerm("");
    setSelectedFormulaId("");
    setFormulaVersions([]);
    setLatestFormulaVersionId("");
    setSelectedFormulaVersionId("");
    setSelectedFormulaDetail(null);
    setFormulaInputValues({});
    setSelectedOutputVariable("");
    setFormulaFieldErrors({});
    setFormulaServerError("");
    setFormulaPreview(null);
    void loadFormulasForItem(lineItem);
  }

  useEffect(() => {
    if (!isFormulaModalOpen || !selectedFormulaId) {
      return;
    }

    let active = true;

    async function loadVersions(): Promise<void> {
      try {
        const result = await getFormulaVersions(selectedFormulaId);
        if (!active) {
          return;
        }

        setFormulaVersions(result.versions);
        setLatestFormulaVersionId(result.latestFormulaId);
        setSelectedFormulaVersionId(result.latestFormulaId);
      } catch (error) {
        if (active) {
          setFormulaServerError(error instanceof Error ? error.message : "Failed to load formula versions");
        }
      }
    }

    void loadVersions();

    return () => {
      active = false;
    };
  }, [isFormulaModalOpen, selectedFormulaId]);

  useEffect(() => {
    if (!isFormulaModalOpen || !selectedFormulaVersionId) {
      return;
    }

    let active = true;

    async function loadDetail(): Promise<void> {
      try {
        const detail = await getFormula(selectedFormulaVersionId);
        if (!active) {
          return;
        }

        setSelectedFormulaDetail(detail);
        setFormulaInputValues(
          Object.fromEntries(
            detail.inputs.map((input) => [input.variable, input.defaultValue !== undefined ? `${input.defaultValue}` : ""]),
          ),
        );

        const outputByUnit = detail.outputs.find((output) =>
          formulaTargetItem ? output.unit.trim().toLowerCase() === formulaTargetItem.unit.trim().toLowerCase() : false,
        );
        setSelectedOutputVariable(outputByUnit?.variable ?? detail.outputs[0]?.variable ?? "");
        setFormulaFieldErrors({});
        setFormulaServerError("");
        setFormulaPreview(null);
      } catch (error) {
        if (active) {
          setFormulaServerError(error instanceof Error ? error.message : "Failed to load formula");
        }
      }
    }

    void loadDetail();

    return () => {
      active = false;
    };
  }, [formulaTargetItem, isFormulaModalOpen, selectedFormulaVersionId]);
  async function handleComputeLineItem(): Promise<void> {
    if (!formulaTargetItem || !selectedFormulaDetail) {
      return;
    }

    const fieldErrors: Record<string, string> = {};
    const inputValues: Record<string, number> = {};

    for (const input of selectedFormulaDetail.inputs) {
      const rawValue = formulaInputValues[input.variable]?.trim() ?? "";
      if (!rawValue) {
        fieldErrors[input.variable] = "Required";
        continue;
      }

      const parsed = Number.parseFloat(rawValue);
      if (!Number.isFinite(parsed)) {
        fieldErrors[input.variable] = "Must be a number";
        continue;
      }

      if (input.type === "integer" && !Number.isInteger(parsed)) {
        fieldErrors[input.variable] = "Must be an integer";
        continue;
      }

      if (input.min !== undefined && parsed < input.min) {
        fieldErrors[input.variable] = `Must be >= ${input.min}`;
        continue;
      }

      if (input.max !== undefined && parsed > input.max) {
        fieldErrors[input.variable] = `Must be <= ${input.max}`;
        continue;
      }

      inputValues[input.variable] = parsed;
    }

    if (Object.keys(fieldErrors).length > 0) {
      setFormulaFieldErrors(fieldErrors);
      return;
    }

    if (selectedFormulaDetail.outputs.length > 1 && !selectedOutputVariable) {
      setFormulaServerError("Select an output variable.");
      return;
    }

    setFormulaFieldErrors({});
    setFormulaServerError("");
    setIsComputing(true);

    try {
      const result = await computeLineItem(formulaTargetItem.id, {
        formulaId: selectedFormulaVersionId,
        outputVariable: selectedFormulaDetail.outputs.length > 1 ? selectedOutputVariable : undefined,
        inputValues,
      });

      setEstimateData((current) => mergeMutation(current, result));
      setFormulaPreview({
        quantity: result.lineItem.quantity,
        unit: result.lineItem.unit,
        totalCost: result.lineItem.totalCost,
        version: result.computation.formulaVersion,
      });
    } catch (error) {
      setFormulaServerError(error instanceof Error ? error.message : "Failed to compute line item");
    } finally {
      setIsComputing(false);
    }
  }

  async function handleFinalizeEstimate(): Promise<void> {
    setIsFinalizing(true);
    setErrorMessage("");

    try {
      await finalizeEstimate(estimateId);
      await loadEstimateData();
      setIsFinalizeModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to finalize estimate");
    } finally {
      setIsFinalizing(false);
    }
  }

  function triggerBrowserDownload(blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  async function runPdfFlow(options: { openPreview: boolean; triggerDownload: boolean }): Promise<void> {
    const runId = ++pdfRunIdRef.current;
    setPdfError("");
    setPdfFlowState("requesting");
    setPdfFlowMessage("Creating PDF job...");
    if (options.openPreview) {
      if (pdfPreviewUrlRef.current) {
        URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = null;
      }
      setPdfPreviewUrl(null);
    }

    try {
      const requestedJob = await requestEstimatePdf(estimateId);
      if (runId !== pdfRunIdRef.current) {
        return;
      }

      let status = requestedJob.status;
      const jobId = requestedJob.jobId;

      if (status === "pending") {
        setPdfFlowState("polling");
        setPdfFlowMessage("Generating PDF...");
      }

      while (status === "pending") {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 1500);
        });

        if (runId !== pdfRunIdRef.current) {
          return;
        }

        const nextStatus = await getPdfJobStatus(jobId);
        if (runId !== pdfRunIdRef.current) {
          return;
        }

        status = nextStatus.status;
        if (status === "failed") {
          throw new Error(nextStatus.message ?? "PDF generation failed");
        }
      }

      const downloadedPdf = await downloadPdfJob(jobId);
      if (runId !== pdfRunIdRef.current) {
        return;
      }

      setPdfFileName(downloadedPdf.fileName);

      if (options.openPreview) {
        if (pdfPreviewUrlRef.current) {
          URL.revokeObjectURL(pdfPreviewUrlRef.current);
        }

        const previewUrl = URL.createObjectURL(downloadedPdf.blob);
        pdfPreviewUrlRef.current = previewUrl;
        setPdfPreviewUrl(previewUrl);
      }

      if (options.triggerDownload) {
        triggerBrowserDownload(downloadedPdf.blob, downloadedPdf.fileName);
      }

      setPdfFlowState("ready");
      setPdfFlowMessage("PDF is ready.");
    } catch (error) {
      if (runId !== pdfRunIdRef.current) {
        return;
      }

      setPdfFlowState("failed");
      setPdfFlowMessage("");
      setPdfError(error instanceof Error ? error.message : "PDF generation failed");
    }
  }

  async function handleOpenPdfPreview(): Promise<void> {
    setIsPdfModalOpen(true);
    setIsDownloadRequested(false);
    await runPdfFlow({ openPreview: true, triggerDownload: false });
  }

  async function handleDownloadPdf(): Promise<void> {
    setIsDownloadRequested(true);
    await runPdfFlow({ openPreview: false, triggerDownload: true });
  }

  const estimate = estimateData?.estimate;
  const isPdfProcessing = pdfFlowState === "requesting" || pdfFlowState === "polling";

  return (
    <section className="space-y-6 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Estimate Editor
          </p>
          <h1 className="text-3xl font-semibold">{project?.name ?? "Project"}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {estimate
              ? `Estimate v${estimate.versionNumber}${estimate.label ? ` · ${estimate.label}` : ""}`
              : "Loading estimate..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estimate ? (
            <Badge
              variant={
                estimate.status === "DRAFT" ? "success" : estimate.status === "FINAL" ? "neutral" : "warning"
              }
            >
              {estimate.status === "DRAFT" ? "Draft" : estimate.status === "FINAL" ? "Final" : "Archived"}
            </Badge>
          ) : null}
          <Badge variant={autoSaveState === "retrying" ? "danger" : "neutral"}>{autoSaveText}</Badge>
          <Button variant="secondary" onClick={() => void handleOpenPdfPreview()} disabled={isPdfProcessing}>
            {isPdfModalOpen && isPdfProcessing ? "Preparing Preview..." : "Preview PDF"}
          </Button>
          <Button onClick={() => void handleDownloadPdf()} disabled={isPdfProcessing}>
            {isDownloadRequested && isPdfProcessing ? "Generating PDF..." : "Download PDF"}
          </Button>
          {canEditByRole && isDraftEstimate ? (
            <Button variant="danger" onClick={() => setIsFinalizeModalOpen(true)}>
              Finalize
            </Button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-2">
        <div>
          <Label htmlFor="markupRate">Markup Rate (%)</Label>
          <Input
            id="markupRate"
            type="number"
            min="0"
            step="0.01"
            value={markupRateDraft}
            onChange={(event) => setMarkupRateDraft(event.target.value)}
            disabled={isReadOnly || isLoading}
          />
        </div>
        <div>
          <Label htmlFor="vatRate">VAT Rate (%)</Label>
          <Input
            id="vatRate"
            type="number"
            min="0"
            step="0.01"
            value={vatRateDraft}
            onChange={(event) => setVatRateDraft(event.target.value)}
            disabled={isReadOnly || isLoading}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Estimate editor sections"
          className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "line-items"}
            className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
              activeTab === "line-items"
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
            }`}
            onClick={() => setActiveTab("line-items")}
          >
            Line Items
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "formula-usage"}
            className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
              activeTab === "formula-usage"
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
            }`}
            onClick={() => setActiveTab("formula-usage")}
          >
            Formula Usage
          </button>
        </div>

        {activeTab === "line-items" ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[var(--color-text-muted)]">{estimateData?.lineItems.length ?? 0} line item(s)</p>
              {!isReadOnly ? <Button onClick={openCreateLineItemModal}>Add Line Item</Button> : null}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-sm text-[var(--color-text-muted)]">
                <Spinner />
                <span>Loading estimate editor...</span>
              </div>
            ) : groupedLineItems.length === 0 ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
                <p className="text-base font-medium">No line items yet.</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Add manual entries or run formulas.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedLineItems.map((group) => (
                  <div
                    key={group.category}
                    className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
                      <p className="text-sm font-semibold">{formatCategoryLabel(group.category)}</p>
                      <p className="text-sm font-medium text-[var(--color-text-muted)]">
                        Subtotal: {formatCurrencyPhp(group.subtotal)}
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1050px] text-sm">
                        <thead className="text-left text-[var(--color-text-muted)]">
                          <tr>
                            <th className="px-4 py-3 font-medium">Category</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                            <th className="px-4 py-3 font-medium">Quantity</th>
                            <th className="px-4 py-3 font-medium">Unit</th>
                            <th className="px-4 py-3 font-medium">Unit Material</th>
                            <th className="px-4 py-3 font-medium">Unit Labor</th>
                            <th className="px-4 py-3 font-medium">Total</th>
                            <th className="px-4 py-3 font-medium">Source</th>
                            <th className="px-4 py-3 font-medium">Override</th>
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((lineItem) => (
                            <tr key={lineItem.id} className="border-t border-[var(--color-border)]">
                              <td className="px-4 py-3">{formatCategoryLabel(lineItem.category)}</td>
                              <td className="px-4 py-3">{lineItem.description}</td>
                              <td className="px-4 py-3">{formatQuantity(lineItem.quantity)}</td>
                              <td className="px-4 py-3">{lineItem.unit}</td>
                              <td className="px-4 py-3">{formatCurrencyPhp(lineItem.unitMaterialCost)}</td>
                              <td className="px-4 py-3">{formatCurrencyPhp(lineItem.unitLaborCost)}</td>
                              <td className="px-4 py-3 font-medium">{formatCurrencyPhp(lineItem.totalCost)}</td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant={
                                    lineItem.calculationSource === "COMPUTED"
                                      ? "success"
                                      : lineItem.calculationSource === "ADJUSTED"
                                        ? "warning"
                                        : "neutral"
                                  }
                                >
                                  {lineItem.calculationSource}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={lineItem.overrideReason ? "warning" : "neutral"}>
                                  {lineItem.overrideReason ? "Yes" : "No"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {!isReadOnly ? (
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      className="h-8 px-2 text-xs"
                                      onClick={() => openEditLineItemModal(lineItem)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      className="h-8 px-2 text-xs"
                                      onClick={() => openFormulaModal(lineItem)}
                                    >
                                      Compute
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      className="h-8 px-2 text-xs"
                                      onClick={() => openOverrideModal(lineItem)}
                                    >
                                      Override
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                                      onClick={() => setLineItemToDelete(lineItem)}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-[var(--color-text-muted)]">Read only</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-sm text-[var(--color-text-muted)]">
                <Spinner />
                <span>Loading formula usage...</span>
              </div>
            ) : formulaUsageRecords.length === 0 ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
                <p className="text-base font-medium">No formula computations recorded.</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Formula usage entries appear here after line-item computations.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {formulaUsageMetaError ? (
                  <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {formulaUsageMetaError}
                  </p>
                ) : null}
                {isLoadingFormulaUsageMeta ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Spinner />
                    <span>Checking formula version history...</span>
                  </div>
                ) : null}
                {formulaUsageRecords.map((usage) => {
                  const usageMeta = formulaUsageMeta[usage.formulaId];
                  const hasNewerVersion = usageMeta ? usageMeta.latestVersion > usage.formulaVersion : false;
                  const inputEntries = isObjectRecord(usage.inputValues) ? Object.entries(usage.inputValues) : [];
                  const outputEntries = isObjectRecord(usage.computedResults)
                    ? Object.entries(usage.computedResults)
                    : [];

                  return (
                    <article
                      key={usage.id}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {usage.formula.name} · v{usage.formulaVersion}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Version author: {usageMeta?.authorName ?? "Unknown"} · Version date:{" "}
                            {formatDateTime(usageMeta?.versionDate ?? usage.formula.createdAt)}
                          </p>
                        </div>
                        {hasNewerVersion ? (
                          <Badge variant="warning">Newer version available (v{usageMeta?.latestVersion})</Badge>
                        ) : (
                          <Badge variant="neutral">Up to date</Badge>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            Affected Line Item
                          </p>
                          <p className="mt-1 text-sm">{usage.lineItem.description}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {formatCategoryLabel(usage.lineItem.category)}
                          </p>
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                            Computed at {formatDateTime(usage.computedAt)}
                          </p>
                        </div>
                        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            Input Values
                          </p>
                          {inputEntries.length === 0 ? (
                            <p className="mt-1 text-sm text-[var(--color-text-muted)]">No input values recorded.</p>
                          ) : (
                            <div className="mt-1 space-y-1">
                              {inputEntries.map(([key, value]) => (
                                <p key={key} className="text-sm">
                                  <span className="text-[var(--color-text-muted)]">{key}: </span>
                                  <span>{formatUnknownValue(value)}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                          Computed Output Values
                        </p>
                        {outputEntries.length === 0 ? (
                          <p className="mt-1 text-sm text-[var(--color-text-muted)]">No computed outputs recorded.</p>
                        ) : (
                          <div className="mt-1 grid gap-1 md:grid-cols-2">
                            {outputEntries.map(([key, value]) => (
                              <p key={key} className="text-sm">
                                <span className="text-[var(--color-text-muted)]">{key}: </span>
                                <span>{formatUnknownValue(value)}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {estimate ? (
        <div className="sticky bottom-2 z-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 p-4 shadow-lg backdrop-blur">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Subtotal</p>
              <p className="text-lg font-semibold">{formatCurrencyPhp(estimate.subtotal)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Markup ({formatQuantity(estimate.markupRate)}%)
              </p>
              <p className="text-lg font-semibold">{formatCurrencyPhp(estimate.markupAmount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                VAT ({formatQuantity(estimate.vatRate)}%)
              </p>
              <p className="text-lg font-semibold">{formatCurrencyPhp(estimate.vatAmount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Grand Total</p>
              <p className="text-lg font-semibold text-[var(--color-accent-strong)]">
                {formatCurrencyPhp(estimate.totalAmount)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={isLineItemModalOpen}
        title={lineItemFormMode === "create" ? "Add Line Item" : "Edit Line Item"}
        onClose={() => !isSubmittingLineItem && setIsLineItemModalOpen(false)}
      >
        <form className="space-y-4" onSubmit={handleSubmitLineItem}>
          <div>
            <Label htmlFor="lineItemCategory">Category</Label>
            <select
              id="lineItemCategory"
              className={SELECT_CLASS}
              value={lineItemForm.category}
              onChange={(event) =>
                setLineItemForm((current) => ({
                  ...current,
                  category: event.target.value as Category,
                }))
              }
              disabled={isSubmittingLineItem}
            >
              {CATEGORY_VALUES.map((category) => (
                <option key={category} value={category}>
                  {formatCategoryLabel(category)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="lineItemDescription">Description</Label>
            <Input
              id="lineItemDescription"
              value={lineItemForm.description}
              onChange={(event) => setLineItemForm((current) => ({ ...current, description: event.target.value }))}
              disabled={isSubmittingLineItem}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="lineItemQuantity">Quantity</Label>
              <Input
                id="lineItemQuantity"
                type="number"
                min="0"
                step="0.0001"
                value={lineItemForm.quantity}
                onChange={(event) => setLineItemForm((current) => ({ ...current, quantity: event.target.value }))}
                disabled={
                  isSubmittingLineItem ||
                  (lineItemFormMode === "edit" && lineItemToEdit?.calculationSource !== "MANUAL")
                }
              />
              {lineItemFormMode === "edit" && lineItemToEdit?.calculationSource !== "MANUAL" ? (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Use Override for computed quantities.</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="lineItemUnit">Unit</Label>
              <Input
                id="lineItemUnit"
                value={lineItemForm.unit}
                onChange={(event) => setLineItemForm((current) => ({ ...current, unit: event.target.value }))}
                disabled={isSubmittingLineItem}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="unitMaterialCost">Unit Material Cost</Label>
              <Input
                id="unitMaterialCost"
                type="number"
                min="0"
                step="0.01"
                value={lineItemForm.unitMaterialCost}
                onChange={(event) =>
                  setLineItemForm((current) => ({ ...current, unitMaterialCost: event.target.value }))
                }
                disabled={isSubmittingLineItem}
              />
            </div>
            <div>
              <Label htmlFor="unitLaborCost">Unit Labor Cost</Label>
              <Input
                id="unitLaborCost"
                type="number"
                min="0"
                step="0.01"
                value={lineItemForm.unitLaborCost}
                onChange={(event) => setLineItemForm((current) => ({ ...current, unitLaborCost: event.target.value }))}
                disabled={isSubmittingLineItem}
              />
            </div>
          </div>
          {lineItemFormError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {lineItemFormError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsLineItemModalOpen(false)} disabled={isSubmittingLineItem}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingLineItem}>
              {isSubmittingLineItem ? "Saving..." : lineItemFormMode === "create" ? "Add Line Item" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={lineItemToDelete !== null}
        title="Delete Line Item"
        onClose={() => !isDeletingLineItem && setLineItemToDelete(null)}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Delete <strong>{lineItemToDelete?.description}</strong>? This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLineItemToDelete(null)} disabled={isDeletingLineItem}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteLineItem} disabled={isDeletingLineItem}>
            {isDeletingLineItem ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={lineItemToOverride !== null}
        title="Override Line Item"
        onClose={() => !isOverriding && setLineItemToOverride(null)}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
            <p>
              Original computed quantity:{" "}
              <strong>{formatQuantity(lineItemToOverride?.originalComputedQuantity ?? lineItemToOverride?.quantity ?? "0")}</strong>
            </p>
            <p>
              Current quantity: <strong>{formatQuantity(lineItemToOverride?.quantity ?? "0")}</strong>
            </p>
          </div>
          <div>
            <Label htmlFor="overrideQuantity">New Quantity</Label>
            <Input
              id="overrideQuantity"
              type="number"
              min="0"
              step="0.0001"
              value={overrideQuantity}
              onChange={(event) => setOverrideQuantity(event.target.value)}
              disabled={isOverriding}
            />
          </div>
          <div>
            <Label htmlFor="overrideReason">Override Reason</Label>
            <Input
              id="overrideReason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              disabled={isOverriding}
            />
          </div>
          {overrideError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {overrideError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLineItemToOverride(null)} disabled={isOverriding}>
              Cancel
            </Button>
            <Button onClick={handleOverrideLineItem} disabled={isOverriding}>
              {isOverriding ? "Applying..." : "Confirm Override"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isFormulaModalOpen}
        title="Run Formula"
        className="max-w-3xl"
        onClose={() => !isComputing && setIsFormulaModalOpen(false)}
      >
        <div className="space-y-4">
          {formulaTargetItem ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Target: <strong>{formulaTargetItem.description}</strong> ({formatCategoryLabel(formulaTargetItem.category)})
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div>
              <Label htmlFor="formulaSearch">Search Formula</Label>
              <Input
                id="formulaSearch"
                value={formulaSearchTerm}
                onChange={(event) => setFormulaSearchTerm(event.target.value)}
                placeholder="Search formula"
                disabled={isLoadingFormulas || isComputing}
              />
            </div>
            <div>
              <Label htmlFor="formulaId">Formula</Label>
              <select
                id="formulaId"
                className={SELECT_CLASS}
                value={selectedFormulaId}
                onChange={(event) => setSelectedFormulaId(event.target.value)}
                disabled={isLoadingFormulas || isComputing}
              >
                <option value="">Select formula</option>
                {filteredFormulas.map((formula) => (
                  <option key={formula.id} value={formula.id}>
                    {formula.name} (v{formula.currentVersion})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="formulaVersion">Version</Label>
            <select
              id="formulaVersion"
              className={SELECT_CLASS}
              value={selectedFormulaVersionId}
              onChange={(event) => setSelectedFormulaVersionId(event.target.value)}
              disabled={isComputing || formulaVersions.length === 0}
            >
              <option value="">Select version</option>
              {formulaVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} {version.isActive ? "(Active)" : "(Inactive)"}
                </option>
              ))}
            </select>
            {selectedFormulaVersionId && latestFormulaVersionId && selectedFormulaVersionId !== latestFormulaVersionId ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Warning: older formula version selected.</p>
            ) : null}
          </div>

          {isLoadingFormulas ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Spinner />
              <span>Loading formulas...</span>
            </div>
          ) : null}

          {selectedFormulaDetail ? (
            <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
              <p className="text-sm font-semibold">
                {selectedFormulaDetail.name} · v{selectedFormulaDetail.version}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {selectedFormulaDetail.inputs.map((input) => (
                  <div key={input.variable}>
                    <Label htmlFor={`formula-input-${input.variable}`}>
                      {input.label} ({input.unit})
                    </Label>
                    <Input
                      id={`formula-input-${input.variable}`}
                      type="number"
                      step={input.type === "integer" ? "1" : "0.0001"}
                      min={input.min}
                      max={input.max}
                      value={formulaInputValues[input.variable] ?? ""}
                      onChange={(event) =>
                        setFormulaInputValues((current) => ({
                          ...current,
                          [input.variable]: event.target.value,
                        }))
                      }
                      disabled={isComputing}
                    />
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {input.min !== undefined ? `min ${input.min}` : "no min"} · {input.max !== undefined ? `max ${input.max}` : "no max"}
                    </p>
                    {formulaFieldErrors[input.variable] ? (
                      <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                        {formulaFieldErrors[input.variable]}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              {selectedFormulaDetail.outputs.length > 1 ? (
                <div>
                  <Label htmlFor="outputVariable">Output Variable</Label>
                  <select
                    id="outputVariable"
                    className={SELECT_CLASS}
                    value={selectedOutputVariable}
                    onChange={(event) => setSelectedOutputVariable(event.target.value)}
                    disabled={isComputing}
                  >
                    <option value="">Select output</option>
                    {selectedFormulaDetail.outputs.map((output) => (
                      <option key={output.variable} value={output.variable}>
                        {output.variable} ({output.unit})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}

          {formulaServerError ? (
            <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formulaServerError}
            </p>
          ) : null}

          {formulaPreview ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-200">
              <p>Computed and applied successfully.</p>
              <p>
                Quantity: <strong>{formatQuantity(formulaPreview.quantity)}</strong> {formulaPreview.unit}
              </p>
              <p>
                Total: <strong>{formatCurrencyPhp(formulaPreview.totalCost)}</strong> (v{formulaPreview.version})
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsFormulaModalOpen(false)} disabled={isComputing}>
              {formulaPreview ? "Close" : "Cancel"}
            </Button>
            {!formulaPreview ? (
              <Button
                onClick={handleComputeLineItem}
                disabled={
                  isComputing ||
                  isLoadingFormulas ||
                  !formulaTargetItem ||
                  !selectedFormulaId ||
                  !selectedFormulaVersionId
                }
              >
                {isComputing ? "Computing..." : "Compute"}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isPdfModalOpen}
        title="PDF Preview"
        className="max-w-6xl"
        onClose={() => setIsPdfModalOpen(false)}
      >
        <div className="space-y-4">
          {isPdfProcessing ? (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
              <Spinner />
              <span>{pdfFlowMessage || "Generating PDF..."}</span>
            </div>
          ) : null}

          {pdfError ? (
            <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {pdfError}
            </p>
          ) : null}

          {pdfPreviewUrl ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-text-muted)]">{pdfFileName}</p>
              <iframe
                title="Estimate PDF Preview"
                src={pdfPreviewUrl}
                className="h-[70vh] w-full rounded-md border border-[var(--color-border)] bg-white"
              />
            </div>
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-6 py-12 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                {pdfFlowState === "failed"
                  ? "Preview unavailable due to PDF generation error."
                  : "Preview will appear once the PDF is ready."}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsPdfModalOpen(false)}>
              Close
            </Button>
            {pdfFlowState === "failed" ? (
              <Button onClick={() => void handleOpenPdfPreview()}>Retry Preview</Button>
            ) : null}
            <Button onClick={() => void handleDownloadPdf()} disabled={isPdfProcessing}>
              {isPdfProcessing ? "Preparing..." : "Download PDF"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isFinalizeModalOpen}
        title="Finalize Estimate"
        onClose={() => !isFinalizing && setIsFinalizeModalOpen(false)}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Finalize this estimate? All line items will be locked and editing will be disabled.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsFinalizeModalOpen(false)} disabled={isFinalizing}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleFinalizeEstimate} disabled={isFinalizing}>
            {isFinalizing ? "Finalizing..." : "Finalize"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

