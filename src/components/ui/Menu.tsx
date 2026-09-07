"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";

export interface MenuItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separator?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  /** Renders the trigger. Spread `props` onto a button-like element. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

/**
 * Small dropdown menu. Closes on outside click, Escape and selection;
 * arrow keys move between items.
 */
const Menu: React.FC<MenuProps> = ({ items, trigger, align = "right", className }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The list is portalled to <body> so cards with overflow-hidden cannot clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const horizontal =
        align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left };
      // Open upwards when there is not enough room below the trigger.
      const listHeight = listRef.current?.offsetHeight || 0;
      const flip = rect.bottom + 4 + listHeight > window.innerHeight - 8;
      setPosition(
        flip
          ? { bottom: window.innerHeight - rect.top + 4, ...horizontal }
          : { top: rect.bottom + 4, ...horizontal },
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const buttons = Array.from(
          listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [],
        );
        if (buttons.length === 0) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === "ArrowDown"
            ? buttons[(index + 1) % buttons.length]
            : buttons[(index - 1 + buttons.length) % buttons.length];
        next.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((value) => !value),
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": id,
      })}
      {open && position && createPortal(
        <div
          ref={listRef}
          id={id}
          role="menu"
          style={position}
          className="fixed z-(--z-toast) min-w-44 rounded-panel border border-line bg-page p-1 shadow-pop animate-pop-in"
        >
          {items.map((item, index) => (
            <React.Fragment key={index}>
              {item.separator && index > 0 && (
                <div role="separator" className="my-1 h-px bg-line" />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm transition-colors duration-120 focus:outline-none focus-visible:bg-page-2 disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4",
                  item.danger
                    ? "text-shu hover:bg-shu-soft"
                    : "text-ink hover:bg-page-2",
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="flex text-ink-2">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default Menu;
