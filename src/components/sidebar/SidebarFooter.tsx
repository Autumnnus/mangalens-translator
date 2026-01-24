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
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
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
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);

      try {
        const res = await fetch("/api/backup/import", {
          method: "POST",
          body: file, // Send file directly as binary
          headers: {
            "Content-Type": "application/zip",
          },
        });

        const contentType = res.headers.get("content-type");
        if (!res.ok) {
          let errorMessage = "Import failed";
          if (contentType?.includes("application/json")) {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            errorMessage = `Server error: ${res.status} ${res.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const json = await res.json();
        if (json.success) {
          alert("Backup restored successfully!");
          window.location.reload();
        } else {
          throw new Error(json.error || "Unknown error occurred");
        }
      } catch (err: Error | unknown) {
        console.error("Import error:", err);
        alert(
          "Import failed: " +
            (err instanceof Error ? err.message : String(err)),
        );
      } finally {
        setIsImporting(false);
        if (e.target) {
          e.target.value = "";
        }
      }
    },
    [],
  );

  if (isSidebarCollapsed || isViewOnly) return null;

  return (
    <div className="p-4 border-t border-slate-800 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 bg-slate-800/50 hover:bg-indigo-600/20 border border-slate-700/50 hover:border-indigo-500/50 p-2 rounded-xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export Backup"
        >
          {isExporting ? (
            <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400" />
          )}
          <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 uppercase tracking-wider">
            {isExporting ? "Busy" : "Export"}
          </span>
        </button>

        <div className="relative">
          <input
            type="file"
            accept=".zip"
            disabled={isImporting}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
            onChange={handleImport}
          />
          <button
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-2 bg-slate-800/50 hover:bg-emerald-600/20 border border-slate-700/50 hover:border-emerald-500/50 p-2 rounded-xl transition-all group disabled:opacity-50"
            title="Import Backup"
          >
            {isImporting ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
            )}
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-emerald-400 uppercase tracking-wider">
              {isImporting ? "Busy" : "Import"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(SidebarFooter);
