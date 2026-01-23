import { Download, Upload } from "lucide-react";
import React, { useCallback } from "react";

interface SidebarFooterProps {
  isSidebarCollapsed: boolean;
  isViewOnly: boolean;
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({
  isSidebarCollapsed,
  isViewOnly,
}) => {
  const handleExport = useCallback(async () => {
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mangalens-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      alert("Export failed: " + e);
    }
  }, []);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!confirm("This will merge/restore data. Continue?")) return;

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/backup/import", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.success) {
          alert("Backup restored successfully!");
          window.location.reload();
        } else {
          throw new Error(json.error);
        }
      } catch (err: Error | unknown) {
        alert("Import failed: " + (err as Error).message);
      }
      e.target.value = "";
    },
    [],
  );

  if (isSidebarCollapsed || isViewOnly) return null;

  return (
    <div className="p-4 border-t border-slate-800 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 bg-slate-800/50 hover:bg-indigo-600/20 border border-slate-700/50 hover:border-indigo-500/50 p-2 rounded-xl transition-all group"
          title="Export Backup"
        >
          <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400" />
          <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 uppercase tracking-wider">
            Export
          </span>
        </button>

        <div className="relative">
          <input
            type="file"
            accept=".zip"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            onChange={handleImport}
          />
          <button
            className="w-full flex items-center justify-center gap-2 bg-slate-800/50 hover:bg-emerald-600/20 border border-slate-700/50 hover:border-emerald-500/50 p-2 rounded-xl transition-all group"
            title="Import Backup"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-emerald-400 uppercase tracking-wider">
              Import
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SidebarFooter);
