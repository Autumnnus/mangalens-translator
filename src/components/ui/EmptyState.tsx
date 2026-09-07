import React from "react";
import { cn } from "../../utils/cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Halftone texture behind the content. */
  textured?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/** Centered message for empty or nothing-selected states. */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  textured = true,
  className,
  children,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-panel border border-dashed border-line px-6 py-16 text-center",
      textured && "screentone",
      className,
    )}
  >
    {icon && (
      <span
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-panel border border-line bg-page text-ink-3 [&_svg]:h-5 [&_svg]:w-5"
      >
        {icon}
      </span>
    )}
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    {description && (
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">
        {description}
      </p>
    )}
    {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    {children}
  </div>
);

export default EmptyState;
