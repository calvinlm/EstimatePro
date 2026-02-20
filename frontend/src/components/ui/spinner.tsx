import { cn } from "@/lib/cn";

type SpinnerProps = {
  className?: string;
};

export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-surface-3)] border-t-[var(--color-accent)]",
        className,
      )}
      aria-hidden="true"
    />
  );
}
