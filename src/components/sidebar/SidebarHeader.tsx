import { X } from "lucide-react";
import React from "react";

interface SidebarHeaderProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (value: boolean) => void;
  setIsMobileOpen: (value: boolean) => void;
}

const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  setIsMobileOpen,
}) => {
  return (
    <div
      className={`p-6 flex items-center ${
        isSidebarCollapsed ? "justify-center" : "justify-between"
      } border-b border-border-muted`}
    >
      {!isSidebarCollapsed && (
        <div className="flex items-center gap-3">
          <h5 className="text-xl font-black tracking-tighter uppercase leading-none italic select-none">
            Manga<span className="text-primary text-glow">Lens</span>
          </h5>
        </div>
      )}
      <button
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className="w-8 h-8 rounded-xl bg-surface-raised hover:bg-surface-elevated text-text-muted hover:text-text-main flex items-center justify-center transition-all md:flex hidden border border-border-muted"
      >
        <i
          className={`fas fa-chevron-${
            isSidebarCollapsed ? "right" : "left"
          } text-xs`}
        ></i>
      </button>
      <button
        onClick={() => setIsMobileOpen(false)}
        className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors md:hidden"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default React.memo(SidebarHeader);
