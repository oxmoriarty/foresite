import React, { useState, useEffect, useCallback } from "react";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Send,
  ShieldCheck,
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
      setFeedbackMessage(`Verification link resent to ${email}. Please check your inbox and spam folder.`);
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-brand-500 selection:text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            F
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">
            ForeSite
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200 ml-1">
            Security Gate
          </span>
        </div>

        {/* Card Container */}
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl border border-slate-200/80 rounded-2xl relative overflow-hidden">
          {/* Top colored accent line */}
          <div className="absolute top-0 inset-x-0 h-1 bg-amber-500" />

          {/* Central Email Icon Badge */}
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-sm mx-auto mb-5">
            <Mail className="w-8 h-8 animate-pulse" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 text-center tracking-tight">
            Verify Your Email Address
          </h2>

          <p className="text-sm text-slate-600 text-center mt-2.5 leading-relaxed">
            We sent a verification link to{" "}
            <span className="font-semibold text-slate-900 break-all">{email}</span>.
            ForeSite requires verified credentials before site inspection records, safety audits, and regulatory certifications can be accessed.
          </p>

          {/* Verification Status Pill */}
          <div className="mt-5 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/70">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Awaiting Email Verification
            </span>
          </div>

          {/* Feedback or Error Alerts */}
          {feedbackMessage && (
            <div className="mt-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{feedbackMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="mt-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm text-rose-800 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{errorMessage}</p>
            </div>
          )}

          {/* Helpful Tips Box */}
          <div className="mt-5 bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
              <span>Inspection Security Requirement</span>
            </div>
            <p className="leading-relaxed">
              Click the verification link sent by Google Firebase. If you do not see the message in your primary inbox, please check your spam or junk folder.
            </p>
          </div>

          {/* Primary & Secondary Action Buttons */}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => void handleCheckVerification()}
              disabled={isChecking}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 shadow-sm transition-all duration-150 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
              />
              {isChecking ? "Checking Status..." : "I Have Verified My Email"}
            </button>

            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={cooldownSeconds > 0 || isResending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 shadow-xs transition-all duration-150 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4 text-slate-500" />
              {isResending
                ? "Sending Email..."
                : cooldownSeconds > 0
                ? `Resend available in ${cooldownSeconds}s`
                : "Resend Verification Email"}
            </button>
          </div>

          {/* Sign Out Link */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out and Use Another Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
