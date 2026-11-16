import React, { useState } from "react";
import { HardHat, Database, Sparkles, LogIn, LogOut, CheckCircle2, AlertTriangle } from "lucide-react";
import { config } from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { AuthModal } from "../auth/AuthModal";

export const Header: React.FC = () => {
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

            {/* Right Status Indicators & User Authentication */}
            <div className="flex items-center gap-3">
              {/* Local Evidence Storage Status */}
              <div
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                title="Original inspection photos are preserved locally in browser IndexedDB"
              >
                <Database className="w-3.5 h-3.5 text-slate-500" />
                <span>Local Storage: Active</span>
              </div>

              {/* Environment Badge */}
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                v{config.appVersion}
              </span>

              {/* Authentication Controls */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                {currentUser ? (
                  <div className="flex items-center gap-3">
                    {/* User Badge / Avatar */}
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold ring-2 ring-brand-500/30"
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
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors shadow-xs"
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
                className="underline font-semibold ml-2 text-amber-900 hover:text-amber-950"
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
