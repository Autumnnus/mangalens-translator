import React from "react";
import { cn } from "../../utils/cn";

export type ChipTone = "neutral" | "accent" | "ok" | "warn" | "danger";

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  tone?: ChipTone;
  /** Selected state for filter chips. Makes the chip a toggle button. */
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  /** Trailing count, rendered in mono. */
  count?: number | string;
  size?: "sm" | "md";
}

const tones: Record<ChipTone, string> = {
  neutral: "border-line bg-page text-ink-2",
  accent: "border-action/40 bg-npb text-action",
  ok: "border-ok/40 bg-ok-soft text-ok",
  warn: "border-warn/40 bg-warn-soft text-warn",
  danger: "border-shu/40 bg-shu-soft text-shu",
};

/**
 * Small status or filter label. Static by default; with `onClick` it becomes a
 * toggle button (aria-pressed reflects `active`).
 */
const Chip: React.FC<ChipProps> = ({
  tone = "neutral",
  active = false,
  onClick,
  icon,
  count,
  size = "md",
  className,
  children,
  ...rest
}) => {
  const classes = cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border font-medium leading-none",
    size === "sm" ? "h-5 px-1.5 text-xs [&_svg]:h-3 [&_svg]:w-3" : "h-6 px-2 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5",
    active ? "border-action bg-npb text-ink" : tones[tone],
    onClick && "cursor-pointer transition-colors duration-120 hover:border-ink-3 hover:text-ink",
    className,
  );

  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className="flex">
          {icon}
        </span>
      )}
      {children}
      {count !== undefined && (
        <span className="font-mono tabular text-ink-3">{count}</span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={classes}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes} {...rest}>
      {content}
    </span>
  );
};

export default Chip;
