import React, { useEffect } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  ArrowLeftRight,
  Settings,
  X,
  LogOut,
  Database,
  Home,
} from "lucide-react";
import { ViewMode } from "../../types";
import { useAuth } from "../../context/AuthContext";

export interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  inspectionBadgeCount?: number;
  syncBadgeCount?: number;
}

interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = ({
  isOpen,
  onClose,
  currentView,
  onSelectView,
  inspectionBadgeCount = 0,
  syncBadgeCount = 0,
}) => {
  const { currentUser, userProfile, logout } = useAuth();

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

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

  const handleItemClick = (id: ViewMode) => {
    onSelectView(id);
    onClose();
  };

  const displayName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    "Lead Site Inspector";
  const displayEmail =
    userProfile?.email || currentUser?.email || "inspector@foresite.test";

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Semi-transparent Backdrop Overlay */}
      <div
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div
        className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation drawer"
      >
        {/* Drawer Header */}
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center font-bold text-xs tracking-tight shadow-xs">
              FS
            </div>
            <div>
              <span className="font-extrabold text-sm text-slate-950 block leading-tight">
                ForeSite
              </span>
              <span className="text-[10px] font-semibold text-brand-600 tracking-wide uppercase block">
                Field Intelligence
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close navigation drawer"
            title="Close navigation drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <nav
          className="flex-1 overflow-y-auto px-4 py-5 space-y-6"
          aria-label="Mobile Navigation"
        >
          {/* Workspace Section */}
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Workspace
            </div>

            <div className="space-y-1">
              {workspaceItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? "bg-brand-50 text-brand-700 font-bold"
                        : "text-slate-600 hover:text-slate-950 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 ${
                          isActive ? "text-brand-600" : "text-slate-400"
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
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

          {/* Preferences Section */}
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Preferences
            </div>

            <div className="space-y-1">
              {preferenceItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? "bg-brand-50 text-brand-700 font-bold"
                        : "text-slate-600 hover:text-slate-950 hover:bg-slate-100"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? "text-brand-600" : "text-slate-400"
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Switch to Landing Page */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleItemClick("landing")}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>Landing Page</span>
            </button>
          </div>
        </nav>

        {/* Drawer Footer with User Info & Sign Out */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-900 truncate">
                {displayName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {displayEmail}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <Database className="w-3 h-3 text-slate-400" />
              <span>IndexedDB Active</span>
            </div>

            <button
              type="button"
              onClick={async () => {
                onClose();
                await logout();
                onSelectView("landing");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
