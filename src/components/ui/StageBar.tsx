import React from "react";
import { cn } from "../../utils/cn";
import type { PageStages, StageState } from "../../utils/stages";

const segmentClass: Record<StageState, string> = {
  idle: "bg-line",
  queued: "bg-warn/60",
  running: "bg-action animate-shimmer",
  done: "bg-ok",
  failed: "bg-shu",
};

const STAGE_NAMES: Array<keyof PageStages> = ["detect", "translate", "render"];
const STAGE_TITLES: Record<keyof PageStages, string> = {
  detect: "Detect",
  translate: "Translate",
  render: "Render",
};

export interface StageBarProps {
  stages: PageStages;
  className?: string;
  /** Accessible description, e.g. "Translating". */
  label?: string;
  size?: "sm" | "md";
}

/**
 * Three-segment pipeline indicator: Detect → Translate → Render.
 * Green done, accent running, amber queued, red failed, grey not started.
 */
const StageBar: React.FC<StageBarProps> = ({
  stages,
  className,
  label,
  size = "md",
}) => {
  const description =
    label ||
    STAGE_NAMES.map((name) => `${STAGE_TITLES[name]}: ${stages[name]}`).join(", ");
  return (
    <div
      role="img"
      aria-label={description}
      title={STAGE_NAMES.map((name) => `${STAGE_TITLES[name]} · ${stages[name]}`).join("\n")}
      className={cn("grid grid-cols-3 gap-0.5", className)}
    >
      {STAGE_NAMES.map((name) => (
        <span
          key={name}
          className={cn(
            "block rounded-full",
            size === "sm" ? "h-1" : "h-1.5",
            segmentClass[stages[name]],
          )}
        />
      ))}
    </div>
  );
};

export default StageBar;
