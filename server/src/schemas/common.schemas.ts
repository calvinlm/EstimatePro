import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "`from` must be less than or equal to `to`",
    path: ["to"],
  });
