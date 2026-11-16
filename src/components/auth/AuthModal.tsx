/**
 * ForeSite Inspector Authentication Modal
 *
 * Provides tabbed interface for:
 * 1. Inspector Sign In
 * 2. Inspector Account Registration
 * 3. Password Reset Request
 */

import React, { useState } from "react";
import { HardHat, LogIn, UserPlus, KeyRound, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useAuth } from "../../context/AuthContext";

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "signin" | "register" | "reset";
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = "signin",
}) => {
  const { login, register, resetPassword, error, clearError, isConfigured } = useAuth();

  const [activeTab, setActiveTab] = useState<"signin" | "register" | "reset">(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleTabSwitch = (tab: "signin" | "register" | "reset") => {
    setActiveTab(tab);
    setLocalError(null);
    setSuccessMessage(null);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    clearError();

    if (!email.trim()) {
      setLocalError("Email address is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (activeTab === "signin") {
        if (!password) {
          setLocalError("Password is required.");
          setSubmitting(false);
          return;
        }
        await login(email, password);
        handleClose();
      } else if (activeTab === "register") {
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
        handleClose();
      } else if (activeTab === "reset") {
        await resetPassword(email);
        setSuccessMessage("Password reset email sent. Please check your inbox.");
      }
    } catch {
      // Handled via context or local error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-500 text-white rounded-md">
            <HardHat className="w-4 h-4" />
          </div>
          <span>ForeSite Inspector Access</span>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Unconfigured Alert Banner */}
        {!isConfigured && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Demo / Offline Preview Mode</span>
              Firebase environment variables are not yet configured in <code>.env.local</code>. Authentication operations will be simulated or unavailable until configured.
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleTabSwitch("signin")}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === "signin"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch("register")}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === "register"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch("reset")}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
              activeTab === "reset"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Reset</span>
            </div>
          </button>
        </div>

        {/* Status Feedback Messages */}
        {(localError || error) && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{localError || error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name Field (Register Only) */}
          {activeTab === "register" && (
            <div>
              <label
                htmlFor="auth-displayName"
                className="block text-xs font-semibold uppercase text-slate-700 mb-1"
              >
                Inspector Name & Credentials <span className="text-red-500">*</span>
              </label>
              <input
                id="auth-displayName"
                type="text"
                required
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. S. Vance, PE (Lead Structural Inspector)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {/* Email Field */}
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold uppercase text-slate-700 mb-1"
            >
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="inspector@agency.gov or name@company.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Password Field (Sign In & Register) */}
          {activeTab !== "reset" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-semibold uppercase text-slate-700"
                >
                  Password <span className="text-red-500">*</span>
                </label>
                {activeTab === "signin" && (
                  <button
                    type="button"
                    onClick={() => handleTabSwitch("reset")}
                    className="text-[11px] text-brand-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                autoComplete={activeTab === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {activeTab === "register" && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Must be at least 6 characters long.
                </p>
              )}
            </div>
          )}

          {/* Confirm Password Field (Register Only) */}
          {activeTab === "register" && (
            <div>
              <label
                htmlFor="auth-confirmPassword"
                className="block text-xs font-semibold uppercase text-slate-700 mb-1"
              >
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                id="auth-confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={submitting}
              icon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {submitting
                ? "Processing..."
                : activeTab === "signin"
                ? "Sign In"
                : activeTab === "register"
                ? "Create Account"
                : "Send Reset Link"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
