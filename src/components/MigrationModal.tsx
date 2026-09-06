import { useConfirm } from "@/hooks/useConfirm";
import { describeJob, isActiveJob, usePageJobs } from "@/hooks/usePageJobs";
import { seriesKeys, useSeriesImagesQuery } from "@/hooks/useSeriesQueries";
import {
  dropSeriesLegacy,
  pageMigrationAction,
  startMigration,
} from "@/services/migration.service";
import { useUIStore } from "@/stores/useUIStore";
import { ProcessedImage, ViewMode } from "@/types";
import { resolveImageUrl } from "@/utils/url";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import ComparisonView from "./ComparisonView";

type Busy = null | "start" | "redetect" | "cleanup" | "page";

/**
 * Migration panel for a series: moves flattened v1 pages to layout v2 (free,
 * from stored bubbles, or with Gemini re-detection), then lets the user
 * compare old and new renders page by page, revert, or drop the old files.
 */
const MigrationModal: React.FC = () => {
  const seriesId = useUIStore((state) => state.migrationSeriesId);
  const closeMigration = useUIStore((state) => state.closeMigration);
  const openLayoutEditor = useUIStore((state) => state.openLayoutEditor);
  const showToast = useUIStore((state) => state.showToast);
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const { data: imagesData } = useSeriesImagesQuery(seriesId);
  const { byImage, activeJobs } = usePageJobs(seriesId);
  const images = useMemo(() => imagesData || [], [imagesData]);

  const [busy, setBusy] = useState<Busy>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("slider");

  const legacyPages = useMemo(
    () => images.filter((image) => image.layoutVersion === 1 && !!image.translatedUrl),
    [images],
  );
  const migratedPages = useMemo(
    () => images.filter((image) => image.layoutVersion === 2 && !!image.legacyTranslatedUrl),
    [images],
  );
  const freeCount = legacyPages.filter((image) => image.hasLegacyBubbles).length;
  const needsRedetect = legacyPages.length - freeCount;
  const migrationJobs = activeJobs.filter((job) => job.provider === "migration" || job.provider === "gemini");

  const reviewList = useMemo(
    () => [...migratedPages, ...legacyPages].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [migratedPages, legacyPages],
  );
  const selected = reviewList.find((image) => image.id === selectedId) || null;
  const selectedIndex = selected ? reviewList.indexOf(selected) : -1;

  useEffect(() => {
    if (!selectedId && reviewList.length > 0) setSelectedId(reviewList[0].id);
    if (selectedId && !reviewList.some((image) => image.id === selectedId)) {
      setSelectedId(reviewList[0]?.id || null);
    }
  }, [reviewList, selectedId]);

  useEffect(() => {
    setPreviewUrl(null);
  }, [selectedId]);

  const refresh = () => {
    if (!seriesId) return;
    queryClient.invalidateQueries({ queryKey: seriesKeys.images(seriesId) });
    queryClient.invalidateQueries({ queryKey: seriesKeys.lists() });
  };

  if (!seriesId) return null;

  const runStart = async (strategy: "legacy" | "redetect", imageIds?: string[]) => {
    setBusy(strategy === "legacy" ? "start" : "redetect");
    try {
      const result = await startMigration(seriesId, strategy, imageIds);
      showToast(
        `${result.queued} sayfa kuyruğa alındı${result.skipped ? `, ${result.skipped} sayfa baloncuk verisi olmadığı için atlandı` : ""}.`,
        "success",
        5000,
      );
      queryClient.invalidateQueries({ queryKey: ["page-jobs", seriesId] });
      refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error", 6000);
    } finally {
      setBusy(null);
    }
  };

  const startAll = () => {
    if (freeCount === 0) return;
    confirm({
      title: "Eski sayfaları taşı",
      message: `${freeCount} sayfa eski baloncuk verisinden yeniden dizilecek. Gemini çağrısı yapılmaz. Eski render'lar incelemen için saklanır.`,
      type: "warning",
      onConfirm: () => void runStart("legacy"),
    });
  };

  const startRedetect = (imageIds?: string[]) => {
    const count = imageIds ? imageIds.length : legacyPages.length;
    if (count === 0) return;
    confirm({
      title: "Gemini ile yeniden tespit",
      message: `${count} sayfa Gemini Vision ile baştan tespit edilip çevrilecek. Token maliyeti oluşur. Eski render'lar saklanır.`,
      type: "warning",
      onConfirm: () => void runStart("redetect", imageIds),
    });
  };

  const cleanup = () => {
    if (migratedPages.length === 0) return;
    confirm({
      title: "Eski render'ları sil",
      message: `${migratedPages.length} sayfanın eski render dosyası kalıcı olarak silinecek. Bu sayfalarda geri alma artık mümkün olmaz.`,
      type: "danger",
      onConfirm: async () => {
        setBusy("cleanup");
        try {
          const result = await dropSeriesLegacy(seriesId);
          showToast(`${result.deleted} eski render silindi.`, "success", 4000);
          refresh();
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error), "error", 6000);
        } finally {
          setBusy(null);
        }
      },
    });
  };

  const pageAction = async (image: ProcessedImage, action: "preview" | "apply" | "revert" | "drop-legacy") => {
    setBusy("page");
    try {
      const result = await pageMigrationAction(image.id, action);
      if (action === "preview" && result.url) {
        setPreviewUrl(result.url);
      } else {
        showToast(
          action === "apply"
            ? "Sayfa yeni sisteme taşındı."
            : action === "revert"
              ? "Eski render geri getirildi."
              : "Eski render silindi.",
          "success",
          3500,
        );
        setPreviewUrl(null);
        refresh();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error", 6000);
    } finally {
      setBusy(null);
    }
  };

  const selectedJob = selected ? byImage.get(selected.id) : undefined;
  const selectedActive = selectedJob && isActiveJob(selectedJob) ? selectedJob : null;
  const isMigrated = !!selected && selected.layoutVersion === 2 && !!selected.legacyTranslatedUrl;
  const comparisonPair =
    selected && (isMigrated || previewUrl)
      ? {
          id: selected.id,
          title: selected.fileName,
          sourceUrl: resolveImageUrl(isMigrated ? selected.legacyTranslatedUrl! : selected.translatedUrl),
          convertedUrl: resolveImageUrl(isMigrated ? selected.translatedUrl : previewUrl),
          createdAt: 0,
        }
      : null;

  return (
    <div className="fixed inset-0 z-[140] flex flex-col bg-background text-text-main">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-muted bg-surface/80 px-4 backdrop-blur-md">
        <ArrowLeftRight className="h-4 w-4 text-amber-400" />
        <div>
          <p className="text-sm font-bold">Yeni sisteme taşıma</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-dark">
            {legacyPages.length} eski sayfa · {migratedPages.length} incelenecek · {migrationJobs.length} aktif iş
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={startAll}
            disabled={busy !== null || freeCount === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-glow hover:bg-primary-hover disabled:opacity-40"
          >
            {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
            Tümünü taşı ({freeCount}, ücretsiz)
          </button>
          <button
            type="button"
            onClick={() => startRedetect()}
            disabled={busy !== null || legacyPages.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-border-muted px-3 py-2 text-[10px] font-black uppercase tracking-wider hover:border-primary/60 disabled:opacity-40"
            title={needsRedetect ? `${needsRedetect} sayfanın baloncuk verisi yok, sadece bu yolla taşınabilir` : undefined}
          >
            {busy === "redetect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Gemini ile yeniden tespit ({legacyPages.length})
          </button>
          <button
            type="button"
            onClick={cleanup}
            disabled={busy !== null || migratedPages.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          >
            {busy === "cleanup" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eski render&apos;ları sil ({migratedPages.length})
          </button>
          <button type="button" onClick={closeMigration} className="ml-1 rounded-lg p-2 text-text-dark hover:text-text-main" title="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="custom-scrollbar w-72 shrink-0 overflow-y-auto border-r border-border-muted bg-surface/60 p-3">
          {reviewList.length === 0 ? (
            <p className="text-xs text-text-muted">Bu seride taşınacak ya da incelenecek sayfa yok.</p>
          ) : (
            <div className="space-y-1.5">
              {reviewList.map((image) => {
                const job = byImage.get(image.id);
                const active = job && isActiveJob(job) ? job : null;
                const migrated = image.layoutVersion === 2 && !!image.legacyTranslatedUrl;
                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setSelectedId(image.id)}
                    className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left ${
                      image.id === selectedId ? "border-primary/60 bg-primary/10" : "border-border-muted bg-surface-raised/40 hover:border-primary/40"
                    }`}
                  >
                    <span className="w-6 shrink-0 text-[10px] font-black text-text-dark">{image.sequenceNumber}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{image.fileName}</span>
                      <span className={`block text-[9px] font-black uppercase tracking-wider ${active ? "text-primary" : migrated ? "text-emerald-400" : image.hasLegacyBubbles ? "text-amber-300" : "text-red-300"}`}>
                        {active ? describeJob(active) : migrated ? "Taşındı · incele" : image.hasLegacyBubbles ? "Eski (ücretsiz taşınabilir)" : "Eski (veri yok, yeniden tespit)"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-muted bg-surface/60 px-4 text-[10px] font-black uppercase tracking-wider text-text-dark">
                <button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(reviewList[selectedIndex - 1].id)} className="rounded-lg border border-border-muted p-1 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={selectedIndex >= reviewList.length - 1} onClick={() => setSelectedId(reviewList[selectedIndex + 1].id)} className="rounded-lg border border-border-muted p-1 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                <span className="truncate text-text-main">{selected.fileName}</span>
                {comparisonPair && (
                  <span className="ml-3 flex items-center gap-1">
                    {(["slider", "side-by-side", "toggle"] as ViewMode[]).map((item) => (
                      <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-lg px-2 py-1 ${mode === item ? "bg-primary/15 text-primary" : "hover:text-text-main"}`}>
                        {item.replace(/-/g, " ")}
                      </button>
                    ))}
                    <span className="ml-2 text-text-dark">Sol: eski · Sağ: yeni</span>
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {selectedActive ? (
                    <span className="flex items-center gap-1.5 text-primary"><Loader2 className="h-3 w-3 animate-spin" /> {describeJob(selectedActive)}</span>
                  ) : isMigrated ? (
                    <>
                      <button type="button" onClick={() => openLayoutEditor(selected)} className="rounded-lg border border-border-muted px-2.5 py-1.5 hover:border-primary/60">Editörde aç</button>
                      <button type="button" disabled={busy !== null} onClick={() => pageAction(selected, "revert")} className="flex items-center gap-1 rounded-lg border border-border-muted px-2.5 py-1.5 hover:border-amber-500/60 disabled:opacity-40"><Undo2 className="h-3 w-3" /> Eskiye dön</button>
                      <button type="button" disabled={busy !== null} onClick={() => pageAction(selected, "drop-legacy")} className="flex items-center gap-1 rounded-lg border border-emerald-500/50 px-2.5 py-1.5 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40">Kabul et, eskiyi sil</button>
                    </>
                  ) : (
                    <>
                      {selected.hasLegacyBubbles && (
                        <button type="button" disabled={busy !== null} onClick={() => pageAction(selected, "preview")} className="rounded-lg border border-border-muted px-2.5 py-1.5 hover:border-primary/60 disabled:opacity-40">
                          {busy === "page" ? "…" : "Önizle (ücretsiz)"}
                        </button>
                      )}
                      {selected.hasLegacyBubbles && previewUrl && (
                        <button type="button" disabled={busy !== null} onClick={() => pageAction(selected, "apply")} className="rounded-lg bg-primary px-2.5 py-1.5 text-white hover:bg-primary-hover disabled:opacity-40">Uygula</button>
                      )}
                      <button type="button" disabled={busy !== null} onClick={() => startRedetect([selected.id])} className="flex items-center gap-1 rounded-lg border border-border-muted px-2.5 py-1.5 hover:border-primary/60 disabled:opacity-40"><Sparkles className="h-3 w-3" /> Yeniden tespit</button>
                    </>
                  )}
                </span>
              </div>
              <div className="min-h-0 flex-1 bg-black/60 p-4">
                {comparisonPair ? (
                  <ComparisonView pair={comparisonPair} mode={mode} />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <img src={resolveImageUrl(selected.translatedUrl || selected.originalUrl)} alt={selected.fileName} className="max-h-full max-w-full object-contain" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Sol listeden bir sayfa seç.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MigrationModal;
