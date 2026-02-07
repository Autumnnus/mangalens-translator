import { MousePointer2, MoveHorizontal } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ImagePair, ViewMode } from "../types";

interface Props {
  pair: ImagePair;
  mode: ViewMode;
  interactive?: boolean;
}

const ComparisonView: React.FC<Props> = ({
  pair,
  mode,
  interactive = true,
}) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [isToggled, setIsToggled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current || !interactive) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const position = ((x - rect.left) / rect.width) * 100;

    setSliderPos(Math.min(Math.max(position, 0.1), 99.9));
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!interactive) return;
    isDragging.current = true;
    handleMove(e);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDragging.current = false;
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging.current && interactive) {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const position = ((e.clientX - rect.left) / rect.width) * 100;
        setSliderPos(Math.min(Math.max(position, 0.1), 99.9));
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [interactive]);

  const hasTranslation = pair.sourceUrl !== pair.convertedUrl;

  if (!hasTranslation) {
    return (
      <div className="relative w-full h-full overflow-hidden rounded-[2rem] border border-border-muted bg-background/40 glass">
        <img
          src={pair.sourceUrl}
          alt="Original"
          className="max-w-full max-h-full object-contain"
        />
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-surface-raised/80 backdrop-blur-xl border border-border-muted rounded-2xl text-xs font-black text-text-muted uppercase tracking-widest shadow-premium">
          NO TRANSLATION AVAILABLE
        </div>
      </div>
    );
  }

  if (mode === "side-by-side") {
    return (
      <div className="grid grid-cols-2 gap-4 w-full h-full">
        <div className="relative overflow-hidden rounded-[2rem] border border-border-muted bg-background/40 glass flex items-center justify-center">
          <img
            src={pair.sourceUrl}
            alt="Source"
            className="w-full h-full object-contain select-none"
          />
          <div className="absolute top-4 left-4 z-20 bg-background/60 backdrop-blur-md px-3 py-1.5 text-[10px] font-black rounded-xl text-text-main border border-border-muted uppercase tracking-widest shadow-premium">
            Source
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-border-muted bg-background/40 glass flex items-center justify-center">
          <img
            src={pair.convertedUrl}
            alt="Converted"
            className="w-full h-full object-contain select-none"
          />
          <div className="absolute top-4 left-4 z-20 bg-primary/80 backdrop-blur-md px-3 py-1.5 text-[10px] font-black rounded-xl text-white border border-primary/20 uppercase tracking-widest shadow-glow">
            Converted
          </div>
        </div>
      </div>
    );
  }

  if (mode === "toggle") {
    return (
      <div
        className="relative w-full h-full cursor-pointer overflow-hidden rounded-[2rem] border border-border-muted bg-background/40 glass group flex items-center justify-center"
        onClick={() => setIsToggled(!isToggled)}
      >
        <img
          src={isToggled ? pair.convertedUrl : pair.sourceUrl}
          alt="Comparison"
          className="w-full h-full object-contain transition-opacity duration-300 select-none"
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
          <div
            className={`px-5 py-2 rounded-2xl text-[10px] font-black tracking-widest transition-all shadow-premium border ${
              !isToggled
                ? "bg-text-main text-background scale-110 shadow-glow border-white/20"
                : "bg-surface-raised/40 text-text-muted border-border-muted"
            }`}
          >
            SOURCE
          </div>
          <div
            className={`px-5 py-2 rounded-2xl text-[10px] font-black tracking-widest transition-all shadow-premium border ${
              isToggled
                ? "bg-primary text-white scale-110 shadow-glow border-primary/20"
                : "bg-surface-raised/40 text-text-muted border-border-muted"
            }`}
          >
            CONVERTED
          </div>
        </div>
        <div className="absolute top-6 right-6 bg-surface-raised/80 backdrop-blur-md rounded-2xl p-3 text-text-main border border-border-muted shadow-premium group-hover:scale-110 transition-transform">
          <MousePointer2 className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden rounded-[2.5rem] border border-border-muted cursor-col-resize group bg-background/40 glass-card"
      onMouseDown={handleMouseDown}
      onTouchMove={handleMove}
    >
      {/* Background Image (Converted) */}
      <img
        src={pair.convertedUrl}
        alt="Converted"
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Foreground Container (Source) - Clipped via clip-path for perfect alignment */}
      <div
        className="absolute inset-0 w-full h-full z-10"
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        <img
          src={pair.sourceUrl}
          alt="Source"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
        <div className="absolute top-4 left-4 bg-background/60 backdrop-blur-md px-3 py-1.5 text-[10px] font-black rounded-xl text-text-main border border-border-muted uppercase tracking-widest shadow-premium z-20">
          Source
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-primary/80 backdrop-blur-md px-3 py-1.5 text-[10px] font-black rounded-xl text-white border border-primary/20 uppercase tracking-widest shadow-glow z-20">
        Converted
      </div>

      {/* Slider Bar */}
      <div
        className="absolute inset-y-0 w-0.5 bg-primary/50 shadow-glow z-30"
        style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-white rounded-2xl flex items-center justify-center shadow-glow border border-primary/50 group-hover:scale-110 transition-transform active:scale-95">
          <MoveHorizontal className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

export default ComparisonView;
