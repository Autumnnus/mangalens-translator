import React from "react";
import { cn } from "../../utils/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  /** Accessible name when the option is icon-only. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

/** Exclusive choice between a few options. Renders as a radiogroup. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-stretch rounded-control border border-line bg-page p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.title}
            title={option.title}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] font-medium transition-colors duration-120 disabled:opacity-40",
              size === "sm"
                ? "h-6 px-2 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5"
                : "h-7 px-2.5 text-sm [&_svg]:h-4 [&_svg]:w-4",
              option.label === undefined && (size === "sm" ? "w-6 px-0" : "w-7 px-0"),
              selected
                ? "bg-page-2 text-ink shadow-[inset_0_0_0_1px_var(--c-line)]"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {option.icon && (
              <span aria-hidden="true" className="flex">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
