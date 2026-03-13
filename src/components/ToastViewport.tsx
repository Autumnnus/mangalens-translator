"use client";

import React from "react";
import { useUIStore } from "../stores/useUIStore";

const ToastViewport: React.FC = () => {
  const toasts = useUIStore((state) => state.toasts);
  const dismissToast = useUIStore((state) => state.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex w-[min(92vw,28rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-slide-up rounded-xl border px-4 py-3 shadow-premium backdrop-blur-md ${
            toast.type === "error"
              ? "border-red-500/30 bg-red-500/15 text-red-100"
              : toast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
                : "border-primary/30 bg-surface-elevated/90 text-text-main"
          }`}
        >
          <div className="flex items-start gap-3">
            <i
              className={`mt-0.5 text-xs ${
                toast.type === "error"
                  ? "fas fa-triangle-exclamation text-red-300"
                  : toast.type === "success"
                    ? "fas fa-circle-check text-emerald-300"
                    : "fas fa-circle-info text-primary"
              }`}
            />
            <p className="flex-1 text-sm leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-xs text-text-muted hover:text-text-main transition-colors"
              aria-label="Dismiss notification"
            >
              <i className="fas fa-xmark" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(ToastViewport);
