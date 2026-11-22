import React from "react";
import { ShieldCheck, Cpu } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white/80 backdrop-blur-md border-t border-slate-200/80 mt-auto py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-700">ForeSite</span>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Cpu className="w-3.5 h-3.5 text-brand-600" />
              Field Intelligence Workspace
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-slate-600">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Offline Ready
            </span>
            <span>MIT License</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
