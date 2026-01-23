import React from "react";

interface EditorPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const EditorPagination: React.FC<EditorPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const handlePageClick = (p: number) => {
    onPageChange(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex items-center justify-center gap-4 py-12 border-t border-slate-800/50 mt-12">
      <button
        disabled={currentPage === 1}
        onClick={() => handlePageClick(currentPage - 1)}
        className="w-12 h-12 flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-indigo-500/50 rounded-2xl transition-all disabled:opacity-30 shadow-xl"
      >
        <i className="fas fa-arrow-left"></i>
      </button>

      <div className="hidden sm:flex items-center gap-2">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
          if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2) {
            return (
              <button
                key={p}
                onClick={() => handlePageClick(p)}
                className={`w-12 h-12 rounded-2xl font-black text-xs transition-all border ${
                  currentPage === p
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {p}
              </button>
            );
          }
          if (Math.abs(p - currentPage) === 3) {
            return (
              <span key={p} className="text-slate-700 font-bold px-1">
                ...
              </span>
            );
          }
          return null;
        })}
      </div>

      <div className="sm:hidden text-xs font-black text-slate-500 uppercase tracking-widest">
        Page {currentPage} of {totalPages}
      </div>

      <button
        disabled={currentPage === totalPages}
        onClick={() => handlePageClick(currentPage + 1)}
        className="w-12 h-12 flex items-center justify-center bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-indigo-500/50 rounded-2xl transition-all disabled:opacity-30 shadow-xl"
      >
        <i className="fas fa-arrow-right"></i>
      </button>
    </div>
  );
};

export default React.memo(EditorPagination);
