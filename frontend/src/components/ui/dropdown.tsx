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
  const rootRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{activeLabel}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]"
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
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
