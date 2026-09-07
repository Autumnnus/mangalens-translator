import React from "react";
import { cn } from "../../utils/cn";
import Spinner from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  full?: boolean;
}

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control border font-medium transition-colors duration-120 disabled:opacity-50";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-action text-on-action hover:bg-action-hover disabled:hover:bg-action",
  secondary:
    "border-line bg-page text-ink hover:bg-page-2 hover:border-ink-3 disabled:hover:bg-page disabled:hover:border-line",
  ghost:
    "border-transparent bg-transparent text-ink-2 hover:bg-page-2 hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink-2",
  danger:
    "border-transparent bg-shu-soft text-shu hover:bg-shu hover:text-white disabled:hover:bg-shu-soft disabled:hover:text-shu",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5",
  md: "h-8 px-3 text-sm [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-9 px-4 text-sm [&_svg]:h-4 [&_svg]:w-4",
};

/** The one button. Four variants, three sizes, optional loading state. */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      iconRight,
      full = false,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        buttonVariants[variant],
        buttonSizes[size],
        full && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "sm" ? "xs" : "sm"} />
      ) : (
        icon && <span aria-hidden="true" className="flex">{icon}</span>
      )}
      {children}
      {iconRight && !loading && (
        <span aria-hidden="true" className="flex">
          {iconRight}
        </span>
      )}
    </button>
  ),
);
Button.displayName = "Button";

export default Button;
