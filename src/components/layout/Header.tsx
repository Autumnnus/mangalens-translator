import { ScanFace } from "lucide-react";
import React from "react";

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border-muted p-4 sm:p-5 glass">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3.5 group cursor-default">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20 shadow-glow transition-all group-hover:scale-110 group-hover:bg-primary group-hover:border-primary/50 group-hover:rotate-6">
            <ScanFace className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
          </div>
          <h1 className="text-xl font-black tracking-tighter text-text-main group-hover:scale-105 transition-transform">
            Manga
            <span className="text-primary text-glow">Lens</span>
          </h1>
        </div>
      </div>
    </header>
  );
};

export default Header;
