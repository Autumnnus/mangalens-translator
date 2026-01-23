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
  confirmText = "Delete",
  cancelText = "Cancel",
  type = "danger",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className="relative bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-[0_0_100px_-20px_rgba(0,0,0,0.5)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-5 duration-300"
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
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                {title}
              </h3>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-[240px]">
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
              className="w-full py-4 px-6 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-white/5 hover:border-white/10 active:scale-95"
            >
              {cancelText}
            </button>
          </div>
        </div>

        {/* Close Icon Shortcut */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ConfirmModal;
