import React from "react";

interface EmptyWorkspaceProps {
  onAddSeries: () => void;
}

const EmptyWorkspace: React.FC<EmptyWorkspaceProps> = ({ onAddSeries }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[65vh] rounded-[3rem] border-2 border-dashed border-border-muted bg-surface/30 group transition-all duration-700 hover:border-primary/40 glass">
      <div className="mb-10 relative">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full group-hover:bg-primary/30 transition-all duration-700"></div>
        <i className="fas fa-layer-group text-7xl text-text-dark group-hover:text-primary group-hover:scale-110 transition-all duration-500 relative z-10"></i>
      </div>
      <h2 className="text-3xl font-black text-text-dark uppercase tracking-tighter mb-4 group-hover:text-text-muted transition-colors">
        No Series Selected
      </h2>
      <p className="text-text-dark font-medium mb-8 max-w-md text-center leading-relaxed">
        Select a series from the sidebar or create a new one to start
        translating your manga.
      </p>
      <button
        onClick={onAddSeries}
        className="bg-primary text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary-hover hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 border border-primary/50"
      >
        Create New Series
      </button>
    </div>
  );
};

export default React.memo(EmptyWorkspace);
