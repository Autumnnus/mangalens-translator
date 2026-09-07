import { ChevronDown } from "lucide-react";
import React, { useId } from "react";
import { cn } from "../../utils/cn";

/* ----------------------------------------------------------------------------
   Field: label + control + hint/error. Every form control goes through this.
   --------------------------------------------------------------------------- */

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Id of the control. Generated when omitted; read it via the render prop. */
  htmlFor?: string;
  className?: string;
  /** Inline layout: label on the left, control on the right. */
  inline?: boolean;
  children: React.ReactNode | ((ids: FieldIds) => React.ReactNode);
}

export interface FieldIds {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  inline = false,
  children,
}) => {
  const generated = useId();
  const id = htmlFor || generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const ids: FieldIds = { id, describedBy, invalid: !!error };

  return (
    <div
      className={cn(
        inline ? "flex items-center justify-between gap-4" : "flex flex-col gap-1.5",
        className,
      )}
    >
      {label && (
        <label
          htmlFor={id}
          className="text-[13px] font-medium text-ink-2"
        >
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-shu">
              *
            </span>
          )}
        </label>
      )}
      <div className={cn(inline ? "shrink-0" : "flex flex-col gap-1.5")}>
        {typeof children === "function" ? children(ids) : children}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-shu">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs leading-relaxed text-ink-3">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------- */

export const controlClass =
  "w-full rounded-control border border-line bg-page-2 px-3 text-sm text-ink placeholder:text-ink-3 transition-colors duration-120 hover:border-ink-3 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30 disabled:opacity-50 disabled:hover:border-line aria-[invalid=true]:border-shu";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Monospace: numbers, ids, keys. */
  mono?: boolean;
  inputSize?: "sm" | "md" | "lg";
}

const inputHeights = { sm: "h-7 text-[13px]", md: "h-8", lg: "h-9" };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, mono, inputSize = "md", className, ...rest }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        controlClass,
        inputHeights[inputSize],
        mono && "font-mono tabular",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...rest }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, "min-h-20 py-2 leading-relaxed", className)}
      {...rest}
    />
  ),
);
Textarea.displayName = "Textarea";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  selectSize?: "sm" | "md" | "lg";
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid, selectSize = "md", className, children, ...rest }, ref) => (
    <span className={cn("relative block", className)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          controlClass,
          inputHeights[selectSize],
          "cursor-pointer appearance-none pr-8",
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
      />
    </span>
  ),
);
Select.displayName = "Select";

/* --------------------------------------------------------------------------- */

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, ...rest }, ref) => {
    const generated = useId();
    const inputId = id || generated;
    return (
      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer items-start gap-2.5 text-sm text-ink",
          rest.disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-chip border-line accent-action"
          {...rest}
        />
        {(label || description) && (
          <span className="flex flex-col gap-0.5">
            {label && <span>{label}</span>}
            {description && (
              <span className="text-xs leading-relaxed text-ink-3">
                {description}
              </span>
            )}
          </span>
        )}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

/** Toggle switch. Renders as a button with role="switch". */
export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  size = "md",
}) => {
  const id = useId();
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const knob = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift = size === "sm" ? "translate-x-3" : "translate-x-4";
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={label ? `${id}-label` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-120 disabled:opacity-50",
        track,
        checked ? "border-action bg-action" : "border-line bg-page-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0.5 rounded-full transition-transform duration-120",
          knob,
          checked ? cn(shift, "bg-on-action") : "bg-ink-3",
        )}
      />
    </button>
  );

  if (!label) return <span className={className}>{control}</span>;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={`${id}-label`} className="text-sm text-ink">
          {label}
        </span>
        {description && (
          <span className="text-xs leading-relaxed text-ink-3">
            {description}
          </span>
        )}
      </span>
      {control}
    </div>
  );
};
