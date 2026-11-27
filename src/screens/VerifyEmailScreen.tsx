import React, { useState, useEffect, useCallback } from "react";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Send,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export interface VerifyEmailScreenProps {
  email: string;
  onSignOut: () => Promise<void>;
  onVerificationSuccess?: () => void;
}

export const VerifyEmailScreen: React.FC<VerifyEmailScreenProps> = ({
  email,
  onSignOut,
  onVerificationSuccess,
}) => {
  const { reloadUser, sendVerificationEmail } = useAuth();

  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Check verification status
  const handleCheckVerification = useCallback(async () => {
    setIsChecking(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      const isVerified = await reloadUser();
      if (isVerified) {
        setFeedbackMessage("Email verified successfully! Welcome to ForeSite.");
        if (onVerificationSuccess) {
          onVerificationSuccess();
        }
      } else {
        setErrorMessage(
          "Your email is not verified yet. Please click the link sent to your inbox, then click here again."
        );
      }
    } catch {
      setErrorMessage("Could not verify status. Please check your network connection and try again.");
    } finally {
      setIsChecking(false);
    }
  }, [reloadUser, onVerificationSuccess]);

  // Resend verification email
  const handleResend = async () => {
    if (cooldownSeconds > 0 || isResending) return;

    setIsResending(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      await sendVerificationEmail();
      setFeedbackMessage(`Verification link resent to ${email}.`);
      setCooldownSeconds(60);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || "Failed to resend verification email. Please try again shortly.");
    } finally {
      setIsResending(false);
    }
  };

  // Cooldown countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Automatically check verification status when the window regains focus or visibility
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void handleCheckVerification();
      }
    };

    const onFocus = () => {
      void handleCheckVerification();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [handleCheckVerification]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-brand-500 selection:text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand Monogram */}
        <div className="text-center mb-6">
          <img
            src="/ForeSiteLogo.svg?v=2"
            alt="ForeSite"
            className="h-8 w-auto object-contain mx-auto"
          />
        </div>

        {/* Main Card */}
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-3xl border border-slate-200/80">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4 border border-brand-100">
            <Mail className="w-6 h-6" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 text-center tracking-tight mb-2">
            Verify Your Email Address
          </h2>

          <p className="text-xs sm:text-sm text-slate-600 text-center mb-6 leading-relaxed">
            We sent a verification link to{" "}
            <span className="font-semibold text-slate-900 break-all">{email}</span>.
          </p>

          {/* Feedback or Error Alerts */}
          {feedbackMessage && (
            <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => void handleCheckVerification()}
              disabled={isChecking}
              className="w-full group inline-flex items-center justify-center gap-3 py-3 px-4 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 active:scale-95 transition-all duration-200 cursor-pointer shadow-pill disabled:opacity-50"
            >
              <span>{isChecking ? "Checking status..." : "I have verified my email"}</span>
              <span className="w-6 h-6 rounded-full bg-white text-brand-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200 shadow-2xs">
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={cooldownSeconds > 0 || isResending}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {isResending
                  ? "Sending email..."
                  : cooldownSeconds > 0
                  ? `Resend available in ${cooldownSeconds}s`
                  : "Resend verification email"}
              </span>
            </button>
          </div>

          {/* Sign Out Option */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
