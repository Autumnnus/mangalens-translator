import React from "react";
import { cn } from "../../utils/cn";

/** Placeholder block for content that is still loading. */
const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    aria-hidden="true"
    className={cn("animate-shimmer rounded-control bg-line-2", className)}
    {...rest}
  />
);

export default Skeleton;
