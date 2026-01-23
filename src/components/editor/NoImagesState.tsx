import React from "react";

interface NoImagesStateProps {
  seriesName: string | undefined;
  onUpload: (files: FileList | null) => void;
}

const NoImagesState: React.FC<NoImagesStateProps> = ({
  seriesName,
  onUpload,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-[65vh] rounded-[3rem] border-2 border-dashed border-border-muted bg-surface/30 group transition-all duration-700 hover:border-primary/40 glass">
      <div className="mb-10 relative">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full group-hover:bg-primary/30 transition-all duration-700"></div>
        <i className="fas fa-cloud-upload-alt text-7xl text-text-dark group-hover:text-primary group-hover:scale-110 transition-all duration-500 relative z-10"></i>
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
        Drag and drop your manga pages here or use the button below to add them
        to this series.
      </p>
      <label className="cursor-pointer bg-surface-raised text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/20 group-hover:shadow-primary/30 border border-border-muted group-hover:border-primary/50">
        <input
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => onUpload(e.target.files)}
        />
        Upload Files
      </label>
    </div>
  );
};

export default React.memo(NoImagesState);
