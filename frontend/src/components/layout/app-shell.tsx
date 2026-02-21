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

type NavIcon = "projects" | "formulas" | "audit" | "settings";

const navItems = [
  { href: "/", label: "Projects", icon: "projects" as NavIcon },
  { href: "/formulas", label: "Formula Library", icon: "formulas" as NavIcon },
  { href: "/audit", label: "Audit Log", icon: "audit" as NavIcon },
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

function getBackFallbackPath(pathname: string): string {
  if (pathname.startsWith("/projects/")) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 4 && segments[2] === "estimates") {
      return `/projects/${segments[1]}`;
    }
    return "/";
  }

  if (pathname.startsWith("/formulas/")) {
    return "/formulas";
  }

  if (pathname.startsWith("/settings/")) {
    return "/settings/users";
  }

  return "/";
}

function SidebarIcon({ icon, className }: { icon: NavIcon; className?: string }) {
  if (icon === "projects") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "formulas") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path
          d="M18 5H7l6 7-6 7h11M6 5h2M6 19h2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "audit") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path
          d="M8 3h8l2 2h2v16H4V5h2l2-2zM8 9h8M8 13h8M8 17h5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 16a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeIcon({ theme, className }: { theme: "light" | "dark"; className?: string }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path
          d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41M12 16a4 4 0 100-8 4 4 0 000 8z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(getInitialSidebarCollapsed);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const user = readAuthUser();
  const visibleNavItems = useMemo(() => {
    if (user?.role === "ADMIN") {
      return [...navItems, { href: "/settings/users", label: "Settings", icon: "settings" as NavIcon }];
    }

    return navItems;
  }, [user?.role]);

  const breadcrumb = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return ["Projects"];
    }

    return segments.map((segment) => formatPathSegment(segment));
  }, [pathname]);
  const isRootPage = pathname === "/";

  function goBack(): void {
    if (typeof window !== "undefined") {
      const state = window.history.state as { idx?: number } | null;
      if (typeof state?.idx === "number" && state.idx > 0) {
        router.back();
        return;
      }
    }

    router.push(getBackFallbackPath(pathname));
  }

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
          "sticky top-0 h-screen shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200",
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
                {isSidebarCollapsed ? ">>" : "<<"}
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3" aria-label="Primary">
            <ul className="space-y-1">
              {visibleNavItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/" || pathname.startsWith("/projects")
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-label={isSidebarCollapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200",
                        active
                          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
                      )}
                    >
                      <SidebarIcon icon={item.icon} className="h-4 w-4 shrink-0" />
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
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="secondary"
                className="h-9 gap-2 px-3"
                onClick={goBack}
                disabled={isRootPage}
                aria-label="Go to previous page"
                title="Back"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Back</span>
              </Button>
              <nav aria-label="Breadcrumb" className="truncate text-sm text-[var(--color-text-muted)]">
                {breadcrumb.join(" / ")}
              </nav>
            </div>
            <Button
              variant="ghost"
              className="h-12 w-12 p-0"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={theme === "light" ? "Dark mode" : "Light mode"}
            >
              <ThemeIcon theme={theme} className="h-6 w-6" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}