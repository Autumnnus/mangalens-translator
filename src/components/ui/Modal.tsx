"use client";

import { X } from "lucide-react";
import React, { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import IconButton from "./IconButton";

/* ----------------------------------------------------------------------------
   Shared dialog behaviour: portal, scroll lock, Escape, initial focus, restore
   focus on close. Both Modal and FullscreenShell use it.
   --------------------------------------------------------------------------- */

const useDialogBehaviour = (open: boolean, onClose: () => void) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first focusable element, or the panel itself.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(
        "[data-autofocus], input:not([type=hidden]), textarea, select, button:not([data-dismiss])",
      );
      (first || panel).focus({ preventScroll: true });
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return panelRef;
};

const subscribeNoop = () => () => {};

/** document.body on the client, null during SSR (dialogs never render there). */
const usePortalTarget = () =>
  useSyncExternalStore(
    subscribeNoop,
    () => document.body,
    () => null,
  );

/* ----------------------------------------------------------------------------
   Modal: centered dialog with title, optional description, body and footer.
   --------------------------------------------------------------------------- */

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Leading icon in the header. */
  icon?: React.ReactNode;
  size?: ModalSize;
  footer?: React.ReactNode;
  /** Removes the body padding, for lists that reach the edges. */
  flush?: boolean;
  /** z-index layer. `confirm` sits above other modals. */
  layer?: "overlay" | "confirm";
  /** Hide the close button (the dialog still closes with Escape). */
  hideClose?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const sizes: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-3xl",
};

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  footer,
  flush = false,
  layer = "overlay",
  hideClose = false,
  children,
  className,
}) => {
  const panelRef = useDialogBehaviour(open, onClose);
  const target = usePortalTarget();
  const titleId = useId();
  const descriptionId = useId();

  if (!open || !target) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4",
        layer === "confirm" ? "z-(--z-confirm)" : "z-(--z-overlay)",
      )}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-[2px] animate-fade-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-panel border border-line bg-page shadow-pop outline-none animate-pop-in",
          sizes[size],
          className,
        )}
      >
        {(title || !hideClose) && (
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            {icon && (
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line bg-page-2 text-ink-2 [&_svg]:h-4 [&_svg]:w-4"
              >
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="text-base font-semibold leading-6 text-ink">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-ink-2">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <IconButton
                label="Close"
                onClick={onClose}
                data-dismiss
                className="-mr-1.5 -mt-1"
              >
                <X />
              </IconButton>
            )}
          </header>
        )}
        <div className={cn("min-h-0 flex-1 overflow-y-auto", !flush && "px-5 py-4")}>
          {children}
        </div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    target,
  );
};

export default Modal;

/* ----------------------------------------------------------------------------
   FullscreenShell: edge-to-edge tool surface (layout editor, migration).
   --------------------------------------------------------------------------- */

export interface FullscreenShellProps {
  open: boolean;
  onClose: () => void;
  /** Left part of the top bar: icon + title + subtitle. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Right part of the top bar. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** Dark theater ground instead of paper (lightboxes). */
  theater?: boolean;
  layer?: "fullscreen" | "lightbox";
  closeLabel?: string;
}

export const FullscreenShell: React.FC<FullscreenShellProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  actions,
  children,
  theater = false,
  layer = "fullscreen",
  closeLabel = "Close (Esc)",
}) => {
  const panelRef = useDialogBehaviour(open, onClose);
  const target = usePortalTarget();
  const titleId = useId();

  if (!open || !target) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        "fixed inset-0 flex flex-col outline-none animate-fade-in",
        layer === "lightbox" ? "z-(--z-lightbox)" : "z-(--z-fullscreen)",
        theater ? "bg-theater text-theater-ink" : "bg-paper text-ink",
      )}
    >
      <header
        className={cn(
          "flex h-12 shrink-0 items-center gap-3 border-b px-3",
          theater ? "border-theater-line bg-theater" : "border-line bg-page",
        )}
      >
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-control [&_svg]:h-4 [&_svg]:w-4",
              theater ? "text-theater-ink-2" : "bg-npb text-action",
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold leading-5">
            {title}
          </h2>
          {subtitle && (
            <p
              className={cn(
                "truncate text-xs leading-4",
                theater ? "text-theater-ink-2" : "text-ink-3",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          <IconButton
            label={closeLabel}
            onClick={onClose}
            data-dismiss
            className={cn("ml-1", theater && "text-theater-ink-2 hover:bg-theater-hover hover:text-theater-ink")}
          >
            <X />
          </IconButton>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>,
    target,
  );
};
