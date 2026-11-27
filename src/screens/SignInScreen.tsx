import React, { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  Lock,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export interface SignInScreenProps {
  onSuccess: () => void;
  onNavigateHome: () => void;
  targetDestinationName?: string;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({
  onSuccess,
  onNavigateHome,
}) => {
  const { login, register, resetPassword, loginAsDemo } = useAuth();

  const [mode, setMode] = useState<"signin" | "register" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setLocalError("Email address is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        if (!password) {
          setLocalError("Password is required.");
          setSubmitting(false);
          return;
        }
        await login(email, password);
        onSuccess();
      } else if (mode === "register") {
        if (!displayName.trim()) {
          setLocalError("Inspector name or title is required.");
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setLocalError("Password must be at least 6 characters long.");
          setSubmitting(false);
          return;
        }
        if (password !== confirmPassword) {
          setLocalError("Passwords do not match. Please verify.");
          setSubmitting(false);
          return;
        }
        await register(email, password, displayName);
        onSuccess();
      } else if (mode === "reset") {
        await resetPassword(email);
        setSuccessMessage("Password reset email sent. Please check your inbox.");
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setLocalError(e.message || "An authentication error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setLocalError(null);
    setSubmitting(true);
    try {
      await loginAsDemo();
      onSuccess();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setLocalError(e.message || "Demo sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-brand-500 selection:text-white">
      {/* Top Bar with Return Home link */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 mb-6">
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
          <span>Return to home</span>
        </button>
      </div>

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
          {/* Mode Tabs */}
          <div className="flex border-b border-slate-200 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-colors cursor-pointer ${
                mode === "signin"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-colors cursor-pointer ${
                mode === "register"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setLocalError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-colors cursor-pointer ${
                mode === "reset"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Reset password
            </button>
          </div>

          {/* Error Banner */}
          {localError && (
            <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Inspector Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe, Lead Structural Inspector"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Inspector Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="inspector@agency.gov"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>

            {mode !== "reset" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                </div>
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-slate-900 placeholder:text-slate-400 transition-all"
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full group inline-flex items-center justify-center gap-3 py-3 px-4 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 active:scale-95 transition-all duration-200 cursor-pointer shadow-pill disabled:opacity-50"
              >
                <span>
                  {mode === "signin"
                    ? "Sign in to workspace"
                    : mode === "register"
                    ? "Create inspector account"
                    : "Send reset link"}
                </span>
                <span className="w-6 h-6 rounded-full bg-white text-brand-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200 shadow-2xs">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
          </form>

          {/* Quick Demo Access Option */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 mb-3">
              Testing locally or previewing without credentials?
            </p>
            <button
              type="button"
              onClick={handleDemoSignIn}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition-all duration-200 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
              <span>Continue as Demo Inspector</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};