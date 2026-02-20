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
