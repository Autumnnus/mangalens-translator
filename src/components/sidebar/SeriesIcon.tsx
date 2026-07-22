import { Hash } from "lucide-react";
import React, { useState } from "react";
import { ProcessedImage } from "../../types";
import { getThumbnailUrl } from "../../utils/url";

interface SeriesIconProps {
  images: ProcessedImage[];
  previewImages?: string[];
  previewImageKeys?: string[];
}

interface PreviewImage {
  key?: string | null;
  fallbackUrl: string | null;
}

const SeriesIcon: React.FC<SeriesIconProps> = ({
  images,
  previewImages,
  previewImageKeys,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayImages: PreviewImage[] =
    previewImageKeys && previewImageKeys.length > 0
      ? previewImageKeys.map((key) => ({ key, fallbackUrl: null }))
      : previewImages && previewImages.length > 0
        ? previewImages.map((url) => ({ fallbackUrl: url }))
        : images.map((img) => ({
            key: img.translatedKey || img.originalKey,
            fallbackUrl: img.translatedUrl || img.originalUrl,
          }));

  if (displayImages.length === 0) {
    return (
      <div className="w-10 h-10 flex items-center justify-center bg-surface-raised rounded-lg border border-border-muted group-hover:border-primary/50 transition-colors shadow-sm">
        <Hash className="w-4 h-4 text-text-dark group-hover:text-primary/70" />
      </div>
    );
  }

  if (isExpanded) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(false);
        }}
      >
        <div
          className="glass-card animate-slide-up rounded-2xl p-4 max-w-sm w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-3 gap-2">
            {displayImages.map((image, idx) => (
              <div
                key={idx}
                className="aspect-3/4 overflow-hidden rounded-lg border border-slate-700"
              >
                <img
                  src={getThumbnailUrl(image.key, image.fallbackUrl, 420, 76)}
                  className="w-full h-full object-contain bg-black/80 p-0.5"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-10 h-10 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(true);
      }}
    >
      {displayImages.slice(0, 3).map((image, i) => (
        <div
          key={(image.key || image.fallbackUrl || "preview") + "-" + i}
          className="absolute w-7 h-7 border border-border-muted rounded-md overflow-hidden bg-surface-raised shadow-lg transition-transform group-hover:border-primary/50"
          style={{
            top: `${i * 3}px`,
            left: `${i * 3}px`,
            zIndex: i,
            transform: `rotate(${i * 4 - 4}deg)`,
          }}
        >
          <img
            src={getThumbnailUrl(image.key, image.fallbackUrl, 120, 62)}
            className="w-full h-full object-contain bg-black/80 p-0.5"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
      ))}
    </div>
  );
};

export default React.memo(SeriesIcon);
