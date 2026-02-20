const ACCESS_TOKEN_KEY = "estimatepro_access_token";
const REFRESH_TOKEN_KEY = "estimatepro_refresh_token";

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function storeTokenPair(tokens: TokenPair): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokenPair(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
