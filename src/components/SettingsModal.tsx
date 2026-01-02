import {
  Baseline,
  Languages,
  Palette,
  Sliders,
  Square,
  Text,
  X,
} from "lucide-react";
import React from "react";
import { TranslationSettings } from "../types";

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

  const handleChange = (key: keyof TranslationSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(79,70,229,0.5)] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sliders className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white italic">
                Translation <span className="text-indigo-400">Settings</span>
              </h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                Visual Appearance & Engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Target Language */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Languages className="w-4 h-4" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em]">
                Target Language
              </label>
            </div>
            <select
              value={settings.targetLanguage}
              onChange={(e) => handleChange("targetLanguage", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 ring-indigo-500 outline-none text-white transition-all hover:border-slate-600"
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

          {/* Font Size */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-400">
                <Text className="w-4 h-4" />
                <label className="text-[10px] font-black uppercase tracking-[0.2em]">
                  Max Font Size
                </label>
              </div>
              <span className="text-sm font-mono font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
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
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/5"></div>

          {/* Appearance / Colors */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Palette className="w-4 h-4" />
              <label className="text-[10px] font-black uppercase tracking-[0.2em]">
                Appearance
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Font Color */}
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <Baseline className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Font
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settings.fontColor}
                    onChange={(e) => handleChange("fontColor", e.target.value)}
                    className="w-10 h-10 rounded-xl border-2 border-slate-700 bg-transparent cursor-pointer hover:scale-105 transition-transform"
                  />
                  <span className="text-xs font-mono text-slate-500 uppercase">
                    {settings.fontColor}
                  </span>
                </div>
              </div>

              {/* Stroke Color */}
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <Baseline className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
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
                    className="w-10 h-10 rounded-xl border-2 border-slate-700 bg-transparent cursor-pointer hover:scale-105 transition-transform"
                  />
                  <span className="text-xs font-mono text-slate-500 uppercase">
                    {settings.strokeColor}
                  </span>
                </div>
              </div>

              {/* Bubble Color */}
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 hover:border-indigo-500/30 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <Square className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
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
                    className="w-10 h-10 rounded-xl border-2 border-slate-700 bg-transparent cursor-pointer hover:scale-105 transition-transform"
                  />
                  <span className="text-xs font-mono text-slate-500 uppercase">
                    {settings.backgroundColor}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-800/30 border-t border-white/5">
          <button
            onClick={onClose}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 active:scale-[0.98]"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
