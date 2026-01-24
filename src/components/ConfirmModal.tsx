import { AlertCircle, X } from "lucide-react";
import React from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning";
}

const ConfirmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "danger",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className="relative bg-surface/40 backdrop-blur-2xl border border-border-muted rounded-[2.5rem] shadow-glow w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-5 duration-300 glass-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Bar */}
        <div
          className={`h-1.5 w-full ${
            type === "danger"
              ? "bg-gradient-to-r from-red-600 via-rose-500 to-red-600"
              : "bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500"
          }`}
        />

        <div className="p-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-6 mb-8">
            <div
              className={`w-20 h-20 rounded-[2rem] flex items-center justify-center relative ${
                type === "danger"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-amber-500/10 text-amber-500"
              }`}
            >
              {/* Outer Glow */}
              <div
                className={`absolute inset-0 rounded-[2rem] blur-2xl opacity-50 ${
                  type === "danger" ? "bg-red-500/20" : "bg-amber-500/20"
                }`}
              />

              <AlertCircle className="w-10 h-10 relative z-10" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-text-main uppercase tracking-tighter">
                {title}
              </h3>
              <p className="text-text-muted text-sm font-medium leading-relaxed max-w-[240px]">
                {message}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`w-full py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${
                type === "danger"
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20 hover:shadow-red-500/40"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20 hover:shadow-amber-500/40"
              }`}
            >
              {confirmText}
            </button>
            <button
              onClick={onClose}
              className="w-full py-4 px-6 bg-surface-raised/50 hover:bg-surface-elevated text-text-muted rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-border-muted hover:border-border-accent active:scale-95"
            >
              {cancelText}
            </button>
          </div>
        </div>

        {/* Close Icon Shortcut */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-text-dark hover:text-text-main transition-colors rounded-full hover:bg-surface-raised"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ConfirmModal;
