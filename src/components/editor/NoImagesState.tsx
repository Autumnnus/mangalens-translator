"use client";

import { Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { Button } from "../ui";

interface NoImagesStateProps {
  seriesName: string | undefined;
  onUpload: (files: FileList | null) => void;
  isUploading?: boolean;
}

/** Drop zone shown when a series has no pages yet. */
const NoImagesState: React.FC<NoImagesStateProps> = ({
  seriesName,
  onUpload,
  isUploading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    onUpload(event.dataTransfer.files);
  };

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "screentone flex flex-1 flex-col items-center justify-center rounded-panel border-2 border-dashed px-6 py-16 text-center transition-colors duration-120",
        isDragging ? "border-action bg-npb" : "border-line",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mb-4 flex h-12 w-12 items-center justify-center rounded-panel border bg-page [&_svg]:h-5 [&_svg]:w-5",
          isDragging ? "border-action text-action" : "border-line text-ink-3",
        )}
      >
        <Upload />
      </span>
      <h2 className="text-base font-semibold text-ink">
        {isDragging ? "Drop to add pages" : `Add pages to ${seriesName}`}
      </h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">
        Drag images or a PDF here. Pages keep the order you add them in; you can
        reorder them afterwards.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        disabled={isUploading}
        onChange={(event) => {
          onUpload(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        variant="primary"
        size="lg"
        icon={<Upload />}
        loading={isUploading}
        onClick={() => fileInputRef.current?.click()}
        className="mt-5"
      >
        {isUploading ? "Adding pages…" : "Choose files"}
      </Button>
    </div>
  );
};

export default React.memo(NoImagesState);
