import { Eye, EyeOff } from "lucide-react";
import React from "react";
import { ViewMode } from "../types";
import { Button, SegmentedControl } from "./ui";

interface Props {
  showComparison: boolean;
  onToggleComparison: () => void;
  comparisonMode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
  hasTranslation?: boolean;
}

const ViewModeControls: React.FC<Props> = ({
  showComparison,
  onToggleComparison,
  comparisonMode,
  onChangeMode,
  hasTranslation = true,
}) => {
  if (!hasTranslation) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={showComparison ? <Eye /> : <EyeOff />}
        aria-pressed={showComparison}
        onClick={onToggleComparison}
        title="Compare with the original page"
      >
        <span className="hidden md:inline">Compare</span>
      </Button>

      {showComparison && (
        <SegmentedControl<ViewMode>
          label="Comparison mode"
          size="sm"
          value={comparisonMode}
          onChange={onChangeMode}
          options={[
            { value: "slider", label: "Slider" },
            { value: "side-by-side", label: "Split" },
            { value: "toggle", label: "Toggle" },
          ]}
        />
      )}
    </div>
  );
};

export default ViewModeControls;
