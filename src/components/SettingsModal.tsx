import {
  Baseline,
  Cpu,
  DollarSign,
  Languages,
  Lock,
  Palette,
  Sliders,
  Sparkles,
  Square,
  Text,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { GEMINI_MODELS, TranslationSettings } from "../types";

const PasswordChangeForm = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const handleChangePassword = async () => {
    if (!password) return;
    if (password !== confirm) {
      setMessage({ text: "Passwords do not match", type: "error" });
      return;
    }
    if (password.length < 6) {
      setMessage({
        text: "Password must be at least 6 characters",
        type: "error",
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to update password");

      setMessage({ text: "Password updated successfully", type: "success" });
      setPassword("");
      setConfirm("");
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Error",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-raised/50 p-4 rounded-2xl border border-border-muted space-y-3">
      {message && (
        <div
          className={`text-[10px] font-bold px-3 py-2 rounded-xl ${message.type === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}
        >
          {message.text}
        </div>
      )}
      <div className="space-y-1">
        <input
          type="password"
          placeholder="New Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface-raised border border-border-muted rounded-xl px-4 py-3 text-xs font-medium focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-text-muted/50"
        />
      </div>
      <div className="space-y-1">
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-surface-raised border border-border-muted rounded-xl px-4 py-3 text-xs font-medium focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-text-muted/50"
        />
      </div>
      <button
        onClick={handleChangePassword}
        disabled={loading || !password}
        className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </div>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: TranslationSettings;
  onSettingsChange: (settings: TranslationSettings) => void;
}

const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}) => {
  if (!isOpen) return null;

  const handleChange = (
    key: keyof TranslationSettings,
    value: string | number | boolean,
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="w-full max-w-lg bg-surface border border-border-muted rounded-[2.5rem] shadow-glow overflow-hidden animate-in zoom-in-95 duration-300 glass-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-border-subtle flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Sliders className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-text-main italic line-clamp-1">
                Translation{" "}
                <span className="text-primary text-glow">Settings</span>
              </h2>
              <p className="text-xs font-bold text-text-dark uppercase tracking-widest mt-1">
                Visual Appearance & Engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-surface-raised hover:bg-surface-elevated text-text-dark hover:text-text-main transition-all flex items-center justify-center border border-border-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Target Language */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Languages className="w-4 h-4" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                Target Language
              </label>
            </div>
            <select
              value={settings.targetLanguage}
              onChange={(e) => handleChange("targetLanguage", e.target.value)}
              className="w-full bg-surface-raised border border-border-muted rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 ring-primary outline-none text-text-main transition-all hover:border-border-accent"
            >
              <option value="Turkish">Turkish</option>
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="Japanese">Japanese</option>
              <option value="French">French</option>
              <option value="German">German</option>
            </select>
          </div>

          <div className="h-px bg-white/5"></div>

          {/* Model Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Cpu className="w-4 h-4" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                AI Intelligence Model
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {GEMINI_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleChange("model", m.id)}
                  className={`flex flex-col p-4 rounded-2xl border transition-all text-left group ${
                    settings.model === m.id
                      ? "bg-primary/10 border-primary shadow-glow ring-1 ring-primary"
                      : "bg-surface-raised/50 border-border-muted hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-black uppercase tracking-wider ${settings.model === m.id ? "text-primary text-glow" : "text-text-main"}`}
                    >
                      {m.name}
                    </span>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/20 border border-white/5">
                      <DollarSign className="w-3 h-3 text-emerald-500" />
                      <span className="text-[9px] font-black text-emerald-500">
                        {m.inputCostPer1k === 0
                          ? "FREE"
                          : `$${m.inputCostPer1k}/1k`}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-text-dark/60 leading-relaxed">
                    {m.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-white/5"></div>

          {/* AI Custom Instructions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-4 h-4" />
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  AI Prompt Guidelines
                </label>
              </div>
              <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest bg-primary/5 px-2 py-1 rounded border border-primary/10">
                Extension
              </span>
            </div>
            <div className="relative group">
              <textarea
                value={settings.customInstructions || ""}
                onChange={(e) =>
                  handleChange("customInstructions", e.target.value)
                }
                placeholder="Example: Keep sound effects in Japanese but add small Turkish translations below them..."
                className="w-full bg-surface-raised border border-border-muted rounded-2xl px-5 py-4 text-xs font-medium focus:ring-2 ring-primary outline-none text-text-main transition-all min-h-[120px] resize-none placeholder:text-text-muted/30"
              />
              <div className="absolute bottom-4 right-4 text-[9px] font-bold text-text-dark/40 uppercase tracking-widest pointer-events-none">
                Guideline #6+
              </div>
            </div>
            <p className="text-[9px] font-bold text-text-dark/60 uppercase tracking-tighter leading-relaxed">
              Every new line will be added as a strict guideline to the AI
              engine (e.g. Rule #6, #7...).
            </p>
          </div>

          <div className="h-px bg-white/5"></div>

          {/* Font Size */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Text className="w-4 h-4" />
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Max Font Size
                </label>
              </div>
              <span className="text-sm font-mono font-black text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
                {settings.fontSize}px
              </span>
            </div>
            <div className="px-2">
              <input
                type="range"
                min="10"
                max="60"
                value={settings.fontSize}
                onChange={(e) =>
                  handleChange("fontSize", parseInt(e.target.value))
                }
                className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between mt-2 text-[10px] font-bold text-text-dark uppercase tracking-widest">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/5"></div>

          {/* Appearance / Colors */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Palette className="w-4 h-4" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                Appearance
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Font Color */}
              <div className="bg-surface-raised/50 p-4 rounded-2xl border border-border-muted hover:border-primary/30 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <Baseline className="w-4 h-4 text-text-dark group-hover:text-primary transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-dark/80">
                    Font
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.fontColor}
                    onChange={(e) => handleChange("fontColor", e.target.value)}
                    className="w-10 h-10 rounded-xl border-2 border-border-muted bg-transparent cursor-pointer hover:scale-105 transition-transform"
                  />
                  <span className="text-xs font-mono text-text-dark uppercase">
                    {settings.fontColor}
                  </span>
                </div>
              </div>

              {/* Stroke Color */}
              <div className="bg-surface-raised/50 p-4 rounded-2xl border border-border-muted hover:border-primary/30 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <Baseline className="w-4 h-4 text-text-dark group-hover:text-primary transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-dark/80">
                    Stroke
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={
                      settings.strokeColor === "transparent"
                        ? "#000000"
                        : settings.strokeColor
                    }
                    onChange={(e) =>
                      handleChange("strokeColor", e.target.value)
                    }
                    className="w-10 h-10 rounded-xl border-2 border-border-muted bg-transparent cursor-pointer hover:scale-105 transition-transform"
                  />
                  <span className="text-xs font-mono text-text-dark uppercase">
                    {settings.strokeColor}
                  </span>
                </div>
              </div>

              {/* Bubble Color */}
              <div className="bg-surface-raised/50 p-4 rounded-2xl border border-border-muted hover:border-primary/30 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <Square className="w-4 h-4 text-text-dark group-hover:text-primary transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-dark/80">
                    Bubble
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={
                      settings.backgroundColor === "transparent"
                        ? "#000000"
                        : settings.backgroundColor
                    }
                    onChange={(e) =>
                      handleChange("backgroundColor", e.target.value)
                    }
                    className="w-10 h-10 rounded-xl border-2 border-border-muted bg-transparent cursor-pointer hover:scale-105 transition-transform"
                  />
                  <span className="text-xs font-mono text-text-dark uppercase">
                    {settings.backgroundColor}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/5"></div>

          {/* Account Security (Password Change) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Lock className="w-4 h-4" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                Security
              </label>
            </div>

            <PasswordChangeForm />
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 bg-surface-raised/30 border-t border-border-subtle">
          <button
            onClick={onClose}
            className="w-full py-4 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] border border-white/10"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
