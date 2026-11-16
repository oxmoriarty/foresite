import React from "react";
import { ShieldCheck, Cpu } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">ForeSite</span>
            <span>•</span>
            <span>BuildHybridAI 2026 Hackathon</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Cpu className="w-3.5 h-3.5 text-brand-500" />
              Chrome-First Hybrid Inference
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              Spark Plan (No Billing Account)
            </span>
            <span>MIT License</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
