import { saveAs } from "file-saver";
import React from "react";
import { useImageProcessor } from "../../hooks/useImageProcessor";
import { useSeriesStore } from "../../stores/useSeriesStore";
import { useUIStore } from "../../stores/useUIStore";
import { ProcessedImage } from "../../types";

interface Props {
  image: ProcessedImage;
  index: number;
  total: number;
}

const ImageCard: React.FC<Props> = ({ image, index, total }) => {
  const { activeSeriesId, setImages, removeImageFromSeries } = useSeriesStore();
  const { openConfirmModal, setSelectedImageId } = useUIStore();
  const { processImage } = useImageProcessor();

  const handleDownload = async () => {
    const url = image.translatedUrl || image.originalUrl;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `translated_${image.fileName}`);
    } catch (e) {
      console.error("Single download failed:", e);
    }
  };

  const moveImage = (dir: "up" | "down") => {
    setImages(activeSeriesId, (prev) => {
      const newImages = [...prev];
      const targetIndex = dir === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      [newImages[index], newImages[targetIndex]] = [
        newImages[targetIndex],
        newImages[index],
      ];
      return newImages;
    });
  };

  const handleRemove = () => {
    openConfirmModal({
      title: "Remove Image",
      message:
        "Are you sure you want to remove this image? This action cannot be undone.",
      onConfirm: () => {
        if (image.originalUrl.startsWith("blob:"))
          URL.revokeObjectURL(image.originalUrl);
        removeImageFromSeries(activeSeriesId, image.id);
      },
      type: "danger",
    });
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-3xl border border-slate-700/50 overflow-hidden hover:border-indigo-500/50 transition-all group duration-300 hover:shadow-2xl hover:shadow-indigo-500/10">
      <div
        className="relative aspect-[2/3] bg-black/40 group-hover:bg-black/20 transition-colors cursor-pointer"
        onClick={() => setSelectedImageId(image.id)}
      >
        <img
          src={image.translatedUrl || image.originalUrl}
          alt={image.fileName}
          className="w-full h-full object-contain"
          loading="lazy"
        />

        {/* Status Overlay */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest backdrop-blur-md border shadow-lg ${
              image.status === "completed"
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                : image.status === "processing"
                ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-400 animate-pulse"
                : image.status === "error"
                ? "bg-red-500/20 border-red-500/30 text-red-400"
                : "bg-slate-800/80 border-slate-600/50 text-slate-300"
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
          <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700 px-2 py-1 rounded-lg text-[10px] font-mono font-bold text-indigo-300">
            ${image.cost.toFixed(5)}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="overflow-hidden">
            <h4
              className="text-white font-bold text-sm truncate mb-1"
              title={image.fileName}
            >
              {image.fileName}
            </h4>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>IMG {String(index + 1).padStart(2, "0")}</span>
              <span className="w-1 h-1 rounded-full bg-slate-700"></span>
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
          {image.status === "completed" ? (
            <button
              onClick={handleDownload}
              className="flex-1 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400 border border-emerald-500/20 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
            >
              Download
            </button>
          ) : (
            <button
              onClick={() => processImage(image)}
              disabled={image.status === "processing"}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:cursor-not-allowed group/btn"
            >
              <span className="group-hover/btn:hidden">
                {image.status === "error" ? "Retry" : "Translate"}
              </span>
              <span className="hidden group-hover/btn:inline">
                <i className="fas fa-bolt"></i> Run
              </span>
            </button>
          )}

          <div className="flex bg-slate-900 rounded-xl border border-slate-700 p-0.5">
            <button
              onClick={() => moveImage("up")}
              disabled={index === 0}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <div className="w-px bg-slate-800 my-1"></div>
            <button
              onClick={() => moveImage("down")}
              disabled={index === total - 1}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCard;
