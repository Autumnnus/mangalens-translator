import { Archive, Download, LogOut, Settings, Tags, Upload } from "lucide-react";
import { signOut } from "next-auth/react";
import React, { useCallback, useRef, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useUIStore } from "../../stores/useUIStore";
import { cn } from "../../utils/cn";
import { IconButton, Menu } from "../ui";

interface SidebarFooterProps {
  isSidebarCollapsed: boolean;
  isViewOnly: boolean;
}

/** Sidebar footer: Categories, Settings, Backup (export / import) and Sign out. */
const SidebarFooter: React.FC<SidebarFooterProps> = ({
  isSidebarCollapsed,
  isViewOnly,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirm } = useConfirm();
  const showToast = useUIStore((state) => state.showToast);
  const toggleCategoryModal = useUIStore((state) => state.toggleCategoryModal);
  const toggleSettingsModal = useUIStore((state) => state.toggleSettingsModal);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mangalens-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast("Backup exported.", "success", 3000);
    } catch (e) {
      showToast(
        `Export failed: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setIsExporting(false);
    }
  }, [showToast]);

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
          showToast("Backup restored. Reloading…", "success", 3000);
          window.location.reload();
        } else {
          throw new Error(json.error || "Unknown error");
        }
      } catch (err: Error | unknown) {
        console.error("Import error:", err);
        showToast(
          `Import failed: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      } finally {
        setIsImporting(false);
        if (e.target) {
          e.target.value = "";
        }
      }
    },
    [showToast],
  );

  const handleLogout = () => {
    confirm({
      title: "Sign out",
      message: "Sign out of MangaLens?",
      onConfirm: () => signOut(),
      type: "danger",
    });
  };

  const busy = isExporting || isImporting;

  return (
    <footer
      className={cn(
        "flex shrink-0 items-center border-t border-line",
        isSidebarCollapsed
          ? "flex-col gap-1 py-2"
          : "justify-between px-2 py-1.5",
      )}
    >
      {!isViewOnly && (
        <>
          <IconButton label="Categories" onClick={() => toggleCategoryModal(true)}>
            <Tags />
          </IconButton>
          <IconButton label="Settings" onClick={() => toggleSettingsModal(true)}>
            <Settings />
          </IconButton>
          <Menu
            align="left"
           
            items={[
              {
                label: "Export backup",
                icon: <Download />,
                onSelect: () => void handleExport(),
                disabled: busy,
              },
              {
                label: "Import backup…",
                icon: <Upload />,
                onSelect: () => fileInputRef.current?.click(),
                disabled: busy,
              },
            ]}
            trigger={(props) => (
              <IconButton
                label={
                  isExporting
                    ? "Exporting backup"
                    : isImporting
                      ? "Importing backup"
                      : "Backup"
                }
                loading={busy}
                {...props}
              >
                <Archive />
              </IconButton>
            )}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleImport}
          />
        </>
      )}

      <IconButton label="Sign out" variant="danger" onClick={handleLogout}>
        <LogOut />
      </IconButton>
    </footer>
  );
};

export default React.memo(SidebarFooter);
