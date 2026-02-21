import {
  clearAuthSession,
  readAccessToken,
  readRefreshToken,
  storeAuthSession,
  type AuthSession,
} from "@/lib/auth";

type ApiEnvelope<T> = {
  data: T;
};

type ApiErrorPayload = {
  status?: string;
  code?: string;
  message?: string;
  requestId?: string;
  details?: unknown;
};

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(statusCode: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

type RequestOptions = {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

async function performJsonRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, init);
}

async function refreshAccessTokenOnce(): Promise<boolean> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    clearAuthSession();
    return false;
  }

  const response = await performJsonRequest("/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearAuthSession();
    return false;
  }

  const payload = (await response.json()) as ApiEnvelope<AuthSession>;
  storeAuthSession(payload.data);
  return true;
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessTokenOnce().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function requestJson<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  const authRequired = options?.auth ?? false;
  const retryOnUnauthorized = options?.retryOnUnauthorized ?? authRequired;

  if (!headers.has("Content-Type") && init?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (authRequired) {
    const accessToken = readAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  let response = await performJsonRequest(path, {
    ...init,
    headers,
  });

  if (response.status === 401 && authRequired && retryOnUnauthorized) {
    const didRefresh = await refreshSession();
    if (didRefresh) {
      const retryHeaders = new Headers(init?.headers);
      const nextAccessToken = readAccessToken();
      if (!retryHeaders.has("Content-Type") && init?.body !== undefined) {
        retryHeaders.set("Content-Type", "application/json");
      }
      if (nextAccessToken) {
        retryHeaders.set("Authorization", `Bearer ${nextAccessToken}`);
      }

      response = await performJsonRequest(path, {
        ...init,
        headers: retryHeaders,
      });
    }
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new ApiError(
      response.status,
      payload.code ?? "API_REQUEST_FAILED",
      payload.message ?? "Request failed",
      payload.details,
      payload.requestId,
    );
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function requestBinary(path: string, init?: RequestInit, options?: RequestOptions): Promise<Response> {
  const headers = new Headers(init?.headers);
  const authRequired = options?.auth ?? false;
  const retryOnUnauthorized = options?.retryOnUnauthorized ?? authRequired;

  if (authRequired) {
    const accessToken = readAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  let response = await performJsonRequest(path, {
    ...init,
    headers,
  });

  if (response.status === 401 && authRequired && retryOnUnauthorized) {
    const didRefresh = await refreshSession();
    if (didRefresh) {
      const retryHeaders = new Headers(init?.headers);
      const nextAccessToken = readAccessToken();
      if (nextAccessToken) {
        retryHeaders.set("Authorization", `Bearer ${nextAccessToken}`);
      }

      response = await performJsonRequest(path, {
        ...init,
        headers: retryHeaders,
      });
    }
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new ApiError(
      response.status,
      payload.code ?? "API_REQUEST_FAILED",
      payload.message ?? "Request failed",
      payload.details,
      payload.requestId,
    );
  }

  return response;
}

export type SetupStatus = {
  required: boolean;
};

export type SetupRequest = {
  organizationName: string;
  adminFullName: string;
  adminEmail: string;
  password: string;
  confirmPassword: string;
};

export type AuthUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
  confirmPassword: string;
};

export type AcceptInviteRequest = {
  token: string;
  newPassword: string;
  confirmPassword: string;
  name?: string;
};

export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type EstimateStatus = "DRAFT" | "FINAL" | "ARCHIVED";
export type LineItemCalculationSource = "MANUAL" | "COMPUTED" | "ADJUSTED";

export type Category =
  | "CONCRETE_WORKS"
  | "MASONRY_WORKS"
  | "PAINTING_WORKS"
  | "FORMWORKS"
  | "STEEL_WORKS"
  | "CARPENTRY"
  | "DOORS_AND_WINDOWS"
  | "WATERPROOFING"
  | "GENERAL_REQUIREMENTS";

export const CATEGORY_VALUES: Category[] = [
  "CONCRETE_WORKS",
  "MASONRY_WORKS",
  "PAINTING_WORKS",
  "FORMWORKS",
  "STEEL_WORKS",
  "CARPENTRY",
  "DOORS_AND_WINDOWS",
  "WATERPROOFING",
  "GENERAL_REQUIREMENTS",
];

export type Pagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  location: string;
  projectType: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
};

export type GetProjectsResponse = {
  items: ProjectSummary[];
  pagination: Pagination;
};

export type GetProjectsQuery = {
  page?: number;
  pageSize?: number;
  status?: ProjectStatus;
};

export type CreateProjectRequest = {
  name: string;
  location: string;
  projectType: string;
};

export type ProjectEstimateSummary = {
  id: string;
  projectId: string;
  versionNumber: number;
  label: string | null;
  status: EstimateStatus;
  subtotal: string;
  markupRate: string;
  markupAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
};

export type GetProjectEstimatesResponse = {
  items: ProjectEstimateSummary[];
  pagination: Pagination;
};

export type GetProjectEstimatesQuery = {
  page?: number;
  pageSize?: number;
};

export type CreateEstimateRequest = {
  label?: string;
  markupRate: number;
  vatRate?: number;
};

export type EstimateSummary = {
  id: string;
  projectId: string;
  versionNumber: number;
  label: string | null;
  status: EstimateStatus;
  subtotal: string;
  markupRate: string;
  markupAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
  };
};

export type EstimateLineItem = {
  id: string;
  category: Category;
  description: string;
  quantity: string;
  unit: string;
  unitMaterialCost: string;
  unitLaborCost: string;
  totalCost: string;
  calculationSource: LineItemCalculationSource;
  originalComputedQuantity: string | null;
  originalComputedCost: string | null;
  overrideReason: string | null;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FormulaUsageRecord = {
  id: string;
  lineItemId: string;
  formulaId: string;
  formulaVersion: number;
  formulaSnapshot: unknown;
  inputValues: Record<string, unknown>;
  computedResults: Record<string, unknown>;
  computedAt: string;
  computedBy: {
    id: string;
    name: string;
  };
  formula: {
    id: string;
    name: string;
    category: Category;
    version: number;
    isActive: boolean;
    createdAt: string;
  };
  lineItem: {
    id: string;
    description: string;
    category: Category;
  };
};

export type EstimateDetailsResponse = {
  estimate: EstimateSummary;
  lineItems: EstimateLineItem[];
  formulaUsage: FormulaUsageRecord[];
};

export type UpdateEstimateRequest = {
  markupRate: number;
  vatRate: number;
};

export type EstimateTotalsSnapshot = {
  id: string;
  subtotal: string;
  markupAmount: string;
  vatAmount: string;
  totalAmount: string;
  updatedAt: string;
};

export type CreateLineItemRequest = {
  category: Category;
  description: string;
  quantity: number;
  unit: string;
  unitMaterialCost: number;
  unitLaborCost: number;
};

export type UpdateLineItemRequest = {
  category?: Category;
  description?: string;
  quantity?: number;
  unit?: string;
  unitMaterialCost?: number;
  unitLaborCost?: number;
};

export type LineItemMutationResponse = {
  lineItem: EstimateLineItem;
  estimate: EstimateTotalsSnapshot;
};

export type OverrideLineItemRequest = {
  quantity: number;
  overrideReason: string;
};

export type DeleteLineItemResponse = {
  deletedLineItemId: string;
  estimate: EstimateTotalsSnapshot;
};

export type ComputeLineItemRequest = {
  formulaId?: string;
  formulaName?: string;
  outputVariable?: string;
  inputValues: Record<string, unknown>;
};

export type ComputeLineItemResponse = LineItemMutationResponse & {
  computation: {
    id: string;
    formulaId: string;
    formulaVersion: number;
  };
};

export type FormulaStatus = "ACTIVE" | "INACTIVE";

export type FormulaSummary = {
  id: string;
  name: string;
  description: string;
  category: Category;
  currentVersion: number;
  status: FormulaStatus;
  isActive: boolean;
  lastModifiedAt: string;
  lastModifiedBy: {
    id: string;
    name: string;
  };
};

export type GetFormulasResponse = {
  items: FormulaSummary[];
  pagination: Pagination;
};

export type FormulaInputDefinition = {
  variable: string;
  label: string;
  unit: string;
  type: "number" | "integer";
  min?: number;
  max?: number;
  defaultValue?: number;
};

export type FormulaExpressionDefinition = {
  variable: string;
  expression: string;
};

export type FormulaOutputDefinition = {
  variable: string;
  lineItemField: "quantity";
  unit: string;
};

export type FormulaDetail = {
  id: string;
  name: string;
  description: string;
  category: Category;
  version: number;
  isActive: boolean;
  previousVersionId: string | null;
  inputs: FormulaInputDefinition[];
  expressions: FormulaExpressionDefinition[];
  outputs: FormulaOutputDefinition[];
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  };
};

export type FormulaVersion = {
  id: string;
  name: string;
  description: string;
  category: Category;
  version: number;
  isActive: boolean;
  previousVersionId: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  };
};

export type FormulaVersionsResponse = {
  rootFormulaId: string;
  latestFormulaId: string;
  versions: FormulaVersion[];
};

export type GetFormulasQuery = {
  page?: number;
  pageSize?: number;
};

export type UserRole = "ADMIN" | "ESTIMATOR" | "VIEWER";
export type UserStatus = "ACTIVE" | "INACTIVE";

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  pendingInvite?: boolean;
  inviteExpiresAt?: string | null;
};

export type GetUsersResponse = {
  items: UserSummary[];
  pagination: Pagination;
};

export type GetUsersQuery = {
  page?: number;
  pageSize?: number;
};

export type AuditEntityType = "Project" | "Estimate" | "LineItem" | "Formula" | "User";

export type AuditLogEntry = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  beforeState: unknown;
  afterState: unknown;
  performedAt: string;
  performedBy: {
    id: string;
    name: string;
    email: string;
  };
};

export type GetAuditLogsResponse = {
  items: AuditLogEntry[];
  pagination: Pagination;
};

export type GetAuditLogsQuery = {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  userId?: string;
  entityType?: AuditEntityType;
};

export type InviteUserRequest = {
  email: string;
  role: UserRole;
};

export type InviteUserResponse = {
  user: UserSummary;
  inviteExpiresAt: string;
  emailDelivery: "SENT" | "FAILED";
  setupLink?: string;
  emailDeliveryErrorCode?: string;
};

export type UpdateUserRoleRequest = {
  role: UserRole;
};

export type UserMutationResponse = {
  user: UserSummary;
};

export type FormulaCreateOrUpdatePayload = {
  name: string;
  description: string;
  category: Category;
  inputs: FormulaInputDefinition[];
  expressions: FormulaExpressionDefinition[];
  outputs: FormulaOutputDefinition[];
};

export type TestFormulaPayload = {
  inputValues: Record<string, number>;
};

export type TestFormulaResponse = {
  formula: {
    id: string;
    name: string;
    category: Category;
    version: number;
    isActive: boolean;
  };
  resolvedInputs: Record<string, number>;
  computedResults: Record<string, number>;
  outputValues: Record<string, number>;
};

export type PdfJobStatus = "pending" | "complete" | "failed";

export type RequestEstimatePdfResponse = {
  jobId: string;
  status: PdfJobStatus;
};

export type PdfJobStatusResponse = {
  jobId: string;
  status: PdfJobStatus;
  downloadUrl?: string;
  message?: string;
};

export type DownloadPdfJobResponse = {
  blob: Blob;
  fileName: string;
};

export async function getSetupStatus(): Promise<SetupStatus> {
  return requestJson<SetupStatus>(
    "/setup",
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function postSetup(payload: SetupRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/setup",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function forgotPassword(payload: ForgotPasswordRequest): Promise<{ success: true; message: string }> {
  return requestJson<{ success: true; message: string }>(
    "/auth/forgot-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function resetPassword(payload: ResetPasswordRequest): Promise<{ success: true }> {
  return requestJson<{ success: true }>(
    "/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function acceptInvite(payload: AcceptInviteRequest): Promise<UserMutationResponse> {
  return requestJson<UserMutationResponse>(
    "/users/accept-invite",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: false,
      retryOnUnauthorized: false,
    },
  );
}

export async function logout(): Promise<void> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    clearAuthSession();
    return;
  }

  try {
    await requestJson<{ success: true }>(
      "/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      {
        auth: false,
        retryOnUnauthorized: false,
      },
    );
  } finally {
    clearAuthSession();
  }
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    query.set(key, `${value}`);
  });

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export async function getProjects(query: GetProjectsQuery = {}): Promise<GetProjectsResponse> {
  const queryString = toQueryString({
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
  });

  return requestJson<GetProjectsResponse>(
    `/projects${queryString}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function createProject(payload: CreateProjectRequest): Promise<ProjectSummary> {
  return requestJson<ProjectSummary>(
    "/projects",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function getProject(projectId: string): Promise<ProjectSummary> {
  return requestJson<ProjectSummary>(
    `/projects/${projectId}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function archiveProject(projectId: string): Promise<ProjectSummary> {
  return requestJson<ProjectSummary>(
    `/projects/${projectId}/archive`,
    {
      method: "PATCH",
    },
    {
      auth: true,
    },
  );
}

export async function getProjectEstimates(
  projectId: string,
  query: GetProjectEstimatesQuery = {},
): Promise<GetProjectEstimatesResponse> {
  const queryString = toQueryString({
    page: query.page,
    pageSize: query.pageSize,
  });

  return requestJson<GetProjectEstimatesResponse>(
    `/projects/${projectId}/estimates${queryString}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function createEstimate(
  projectId: string,
  payload: CreateEstimateRequest,
): Promise<ProjectEstimateSummary> {
  return requestJson<ProjectEstimateSummary>(
    `/projects/${projectId}/estimates`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function duplicateEstimate(estimateId: string): Promise<ProjectEstimateSummary> {
  return requestJson<ProjectEstimateSummary>(
    `/estimates/${estimateId}/duplicate`,
    {
      method: "POST",
    },
    {
      auth: true,
    },
  );
}

export async function archiveEstimate(estimateId: string): Promise<ProjectEstimateSummary> {
  return requestJson<ProjectEstimateSummary>(
    `/estimates/${estimateId}/archive`,
    {
      method: "PATCH",
    },
    {
      auth: true,
    },
  );
}

export async function softDeleteEstimate(estimateId: string): Promise<ProjectEstimateSummary> {
  return requestJson<ProjectEstimateSummary>(
    `/estimates/${estimateId}`,
    {
      method: "DELETE",
    },
    {
      auth: true,
    },
  );
}

export async function getEstimate(estimateId: string): Promise<EstimateDetailsResponse> {
  return requestJson<EstimateDetailsResponse>(
    `/estimates/${estimateId}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function updateEstimate(
  estimateId: string,
  payload: UpdateEstimateRequest,
): Promise<EstimateSummary> {
  return requestJson<EstimateSummary>(
    `/estimates/${estimateId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function finalizeEstimate(estimateId: string): Promise<EstimateSummary> {
  return requestJson<EstimateSummary>(
    `/estimates/${estimateId}/finalize`,
    {
      method: "POST",
    },
    {
      auth: true,
    },
  );
}

export async function createLineItem(
  estimateId: string,
  payload: CreateLineItemRequest,
): Promise<LineItemMutationResponse> {
  return requestJson<LineItemMutationResponse>(
    `/estimates/${estimateId}/line-items`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function updateLineItem(
  lineItemId: string,
  payload: UpdateLineItemRequest,
): Promise<LineItemMutationResponse> {
  return requestJson<LineItemMutationResponse>(
    `/line-items/${lineItemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function overrideLineItem(
  lineItemId: string,
  payload: OverrideLineItemRequest,
): Promise<LineItemMutationResponse> {
  return requestJson<LineItemMutationResponse>(
    `/line-items/${lineItemId}/override`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function deleteLineItem(lineItemId: string): Promise<DeleteLineItemResponse> {
  return requestJson<DeleteLineItemResponse>(
    `/line-items/${lineItemId}`,
    {
      method: "DELETE",
    },
    {
      auth: true,
    },
  );
}

export async function computeLineItem(
  lineItemId: string,
  payload: ComputeLineItemRequest,
): Promise<ComputeLineItemResponse> {
  return requestJson<ComputeLineItemResponse>(
    `/line-items/${lineItemId}/compute`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function getFormulas(query: GetFormulasQuery = {}): Promise<GetFormulasResponse> {
  const queryString = toQueryString({
    page: query.page,
    pageSize: query.pageSize,
  });

  return requestJson<GetFormulasResponse>(
    `/formulas${queryString}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function getFormula(formulaId: string): Promise<FormulaDetail> {
  return requestJson<FormulaDetail>(
    `/formulas/${formulaId}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function getFormulaVersions(formulaId: string): Promise<FormulaVersionsResponse> {
  return requestJson<FormulaVersionsResponse>(
    `/formulas/${formulaId}/versions`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function getUsers(query: GetUsersQuery = {}): Promise<GetUsersResponse> {
  const queryString = toQueryString({
    page: query.page,
    pageSize: query.pageSize,
  });

  return requestJson<GetUsersResponse>(
    `/users${queryString}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function getAuditLogs(query: GetAuditLogsQuery = {}): Promise<GetAuditLogsResponse> {
  const queryString = toQueryString({
    page: query.page,
    pageSize: query.pageSize,
    from: query.from,
    to: query.to,
    userId: query.userId,
    entityType: query.entityType,
  });

  return requestJson<GetAuditLogsResponse>(
    `/audit${queryString}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function inviteUser(payload: InviteUserRequest): Promise<InviteUserResponse> {
  return requestJson<InviteUserResponse>(
    "/users/invite",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function updateUserRole(
  userId: string,
  payload: UpdateUserRoleRequest,
): Promise<UserMutationResponse> {
  return requestJson<UserMutationResponse>(
    `/users/${userId}/role`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function deactivateUser(userId: string): Promise<UserMutationResponse> {
  return requestJson<UserMutationResponse>(
    `/users/${userId}/deactivate`,
    {
      method: "PATCH",
    },
    {
      auth: true,
    },
  );
}

export async function createFormula(payload: FormulaCreateOrUpdatePayload): Promise<FormulaDetail> {
  return requestJson<FormulaDetail>(
    "/formulas",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function updateFormula(
  formulaId: string,
  payload: FormulaCreateOrUpdatePayload,
): Promise<FormulaDetail> {
  return requestJson<FormulaDetail>(
    `/formulas/${formulaId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

export async function deactivateFormula(formulaId: string): Promise<FormulaDetail> {
  return requestJson<FormulaDetail>(
    `/formulas/${formulaId}/deactivate`,
    {
      method: "POST",
    },
    {
      auth: true,
    },
  );
}

export async function testFormula(
  formulaId: string,
  payload: TestFormulaPayload,
): Promise<TestFormulaResponse> {
  return requestJson<TestFormulaResponse>(
    `/formulas/${formulaId}/test`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    {
      auth: true,
    },
  );
}

function parseDownloadFilename(disposition: string | null, fallback: string): string {
  if (!disposition) {
    return fallback;
  }

  const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch?.[1]) {
    return decodeURIComponent(starMatch[1]);
  }

  const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }

  return fallback;
}

export async function requestEstimatePdf(estimateId: string): Promise<RequestEstimatePdfResponse> {
  return requestJson<RequestEstimatePdfResponse>(
    `/estimates/${estimateId}/pdf`,
    {
      method: "POST",
    },
    {
      auth: true,
    },
  );
}

export async function getPdfJobStatus(jobId: string): Promise<PdfJobStatusResponse> {
  return requestJson<PdfJobStatusResponse>(
    `/pdf-jobs/${jobId}`,
    {
      method: "GET",
      cache: "no-store",
    },
    {
      auth: true,
    },
  );
}

export async function downloadPdfJob(jobId: string): Promise<DownloadPdfJobResponse> {
  const response = await requestBinary(
    `/pdf-jobs/${jobId}/download`,
    {
      method: "GET",
    },
    {
      auth: true,
    },
  );

  const blob = await response.blob();
  const fileName = parseDownloadFilename(
    response.headers.get("content-disposition"),
    `estimate-${jobId}.pdf`,
  );

  return {
    blob,
    fileName,
  };
}
