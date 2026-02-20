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

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

async function readErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return {};
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

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

export type SetupResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    organizationId: string;
    name: string;
    email: string;
    role: string;
    status: string;
  };
};

export async function getSetupStatus(): Promise<SetupStatus> {
  return requestJson<SetupStatus>("/setup", { method: "GET", cache: "no-store" });
}

export async function postSetup(payload: SetupRequest): Promise<SetupResponse> {
  return requestJson<SetupResponse>("/setup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
