import { PanelLeftClose, PanelLeftOpen, ScanFace, X } from "lucide-react";
import React from "react";
import { cn } from "../../utils/cn";
import { IconButton } from "../ui";

interface SidebarHeaderProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (value: boolean) => void;
  /** Closes the off-canvas sidebar on small screens. */
  onCloseMobile?: () => void;
}

const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  onCloseMobile,
}) => (
  <header
    className={cn(
      "flex h-12 shrink-0 items-center border-b border-line",
      isSidebarCollapsed ? "justify-center px-1" : "justify-between pl-3 pr-2",
    )}
  >
    {!isSidebarCollapsed && (
      <div className="flex min-w-0 items-center gap-2">
        <ScanFace aria-hidden="true" className="h-4 w-4 shrink-0 text-action" />
        <span className="truncate text-sm font-semibold text-ink">MangaLens</span>
      </div>
    )}

    <IconButton
      label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="hidden md:inline-flex"
      onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
    >
      {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </IconButton>

    {onCloseMobile && (
      <IconButton
        label="Close series list"
        className="md:hidden"
        onClick={onCloseMobile}
      >
        <X />
      </IconButton>
    )}
  </header>
);

export default React.memo(SidebarHeader);
