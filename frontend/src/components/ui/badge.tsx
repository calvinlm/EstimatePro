import { cn } from "@/lib/cn";

type BadgeVariant = "neutral" | "success" | "warning" | "danger";

const badgeStyles: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text)]",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-300",
};

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        badgeStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
