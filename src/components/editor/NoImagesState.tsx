import React, { useState } from "react";

interface NoImagesStateProps {
  seriesName: string | undefined;
  onUpload: (files: FileList | null) => void;
  isUploading?: boolean;
}

const NoImagesState: React.FC<NoImagesStateProps> = ({
  seriesName,
  onUpload,
  isUploading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

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
      className={`flex flex-col items-center justify-center h-[65vh] rounded-[3rem] border-2 border-dashed bg-surface/30 group transition-all duration-300 glass ${
        isDragging
          ? "border-primary bg-primary/10 scale-[1.01] shadow-glow"
          : "border-border-muted hover:border-primary/40"
      }`}
    >
      <div className="mb-10 relative">
        <div className={`absolute inset-0 blur-3xl rounded-full transition-all duration-300 ${isDragging ? "bg-primary/40" : "bg-primary/20 group-hover:bg-primary/30"}`}></div>
        <i className={`fas fa-cloud-upload-alt text-7xl transition-all duration-300 relative z-10 ${isDragging ? "text-primary scale-110" : "text-text-dark group-hover:text-primary group-hover:scale-110"}`}></i>
      </div>
      <div className="text-center">
        <h2 className="text-3xl font-black text-text-dark uppercase tracking-tighter mb-1 group-hover:text-text-muted transition-colors">
          Add Pages to
        </h2>
        <div className="text-primary font-black italic text-xl uppercase tracking-tighter mb-4 text-glow">
          {seriesName}
        </div>
      </div>
      <p className="text-text-dark font-medium mb-8 max-w-md text-center leading-relaxed">
        {isDragging
          ? "Drop files to add them to this series."
          : "Drag and drop your manga pages here or use the button below to add them to this series."}
      </p>
      <label className={`cursor-pointer bg-surface-raised text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-black/20 border border-border-muted ${isUploading ? "opacity-60 cursor-wait" : "hover:bg-primary hover:scale-105 active:scale-95 group-hover:shadow-primary/30 group-hover:border-primary/50"}`}>
        <input
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => onUpload(e.target.files)}
        />
        {isUploading ? "Adding files..." : "Upload Files"}
      </label>
    </div>
  );
};

export default React.memo(NoImagesState);
