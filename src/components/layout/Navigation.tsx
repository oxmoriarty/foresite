import React from "react";
import { LayoutDashboard, FolderKanban, ClipboardCheck, Settings, ArrowLeftRight } from "lucide-react";
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
      label: "Sync Center",
      icon: ArrowLeftRight,
      badge: syncBadgeCount > 0 ? syncBadgeCount : undefined,
    },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="bg-white border-b border-slate-200" aria-label="Main Navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-8 overflow-x-auto py-2 sm:py-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors rounded-t-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  isActive
                    ? "border-brand-600 text-brand-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-brand-600" : "text-slate-400"}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                      isActive
                        ? "bg-brand-100 text-brand-700"
                        : "bg-slate-100 text-slate-600"
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
