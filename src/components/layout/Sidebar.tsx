import React from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  UploadCloud,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ViewMode } from "../../types";

export interface SidebarProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  inspectionBadgeCount?: number;
  syncBadgeCount?: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  inspectionBadgeCount = 0,
  syncBadgeCount = 0,
  isCollapsed,
  onToggleCollapse,
}) => {
  const workspaceItems: NavItem[] = [
    {
      id: "overview",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "projects",
      label: "Projects",
      icon: FolderKanban,
    },
    {
      id: "inspections",
      label: "Inspections",
      icon: ClipboardCheck,
      badge: inspectionBadgeCount > 0 ? inspectionBadgeCount : undefined,
    },
    {
      id: "uploads",
      label: "Uploads",
      icon: UploadCloud,
      badge: syncBadgeCount > 0 ? syncBadgeCount : undefined,
    },
  ];

  const preferenceItems: NavItem[] = [
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
    },
  ];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = currentView === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectView(item.id)}
        aria-current={isActive ? "page" : undefined}
        title={isCollapsed ? item.label : undefined}
        aria-label={item.label}
        className={`group relative flex items-center gap-3 w-full rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
          isCollapsed ? "justify-center p-2.5" : "px-3 py-2.5 text-xs font-semibold"
        } ${
          isActive
            ? "bg-white/10 text-white shadow-xs font-bold border border-white/20 backdrop-blur-xs"
            : "text-brand-200/75 hover:text-white hover:bg-white/5 active:scale-[0.98]"
        }`}
      >
        <Icon
          className={`shrink-0 transition-transform duration-200 ${
            isCollapsed ? "w-5 h-5" : "w-4 h-4"
          } ${isActive ? "text-white scale-105" : "text-brand-300/80 group-hover:text-white group-hover:scale-110"}`}
        />

        {!isCollapsed && (
          <span className="flex-1 text-left truncate">{item.label}</span>
        )}

        {/* Badge indicator */}
        {item.badge !== undefined && (
          <span
            className={`rounded-full font-bold flex items-center justify-center ${
              isCollapsed
                ? "absolute top-1 right-1 w-2 h-2 bg-brand-400"
                : `px-2 py-0.5 text-[10px] ${
                    isActive
                      ? "bg-brand-500 text-white"
                      : "bg-brand-800 text-brand-200 border border-brand-700/60 group-hover:bg-brand-700"
                  }`
            }`}
          >
            {!isCollapsed && item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 bg-brand-900 text-white border-r border-brand-800/80 transition-all duration-300 ease-in-out select-none shadow-sm ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Top Header: ForeSite Logo & Collapse Toggle */}
      <div
        className={`h-16 flex items-center border-b border-brand-800/60 px-4 ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectView("overview")}
          className="flex items-center gap-3 group text-left cursor-pointer focus:outline-none"
          title="ForeSite Dashboard"
        >
          {isCollapsed ? (
            <img
              src="/favicon.svg"
              alt="ForeSite"
              className="w-8 h-8 object-contain group-hover:scale-105 transition-transform duration-200 shrink-0"
            />
          ) : (
            <div className="flex items-center gap-2 overflow-hidden">
              <img
                src="/ForeSiteLogo.svg"
                alt="ForeSite"
                className="h-6 w-auto object-contain group-hover:scale-[1.02] transition-transform duration-200 shrink-0"
              />
              <span className="sr-only">ForeSite</span>
            </div>
          )}
        </button>

        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-lg border border-brand-700/60 hover:bg-brand-800 text-brand-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Primary Navigation Landmarks */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-4 space-y-6"
        aria-label="Main Navigation"
      >
        {/* Workspace Section */}
        <div className="space-y-1">
          {!isCollapsed ? (
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-brand-300/70 uppercase">
              Workspace
            </div>
          ) : (
            <div className="w-6 h-px bg-brand-800/60 mx-auto my-2" />
          )}

          <div className="space-y-1">
            {workspaceItems.map(renderNavButton)}
          </div>
        </div>

        {/* Preferences Section */}
        <div className="space-y-1">
          {!isCollapsed ? (
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-brand-300/70 uppercase">
              Preferences
            </div>
          ) : (
            <div className="w-6 h-px bg-brand-800/60 mx-auto my-2" />
          )}

          <div className="space-y-1">
            {preferenceItems.map(renderNavButton)}
          </div>
        </div>
      </nav>

      {/* Bottom Area: Expand Control when collapsed */}
      {isCollapsed && (
        <div className="p-3 border-t border-brand-800/60">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-full py-2 rounded-xl hover:bg-brand-800 text-brand-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </aside>
  );
};
