import React from "react";
import { cn } from "../../utils/cn";
import Spinner from "./Spinner";

export type IconButtonVariant = "ghost" | "secondary" | "primary" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Accessible name. Also used as the tooltip. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Pressed/selected look (e.g. a toggle). Sets aria-pressed. */
  active?: boolean;
  loading?: boolean;
}

const variants: Record<IconButtonVariant, string> = {
  ghost:
    "border-transparent text-ink-2 hover:bg-page-2 hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink-2",
  secondary:
    "border-line bg-page text-ink-2 hover:bg-page-2 hover:text-ink hover:border-ink-3",
  primary: "border-transparent bg-action text-on-action hover:bg-action-hover",
  danger:
    "border-transparent text-ink-2 hover:bg-shu-soft hover:text-shu disabled:hover:bg-transparent",
};

const sizes: Record<IconButtonSize, string> = {
  sm: "h-7 w-7 [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4",
};

/** Square icon-only button with a mandatory accessible name. */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      variant = "ghost",
      size = "md",
      active = false,
      loading = false,
      className,
      children,
      disabled,
      type = "button",
      title,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={active || undefined}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-control border transition-colors duration-120 disabled:opacity-50",
        variants[variant],
        sizes[size],
        active && variant === "ghost" && "bg-npb text-action hover:bg-npb",
        active && variant === "secondary" && "border-action bg-npb text-action",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="xs" /> : children}
    </button>
  ),
);
IconButton.displayName = "IconButton";

export default IconButton;
