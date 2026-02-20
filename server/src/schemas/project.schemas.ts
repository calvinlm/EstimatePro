import { ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { idParamSchema, paginationQuerySchema } from "./common.schemas";

export const getProjectsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ProjectStatus).optional(),
});

export const projectIdParamSchema = idParamSchema;

const projectTextField = z.string().trim().min(1);

export const createProjectBodySchema = z.object({
  name: projectTextField,
  location: projectTextField,
  projectType: projectTextField,
});

export const updateProjectBodySchema = z
  .object({
    name: projectTextField.optional(),
    location: projectTextField.optional(),
    projectType: projectTextField.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.location !== undefined || body.projectType !== undefined,
    {
      message: "At least one field must be provided",
      path: ["root"],
    },
  );

export type GetProjectsQueryInput = z.infer<typeof getProjectsQuerySchema>;
export type ProjectIdParamInput = z.infer<typeof projectIdParamSchema>;
export type CreateProjectBodyInput = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBodyInput = z.infer<typeof updateProjectBodySchema>;
