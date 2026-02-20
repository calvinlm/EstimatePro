import { UserRole } from "@prisma/client";
import { idParamSchema, paginationQuerySchema } from "./common.schemas";
import { z } from "zod";

export const getUsersQuerySchema = paginationQuerySchema;
export const userIdParamSchema = idParamSchema;
export const inviteUserBodySchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(UserRole),
});
export const updateUserRoleBodySchema = z.object({
  role: z.nativeEnum(UserRole),
});
export const acceptInviteBodySchema = z
  .object({
    token: z.string().trim().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
    name: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>;
export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type InviteUserBodyInput = z.infer<typeof inviteUserBodySchema>;
export type UpdateUserRoleBodyInput = z.infer<typeof updateUserRoleBodySchema>;
export type AcceptInviteBodyInput = z.infer<typeof acceptInviteBodySchema>;
