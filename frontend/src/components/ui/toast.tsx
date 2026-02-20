import { cn } from "@/lib/cn";

type ToastVariant = "info" | "success" | "error";

const toastStyles: Record<ToastVariant, string> = {
  info: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
  success: "border-emerald-500/40 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-300",
  error: "border-rose-500/40 bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-300",
};

type ToastProps = {
  message: string;
  variant?: ToastVariant;
  onClose?: () => void;
  className?: string;
};

export function Toast({ message, variant = "info", onClose, className }: ToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2 text-sm shadow-md",
        toastStyles[variant],
        className,
      )}
    >
      <p className="flex-1">{message}</p>
      {onClose ? (
        <button
          type="button"
          className="text-xs font-semibold uppercase tracking-wide opacity-80 hover:opacity-100"
          onClick={onClose}
        >
          Close
        </button>
      ) : null}
    </div>
  );
}
