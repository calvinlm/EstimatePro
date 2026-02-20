import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { AuditEntityTypeInput } from "../schemas/audit.schemas";

type GetAuditLogsInput = {
  organizationId: string;
  page: number;
  pageSize: number;
  from?: Date;
  to?: Date;
  userId?: string;
  entityType?: AuditEntityTypeInput;
};

type AuditLogListItem = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeState: Prisma.JsonValue;
  afterState: Prisma.JsonValue;
  performedAt: Date;
  performedBy: {
    id: string;
    name: string;
    email: string;
  };
};

export type GetAuditLogsResult = {
  items: AuditLogListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export async function getAuditLogs(input: GetAuditLogsInput): Promise<GetAuditLogsResult> {
  const where: Prisma.AuditLogWhereInput = {
    organizationId: input.organizationId,
    ...(input.userId
      ? {
          performedBy: input.userId,
        }
      : {}),
    ...(input.entityType
      ? {
          entityType: input.entityType,
        }
      : {}),
    ...(input.from || input.to
      ? {
          performedAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
  };

  const skip = (input.page - 1) * input.pageSize;
  const [items, totalItems] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip,
      take: input.pageSize,
      orderBy: [{ performedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        entityType: true,
        entityId: true,
        action: true,
        beforeState: true,
        afterState: true,
        performedAt: true,
        performedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      beforeState: item.beforeState,
      afterState: item.afterState,
      performedAt: item.performedAt,
      performedBy: item.performedByUser,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
    },
  };
}
