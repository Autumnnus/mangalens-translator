import { AlertCircle } from "lucide-react";
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
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                type === "danger"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-amber-500/10 text-amber-500"
              }`}
            >
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">
                {title}
              </h3>
            </div>
          </div>

          <p className="text-slate-400 text-sm font-bold leading-relaxed mb-6">
            {message}
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase transition-all shadow-lg ${
                type === "danger"
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-red-500/20"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20"
              }`}
            >
              {confirmText}
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-xs uppercase transition-all border border-slate-700"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
