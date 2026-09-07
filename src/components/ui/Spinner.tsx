import React from "react";
import { cn } from "../../utils/cn";

const sizes = {
  xs: "h-3 w-3 border-[1.5px]",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
} as const;

/** Circular progress indicator in the current text colour. */
const Spinner: React.FC<{
  size?: keyof typeof sizes;
  className?: string;
  label?: string;
}> = ({ size = "sm", className, label = "Loading" }) => (
  <span
    role="status"
    aria-label={label}
    className={cn(
      "inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent",
      sizes[size],
      className,
    )}
  />
);

export default Spinner;
