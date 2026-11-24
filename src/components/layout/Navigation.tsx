import React from "react";
import { LayoutDashboard, FolderKanban, ClipboardCheck, Settings, UploadCloud } from "lucide-react";
import { ViewMode } from "../../types";

export interface NavigationProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  inspectionBadgeCount?: number;
  syncBadgeCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentView,
  onSelectView,
  inspectionBadgeCount = 0,
  syncBadgeCount = 0,
}) => {
  const navItems: { id: ViewMode; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "projects", label: "Projects", icon: FolderKanban },
    {
      id: "inspections",
      label: "Inspections",
      icon: ClipboardCheck,
      badge: inspectionBadgeCount > 0 ? inspectionBadgeCount : undefined,
    },
    {
      id: "sync",
      label: "Uploads",
      icon: UploadCloud,
      badge: syncBadgeCount > 0 ? syncBadgeCount : undefined,
    },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200/70 sticky top-16 z-30" aria-label="Main Navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-2 sm:space-x-3 overflow-x-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  isActive
                    ? "bg-brand-50 text-brand-700 font-semibold shadow-xs ring-1 ring-brand-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:scale-[0.98]"
                }`}
              >
                <Icon className={`w-4 h-4 transition-transform duration-200 ${isActive ? "text-brand-600 scale-105" : "text-slate-400 group-hover:text-slate-600"}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-0.5 px-2 py-0.2 rounded-full text-[11px] font-bold ${
                      isActive
                        ? "bg-brand-600 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
