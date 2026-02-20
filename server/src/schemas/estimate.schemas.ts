import { z } from "zod";
import { idParamSchema, paginationQuerySchema, uuidSchema } from "./common.schemas";

export const projectEstimatesParamSchema = z.object({
  projectId: uuidSchema,
});

export const getProjectEstimatesQuerySchema = paginationQuerySchema;

export const estimateIdParamSchema = idParamSchema;

export const createProjectEstimateBodySchema = z.object({
  label: z.string().trim().min(1).optional(),
  markupRate: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0).default(12),
});

export const updateEstimateBodySchema = z.object({
  markupRate: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0),
});

export type ProjectEstimatesParamInput = z.infer<typeof projectEstimatesParamSchema>;
export type GetProjectEstimatesQueryInput = z.infer<typeof getProjectEstimatesQuerySchema>;
export type CreateProjectEstimateBodyInput = z.infer<typeof createProjectEstimateBodySchema>;
export type EstimateIdParamInput = z.infer<typeof estimateIdParamSchema>;
export type UpdateEstimateBodyInput = z.infer<typeof updateEstimateBodySchema>;
