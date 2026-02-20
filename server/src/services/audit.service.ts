import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";

type AuditDbClient = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

type AuditLogInput = {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  performedBy: string;
  performedAt?: Date;
};

export async function logAudit(input: AuditLogInput, db?: AuditDbClient): Promise<void> {
  const client = db ?? prisma;

  await client.auditLog.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeState: input.beforeState ?? {},
      afterState: input.afterState ?? {},
      performedBy: input.performedBy,
      performedAt: input.performedAt ?? new Date(),
    },
  });
}
