import type { Request } from "express";

export type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
};

export type RequestWithAuth = Request & {
  auth?: AuthContext;
  organizationId?: string;
};
