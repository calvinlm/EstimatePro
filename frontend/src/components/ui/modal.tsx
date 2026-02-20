"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

type ModalProps = {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
};

export function Modal({ isOpen, title, children, onClose, className }: ModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl",
          className,
        )}
      >
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
