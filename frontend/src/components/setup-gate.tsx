"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSetupStatus } from "@/lib/api";

type SetupGateProps = {
  children: React.ReactNode;
};

export function SetupGate({ children }: SetupGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function checkSetup(): Promise<void> {
      try {
        const { required } = await getSetupStatus();

        if (!isActive) {
          return;
        }

        if (required && pathname !== "/setup") {
          router.replace("/setup");
          return;
        }

        if (!required && pathname === "/setup") {
          router.replace("/login");
          return;
        }
      } catch {
        // Keep the app usable if the setup check endpoint is temporarily unreachable.
      } finally {
        if (isActive) {
          setIsChecked(true);
        }
      }
    }

    void checkSetup();

    return () => {
      isActive = false;
    };
  }, [pathname, router]);

  if (!isChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        <p className="text-sm">Loading setup status...</p>
      </div>
    );
  }

  return <>{children}</>;
}
