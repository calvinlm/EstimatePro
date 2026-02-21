"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type DropdownOption = {
  label: string;
  value: string;
};

type DropdownProps = {
  value: string;
  options: DropdownOption[];
  onSelect: (value: string) => void;
  className?: string;
};

export function Dropdown({ value, options, onSelect, className }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const activeLabel = options.find((option) => option.value === value)?.label ?? "Select";

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("click", onClickOutside);
    return () => {
      window.removeEventListener("click", onClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, options, value]);

  function closeMenu(): void {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && !isOpen) {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => {
        const next = current + 1;
        return next >= options.length ? 0 : next;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => {
        const next = current - 1;
        return next < 0 ? options.length - 1 : next;
      });
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (activeIndex < 0 || activeIndex >= options.length) {
        return;
      }

      onSelect(options[activeIndex].value);
      closeMenu();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onKeyDown={onTriggerKeyDown}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{activeLabel}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute z-20 mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {options.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]",
                  index === activeIndex ? "bg-[var(--color-surface-2)]" : "",
                )}
                onClick={() => {
                  onSelect(option.value);
                  closeMenu();
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
