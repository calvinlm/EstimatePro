"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

type ModalProps = {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
};

export function Modal({ isOpen, title, children, onClose, className }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialogElement = dialogRef.current;
    const focusableSelectors = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const focusFirstElement = (): void => {
      if (!dialogElement) {
        return;
      }

      const focusableElements = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(focusableSelectors),
      );

      if (focusableElements.length > 0) {
        focusableElements[0].focus();
        return;
      }

      dialogElement.focus();
    };

    focusFirstElement();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogElement) {
        return;
      }

      const focusableElements = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(focusableSelectors),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
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
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl",
          className,
        )}
      >
        <h2 id={titleId} className="text-lg font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
