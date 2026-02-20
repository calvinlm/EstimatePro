import type { Prisma, ProjectStatus } from "@prisma/client";
import { ProjectStatus as ProjectStatusEnum } from "@prisma/client";
import { AppError } from "../errors/app-error";
import { prisma } from "../prisma/client";
import { logAudit } from "./audit.service";

type GetProjectsInput = {
  organizationId: string;
  page: number;
  pageSize: number;
  status?: ProjectStatus;
};

type ProjectSummary = {
  id: string;
  name: string;
  location: string;
  projectType: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string;
  };
};

type ProjectSelectedShape = {
  id: string;
  name: string;
  location: string;
  projectType: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  createdByUser: {
    id: string;
    name: string;
  };
};

type CreateProjectInput = {
  organizationId: string;
  name: string;
  location: string;
  projectType: string;
  performedBy: string;
};

type UpdateProjectInput = {
  organizationId: string;
  projectId: string;
  name?: string;
  location?: string;
  projectType?: string;
  performedBy: string;
};

type ArchiveProjectInput = {
  organizationId: string;
  projectId: string;
  performedBy: string;
};

export type GetProjectsResult = {
  items: ProjectSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

function toProjectSummary(project: ProjectSelectedShape): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    location: project.location,
    projectType: project.projectType,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdBy: project.createdByUser,
  };
}

async function findProjectOrThrow(input: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectSelectedShape> {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      name: true,
      location: true,
      projectType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return project;
}

export async function getProjects(input: GetProjectsInput): Promise<GetProjectsResult> {
  const where: Prisma.ProjectWhereInput = {
    organizationId: input.organizationId,
    ...(input.status ? { status: input.status } : {}),
  };

  const skip = (input.page - 1) * input.pageSize;

  const [items, totalItems] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        location: true,
        projectType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    items: items.map((project) => toProjectSummary(project)),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const created = await prisma.project.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      location: input.location,
      projectType: input.projectType,
      status: ProjectStatusEnum.ACTIVE,
      createdBy: input.performedBy,
    },
    select: {
      id: true,
      name: true,
      location: true,
      projectType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    organizationId: input.organizationId,
    entityType: "Project",
    entityId: created.id,
    action: "PROJECT_CREATED",
    beforeState: {},
    afterState: {
      name: created.name,
      location: created.location,
      projectType: created.projectType,
      status: created.status,
    },
    performedBy: input.performedBy,
  });

  return toProjectSummary(created);
}

export async function getProjectById(input: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectSummary> {
  const project = await findProjectOrThrow(input);
  return toProjectSummary(project);
}

export async function updateProject(input: UpdateProjectInput): Promise<ProjectSummary> {
  const beforeState = await findProjectOrThrow({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const updated = await prisma.project.update({
    where: { id: input.projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.projectType !== undefined ? { projectType: input.projectType } : {}),
    },
    select: {
      id: true,
      name: true,
      location: true,
      projectType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    organizationId: input.organizationId,
    entityType: "Project",
    entityId: updated.id,
    action: "PROJECT_UPDATED",
    beforeState: {
      name: beforeState.name,
      location: beforeState.location,
      projectType: beforeState.projectType,
      status: beforeState.status,
    },
    afterState: {
      name: updated.name,
      location: updated.location,
      projectType: updated.projectType,
      status: updated.status,
    },
    performedBy: input.performedBy,
  });

  return toProjectSummary(updated);
}

export async function archiveProject(input: ArchiveProjectInput): Promise<ProjectSummary> {
  const beforeState = await findProjectOrThrow({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  if (beforeState.status === ProjectStatusEnum.ARCHIVED) {
    return toProjectSummary(beforeState);
  }

  const updated = await prisma.project.update({
    where: { id: input.projectId },
    data: {
      status: ProjectStatusEnum.ARCHIVED,
    },
    select: {
      id: true,
      name: true,
      location: true,
      projectType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  await logAudit({
    organizationId: input.organizationId,
    entityType: "Project",
    entityId: updated.id,
    action: "PROJECT_ARCHIVED",
    beforeState: {
      status: beforeState.status,
    },
    afterState: {
      status: updated.status,
    },
    performedBy: input.performedBy,
  });

  return toProjectSummary(updated);
}
