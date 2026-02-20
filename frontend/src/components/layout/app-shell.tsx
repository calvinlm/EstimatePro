"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api";
import { readAuthUser } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/cn";

const SIDEBAR_COLLAPSED_KEY = "estimatepro_sidebar_collapsed";

const navItems = [
  { href: "/", label: "Projects" },
  { href: "/formulas", label: "Formula Library" },
  { href: "/audit", label: "Audit Log" },
];

type AppShellProps = {
  children: React.ReactNode;
};

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

function formatPathSegment(segment: string): string {
  if (!segment) {
    return "Dashboard";
  }

  return segment
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(getInitialSidebarCollapsed);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const user = readAuthUser();

  const breadcrumb = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return ["Projects"];
    }

    return segments.map((segment) => formatPathSegment(segment));
  }, [pathname]);

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }

  function toggleSidebar(): void {
    setIsSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, `${next}`);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <aside
        className={cn(
          "border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200",
          isSidebarCollapsed ? "w-20" : "w-72",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between">
              {!isSidebarCollapsed ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                    EstimatePro PH
                  </p>
                  <h1 className="text-lg font-semibold">Workspace</h1>
                </div>
              ) : (
                <span className="mx-auto text-sm font-semibold">EP</span>
              )}
              <button
                type="button"
                className="rounded-md p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                onClick={toggleSidebar}
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? "»" : "«"}
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3" aria-label="Primary">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/projects")
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200",
                        active
                          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
                      )}
                    >
                      <span aria-hidden="true">•</span>
                      {!isSidebarCollapsed ? <span>{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-[var(--color-border)] p-4">
            <div className="space-y-2">
              {!isSidebarCollapsed ? (
                <>
                  <p className="truncate text-sm font-medium">{user?.name ?? "User"}</p>
                  <Badge>{user?.role ?? "VIEWER"}</Badge>
                </>
              ) : null}
              <Button
                variant="secondary"
                className={cn("w-full", isSidebarCollapsed ? "px-0" : "")}
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "..." : "Logout"}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-text-muted)]">
              {breadcrumb.join(" / ")}
            </nav>
            <Button variant="ghost" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "light" ? "Dark" : "Light"}
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
