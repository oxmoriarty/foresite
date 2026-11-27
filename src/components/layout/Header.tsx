import React, { useState } from "react";
import { Sparkles, LogIn, LogOut, CheckCircle2, AlertTriangle, Home } from "lucide-react";
import { config } from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { AuthModal } from "../auth/AuthModal";
import { ViewMode } from "../../types";

export interface HeaderProps {
  currentView?: ViewMode;
  onSelectView?: (view: ViewMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onSelectView }) => {
  const { currentUser, userProfile, logout, sendVerificationEmail } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [verifyNoticeSent, setVerifyNoticeSent] = useState(false);

  const handleResendVerification = async () => {
    try {
      await sendVerificationEmail();
      setVerifyNoticeSent(true);
      setTimeout(() => setVerifyNoticeSent(false), 5000);
    } catch (err) {
      console.warn("Failed to resend verification:", err);
    }
  };

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

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Identity */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectView?.("landing")}
                className="flex items-center gap-3 group text-left cursor-pointer focus:outline-none"
                title="Go to ForeSite Home"
              >
                <img
                  src="/favicon.svg"
                  alt="ForeSite"
                  className="w-9 h-9 object-contain group-hover:scale-105 transition-transform duration-200"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-brand-600 transition-colors">
                      ForeSite
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                      <Sparkles className="w-3 h-3 text-brand-500" />
                      Field Intelligence
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 hidden sm:block">
                    Site inspection and observation workspace
                  </p>
                </div>
              </button>
            </div>

            {/* Right Status Indicators & User Authentication */}
            <div className="flex items-center gap-3">
              {/* Home / Landing Switch Pill */}
              {onSelectView && (
                <button
                  type="button"
                  onClick={() => onSelectView(currentView === "landing" ? "overview" : "landing")}
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 cursor-pointer"
                  title={currentView === "landing" ? "Open Inspection Workspace" : "View Landing Page"}
                >
                  <Home className="w-3.5 h-3.5 text-brand-600" />
                  <span>{currentView === "landing" ? "Open Workspace" : "Landing Page"}</span>
                </button>
              )}


              {/* Environment Badge */}
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                v{config.appVersion}
              </span>

              {/* Authentication Controls */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                {currentUser ? (
                  <div className="flex items-center gap-3">
                    {/* User Badge / Avatar */}
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold ring-2 ring-brand-500/20"
                        title={currentUser.email || "Authenticated Inspector"}
                      >
                        {getInitials(userProfile?.displayName, currentUser.email)}
                      </div>
                      <div className="hidden md:block text-left">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-slate-800 leading-tight block truncate max-w-[140px]">
                            {userProfile?.displayName || currentUser.email?.split("@")[0]}
                          </span>
                          {currentUser.emailVerified ? (
                            <span title="Verified Inspector Email">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            </span>
                          ) : (
                            <span title="Email Not Yet Verified">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[140px]">
                          {userProfile?.role || "Site Inspector"}
                        </span>
                      </div>
                    </div>

                    {/* Sign Out Action */}
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Sign Out"
                      aria-label="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAuthModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 active:scale-95 transition-all duration-200 shadow-pill cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Unverified Email Warning Banner */}
        {currentUser && !currentUser.emailVerified && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center justify-between">
            <div className="flex items-center gap-2 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Your inspector email ({currentUser.email}) is pending verification.
              </span>
              <button
                type="button"
                onClick={handleResendVerification}
                className="underline font-semibold ml-2 text-amber-900 hover:text-amber-950 cursor-pointer"
              >
                {verifyNoticeSent ? "Verification Link Sent!" : "Resend Link"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
};
