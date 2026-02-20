import { z } from "zod";
import { dateRangeQuerySchema, paginationQuerySchema, uuidSchema } from "./common.schemas";

export const auditEntityTypeSchema = z.enum(["Project", "Estimate", "LineItem", "Formula", "User"]);

export const getAuditLogsQuerySchema = paginationQuerySchema.merge(dateRangeQuerySchema).extend({
  userId: uuidSchema.optional(),
  entityType: auditEntityTypeSchema.optional(),
});

export type AuditEntityTypeInput = z.infer<typeof auditEntityTypeSchema>;
export type GetAuditLogsQueryInput = z.infer<typeof getAuditLogsQuerySchema>;
