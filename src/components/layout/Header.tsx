import React from "react";
import { HardHat, Database, Sparkles } from "lucide-react";
import { config } from "../../config/env";

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500 text-white rounded-lg shadow-sm">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  ForeSite
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                  <Sparkles className="w-3 h-3 text-brand-500" />
                  Hybrid AI
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Site Inspection & Observation Workspace
              </p>
            </div>
          </div>

          {/* Right Status Indicators & User Placeholder */}
          <div className="flex items-center gap-3">
            {/* Local Evidence Storage Status */}
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
              title="Original inspection photos are preserved locally in browser IndexedDB"
            >
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>Local Storage: Active</span>
            </div>

            {/* Environment Badge */}
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              v{config.appVersion}
            </span>

            {/* Inspector Avatar / Profile Placeholder */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div
                className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white"
                title="Inspector Profile Placeholder"
              >
                FS
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
