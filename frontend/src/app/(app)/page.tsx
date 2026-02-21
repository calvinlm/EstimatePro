"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveProject,
  createProject,
  getProjects,
  type ProjectStatus,
  type ProjectSummary,
} from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE = 20;
const SELECT_CLASS =
  "h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]";

type StatusFilter = "ALL" | ProjectStatus;

type ProjectFormState = {
  name: string;
  location: string;
  projectType: string;
};

const INITIAL_PROJECT_FORM: ProjectFormState = {
  name: "",
  location: "",
  projectType: "",
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [userRole, setUserRole] = useState("VIEWER");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(INITIAL_PROJECT_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [projectToArchive, setProjectToArchive] = useState<ProjectSummary | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    setUserRole(readAuthUser()?.role ?? "VIEWER");
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProjects(): Promise<void> {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const result = await getProjects({
          page,
          pageSize: PAGE_SIZE,
          ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        });

        if (!active) {
          return;
        }

        setProjects(result.items);
        setTotalPages(result.pagination.totalPages);
      } catch (error) {
        if (!active) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to load projects");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      active = false;
    };
  }, [page, statusFilter]);

  const visibleProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projects, searchTerm]);

  const canCreateProject = userRole === "ADMIN" || userRole === "ESTIMATOR";
  const canArchiveProject = userRole === "ADMIN";

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError("");

    if (!projectForm.name.trim() || !projectForm.location.trim() || !projectForm.projectType.trim()) {
      setCreateError("Project name, location, and project type are required.");
      return;
    }

    setIsCreating(true);
    try {
      await createProject({
        name: projectForm.name.trim(),
        location: projectForm.location.trim(),
        projectType: projectForm.projectType.trim(),
      });

      setIsCreateModalOpen(false);
      setProjectForm(INITIAL_PROJECT_FORM);
      setPage(1);
      const result = await getProjects({
        page: 1,
        pageSize: PAGE_SIZE,
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      });
      setProjects(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleArchiveProject(): Promise<void> {
    if (!projectToArchive) {
      return;
    }

    setIsArchiving(true);
    try {
      await archiveProject(projectToArchive.id);
      setProjectToArchive(null);
      const result = await getProjects({
        page,
        pageSize: PAGE_SIZE,
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      });
      setProjects(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to archive project");
    } finally {
      setIsArchiving(false);
    }
  }

  function onProjectRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, projectId: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(`/projects/${projectId}`);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            Dashboard
          </p>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Browse and manage all projects in your organization.
          </p>
        </div>
        {canCreateProject ? (
          <Button onClick={() => setIsCreateModalOpen(true)}>New Project</Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by project name"
          aria-label="Search projects"
        />
        <select
          className={SELECT_CLASS}
          aria-label="Filter projects by status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
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
            <span>Loading projects...</span>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium">
              {projects.length === 0 ? "No projects yet." : "No projects match your search."}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {projects.length === 0
                ? "Create your first project to start building estimates."
                : "Try a different search term or filter."}
            </p>
          </div>
        ) : (
          <table role="table" className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Project</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Updated</th>
                <th scope="col" className="px-4 py-3 font-medium">Created By</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => (
                <tr
                  key={project.id}
                  className="cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)]"
                  role="link"
                  tabIndex={0}
                  aria-label={`Open project ${project.name}`}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  onKeyDown={(event) => onProjectRowKeyDown(event, project.id)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{project.location}</p>
                  </td>
                  <td className="px-4 py-3">{project.projectType}</td>
                  <td className="px-4 py-3">
                    <Badge variant={project.status === "ACTIVE" ? "success" : "neutral"}>
                      {project.status === "ACTIVE" ? "Active" : "Archived"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{formatDate(project.updatedAt)}</td>
                  <td className="px-4 py-3">{project.createdBy.name}</td>
                  <td className="px-4 py-3 text-right">
                    {canArchiveProject && project.status === "ACTIVE" ? (
                      <Button
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setProjectToArchive(project);
                        }}
                      >
                        Archive
                      </Button>
                    ) : null}
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

      <Modal isOpen={isCreateModalOpen} title="New Project" onClose={() => setIsCreateModalOpen(false)}>
        <form className="space-y-4" onSubmit={handleCreateProject}>
          <div>
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectForm.name}
              onChange={(event) => setProjectForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="projectLocation">Location</Label>
            <Input
              id="projectLocation"
              value={projectForm.location}
              onChange={(event) => setProjectForm((current) => ({ ...current, location: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="projectType">Project Type</Label>
            <Input
              id="projectType"
              value={projectForm.projectType}
              onChange={(event) =>
                setProjectForm((current) => ({
                  ...current,
                  projectType: event.target.value,
                }))
              }
              placeholder="Residential, Commercial, Industrial"
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
              {isCreating ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={projectToArchive !== null}
        title="Archive Project"
        onClose={() => {
          if (!isArchiving) {
            setProjectToArchive(null);
          }
        }}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Archive <strong>{projectToArchive?.name}</strong>? You can still access archived projects, but they will be
          marked as inactive.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setProjectToArchive(null)} disabled={isArchiving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleArchiveProject} disabled={isArchiving}>
            {isArchiving ? "Archiving..." : "Archive"}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

