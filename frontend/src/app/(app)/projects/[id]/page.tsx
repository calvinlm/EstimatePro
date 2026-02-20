"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  archiveEstimate,
  createEstimate,
  duplicateEstimate,
  getProject,
  getProjectEstimates,
  softDeleteEstimate,
  type ProjectEstimateSummary,
  type ProjectSummary,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { formatCurrencyPhp, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE = 20;

type EstimateFormState = {
  label: string;
  markupRate: string;
  vatRate: string;
};

const INITIAL_ESTIMATE_FORM: EstimateFormState = {
  label: "",
  markupRate: "",
  vatRate: "12",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [estimates, setEstimates] = useState<ProjectEstimateSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [userRole, setUserRole] = useState("VIEWER");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [estimateForm, setEstimateForm] = useState<EstimateFormState>(INITIAL_ESTIMATE_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [estimateToDuplicate, setEstimateToDuplicate] = useState<ProjectEstimateSummary | null>(null);
  const [estimateToArchive, setEstimateToArchive] = useState<ProjectEstimateSummary | null>(null);
  const [estimateToDelete, setEstimateToDelete] = useState<ProjectEstimateSummary | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    setUserRole(readAuthUser()?.role ?? "VIEWER");
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProjectData(): Promise<void> {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [projectResult, estimatesResult] = await Promise.all([
          getProject(projectId),
          getProjectEstimates(projectId, { page, pageSize: PAGE_SIZE }),
        ]);

        if (!active) {
          return;
        }

        setProject(projectResult);
        setEstimates(estimatesResult.items);
        setTotalPages(estimatesResult.pagination.totalPages);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to load project");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadProjectData();

    return () => {
      active = false;
    };
  }, [page, projectId]);

  const canManageEstimates = useMemo(
    () => userRole === "ADMIN" || userRole === "ESTIMATOR",
    [userRole],
  );
  const canAdminManageEstimates = useMemo(() => userRole === "ADMIN", [userRole]);

  async function reloadEstimates(nextPage = page): Promise<void> {
    const result = await getProjectEstimates(projectId, { page: nextPage, pageSize: PAGE_SIZE });
    setEstimates(result.items);
    setTotalPages(result.pagination.totalPages);
  }

  async function handleCreateEstimate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError("");

    const markupRate = Number.parseFloat(estimateForm.markupRate);
    const vatRate = Number.parseFloat(estimateForm.vatRate || "12");
    if (!Number.isFinite(markupRate) || markupRate < 0) {
      setCreateError("Markup rate is required and must be 0 or greater.");
      return;
    }

    if (!Number.isFinite(vatRate) || vatRate < 0) {
      setCreateError("VAT rate must be 0 or greater.");
      return;
    }

    setIsCreating(true);
    try {
      await createEstimate(projectId, {
        label: estimateForm.label.trim() ? estimateForm.label.trim() : undefined,
        markupRate,
        vatRate,
      });
      setIsCreateModalOpen(false);
      setEstimateForm(INITIAL_ESTIMATE_FORM);
      setPage(1);
      await reloadEstimates(1);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create estimate");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDuplicateEstimate(): Promise<void> {
    if (!estimateToDuplicate) {
      return;
    }

    setIsWorking(true);
    try {
      await duplicateEstimate(estimateToDuplicate.id);
      setEstimateToDuplicate(null);
      setPage(1);
      await reloadEstimates(1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to duplicate estimate");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleArchiveEstimate(): Promise<void> {
    if (!estimateToArchive) {
      return;
    }

    setIsWorking(true);
    try {
      await archiveEstimate(estimateToArchive.id);
      setEstimateToArchive(null);
      await reloadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to archive estimate");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDeleteEstimate(): Promise<void> {
    if (!estimateToDelete) {
      return;
    }

    setIsWorking(true);
    try {
      await softDeleteEstimate(estimateToDelete.id);
      setEstimateToDelete(null);
      await reloadEstimates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete estimate");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Project Detail
          </p>
          <h1 className="text-3xl font-semibold">{project?.name ?? "Project"}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {project ? `${project.location} · ${project.projectType}` : "Loading project details..."}
          </p>
        </div>
        {project ? (
          <div className="flex items-center gap-2">
            <Badge variant={project.status === "ACTIVE" ? "success" : "neutral"}>
              {project.status === "ACTIVE" ? "Active" : "Archived"}
            </Badge>
            {canManageEstimates ? (
              <Button onClick={() => setIsCreateModalOpen(true)}>New Estimate</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-[var(--color-text-muted)]">
            <Spinner />
            <span>Loading estimates...</span>
          </div>
        ) : estimates.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium">No estimates yet.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Create your first estimate version for this project.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Total Amount</th>
                <th className="px-4 py-3 font-medium">Created By</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last Modified</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((estimate) => (
                <tr
                  key={estimate.id}
                  className="cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)]"
                  onClick={() => router.push(`/projects/${projectId}/estimates/${estimate.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      v{estimate.versionNumber}
                      {estimate.label ? ` · ${estimate.label}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        estimate.status === "FINAL"
                          ? "neutral"
                          : estimate.status === "ARCHIVED"
                            ? "warning"
                            : "success"
                      }
                    >
                      {estimate.status === "DRAFT"
                        ? "Draft"
                        : estimate.status === "FINAL"
                          ? "Final"
                          : "Archived"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{formatCurrencyPhp(estimate.totalAmount)}</td>
                  <td className="px-4 py-3">{estimate.createdBy.name}</td>
                  <td className="px-4 py-3">{formatDate(estimate.createdAt)}</td>
                  <td className="px-4 py-3">{formatDate(estimate.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {canManageEstimates ? (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEstimateToDuplicate(estimate);
                          }}
                        >
                          Duplicate
                        </Button>
                      ) : null}
                      {canAdminManageEstimates && estimate.status !== "ARCHIVED" ? (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEstimateToArchive(estimate);
                          }}
                        >
                          Archive
                        </Button>
                      ) : null}
                      {canAdminManageEstimates ? (
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEstimateToDelete(estimate);
                          }}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Previous
        </Button>
        <p className="text-sm text-[var(--color-text-muted)]">
          Page {page} {totalPages > 0 ? `of ${totalPages}` : ""}
        </p>
        <Button
          variant="secondary"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>

      <Modal isOpen={isCreateModalOpen} title="New Estimate" onClose={() => setIsCreateModalOpen(false)}>
        <form className="space-y-4" onSubmit={handleCreateEstimate}>
          <div>
            <Label htmlFor="estimateLabel">Estimate Label (optional)</Label>
            <Input
              id="estimateLabel"
              value={estimateForm.label}
              onChange={(event) =>
                setEstimateForm((current) => ({
                  ...current,
                  label: event.target.value,
                }))
              }
              placeholder="Version label"
            />
          </div>
          <div>
            <Label htmlFor="markupRate">Markup Rate (%)</Label>
            <Input
              id="markupRate"
              type="number"
              min="0"
              step="0.01"
              value={estimateForm.markupRate}
              onChange={(event) =>
                setEstimateForm((current) => ({
                  ...current,
                  markupRate: event.target.value,
                }))
              }
              placeholder="e.g. 10"
            />
          </div>
          <div>
            <Label htmlFor="vatRate">VAT Rate (%)</Label>
            <Input
              id="vatRate"
              type="number"
              min="0"
              step="0.01"
              value={estimateForm.vatRate}
              onChange={(event) =>
                setEstimateForm((current) => ({
                  ...current,
                  vatRate: event.target.value,
                }))
              }
            />
          </div>
          {createError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {createError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Estimate"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={estimateToDuplicate !== null} title="Duplicate Estimate" onClose={() => setEstimateToDuplicate(null)}>
        <p className="text-sm text-[var(--color-text-muted)]">
          Create a new draft version from <strong>v{estimateToDuplicate?.versionNumber}</strong>?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEstimateToDuplicate(null)} disabled={isWorking}>
            Cancel
          </Button>
          <Button onClick={handleDuplicateEstimate} disabled={isWorking}>
            {isWorking ? "Duplicating..." : "Duplicate"}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={estimateToArchive !== null} title="Archive Estimate" onClose={() => setEstimateToArchive(null)}>
        <p className="text-sm text-[var(--color-text-muted)]">
          Archive <strong>v{estimateToArchive?.versionNumber}</strong>? It will remain visible in history.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEstimateToArchive(null)} disabled={isWorking}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleArchiveEstimate} disabled={isWorking}>
            {isWorking ? "Archiving..." : "Archive"}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={estimateToDelete !== null} title="Delete Estimate" onClose={() => setEstimateToDelete(null)}>
        <p className="text-sm text-[var(--color-text-muted)]">
          Soft-delete <strong>v{estimateToDelete?.versionNumber}</strong>? This can be restored by an Admin.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEstimateToDelete(null)} disabled={isWorking}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteEstimate} disabled={isWorking}>
            {isWorking ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
