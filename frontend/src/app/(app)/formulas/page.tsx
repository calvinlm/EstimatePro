"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deactivateFormula,
  getFormulas,
  getFormulaVersions,
  type FormulaSummary,
  type FormulaVersion,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE = 20;

function formatCategoryLabel(value: string): string {
  return value
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export default function FormulaLibraryPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState("VIEWER");

  const [formulas, setFormulas] = useState<FormulaSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [expandedFormulaId, setExpandedFormulaId] = useState<string | null>(null);
  const [versionsByFormulaId, setVersionsByFormulaId] = useState<Record<string, FormulaVersion[]>>({});
  const [loadingVersionsForFormulaId, setLoadingVersionsForFormulaId] = useState<string | null>(null);

  const [formulaToDeactivate, setFormulaToDeactivate] = useState<FormulaSummary | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  useEffect(() => {
    setUserRole(readAuthUser()?.role ?? "VIEWER");
  }, []);

  const isAdmin = useMemo(() => userRole === "ADMIN", [userRole]);

  const loadFormulas = useCallback(async (currentPage: number): Promise<void> => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await getFormulas({ page: currentPage, pageSize: PAGE_SIZE });
      setFormulas(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load formulas");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFormulas(page);
  }, [loadFormulas, page]);

  async function toggleVersionHistory(formula: FormulaSummary): Promise<void> {
    if (expandedFormulaId === formula.id) {
      setExpandedFormulaId(null);
      return;
    }

    setExpandedFormulaId(formula.id);
    if (versionsByFormulaId[formula.id]) {
      return;
    }

    setLoadingVersionsForFormulaId(formula.id);
    try {
      const result = await getFormulaVersions(formula.id);
      setVersionsByFormulaId((current) => ({
        ...current,
        [formula.id]: result.versions,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load formula versions");
    } finally {
      setLoadingVersionsForFormulaId(null);
    }
  }

  async function handleDeactivateFormula(): Promise<void> {
    if (!formulaToDeactivate) {
      return;
    }

    setIsDeactivating(true);
    setErrorMessage("");
    try {
      await deactivateFormula(formulaToDeactivate.id);
      setFormulaToDeactivate(null);
      await loadFormulas(page);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to deactivate formula");
    } finally {
      setIsDeactivating(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Formula Library
          </p>
          <h1 className="text-3xl font-semibold">Formulas</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Browse formula definitions, inspect version history, and manage activation status.
          </p>
        </div>
        {isAdmin ? <Button onClick={() => router.push("/formulas/new")}>New Formula</Button> : null}
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
            <span>Loading formulas...</span>
          </div>
        ) : formulas.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium">No formulas found.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Create your first formula to start formula-driven quantity computations.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Current Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Modified By</th>
                <th className="px-4 py-3 font-medium">Last Modified Date</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {formulas.map((formula) => (
                <Fragment key={formula.id}>
                  <tr key={formula.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3">
                      <p className="font-medium">{formula.name}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{formula.description}</p>
                    </td>
                    <td className="px-4 py-3">{formatCategoryLabel(formula.category)}</td>
                    <td className="px-4 py-3">v{formula.currentVersion}</td>
                    <td className="px-4 py-3">
                      <Badge variant={formula.isActive ? "success" : "warning"}>
                        {formula.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{formula.lastModifiedBy.name}</td>
                    <td className="px-4 py-3">{formatDate(formula.lastModifiedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => void toggleVersionHistory(formula)}
                        >
                          {expandedFormulaId === formula.id ? "Hide Versions" : "Versions"}
                        </Button>
                        {isAdmin ? (
                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            onClick={() => router.push(`/formulas/${formula.id}/edit`)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {isAdmin && formula.isActive ? (
                          <Button
                            variant="ghost"
                            className="h-8 px-2 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                            onClick={() => setFormulaToDeactivate(formula)}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expandedFormulaId === formula.id ? (
                    <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
                      <td colSpan={7} className="px-4 py-3">
                        {loadingVersionsForFormulaId === formula.id ? (
                          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                            <Spinner />
                            <span>Loading version history...</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                              Version History
                            </p>
                            <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
                              <table className="w-full text-sm">
                                <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Version</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Created By</th>
                                    <th className="px-3 py-2 font-medium">Created Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(versionsByFormulaId[formula.id] ?? []).map((version) => (
                                    <tr key={version.id} className="border-t border-[var(--color-border)]">
                                      <td className="px-3 py-2">v{version.version}</td>
                                      <td className="px-3 py-2">
                                        <Badge variant={version.isActive ? "success" : "warning"}>
                                          {version.isActive ? "Active" : "Inactive"}
                                        </Badge>
                                      </td>
                                      <td className="px-3 py-2">{version.createdBy.name}</td>
                                      <td className="px-3 py-2">{formatDate(version.createdAt)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
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

      <Modal
        isOpen={formulaToDeactivate !== null}
        title="Deactivate Formula"
        onClose={() => {
          if (!isDeactivating) {
            setFormulaToDeactivate(null);
          }
        }}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Deactivate <strong>{formulaToDeactivate?.name}</strong>? Existing computations remain unchanged, but this
          formula will no longer be active.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFormulaToDeactivate(null)} disabled={isDeactivating}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeactivateFormula} disabled={isDeactivating}>
            {isDeactivating ? "Deactivating..." : "Deactivate"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
