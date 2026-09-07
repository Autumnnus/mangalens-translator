import React from "react";
import { cn } from "../../utils/cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: "accent" | "ok" | "warn" | "danger";
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

const tones = {
  accent: "bg-action",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-shu",
};

/** Thin determinate progress bar. */
const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  tone = "ok",
  size = "sm",
  label,
  className,
}) => {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-line",
        size === "sm" ? "h-1" : "h-1.5",
        className,
      )}
    >
      <span
        className={cn("block h-full rounded-full transition-[width] duration-200", tones[tone])}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
};

export default ProgressBar;
