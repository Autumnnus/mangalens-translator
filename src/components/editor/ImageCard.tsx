import React from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useUIStore } from "../../stores/useUIStore";
import { ProcessedImage } from "../../types";
import { resolveImageUrl } from "../../utils/url";

interface Props {
  image: ProcessedImage;
  index: number;
  total: number;
}

const ImageCard: React.FC<Props> = ({ image, index, total }) => {
  const {
    activeSeriesId,

    removeImageFromSeries,
    updateImageInSeries,
    series,
    reorderImages,
  } = useSeriesStore();
  const { setSelectedImage } = useUIStore();
  const { confirm } = useConfirm();
  const { processImage } = useImageProcessor();

  const [isLoaded, setIsLoaded] = React.useState(false);
  const displayUrl = resolveImageUrl(image.translatedUrl || image.originalUrl);

  const moveImage = (dir: "up" | "down" | "jump", targetPos?: number) => {
    const activeSeries = series.find((s) => s.id === activeSeriesId);
    if (!activeSeries) return;

    const currentImages = [...activeSeries.images];

    if (dir === "jump" && targetPos !== undefined) {
      // Logic: Move from current position to targetPos
      const [item] = currentImages.splice(index, 1);
      const insertIdx = Math.max(
        0,
        Math.min(targetPos - 1, currentImages.length),
      );
      currentImages.splice(insertIdx, 0, item);
    } else {
      const targetIndex = dir === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= currentImages.length) return;

      [currentImages[index], currentImages[targetIndex]] = [
        currentImages[targetIndex],
        currentImages[index],
      ];
    }

    const orderedIds = currentImages.map((img) => img.id);
    if (activeSeriesId) {
      reorderImages(activeSeriesId, orderedIds);
    }
  };

  const handleRemove = () => {
    confirm({
      title: "Remove Image",
      message:
        "Are you sure you want to remove this image? This action cannot be undone.",
      onConfirm: () => {
        if (image.originalUrl.startsWith("blob:"))
          URL.revokeObjectURL(image.originalUrl);
        if (activeSeriesId) {
          removeImageFromSeries(activeSeriesId, image.id);
        }
      },
      type: "danger",
    });
  };

  return (
    <div className="glass-card rounded-[2rem] overflow-hidden group transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]">
      <div
        className="relative aspect-[2/3] bg-black/40 group-hover:bg-black/20 transition-colors cursor-pointer overflow-hidden"
        onClick={() => setSelectedImage(image)}
      >
        {!isLoaded && (
          <div className="absolute inset-0 bg-surface-muted/30 animate-pulse flex items-center justify-center">
            <i className="fas fa-image text-text-muted/20 text-4xl" />
          </div>
        )}
        <img
          src={displayUrl}
          alt={image.fileName}
          className={`w-full h-full object-cover transition-all duration-500 ${isLoaded ? "opacity-100 scale-100 group-hover:scale-110" : "opacity-0 scale-105"}`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
        />

        {/* Status Overlay */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest backdrop-blur-md border shadow-lg transition-colors ${
              image.status === "completed"
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                : image.status === "processing"
                  ? "bg-primary/20 border-primary/30 text-primary animate-pulse"
                  : image.status === "error"
                    ? "bg-red-500/20 border-red-500/30 text-red-400"
                    : "bg-surface-raised/80 border-border-muted text-text-muted"
            }`}
          >
            {image.status === "processing" ? (
              <span className="flex items-center gap-2">
                <i className="fas fa-circle-notch fa-spin"></i>
                Processing
              </span>
            ) : (
              image.status
            )}
          </div>
        </div>

        {/* Cost Badge */}
        {image.cost !== undefined && (
          <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-md border border-border-muted px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold text-primary shadow-glow">
            ${image.cost.toFixed(5)}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="overflow-hidden">
            <h4
              className="text-text-main font-bold text-sm truncate mb-1"
              title={image.fileName}
            >
              {image.fileName}
            </h4>
            <div className="flex items-center gap-2 text-[10px] font-bold text-text-dark uppercase tracking-wider">
              <span>IMG {String(index + 1).padStart(2, "0")}</span>
              <span className="w-1 h-1 rounded-full bg-border-muted"></span>
              <span>
                {(image.usage?.totalTokenCount || 0).toLocaleString()} tok
              </span>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="text-slate-600 hover:text-red-400 transition-colors p-1"
            title="Remove"
          >
            <i className="fas fa-trash-alt text-sm"></i>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (image.status === "completed") {
                confirm({
                  title: "Re-translate Image",
                  message:
                    "This will overwrite the existing translation and usage data. Are you sure?",
                  onConfirm: () => processImage(image),
                  type: "warning",
                });
              } else {
                processImage(image);
              }
            }}
            disabled={image.status === "processing"}
            className="flex-1 bg-primary hover:bg-primary-hover disabled:bg-surface-elevated disabled:text-text-dark text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:cursor-not-allowed group/btn shadow-lg shadow-primary/20 border border-primary/30"
          >
            <span className="group-hover/btn:hidden">
              {image.status === "completed"
                ? "Re-translate"
                : image.status === "error"
                  ? "Retry"
                  : "Translate"}
            </span>
            <span className="hidden group-hover/btn:inline">
              <i className="fas fa-bolt"></i> Run
            </span>
          </button>

          {/* Premium Order Control */}
          <div className="flex bg-background/50 rounded-2xl border border-border-muted p-1 items-center shadow-inner group/order">
            <button
              onClick={() => moveImage("up")}
              disabled={index === 0}
              className="w-9 h-9 flex items-center justify-center text-text-dark hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-20 active:scale-90"
              title="Move Up"
            >
              <i className="fas fa-chevron-left text-xs"></i>
            </button>

            <div className="relative flex items-center px-1">
              <span className="absolute left-1/2 -translate-x-1/2 text-[8px] font-black text-text-dark/40 uppercase tracking-tighter -top-3 opacity-0 group-hover/order:opacity-100 transition-opacity">
                Pos
              </span>
              <input
                type="number"
                className="w-10 bg-transparent text-center text-xs font-black text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50 rounded-lg py-1 transition-all"
                value={image.sequenceNumber}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    moveImage("jump", val);
                  }
                }}
                onFocus={(e) => e.target.select()}
              />
            </div>

            <button
              onClick={() => moveImage("down")}
              disabled={index === total - 1}
              className="w-9 h-9 flex items-center justify-center text-text-dark hover:text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-20 active:scale-90"
              title="Move Down"
            >
              <i className="fas fa-chevron-right text-xs"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCard;
