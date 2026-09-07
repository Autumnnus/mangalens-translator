"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import React from "react";
import { ToastMessage, useUIStore } from "../stores/useUIStore";
import { IconButton } from "./ui";

type ToastType = ToastMessage["type"];

const toneStripe: Record<ToastType, string> = {
  success: "border-l-ok",
  error: "border-l-shu",
  warning: "border-l-warn",
  info: "border-l-action",
};

const toneIcon: Record<ToastType, string> = {
  success: "text-ok",
  error: "text-shu",
  warning: "text-warn",
  info: "text-action",
};

const ToneIcon: React.FC<{ type: ToastType }> = ({ type }) => {
  const className = `mt-0.5 h-4 w-4 shrink-0 ${toneIcon[type]}`;
  switch (type) {
    case "success":
      return <CheckCircle2 aria-hidden="true" className={className} />;
    case "error":
      return <XCircle aria-hidden="true" className={className} />;
    case "warning":
      return <AlertTriangle aria-hidden="true" className={className} />;
    default:
      return <Info aria-hidden="true" className={className} />;
  }
};

const ToastViewport: React.FC = () => {
  const toasts = useUIStore((state) => state.toasts);
  const dismissToast = useUIStore((state) => state.dismissToast);

  if (!toasts.length) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-(--z-toast) flex w-[min(92vw,24rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === "error" ? "alert" : undefined}
          className={`flex items-start gap-2.5 rounded-panel border border-line border-l-[3px] bg-page px-3 py-2.5 shadow-pop animate-slide-in-right ${toneStripe[toast.type]}`}
        >
          <ToneIcon type={toast.type} />
          <p className="min-w-0 flex-1 text-sm leading-5 text-ink">
            {toast.message}
          </p>
          <IconButton
            label="Dismiss"
            size="sm"
            onClick={() => dismissToast(toast.id)}
            className="-mr-1 -mt-0.5"
          >
            <X />
          </IconButton>
        </div>
      ))}
    </div>
  );
};

export default React.memo(ToastViewport);
