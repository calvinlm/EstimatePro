import { z } from "zod";
import { idParamSchema, uuidSchema } from "./common.schemas";

export const estimatePdfParamSchema = idParamSchema;

export const pdfJobIdParamSchema = z.object({
  jobId: uuidSchema,
});

export type EstimatePdfParamInput = z.infer<typeof estimatePdfParamSchema>;
export type PdfJobIdParamInput = z.infer<typeof pdfJobIdParamSchema>;
