import { MoveHorizontal } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ImagePair, ViewMode } from "../types";

interface Props {
  pair: ImagePair;
  mode: ViewMode;
  interactive?: boolean;
}

/** Small mono label pinned over an image. */
const chipClass =
  "rounded-chip border border-theater-line bg-theater px-1.5 py-0.5 font-mono text-xs text-theater-ink-2";

/** Opaque image frame on the theater ground. */
const frameClass =
  "relative flex h-full w-full items-center justify-center overflow-hidden rounded-panel border border-theater-line bg-theater";

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
      <div className={frameClass}>
        <img
          src={pair.sourceUrl}
          alt="Original"
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          decoding="async"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className={chipClass}>No translation available</span>
        </div>
      </div>
    );
  }

  if (mode === "side-by-side") {
    return (
      <div className="grid h-full w-full grid-cols-2 gap-3">
        <div className={frameClass}>
          <img
            src={pair.sourceUrl}
            alt="Original"
            className="h-full w-full select-none object-contain"
            loading="lazy"
            decoding="async"
          />
          <span className={`absolute left-2 top-2 ${chipClass}`}>Original</span>
        </div>
        <div className={frameClass}>
          <img
            src={pair.convertedUrl}
            alt="Translated"
            className="h-full w-full select-none object-contain"
            loading="lazy"
            decoding="async"
          />
          <span className={`absolute left-2 top-2 ${chipClass}`}>Translated</span>
        </div>
      </div>
    );
  }

  if (mode === "toggle") {
    return (
      <div
        className={`${frameClass} cursor-pointer`}
        onClick={() => setIsToggled(!isToggled)}
        role="button"
        tabIndex={0}
        aria-pressed={isToggled}
        aria-label={isToggled ? "Showing translated page. Press to show the original" : "Showing original page. Press to show the translation"}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsToggled(!isToggled);
          }
        }}
      >
        <img
          src={isToggled ? pair.convertedUrl : pair.sourceUrl}
          alt={isToggled ? "Translated" : "Original"}
          className="h-full w-full select-none object-contain"
          loading="lazy"
          decoding="async"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          <span
            className={
              isToggled
                ? chipClass
                : "rounded-chip border border-transparent bg-action px-1.5 py-0.5 font-mono text-xs text-on-action"
            }
          >
            Original
          </span>
          <span
            className={
              isToggled
                ? "rounded-chip border border-transparent bg-action px-1.5 py-0.5 font-mono text-xs text-on-action"
                : chipClass
            }
          >
            Translated
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${frameClass} select-none ${interactive ? "cursor-col-resize" : ""}`}
      onMouseDown={handleMouseDown}
      onTouchMove={handleMove}
    >
      {/* Background image (translated) */}
      <img
        src={pair.convertedUrl}
        alt="Translated"
        className="absolute inset-0 h-full w-full object-contain"
        loading="lazy"
        decoding="async"
      />

      {/* Foreground (original), clipped with clip-path so both images stay aligned */}
      <div
        className="absolute inset-0 z-10 h-full w-full"
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        <img
          src={pair.sourceUrl}
          alt="Original"
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        <span className={`absolute left-2 top-2 z-20 ${chipClass}`}>Original</span>
      </div>

      <span className={`absolute right-2 top-2 z-20 ${chipClass}`}>Translated</span>

      {/* Divider and handle */}
      <div
        className="absolute inset-y-0 z-30 flex w-0.5 items-center justify-center bg-action"
        style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
        aria-hidden="true"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
          <MoveHorizontal className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
};

export default ComparisonView;
