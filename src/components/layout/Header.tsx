import { ScanFace } from "lucide-react";
import React from "react";

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur-xl border-b border-slate-800 p-3 sm:p-4 shadow-2xl">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <ScanFace className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-black tracking-tighter text-white">
            Manga
            <span className="text-indigo-400">Lens</span>
          </h1>
        </div>
      </div>
    </header>
  );
};

export default Header;
