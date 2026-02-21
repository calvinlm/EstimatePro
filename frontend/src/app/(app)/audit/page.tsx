"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAuditLogs,
  getUsers,
  type AuditEntityType,
  type AuditLogEntry,
  type GetAuditLogsQuery,
  type UserSummary,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE = 20;
const SELECT_CLASS =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]";
const ENTITY_TYPE_OPTIONS: Array<{ value: AuditEntityType; label: string }> = [
  { value: "Project", label: "Project" },
  { value: "Estimate", label: "Estimate" },
  { value: "LineItem", label: "Line Item" },
  { value: "Formula", label: "Formula" },
  { value: "User", label: "User" },
];

type AuditFilters = {
  from: string;
  to: string;
  userId: string;
  entityType: "" | AuditEntityType;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
};

function formatTimestamp(value: string): string {
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

function formatActionDescription(action: string): string {
  return action
    .split("_")
    .map((part) => `${part[0] ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function stringifyState(value: unknown): string {
  if (value === null || value === undefined) {
    return "No state recorded.";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "Unable to render state.";
    }
  }

  return `${value}`;
}

export default function AuditPage() {
  const [userRole, setUserRole] = useState("VIEWER");
  const [authUser, setAuthUser] = useState<{ id: string; name: string; email: string } | null>(null);

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [knownUsers, setKnownUsers] = useState<UserOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingKnownUsers, setIsLoadingKnownUsers] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [draftFilters, setDraftFilters] = useState<AuditFilters>({
    from: "",
    to: "",
    userId: "",
    entityType: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>({
    from: "",
    to: "",
    userId: "",
    entityType: "",
  });

  useEffect(() => {
    const user = readAuthUser();
    setUserRole(user?.role ?? "VIEWER");
    setAuthUser(
      user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
          }
        : null,
    );
  }, []);

  const canViewAudit = useMemo(() => userRole === "ADMIN" || userRole === "ESTIMATOR", [userRole]);
  const canLoadAllUsers = useMemo(() => userRole === "ADMIN", [userRole]);

  const loadAuditLogs = useCallback(async (currentPage: number, filters: AuditFilters): Promise<void> => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const query: GetAuditLogsQuery = {
        page: currentPage,
        pageSize: PAGE_SIZE,
        from: filters.from || undefined,
        to: filters.to || undefined,
        userId: filters.userId || undefined,
        entityType: filters.entityType || undefined,
      };
      const result = await getAuditLogs(query);
      setEntries(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load audit log");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewAudit) {
      setEntries([]);
      setTotalPages(0);
      setIsLoading(false);
      return;
    }

    void loadAuditLogs(page, appliedFilters);
  }, [appliedFilters, canViewAudit, loadAuditLogs, page]);

  useEffect(() => {
    if (!canLoadAllUsers) {
      setKnownUsers([]);
      return;
    }

    let active = true;
    setIsLoadingKnownUsers(true);

    async function loadUsers(): Promise<void> {
      try {
        const result = await getUsers({ page: 1, pageSize: 100 });
        if (!active) {
          return;
        }

        setKnownUsers(
          result.items.map((user: UserSummary) => ({
            id: user.id,
            name: user.name,
            email: user.email,
          })),
        );
      } catch {
        if (!active) {
          return;
        }

        setKnownUsers([]);
      } finally {
        if (active) {
          setIsLoadingKnownUsers(false);
        }
      }
    }

    void loadUsers();

    return () => {
      active = false;
    };
  }, [canLoadAllUsers]);

  const userFilterOptions = useMemo(() => {
    const map = new Map<string, UserOption>();

    if (authUser) {
      map.set(authUser.id, authUser);
    }

    knownUsers.forEach((user) => {
      map.set(user.id, user);
    });

    entries.forEach((entry) => {
      map.set(entry.performedBy.id, {
        id: entry.performedBy.id,
        name: entry.performedBy.name,
        email: entry.performedBy.email,
      });
    });

    if (draftFilters.userId && !map.has(draftFilters.userId)) {
      map.set(draftFilters.userId, {
        id: draftFilters.userId,
        name: "Selected User",
        email: draftFilters.userId,
      });
    }

    return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [authUser, draftFilters.userId, entries, knownUsers]);

  const userLabelById = useMemo(() => {
    const map = new Map<string, string>();
    userFilterOptions.forEach((user) => {
      map.set(user.id, `${user.name} (${user.email})`);
    });
    return map;
  }, [userFilterOptions]);

  function updateDraftFilter<Key extends keyof AuditFilters>(key: Key, value: AuditFilters[Key]): void {
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to) {
      setErrorMessage("`From` date must be earlier than or equal to `To` date.");
      return;
    }

    setErrorMessage("");
    setExpandedLogId(null);
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  function clearFilters(): void {
    const next: AuditFilters = {
      from: "",
      to: "",
      userId: "",
      entityType: "",
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    setExpandedLogId(null);
    setPage(1);
    setErrorMessage("");
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Audit Log</p>
        <h1 className="text-3xl font-semibold">Audit</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Review immutable activity records across projects, estimates, formulas, and users.
        </p>
      </div>

      {!canViewAudit ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only Admin and Estimator roles can access the audit log.
        </p>
      ) : null}

      <form
        className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-5"
        onSubmit={applyFilters}
      >
        <div>
          <Label htmlFor="audit-filter-from">From</Label>
          <Input
            id="audit-filter-from"
            type="date"
            value={draftFilters.from}
            onChange={(event) => updateDraftFilter("from", event.target.value)}
            disabled={!canViewAudit}
          />
        </div>
        <div>
          <Label htmlFor="audit-filter-to">To</Label>
          <Input
            id="audit-filter-to"
            type="date"
            value={draftFilters.to}
            onChange={(event) => updateDraftFilter("to", event.target.value)}
            disabled={!canViewAudit}
          />
        </div>
        <div>
          <Label htmlFor="audit-filter-user">User</Label>
          <select
            id="audit-filter-user"
            className={SELECT_CLASS}
            value={draftFilters.userId}
            onChange={(event) => updateDraftFilter("userId", event.target.value)}
            disabled={!canViewAudit}
          >
            <option value="">All users</option>
            {userFilterOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="audit-filter-entity">Entity Type</Label>
          <select
            id="audit-filter-entity"
            className={SELECT_CLASS}
            value={draftFilters.entityType}
            onChange={(event) => updateDraftFilter("entityType", event.target.value as "" | AuditEntityType)}
            disabled={!canViewAudit}
          >
            <option value="">All entities</option>
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end justify-end gap-2">
          <Button type="button" variant="secondary" onClick={clearFilters} disabled={!canViewAudit}>
            Clear
          </Button>
          <Button type="submit" disabled={!canViewAudit}>
            Apply
          </Button>
        </div>
      </form>

      {isLoadingKnownUsers && canLoadAllUsers ? (
        <p className="text-xs text-[var(--color-text-muted)]">Loading user filter options...</p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-[var(--color-text-muted)]">
            <Spinner />
            <span>Loading audit log...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium">No audit entries found.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Adjust filters or perform an action in the app to generate audit records.
            </p>
          </div>
        ) : (
          <table role="table" className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Timestamp</th>
                <th scope="col" className="px-4 py-3 font-medium">User</th>
                <th scope="col" className="px-4 py-3 font-medium">Entity</th>
                <th scope="col" className="px-4 py-3 font-medium">Action</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-4 py-3">
                    <p>{formatTimestamp(entry.performedAt)}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{formatDate(entry.performedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.performedBy.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{entry.performedBy.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{entry.entityType}</Badge>
                    <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{entry.entityId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{formatActionDescription(entry.action)}</p>
                    <p className="font-mono text-xs text-[var(--color-text-muted)]">{entry.action}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      aria-expanded={expandedLogId === entry.id}
                      onClick={() => setExpandedLogId((current) => (current === entry.id ? null : entry.id))}
                    >
                      {expandedLogId === entry.id ? "Hide" : "View"}
                    </Button>
                    {expandedLogId === entry.id ? (
                      <div className="mt-3 grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-left md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            Before State
                          </p>
                          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs">
                            {stringifyState(entry.beforeState)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                            After State
                          </p>
                          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs">
                            {stringifyState(entry.afterState)}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-text-muted)]">
          {appliedFilters.userId ? `Filtered by user: ${userLabelById.get(appliedFilters.userId) ?? appliedFilters.userId}` : "All users"}
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={page <= 1 || !canViewAudit} onClick={() => setPage((current) => current - 1)}>
            Previous
          </Button>
          <p className="text-sm text-[var(--color-text-muted)]">
            Page {page} {totalPages > 0 ? `of ${totalPages}` : ""}
          </p>
          <Button
            variant="secondary"
            disabled={totalPages === 0 || page >= totalPages || !canViewAudit}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

