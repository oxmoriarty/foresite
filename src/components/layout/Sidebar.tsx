import React from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  ArrowLeftRight,
  Settings,
  ChevronLeft,
  ChevronRight,
  Database,
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
      id: "sync",
      label: "Sync Center",
      icon: ArrowLeftRight,
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
        className={`group relative flex items-center gap-3 w-full rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          isCollapsed ? "justify-center p-2.5" : "px-3 py-2.5 text-xs font-semibold"
        } ${
          isActive
            ? "bg-brand-50 text-brand-700 shadow-2xs font-bold"
            : "text-slate-600 hover:text-slate-950 hover:bg-slate-100/80 active:scale-[0.98]"
        }`}
      >
        {/* Active Left Indicator Bar */}
        {isActive && !isCollapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-brand-600" />
        )}

        <Icon
          className={`shrink-0 transition-transform duration-200 ${
            isCollapsed ? "w-5 h-5" : "w-4 h-4"
          } ${isActive ? "text-brand-600 scale-105" : "text-slate-400 group-hover:text-slate-700"}`}
        />

        {!isCollapsed && (
          <span className="flex-1 text-left truncate">{item.label}</span>
        )}

        {/* Badge indicator */}
        {item.badge !== undefined && (
          <span
            className={`rounded-full font-bold flex items-center justify-center ${
              isCollapsed
                ? "absolute top-1 right-1 w-2 h-2 bg-brand-600"
                : `px-2 py-0.5 text-[10px] ${
                    isActive
                      ? "bg-brand-600 text-white"
                      : "bg-slate-200 text-slate-700 group-hover:bg-slate-300"
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
      className={`hidden md:flex flex-col shrink-0 bg-white border-r border-slate-200/80 transition-all duration-300 ease-in-out select-none ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Top Header: ForeSite Logo & Collapse Toggle */}
      <div
        className={`h-16 flex items-center border-b border-slate-100 px-4 ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectView("overview")}
          className="flex items-center gap-3 group text-left cursor-pointer focus:outline-none"
          title="ForeSite Dashboard"
        >
          {/* Black circle monogram logo */}
          <div className="w-9 h-9 rounded-full bg-slate-950 text-white flex items-center justify-center font-bold text-xs tracking-tight group-hover:scale-105 transition-transform duration-200 shadow-xs shrink-0">
            FS
          </div>

          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="text-base font-extrabold tracking-tight text-slate-950 block leading-tight">
                ForeSite
              </span>
              <span className="text-[10px] font-semibold text-brand-600 tracking-wide uppercase block">
                Field Intelligence
              </span>
            </div>
          )}
        </button>

        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-7 h-7 rounded-lg border border-slate-200/80 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
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
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Workspace
            </div>
          ) : (
            <div className="w-6 h-px bg-slate-200 mx-auto my-2" />
          )}

          <div className="space-y-1">
            {workspaceItems.map(renderNavButton)}
          </div>
        </div>

        {/* Preferences Section */}
        <div className="space-y-1">
          {!isCollapsed ? (
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Preferences
            </div>
          ) : (
            <div className="w-6 h-px bg-slate-200 mx-auto my-2" />
          )}

          <div className="space-y-1">
            {preferenceItems.map(renderNavButton)}
          </div>
        </div>
      </nav>

      {/* Bottom Area: Expand Control when collapsed & Local Storage Indicator */}
      <div className="p-3 border-t border-slate-100 space-y-2">
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-full py-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] font-medium text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Local Storage Active</span>
          </div>
        )}
      </div>
    </aside>
  );
};
