import React from "react";
import { cn } from "../../utils/cn";

/** Mono, uppercase section label. Use sparingly: one per group of controls. */
export const SectionLabel: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  ...rest
}) => <p className={cn("label-mono", className)} {...rest} />;

/** Keyboard key hint. */
export const Kbd: React.FC<React.HTMLAttributes<HTMLElement>> = ({
  className,
  ...rest
}) => (
  <kbd
    className={cn(
      "inline-flex h-5 min-w-5 items-center justify-center rounded-chip border border-line bg-page-2 px-1 font-mono text-xs text-ink-2",
      className,
    )}
    {...rest}
  />
);

/** Inline mono value: counts, costs, ids. */
export const Mono: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({
  className,
  ...rest
}) => <span className={cn("font-mono tabular", className)} {...rest} />;
