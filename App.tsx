import { Eye, Settings } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import CategoryManagerModal from "./components/CategoryManagerModal";
import ComparisonView from "./components/ComparisonView";
import NewSeriesModal from "./components/NewSeriesModal";
import SeriesSidebar from "./components/SeriesSidebar";
import ViewModeControls from "./components/ViewModeControls";
import { GeminiService } from "./services/gemini";
import {
  ProcessedImage,
  Series,
  TranslationSettings,
  UsageMetadata,
  ViewMode,
} from "./types";
import { imageDb } from "./utils/db";
import { createTranslatedImage } from "./utils/image";
import { extractImagesFromPdf } from "./utils/pdf";

declare const JSZip: any;
declare const saveAs: any;

const INPUT_COST_PER_1K = 0.0005;
const OUTPUT_COST_PER_1K = 0.003;

const App: React.FC = () => {
  const [series, setSeries] = useState<Series[]>(() => {
    const saved = localStorage.getItem("mangalens_series");
    if (saved) {
      try {
        const loadedSeries = JSON.parse(saved) as Series[];
        // Migration: add updatedAt if missing
        return loadedSeries.map((s) => ({
          ...s,
          updatedAt: s.updatedAt || s.createdAt,
        }));
      } catch (e) {
        console.error("Failed to load series", e);
      }
    }
    const now = Date.now();
    return [
      {
        id: "default",
        name: "Untitled Project",
        description: "Default collection",
        images: [],
        category: "Uncategorized",
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
  });

  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("mangalens_categories");
    return saved
      ? JSON.parse(saved)
      : ["Manga", "Manhwa", "Webtoon", "Comic", "Uncategorized"];
  });

  useEffect(() => {
    localStorage.setItem("mangalens_categories", JSON.stringify(categories));
  }, [categories]);

  const [activeSeriesId, setActiveSeriesId] = useState<string>(() => {
    return series.length > 0 ? series[0].id : "default";
  });

  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showComparison, setShowComparison] = useState(false);

  const activeSeries = useMemo(
    () => series.find((s) => s.id === activeSeriesId) || series[0],
    [series, activeSeriesId]
  );

  const images = activeSeries?.images || [];

  const setImages = (arg: React.SetStateAction<ProcessedImage[]>) => {
    setSeries((prev) => {
      const idx = prev.findIndex((s) => s.id === activeSeriesId);
      if (idx === -1) return prev;

      const currentImages = prev[idx].images;
      const newImages =
        typeof arg === "function" ? (arg as any)(currentImages) : arg;

      const newSeries = [...prev];
      newSeries[idx] = {
        ...newSeries[idx],
        images: newImages,
        updatedAt: Date.now(),
      };
      return newSeries;
    });
  };

  useEffect(() => {
    localStorage.setItem("mangalens_series", JSON.stringify(series));
  }, [series]);

  // Rehydration: Restore blob URLs from IndexedDB on mount
  useEffect(() => {
    const rehydrate = async () => {
      let changed = false;
      const newSeries = await Promise.all(
        series.map(async (s) => {
          const newImages = await Promise.all(
            s.images.map(async (img) => {
              let updatedImg = { ...img };
              let imgChanged = false;

              // Check if URLs are invalid (blob URLs from previous session)
              const needsOriginal = img.originalUrl?.startsWith("blob:");
              const needsTranslated = img.translatedUrl?.startsWith("blob:");

              if (needsOriginal || !img.originalUrl) {
                const blob = await imageDb.getImage(img.id, "original");
                if (blob) {
                  updatedImg.originalUrl = URL.createObjectURL(blob);
                  imgChanged = true;
                }
              }

              if (needsTranslated) {
                const blob = await imageDb.getImage(img.id, "translated");
                if (blob) {
                  updatedImg.translatedUrl = URL.createObjectURL(blob);
                  imgChanged = true;
                }
              }

              if (imgChanged) changed = true;
              return updatedImg;
            })
          );
          return { ...s, images: newImages };
        })
      );

      if (changed) {
        setSeries(newSeries);
      }
    };

    rehydrate();
  }, []);

  const [settings, setSettings] = useState<TranslationSettings>({
    targetLanguage: "Turkish",
    fontSize: 24, // Increased base size, logic will downscale if needed
    fontColor: "#000000",
    backgroundColor: "#ffffff",
    strokeColor: "#ffffff",
  });
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ViewMode>("slider");

  const geminiService = useRef(new GeminiService());

  const totalStats = useMemo(() => {
    return images.reduce(
      (acc, img) => ({
        tokens: acc.tokens + (img.usage?.totalTokenCount || 0),
        cost: acc.cost + (img.cost || 0),
      }),
      { tokens: 0, cost: 0 }
    );
  }, [images]);

  const calculateCost = (usage: UsageMetadata) => {
    const inputCost = (usage.promptTokenCount / 1000) * INPUT_COST_PER_1K;
    const outputCost = (usage.candidatesTokenCount / 1000) * OUTPUT_COST_PER_1K;
    return inputCost + outputCost;
  };

  const urlToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Error converting URL to Base64:", url, e);
      throw e;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let rehydratedImages: ProcessedImage[] = [];
    for (const file of Array.from(files) as File[]) {
      if (file.type === "application/pdf") {
        try {
          const extracted = await extractImagesFromPdf(file);
          for (const img of extracted) {
            const id = Math.random().toString(36).substring(2, 11);
            const res = await fetch(img.url);
            const blob = await res.blob();
            await imageDb.saveImage(id, "original", blob);
            rehydratedImages.push({
              id,
              fileName: img.name,
              originalUrl: URL.createObjectURL(blob), // Use Blob URL instead of Data URL
              translatedUrl: null,
              status: "idle" as const,
              bubbles: [],
            });
          }
        } catch (err) {
          console.error("PDF extraction failed", err);
        }
      } else {
        const id = Math.random().toString(36).substring(2, 11);
        await imageDb.saveImage(id, "original", file);
        rehydratedImages.push({
          id,
          fileName: file.name,
          originalUrl: URL.createObjectURL(file),
          translatedUrl: null,
          status: "idle" as const,
          bubbles: [],
        });
      }
    }

    setImages((prev) => [...prev, ...rehydratedImages]);
    e.target.value = "";
  };

  const processImage = async (
    image: ProcessedImage,
    retryCount = 0
  ): Promise<boolean> => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === image.id ? { ...img, status: "processing" } : img
      )
    );

    try {
      const base64 = await urlToBase64(image.originalUrl);
      const { bubbles, usage } = await geminiService.current.translateImage(
        base64,
        settings.targetLanguage
      );
      const translatedUrl = await createTranslatedImage(
        image.originalUrl,
        bubbles,
        settings
      );
      const cost = calculateCost(usage);

      // Save translated image to IDB
      let finalTranslatedUrl = translatedUrl;
      try {
        const tRes = await fetch(translatedUrl);
        const tBlob = await tRes.blob();
        await imageDb.saveImage(image.id, "translated", tBlob);
        // If it was a Data URL, convert it to a Blob URL to save localStorage space
        if (translatedUrl.startsWith("data:")) {
          finalTranslatedUrl = URL.createObjectURL(tBlob);
        }
      } catch (e) {
        console.error("Failed to save translated image to DB", e);
      }

      setImages((prev) =>
        prev.map((img) =>
          img.id === image.id
            ? {
                ...img,
                status: "completed",
                bubbles,
                translatedUrl: finalTranslatedUrl,
                usage,
                cost,
              }
            : img
        )
      );
      return true;
    } catch (error: any) {
      const errorStr = (error?.message || "").toLowerCase();
      const isRateLimit =
        errorStr.includes("429") ||
        errorStr.includes("limit") ||
        errorStr.includes("quota");

      if (isRateLimit && retryCount < 8) {
        const backoff = Math.pow(2, retryCount) * 2000;
        console.warn(
          `Rate limit hit for ${image.fileName}. Retrying in ${
            backoff / 1000
          }s... (Attempt ${retryCount + 1})`
        );
        await new Promise((r) => setTimeout(r, backoff));
        return processImage(image, retryCount + 1);
      }

      console.error("Processing failed for", image.fileName, error);
      setImages((prev) =>
        prev.map((img) =>
          img.id === image.id ? { ...img, status: "error" } : img
        )
      );
      return false;
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    for (const image of images) {
      if (image.status === "idle" || image.status === "error") {
        await processImage(image);
      }
    }
    setIsProcessingAll(false);
  };

  const downloadSingle = async (image: ProcessedImage) => {
    const url = image.translatedUrl || image.originalUrl;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `translated_${image.fileName}`);
    } catch (e) {
      console.error("Single download failed:", e);
    }
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    const newImages = [...images];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    [newImages[index], newImages[targetIndex]] = [
      newImages[targetIndex],
      newImages[index],
    ];
    setImages(newImages);
  };

  const downloadAllAsZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(activeSeries.name.replace(/[^a-z0-9]/gi, "_"));

    // Create a clean version of series for JSON export (without blob URLs)
    const cleanedSeries = {
      ...activeSeries,
      images: activeSeries.images.map((img, idx) => {
        const paddedIndex = (idx + 1).toString().padStart(3, "0");
        const extension = img.fileName.split(".").pop() || "jpg";
        return {
          ...img,
          originalUrl: `${paddedIndex}_source.${extension}`,
          translatedUrl: img.translatedUrl
            ? `${paddedIndex}_translated.${extension}`
            : null,
        };
      }),
    };

    // Save metadata
    folder.file("series.json", JSON.stringify(cleanedSeries, null, 2));

    for (let idx = 0; idx < images.length; idx++) {
      const img = images[idx];
      try {
        const extension = img.fileName.split(".").pop() || "jpg";
        const paddedIndex = (idx + 1).toString().padStart(3, "0");

        // Save Source
        const sourceData = await urlToBase64(img.originalUrl);
        folder.file(`${paddedIndex}_source.${extension}`, sourceData, {
          base64: true,
        });

        // Save Translated if exists
        if (img.translatedUrl && img.translatedUrl !== img.originalUrl) {
          const translatedData = await urlToBase64(img.translatedUrl as string);
          folder.file(
            `${paddedIndex}_translated.${extension}`,
            translatedData,
            { base64: true }
          );
        }
      } catch (e) {
        console.error(`Failed to add ${img.fileName} to ZIP:`, e);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${activeSeries.name}_export.zip`);
  };

  const handleImportLibrary = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const zip = await JSZip.loadAsync(file);
      const newSeries: Series[] = [];

      // Detect if this is a full library export (has subfolders as series) or single series
      // Quick check: look for folders at root
      const rootEntries = Object.keys(zip.files).filter(
        (path) => !path.includes("/")
      );

      // We'll traverse all folders looking for "series.json"
      const seriesFolders = new Set<string>();

      zip.forEach((relativePath, zipEntry) => {
        if (relativePath.endsWith("series.json") && !zipEntry.dir) {
          // Extract folder path, e.g., "MySeries/series.json" -> "MySeries/"
          const folderPath = relativePath.replace("series.json", "");
          seriesFolders.add(folderPath);
        }
      });

      for (const folderPath of Array.from(seriesFolders)) {
        const jsonContent = await zip
          .file(folderPath + "series.json")
          ?.async("string");
        if (!jsonContent) continue;

        const seriesData = JSON.parse(jsonContent) as Series;

        const rehydratedImages: ProcessedImage[] = [];

        for (let i = 0; i < seriesData.images.length; i++) {
          const originalImg = seriesData.images[i];
          const extension = originalImg.fileName.split(".").pop() || "jpg";
          const paddedIndex = (i + 1).toString().padStart(3, "0");

          const sourcePath = `${folderPath}${paddedIndex}_source.${extension}`;
          const translatedPath = `${folderPath}${paddedIndex}_translated.${extension}`;

          let sourceBlobUrl = "";
          let translatedBlobUrl = null;

          const sourceFile = zip.file(sourcePath);
          if (sourceFile) {
            const blob = await sourceFile.async("blob");
            sourceBlobUrl = URL.createObjectURL(blob);
            await imageDb.saveImage(originalImg.id, "original", blob);
          } else {
            continue;
          }

          const translatedFile = zip.file(translatedPath);
          if (translatedFile) {
            const blob = await translatedFile.async("blob");
            translatedBlobUrl = URL.createObjectURL(blob);
            await imageDb.saveImage(originalImg.id, "translated", blob);
          }

          rehydratedImages.push({
            ...originalImg,
            originalUrl: sourceBlobUrl,
            translatedUrl: translatedBlobUrl,
            status: "completed",
          });
        }

        newSeries.push({
          ...seriesData,
          id: Math.random().toString(36).substring(2, 9), // Generate new ID to avoid collisions
          images: rehydratedImages,
        });
      }

      if (newSeries.length > 0) {
        setSeries((prev) => [...prev, ...newSeries]);
        setActiveSeriesId(newSeries[0].id);
        alert(`Imported ${newSeries.length} series successfully!`);
      } else {
        alert("No valid series found in the ZIP archive.");
      }
    } catch (err) {
      console.error("Failed to import library:", err);
      alert("Failed to import library. See console for details.");
    }

    e.target.value = "";
  };

  const downloadFullAccountZip = async () => {
    const zip = new JSZip();
    console.log("series", series);
    for (const s of series) {
      if (s.images.length === 0) continue;
      const folder = zip.folder(s.name.replace(/[^a-z0-9]/gi, "_"));

      // Create a clean version of series for JSON export (without blob URLs)
      const cleanedSeries = {
        ...s,
        images: s.images.map((img, idx) => {
          const paddedIndex = (idx + 1).toString().padStart(3, "0");
          const extension = img.fileName.split(".").pop() || "jpg";
          return {
            ...img,
            // Store relative file paths instead of blob URLs
            originalUrl: `${paddedIndex}_source.${extension}`,
            translatedUrl: img.translatedUrl
              ? `${paddedIndex}_translated.${extension}`
              : null,
          };
        }),
      };

      folder.file("series.json", JSON.stringify(cleanedSeries, null, 2));

      for (let idx = 0; idx < s.images.length; idx++) {
        const img = s.images[idx];
        try {
          const extension = img.fileName.split(".").pop() || "jpg";
          const paddedIndex = (idx + 1).toString().padStart(3, "0");

          // Save Source
          const sourceData = await urlToBase64(img.originalUrl);
          folder.file(`${paddedIndex}_source.${extension}`, sourceData, {
            base64: true,
          });

          // Save Translated if exists
          if (img.translatedUrl && img.translatedUrl !== img.originalUrl) {
            const translatedData = await urlToBase64(
              img.translatedUrl as string
            );
            folder.file(
              `${paddedIndex}_translated.${extension}`,
              translatedData,
              { base64: true }
            );
          }
        } catch (e) {
          console.error(
            `Failed to add ${img.fileName} from ${s.name} to ZIP:`,
            e
          );
        }
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "mangalens_full_library_export.zip");
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const imgToRemove = prev.find((img) => img.id === id);
      if (imgToRemove?.originalUrl.startsWith("blob:"))
        URL.revokeObjectURL(imgToRemove.originalUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach((img) => {
      if (img.originalUrl.startsWith("blob:"))
        URL.revokeObjectURL(img.originalUrl);
    });
    setImages([]);
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNewSeriesModalOpen, setIsNewSeriesModalOpen] = useState(false);

  const handleAddSeries = () => {
    setIsNewSeriesModalOpen(true);
  };

  const confirmAddSeries = (name: string, category: string) => {
    if (editingSeriesId) {
      setSeries((prev) =>
        prev.map((s) =>
          s.id === editingSeriesId
            ? { ...s, name, category, updatedAt: Date.now() }
            : s
        )
      );
      setEditingSeriesId(null);
    } else {
      const now = Date.now();
      const newSeries: Series = {
        id: Math.random().toString(36).substring(2, 9),
        name,
        description: "",
        category,
        tags: [],
        images: [],
        createdAt: now,
        updatedAt: now,
      };
      setSeries([...series, newSeries]);
      setActiveSeriesId(newSeries.id);
    }
  };

  const handleUpdateCategory = (oldName: string, newName: string) => {
    setCategories((prev) => prev.map((c) => (c === oldName ? newName : c)));
    setSeries((prev) =>
      prev.map((s) =>
        s.category === oldName ? { ...s, category: newName } : s
      )
    );
  };

  const handleDeleteCategory = (name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    setSeries((prev) =>
      prev.map((s) =>
        s.category === name ? { ...s, category: "Uncategorized" } : s
      )
    );
  };

  const handleDeleteSeries = (id: string) => {
    const newSeries = series.filter((s) => s.id !== id);
    setSeries(newSeries);
    if (activeSeriesId === id) {
      setActiveSeriesId(newSeries[0].id);
    }
  };

  return (
    <>
      <div className="flex h-screen bg-[#020617] text-slate-100 font-sans overflow-hidden">
        <SeriesSidebar
          series={series}
          activeId={activeSeriesId}
          onSelect={(id) => {
            setActiveSeriesId(id);
            setIsSidebarOpen(false);
          }}
          onAdd={handleAddSeries}
          onDelete={handleDeleteSeries}
          onEdit={(id) => {
            setEditingSeriesId(id);
            setIsNewSeriesModalOpen(true);
          }}
          onExportAll={downloadFullAccountZip}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onImport={handleImportLibrary}
          isViewOnly={isViewOnly}
          categories={categories}
        />

        <CategoryManagerModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          categories={categories}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
        />

        <NewSeriesModal
          isOpen={isNewSeriesModalOpen}
          onClose={() => {
            setIsNewSeriesModalOpen(false);
            setEditingSeriesId(null);
          }}
          onConfirm={confirmAddSeries}
          existingTitles={series.map((s) => s.name)}
          categories={categories}
          onAddCategory={(cat) => setCategories([...categories, cat])}
          initialName={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.name
              : ""
          }
          initialCategory={
            editingSeriesId
              ? series.find((s) => s.id === editingSeriesId)?.category
              : ""
          }
        />

        <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar relative">
          <header className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur-xl border-b border-slate-800 p-4 shadow-2xl">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-gradient-to-tr from-indigo-600 to-fuchsia-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-500/30">
                  <i className="fas fa-eye-low-vision text-xl"></i>
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tighter uppercase leading-none italic">
                    Manga<span className="text-indigo-400">Lens</span>{" "}
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-500/30 font-bold not-italic">
                      v3.3
                    </span>
                  </h1>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        Cost
                      </span>
                      <span className="text-[10px] font-black text-emerald-400 font-mono">
                        ${totalStats.cost.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        Tokens
                      </span>
                      <span className="text-[10px] font-black text-indigo-400 font-mono">
                        {totalStats.tokens.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsViewOnly(!isViewOnly)}
                  className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] transition-all flex items-center gap-2.5 border shadow-2xl ${
                    isViewOnly
                      ? "bg-indigo-600 border-indigo-400 text-white shadow-indigo-500/40"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  }`}
                >
                  {isViewOnly ? (
                    <Eye className="w-4 h-4 animate-pulse" />
                  ) : (
                    <Settings className="w-4 h-4" />
                  )}
                  {isViewOnly ? "Viewing mode" : "Reader mode off"}
                </button>

                {!isViewOnly && (
                  <button
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all shadow-xl group"
                    title="Manage Categories"
                  >
                    <i className="fas fa-tags text-xs group-hover:scale-110 transition-transform"></i>
                  </button>
                )}

                {!isViewOnly && (
                  <button
                    onClick={processAll}
                    disabled={isProcessingAll || images.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all px-6 py-2.5 rounded-xl font-black flex items-center gap-2 shadow-xl shadow-indigo-500/20 text-xs uppercase tracking-wider"
                  >
                    {isProcessingAll ? (
                      <i className="fas fa-circle-notch fa-spin"></i>
                    ) : (
                      <i className="fas fa-bolt"></i>
                    )}
                    {isProcessingAll ? "Translating..." : "Translate All"}
                  </button>
                )}

                {!isViewOnly && images.length > 0 && (
                  <button
                    onClick={downloadAllAsZip}
                    className="bg-slate-100 text-slate-900 hover:bg-white px-6 py-2.5 rounded-xl font-black flex items-center gap-2 shadow-xl text-xs uppercase tracking-wider transition-all"
                  >
                    <i className="fas fa-archive"></i> Download ZIP
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10">
            {images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[65vh] rounded-[4rem] border-4 border-dashed border-slate-800/50 bg-slate-900/10 group transition-all duration-700 hover:border-indigo-500/40">
                <div className="mb-10 relative">
                  <div className="absolute inset-0 bg-indigo-500 blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
                  <div className="w-24 h-24 bg-slate-800 rounded-3xl flex items-center justify-center shadow-2xl relative z-10 border border-slate-700 group-hover:scale-110 transition-transform">
                    <i className="fas fa-plus text-4xl text-indigo-400"></i>
                  </div>
                </div>
                <h2 className="text-4xl font-black mb-4 text-center tracking-tighter">
                  Manga Translator
                </h2>
                <p className="text-slate-500 mb-10 max-w-sm text-center font-bold leading-relaxed">
                  Upload manga panels. v3.3 features auto-font scaling to fit
                  detected bubbles perfectly.
                </p>
                <label className="cursor-pointer bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all px-16 py-5 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-500/40">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  GET STARTED
                </label>
              </div>
            ) : isViewOnly ? (
              <div className="flex-1 flex flex-col h-full animate-in fade-in duration-700 min-h-0">
                {/* Premium Viewer Header */}
                <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/5 flex items-center justify-between mb-8 shadow-2xl shrink-0">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black text-white italic uppercase tracking-tight">
                      {activeSeries?.name}
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                        {activeSeries?.category}
                      </span>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Page {currentImageIndex + 1} / {images.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <ViewModeControls
                      showComparison={showComparison}
                      onToggleComparison={() =>
                        setShowComparison(!showComparison)
                      }
                      comparisonMode={comparisonMode}
                      onChangeMode={setComparisonMode}
                    />

                    <button
                      onClick={() =>
                        setCurrentImageIndex(Math.max(0, currentImageIndex - 1))
                      }
                      disabled={currentImageIndex === 0}
                      className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 hover:bg-indigo-600 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800 transition-all flex items-center justify-center border border-slate-700 shadow-xl"
                    >
                      <i className="fas fa-chevron-left text-lg"></i>
                    </button>
                    <button
                      onClick={() =>
                        setCurrentImageIndex(
                          Math.min(images.length - 1, currentImageIndex + 1)
                        )
                      }
                      disabled={currentImageIndex === images.length - 1}
                      className="w-12 h-12 rounded-2xl bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 disabled:opacity-30 transition-all flex items-center justify-center border border-indigo-500/30"
                    >
                      <i className="fas fa-chevron-right text-lg"></i>
                    </button>
                  </div>
                </div>

                {/* Main Viewer Stage */}
                <div className="flex-1 relative flex items-center justify-center min-h-0 group px-4">
                  <div className="absolute inset-0 bg-indigo-500/5 blur-[120px] rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>

                  <div className="relative w-full h-full flex items-center justify-center">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-out ${
                          idx === currentImageIndex
                            ? "opacity-100 scale-100 translate-x-0 z-10"
                            : idx < currentImageIndex
                            ? "opacity-0 scale-95 -translate-x-full pointer-events-none"
                            : "opacity-0 scale-95 translate-x-full pointer-events-none"
                        }`}
                      >
                        {showComparison ? (
                          <div className="w-full h-full max-w-5xl">
                            <ComparisonView
                              pair={{
                                id: img.id,
                                title: img.fileName,
                                sourceUrl: img.originalUrl,
                                convertedUrl:
                                  img.translatedUrl || img.originalUrl,
                                createdAt: Date.now(),
                              }}
                              mode={comparisonMode}
                            />
                          </div>
                        ) : (
                          <div className="relative bg-[#0b0f1a] border border-slate-800 rounded-[3rem] overflow-hidden shadow-[0_60px_100px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 group/img w-full h-full max-w-3xl">
                            <img
                              src={img.translatedUrl || img.originalUrl}
                              alt={`Page ${idx + 1}`}
                              className="w-full h-full object-contain select-none"
                            />
                            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none"></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Thumbnail Strip */}
                <div className="mt-8 flex items-center justify-center gap-3 p-4 shrink-0 overflow-x-auto no-scrollbar max-w-full mx-auto">
                  {images.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`relative flex-shrink-0 w-12 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        idx === currentImageIndex
                          ? "border-indigo-500 scale-110 shadow-lg shadow-indigo-500/40"
                          : "border-slate-800 opacity-40 hover:opacity-100 grayscale hover:grayscale-0"
                      }`}
                    >
                      <img
                        src={img.originalUrl}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-end mb-10 px-2">
                  <div>
                    <h3 className="text-3xl font-black tracking-tighter uppercase mb-2">
                      Editor Workspace
                    </h3>
                    <p className="text-slate-500 font-bold text-sm tracking-wide">
                      {images.length} items • Working on{" "}
                      <span className="text-slate-300 font-black italic underline decoration-indigo-500/50 underline-offset-4">
                        {activeSeries?.name}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-5 py-2.5 rounded-xl text-xs font-black transition-all uppercase flex items-center gap-2">
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <i className="fas fa-plus-circle"></i> Append More
                    </label>
                    <label className="cursor-pointer bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all border border-amber-500/20 uppercase flex items-center gap-2">
                      <input
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={handleImportLibrary}
                      />
                      <i className="fas fa-file-import"></i> Import
                    </label>
                    <button
                      onClick={clearAll}
                      className="bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all border border-red-500/20 uppercase"
                    >
                      Wipe All
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {images.map((image, idx) => (
                    <div
                      key={image.id}
                      className="group bg-slate-900/40 rounded-[2rem] border border-slate-800/60 overflow-hidden shadow-2xl flex flex-col hover:border-indigo-500/50 transition-all duration-300"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-slate-800">
                        <img
                          src={image.translatedUrl || image.originalUrl}
                          alt={image.fileName}
                          onClick={() => setSelectedImageId(image.id)}
                          className="w-full h-full object-contain transition-all duration-500 cursor-zoom-in group-hover:scale-105"
                        />

                        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md w-10 h-10 flex items-center justify-center rounded-xl font-black text-indigo-400 border border-slate-700 shadow-xl z-10">
                          {idx + 1}
                        </div>

                        <div
                          className={`absolute top-4 right-4 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border z-10 ${
                            image.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : image.status === "processing"
                              ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {image.status}
                        </div>

                        {image.status === "processing" && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl">
                            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="font-black text-[10px] text-indigo-400 uppercase tracking-[0.2em]">
                              Processing Geometry
                            </p>
                          </div>
                        )}

                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadSingle(image);
                            }}
                            className="w-16 h-16 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all scale-75 group-hover:scale-100 border border-white/20 pointer-events-auto shadow-2xl"
                            title="Download this page"
                          >
                            <i className="fas fa-download text-2xl"></i>
                          </button>
                        </div>

                        <div className="absolute bottom-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                          <button
                            onClick={() => moveImage(idx, "up")}
                            disabled={idx === 0}
                            className="w-10 h-10 bg-slate-800 hover:bg-indigo-600 disabled:bg-slate-900 rounded-xl flex items-center justify-center transition-colors border border-slate-700"
                          >
                            <i className="fas fa-chevron-up"></i>
                          </button>
                          <button
                            onClick={() => moveImage(idx, "down")}
                            disabled={idx === images.length - 1}
                            className="w-10 h-10 bg-slate-800 hover:bg-indigo-600 disabled:bg-slate-900 rounded-xl flex items-center justify-center transition-colors border border-slate-700"
                          >
                            <i className="fas fa-chevron-down"></i>
                          </button>
                        </div>

                        <button
                          onClick={() => removeImage(image.id)}
                          className="absolute bottom-4 left-4 w-10 h-10 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0 border border-red-500/30"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>

                      <div className="p-5 bg-slate-900/80 border-t border-slate-800 flex-1 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-black truncate text-slate-300 pr-2">
                            {image.fileName}
                          </p>
                          {image.cost && (
                            <span className="text-[10px] font-bold text-emerald-400 font-mono">
                              ${image.cost.toFixed(4)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800/50">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider">
                              Session
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {image.usage?.totalTokenCount || 0} tokens
                            </span>
                          </div>
                          {(image.status === "idle" ||
                            image.status === "error") && (
                            <button
                              onClick={() => processImage(image)}
                              className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95"
                            >
                              {image.status === "error" ? "Retry" : "Run"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      <div
        style={{ display: isViewOnly ? "none" : "flex" }}
        className="fixed bottom-8 left-[calc(50%+128px)] -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/50 p-6 rounded-[2.5rem] shadow-2xl flex items-center gap-12 backdrop-blur-2xl border-t border-t-white/5 max-w-[95vw] overflow-x-auto"
      >
        <div className="flex flex-col gap-2 min-w-fit">
          <label className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black">
            Target
          </label>
          <select
            value={settings.targetLanguage}
            onChange={(e) =>
              setSettings((s) => ({ ...s, targetLanguage: e.target.value }))
            }
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-black focus:ring-2 ring-indigo-500 outline-none text-indigo-300"
          >
            <option value="Turkish">Turkish</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="Japanese">Japanese</option>
            <option value="French">French</option>
            <option value="German">German</option>
          </select>
        </div>

        <div className="flex flex-col gap-2 min-w-fit">
          <label className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black">
            Max Font Size
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="10"
              max="60"
              value={settings.fontSize}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  fontSize: parseInt(e.target.value),
                }))
              }
              className="w-32 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="text-xs font-mono font-black text-indigo-400">
              {settings.fontSize}px
            </span>
          </div>
        </div>

        <div className="h-12 w-[1px] bg-slate-800"></div>

        <div className="flex flex-col gap-2 min-w-fit">
          <label className="text-[9px] uppercase tracking-[0.3em] text-slate-500 font-black">
            Appearance
          </label>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={settings.fontColor}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, fontColor: e.target.value }))
                }
                className="w-9 h-9 rounded-xl border-2 border-slate-800 bg-transparent cursor-pointer hover:scale-110"
                title="Text Color"
              />
              <span className="text-[8px] uppercase font-black text-slate-500">
                Font
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={
                  settings.strokeColor === "transparent"
                    ? "#000000"
                    : settings.strokeColor
                }
                onChange={(e) =>
                  setSettings((s) => ({ ...s, strokeColor: e.target.value }))
                }
                className="w-9 h-9 rounded-xl border-2 border-slate-800 bg-transparent cursor-pointer hover:scale-110"
                title="Stroke Color"
              />
              <span className="text-[8px] uppercase font-black text-slate-500">
                Stroke
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <input
                type="color"
                value={
                  settings.backgroundColor === "transparent"
                    ? "#000000"
                    : settings.backgroundColor
                }
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    backgroundColor: e.target.value,
                  }))
                }
                className="w-9 h-9 rounded-xl border-2 border-slate-800 bg-transparent cursor-pointer hover:scale-110"
                title="Background Color"
              />
              <span className="text-[8px] uppercase font-black text-slate-500">
                Bubble
              </span>
            </div>
          </div>
        </div>
      </div>

      {selectedImageId &&
        (() => {
          const selectedImg = images.find((img) => img.id === selectedImageId);
          if (!selectedImg) return null;

          return (
            <div
              className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 md:p-10"
              onClick={() => setSelectedImageId(null)}
            >
              <div
                className="w-full max-w-5xl h-full flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                {selectedImg.translatedUrl && (
                  <div className="bg-slate-800/50 p-2 rounded-full flex gap-2 border border-slate-700">
                    {(["slider", "side-by-side", "toggle"] as ViewMode[]).map(
                      (mode) => (
                        <button
                          key={mode}
                          onClick={() => setComparisonMode(mode)}
                          className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                            comparisonMode === mode
                              ? "bg-indigo-600 text-white shadow-lg"
                              : "text-slate-400 hover:text-white hover:bg-slate-700"
                          }`}
                        >
                          {mode.replace(/-/g, " ")}
                        </button>
                      )
                    )}
                  </div>
                )}

                <div className="w-full relative">
                  <ComparisonView
                    pair={{
                      id: selectedImg.id,
                      title: selectedImg.fileName,
                      sourceUrl: selectedImg.originalUrl,
                      convertedUrl:
                        selectedImg.translatedUrl || selectedImg.originalUrl,
                      createdAt: Date.now(),
                    }}
                    mode={comparisonMode}
                  />
                </div>

                <button
                  className="absolute top-8 right-8 text-white/50 hover:text-white text-3xl transition-colors"
                  onClick={() => setSelectedImageId(null)}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
          );
        })()}
    </>
  );
};

export default App;
