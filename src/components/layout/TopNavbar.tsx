import React, { useState, useEffect, useRef } from "react";
import {
  Menu,
  WifiOff,
  LogOut,
  ChevronDown,
  Home,
  Settings,
  X,
  CheckCircle2,
} from "lucide-react";
import { ViewMode } from "../../types";
import { useAuth } from "../../context/AuthContext";

export interface TopNavbarProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  selectedProjectId?: string | null;
  selectedProjectName?: string;
  onClearProjectFilter?: () => void;
  onOpenMobileMenu: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentView,
  onSelectView,
  selectedProjectId,
  selectedProjectName,
  onClearProjectFilter,
  onOpenMobileMenu,
}) => {
  const { currentUser, userProfile, logout } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Track network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Close profile dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  // Derive inspector initials
  const getInitials = (name?: string | null, email?: string | null): string => {
    if (name) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return "FS";
  };

  const displayName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    "Lead Site Inspector";
  const displayEmail =
    userProfile?.email || currentUser?.email || "inspector@foresite.test";
  const initials = getInitials(displayName, displayEmail);

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all duration-200"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between text-xs font-medium text-slate-700">
        {/* Left Side: Mobile Menu Button & Contextual Project Filter */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger trigger */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Open navigation menu"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Contextual Project Badge if active on Inspections page */}
          {selectedProjectId && selectedProjectName && currentView === "inspections" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-[11px] font-semibold">
              <span className="truncate max-w-[200px]">{selectedProjectName}</span>
              {onClearProjectFilter && (
                <button
                  type="button"
                  onClick={onClearProjectFilter}
                  className="hover:text-brand-900 transition-colors cursor-pointer"
                  title="Clear project filter"
                  aria-label="Clear project filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}
        </div>

        {/* Right Side: Global Application Controls */}
        <div className="flex items-center gap-3">
          {/* Offline Warning only when disconnected */}
          {!isOnline && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 shadow-2xs"
              title="Working offline with local storage"
            >
              <WifiOff className="w-3 h-3 text-amber-600" />
              <span>Offline Mode</span>
            </div>
          )}

          {/* User Profile Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-expanded={isProfileMenuOpen}
              aria-label="User profile menu"
              title={displayName}
            >
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {initials}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {/* Profile Dropdown Card */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in duration-150">
                {/* User Identity Info */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {displayEmail}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Verified Inspector</span>
                  </div>
                </div>

                {/* Menu Action Options */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onSelectView("landing");
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    <Home className="w-3.5 h-3.5 text-slate-400" />
                    <span>Landing Page</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onSelectView("settings");
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Settings</span>
                  </button>
                </div>

                {/* Sign Out Action */}
                <div className="border-t border-slate-100 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsProfileMenuOpen(false);
                      await logout();
                      onSelectView("landing");
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
