export const ACCESS_TOKEN_KEY = "estimatepro_access_token";
export const REFRESH_TOKEN_KEY = "estimatepro_refresh_token";
export const AUTH_USER_KEY = "estimatepro_auth_user";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export type AuthSession = TokenPair & {
  user: AuthUser;
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = window.atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readAccessToken(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function readRefreshToken(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function readAuthUser(): AuthUser | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeTokenPair(tokens: TokenPair): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function storeAuthSession(session: AuthSession): void {
  if (!canUseLocalStorage()) {
    return;
  }

  storeTokenPair({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session.user));
}

export function clearAuthSession(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export function isAccessTokenExpired(bufferSeconds = 30): boolean {
  if (!canUseLocalStorage()) {
    return true;
  }

  const accessToken = readAccessToken();
  if (!accessToken) {
    return true;
  }

  const payload = decodeJwtPayload(accessToken);
  const exp = payload?.exp;
  if (typeof exp !== "number") {
    return true;
  }

  const nowSeconds = Date.now() / 1000;
  return exp <= nowSeconds + bufferSeconds;
}
