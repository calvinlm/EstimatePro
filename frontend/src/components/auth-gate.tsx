"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { refreshSession } from "@/lib/api";
import { isAccessTokenExpired, readAccessToken, readRefreshToken } from "@/lib/auth";

type AuthGateProps = {
  children: React.ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function verifySession(): Promise<void> {
      const accessToken = readAccessToken();
      const refreshToken = readRefreshToken();

      if (!refreshToken && !accessToken) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      if (!isAccessTokenExpired()) {
        setIsChecking(false);
        return;
      }

      const didRefresh = await refreshSession();
      if (!active) {
        return;
      }

      if (!didRefresh) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      setIsChecking(false);
    }

    void verifySession().finally(() => {
      if (active) {
        setIsChecking(false);
      }
    });

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        <p className="text-sm">Validating session...</p>
      </div>
    );
  }

  return <>{children}</>;
}
