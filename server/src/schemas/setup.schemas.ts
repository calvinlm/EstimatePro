import { z } from "zod";

export const setupSchema = z
  .object({
    organizationName: z.string().trim().min(1),
    adminFullName: z.string().trim().min(1),
    adminEmail: z.string().trim().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

export type SetupInput = z.infer<typeof setupSchema>;
