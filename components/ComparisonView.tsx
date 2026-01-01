import { MousePointer2, MoveHorizontal } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ImagePair, ViewMode } from "../types";

interface Props {
  pair: ImagePair;
  mode: ViewMode;
}

const ComparisonView: React.FC<Props> = ({ pair, mode }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [isToggled, setIsToggled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const position = ((x - rect.left) / rect.width) * 100;

    setSliderPos(Math.min(Math.max(position, 0.1), 99.9));
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    handleMove(e);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDragging.current = false;
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
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
  }, []);

  // Check if we have a real conversion to compare
  const hasTranslation = pair.sourceUrl !== pair.convertedUrl;

  if (!hasTranslation) {
    return (
      <div className="relative h-[400px] md:h-[600px] overflow-hidden rounded-xl border border-slate-700 bg-black/40">
        <img
          src={pair.sourceUrl}
          alt="Original"
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-800/80 backdrop-blur rounded-full text-xs font-bold text-slate-300">
          NO TRANSLATION AVAILABLE
        </div>
      </div>
    );
  }

  if (mode === "side-by-side") {
    return (
      <div className="grid grid-cols-2 gap-2 h-[400px] md:h-[600px]">
        <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-black/40">
          <img
            src={pair.sourceUrl}
            alt="Source"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-1 text-[10px] font-bold rounded text-white uppercase tracking-widest">
            Source
          </div>
        </div>
        <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-black/40">
          <img
            src={pair.convertedUrl}
            alt="Converted"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 left-2 bg-indigo-600/80 backdrop-blur px-2 py-1 text-[10px] font-bold rounded text-white uppercase tracking-widest">
            Converted
          </div>
        </div>
      </div>
    );
  }

  if (mode === "toggle") {
    return (
      <div
        className="relative h-[400px] md:h-[600px] cursor-pointer overflow-hidden rounded-xl border border-slate-700 bg-black/40"
        onClick={() => setIsToggled(!isToggled)}
      >
        <img
          src={isToggled ? pair.convertedUrl : pair.sourceUrl}
          alt="Comparison"
          className="w-full h-full object-contain transition-opacity duration-300"
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
          <div
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              !isToggled
                ? "bg-white text-black scale-110 shadow-xl"
                : "bg-black/40 text-white/50"
            }`}
          >
            SOURCE
          </div>
          <div
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              isToggled
                ? "bg-indigo-600 text-white scale-110 shadow-xl"
                : "bg-black/40 text-white/50"
            }`}
          >
            CONVERTED
          </div>
        </div>
        <div className="absolute top-4 right-4 bg-black/50 backdrop-blur rounded-full p-2 text-white/70">
          <MousePointer2 className="w-4 h-4" />
        </div>
      </div>
    );
  }

  // Default: Slider Mode
  return (
    <div
      ref={containerRef}
      className="relative h-[400px] md:h-[600px] select-none overflow-hidden rounded-xl border border-slate-700 cursor-col-resize group bg-black/40"
      onMouseDown={handleMouseDown}
      onTouchMove={handleMove}
    >
      {/* Background Image (Converted) */}
      <img
        src={pair.convertedUrl}
        alt="Converted"
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Foreground Image (Source) */}
      <div
        className="absolute inset-0 w-full h-full overflow-hidden"
        style={{ width: `${sliderPos}%` }}
      >
        <img
          src={pair.sourceUrl}
          alt="Source"
          className="absolute inset-0 w-full h-full object-contain"
          style={{ width: `${100 / (sliderPos / 100)}%`, maxWidth: "none" }} // Ensure image scales correctly relative to parent
        />
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-2 py-1 text-[10px] font-bold rounded text-white uppercase tracking-widest">
          Source
        </div>
      </div>

      <div className="absolute top-4 right-4 bg-indigo-600/80 backdrop-blur px-2 py-1 text-[10px] font-bold rounded text-white uppercase tracking-widest">
        Converted
      </div>

      {/* Slider Bar */}
      <div
        className="absolute inset-y-0 w-1 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10"
        style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl border-4 border-slate-900 group-hover:scale-110 transition-transform">
          <MoveHorizontal className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

export default ComparisonView;
