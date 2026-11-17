import React, { useState, useEffect } from "react";
import {
  Database,
  ShieldCheck,
  Cpu,
  HardHat,
  UserCheck,
  Flame,
  AlertCircle,
  HardDrive,
  RefreshCw,
  Trash2,
  Lock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { config } from "../config/env";
import { useAuth } from "../context/AuthContext";
import {
  getStorageQuotaEstimate,
  requestPersistentStorage,
  getAllEvidencePhotosCount,
  getAllLocalDrafts,
  clearAllLocalEvidence,
} from "../services/indexeddb";
import { formatBytes } from "../services/photoValidation";
import { StorageEstimateInfo, CloudFallbackPreference } from "../types";
import {
  getAutoCloudFallbackPreference,
  setAutoCloudFallbackSetting,
  SAFE_DEFAULT_PREFERENCE,
} from "../services/preferences";

export const SettingsScreen: React.FC = () => {
  const { currentUser, userProfile, isConfigured } = useAuth();

  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo>({
    supported: false,
    usageBytes: 0,
    quotaBytes: 0,
    usagePercentage: 0,
    persisted: false,
  });

  const [localPhotoCount, setLocalPhotoCount] = useState<number>(0);
  const [localDraftCount, setLocalDraftCount] = useState<number>(0);
  const [isClearing, setIsClearing] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [refreshingQuota, setRefreshingQuota] = useState(false);

  // AI & Privacy: Persistent Automatic Cloud Fallback Preference
  const [cloudFallbackPref, setCloudFallbackPref] = useState<CloudFallbackPreference>(SAFE_DEFAULT_PREFERENCE);
  const [prefLoading, setPrefLoading] = useState<boolean>(true);
  const [prefSaving, setPrefSaving] = useState<boolean>(false);
  const [prefStatusMessage, setPrefStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadPref = async () => {
      setPrefLoading(true);
      try {
        const pref = await getAutoCloudFallbackPreference(currentUser?.uid);
        if (isMounted) {
          setCloudFallbackPref(pref);
        }
      } catch (err) {
        console.warn("Failed to load cloud fallback preference:", err);
      } finally {
        if (isMounted) {
          setPrefLoading(false);
        }
      }
    };

    loadPref();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  const handleToggleFallback = async (newVal: boolean) => {
    setPrefSaving(true);
    setPrefStatusMessage(null);
    try {
      const updated = await setAutoCloudFallbackSetting(currentUser?.uid, newVal);
      setCloudFallbackPref(updated);
      if (updated.syncStatus === "synced") {
        setPrefStatusMessage("Setting saved and synchronized with your account.");
      } else if (updated.syncStatus === "failed") {
        setPrefStatusMessage("Saved locally on this device; cloud synchronization failed.");
      }
    } catch (err) {
      console.error("Failed to update cloud fallback setting:", err);
      setPrefStatusMessage("Failed to update setting. Please try again.");
    } finally {
      setPrefSaving(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setRefreshingQuota(true);
      try {
        const [estimate, photoCount, drafts] = await Promise.all([
          getStorageQuotaEstimate(),
          getAllEvidencePhotosCount(),
          getAllLocalDrafts(),
        ]);
        if (isMounted && typeof window !== "undefined") {
          setStorageInfo(estimate);
          setLocalPhotoCount(photoCount);
          setLocalDraftCount(drafts.length);
        }
      } catch (err) {
        console.warn("Failed to load storage metrics:", err);
      } finally {
        if (isMounted && typeof window !== "undefined") {
          setRefreshingQuota(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefreshClick = async () => {
    setRefreshingQuota(true);
    try {
      const [estimate, photoCount, drafts] = await Promise.all([
        getStorageQuotaEstimate(),
        getAllEvidencePhotosCount(),
        getAllLocalDrafts(),
      ]);
      setStorageInfo(estimate);
      setLocalPhotoCount(photoCount);
      setLocalDraftCount(drafts.length);
    } catch (err) {
      console.warn("Failed to load storage metrics:", err);
    } finally {
      setRefreshingQuota(false);
    }
  };

  const handleRequestPersistence = async () => {
    const granted = await requestPersistentStorage();
    if (granted) {
      await handleRefreshClick();
    }
  };

  const handleClearAllEvidence = async () => {
    setIsClearing(true);
    try {
      await clearAllLocalEvidence();
      await handleRefreshClick();
      setIsClearModalOpen(false);
    } catch (err) {
      console.error("Failed to clear local evidence:", err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Settings & Architecture Policy
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review inspector identity, IndexedDB storage quotas, hybrid inference configuration, and compliance policies.
        </p>
      </div>

      {/* Section 0: Inspector Authentication & Profile */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-brand-100 text-brand-700 rounded-lg">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Inspector Authentication & Identity
            </h2>
            <p className="text-xs text-slate-500">
              Session state and credential verification from Firebase Auth
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 text-xs text-slate-700">
          {currentUser ? (
            <div className="space-y-2">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="font-medium text-slate-600">Inspector Name:</span>
                <span className="font-semibold text-slate-900">
                  {userProfile?.displayName || currentUser.displayName || "Site Inspector"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="font-medium text-slate-600">Email Address:</span>
                <span className="font-mono text-slate-900">{currentUser.email}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="font-medium text-slate-600">Inspector UID:</span>
                <span className="font-mono text-[11px] text-slate-700 select-all">
                  {currentUser.uid}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="font-medium text-slate-600">Email Verification:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    currentUser.emailVerified
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {currentUser.emailVerified ? "Verified" : "Pending Verification"}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="font-medium text-slate-600">Assigned Role:</span>
                <span className="font-medium text-slate-800">
                  {userProfile?.role || "Site Inspector"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 space-y-1">
              <span className="font-semibold text-slate-800 block">
                Unauthenticated (Guest Preview Session)
              </span>
              <p>
                You are currently viewing ForeSite with local sample data. Sign in using the &quot;Sign In&quot; button in the header to synchronize projects and inspection observations with your isolated Cloud Firestore account.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Section 1: Local Photo Evidence & IndexedDB Quota (Phase 3 Core) */}
      <Card>
        <CardHeader className="flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Local Photograph Retention (IndexedDB)
              </h2>
              <p className="text-xs text-slate-500">
                Zero-cloud photo binary storage and browser disk capacity
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={refreshingQuota}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Storage Quota"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingQuota ? "animate-spin" : ""}`} />
          </button>
        </CardHeader>
        <CardBody className="space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Real-Time Storage Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="font-medium">Photos in IndexedDB</span>
                <Database className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <span className="text-lg font-bold text-slate-900">
                {localPhotoCount} photos
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Stored as original Blobs
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="font-medium">Unsynced Local Drafts</span>
                <HardDrive className="w-3.5 h-3.5 text-brand-600" />
              </div>
              <span className="text-lg font-bold text-slate-900">
                {localDraftCount} drafts
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Recoverable across reloads
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="font-medium">Storage Persistence</span>
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-slate-900 block truncate">
                {storageInfo.persisted ? "Persisted (Protected)" : "Standard (Best-effort)"}
              </span>
              {!storageInfo.persisted && (
                <button
                  type="button"
                  onClick={handleRequestPersistence}
                  className="text-[10px] text-brand-600 font-semibold hover:underline mt-0.5"
                >
                  Request Persistence &rarr;
                </button>
              )}
            </div>
          </div>

          {/* Browser Storage Quota Progress */}
          {storageInfo.supported && storageInfo.quotaBytes > 0 && (
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-800">Browser Disk Quota Usage</span>
                <span className="font-mono text-slate-600">
                  {formatBytes(storageInfo.usageBytes)} / {formatBytes(storageInfo.quotaBytes)} ({storageInfo.usagePercentage}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    storageInfo.usagePercentage > 80 ? "bg-red-500" : "bg-brand-500"
                  }`}
                  style={{ width: `${Math.min(storageInfo.usagePercentage, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Local-Only Disclosure Warning */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Mandatory Local Storage Disclosure:</span>
                <p className="text-[11px] text-amber-800 leading-normal mt-0.5">
                  Original site photographs and unfinished inspection drafts are stored exclusively in your local browser profile (IndexedDB). They are <strong>never uploaded to cloud storage</strong>.
                </p>
              </div>
            </div>
            <ul className="list-disc pl-7 text-[11px] text-amber-800 space-y-1">
              <li>
                <strong>No Cloud Backup:</strong> Photos remain on this specific device and browser profile only.
              </li>
              <li>
                <strong>Cache Eviction Risk:</strong> Clearing browser history, deleting site data, or deleting the Chrome user profile will permanently erase locally stored photographic evidence.
              </li>
              <li>
                <strong>External Copy Recommendation:</strong> Inspectors must keep offline backups of primary evidence files before clearing browser cache.
              </li>
            </ul>
          </div>

          {/* Danger Zone: Clear Local Database */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 block">Reset Local Evidence Database</span>
              <span className="text-[11px] text-slate-500">
                Purge all photographic Blobs and local drafts stored in IndexedDB.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50 border-red-200"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setIsClearModalOpen(true)}
            >
              Clear Local Data
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Section 2: Firebase Foundation & Infrastructure */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Firebase Services & Infrastructure
            </h2>
            <p className="text-xs text-slate-500">
              Spark Plan compliance and service initialization status
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 text-xs text-slate-700">
          <div className="space-y-2">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="font-medium text-slate-600">Firebase Config Status:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  isConfigured
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {isConfigured ? "Connected (Live Client SDK)" : "Offline / Scaffold Preview"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="font-medium text-slate-600">Target Project ID:</span>
              <span className="font-mono text-slate-800">
                {config.firebase.projectId || "foresite-preview (unconfigured)"}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="font-medium text-slate-600">App Check Provider:</span>
              <span className="font-medium text-slate-800">
                {config.appCheck.siteKey
                  ? "reCAPTCHA Enterprise (Production)"
                  : config.appCheck.debugToken
                  ? "Custom Debug Provider (Development)"
                  : "Optional / Disabled (Non-blocking)"}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-medium text-slate-600">Billing Tier:</span>
              <span className="font-semibold text-emerald-700">
                Firebase Spark Plan ($0.00 / Month - Zero Billing Enforced)
              </span>
            </div>
          </div>

          {!isConfigured && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                To connect to your own Firebase project, copy <code>.env.example</code> to <code>.env.local</code> and populate your Firebase project credentials. See <code>docs/FIREBASE_SETUP.md</code> for step-by-step instructions.
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Section 3: AI & Privacy — Automatic Cloud Fallback */}
      <Card>
        <CardHeader className="flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                AI & Privacy — Automatic Cloud Fallback
              </h2>
              <p className="text-xs text-slate-500">
                Hybrid AI inference routing policy and Google Cloud transmission control
              </p>
            </div>
          </div>
          {/* Sync Status Badge */}
          <div>
            {prefLoading ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                Loading...
              </span>
            ) : cloudFallbackPref.syncStatus === "synced" ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Synced with Cloud
              </span>
            ) : cloudFallbackPref.syncStatus === "failed" ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-600" />
                ON (Local Only - Unsynced)
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                Offline Default (OFF)
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody className="space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Main Setting Toggle Row */}
          <div className="flex items-start justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">
                  Automatic cloud fallback
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    cloudFallbackPref.enabled
                      ? "bg-brand-100 text-brand-800"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {cloudFallbackPref.enabled ? "Enabled" : "Disabled (Default)"}
                </span>
              </div>
              <p className="text-slate-600 text-xs">
                {cloudFallbackPref.enabled
                  ? "Mode A active: On-device inference is attempted first; automatically falls back to gemini-3.5-flash-lite if the local model is unavailable or unready. Per-request consent modal is bypassed."
                  : "Mode B active (Default): Strictly on-device inference. Awaits on-device model download. If on-device inference is unavailable, execution halts locally before network transmission, requiring explicit consent per request."}
              </p>
              {prefStatusMessage && (
                <p className="text-brand-600 font-medium text-[11px] pt-1">
                  {prefStatusMessage}
                </p>
              )}
            </div>

            {/* Toggle Button */}
            <div className="shrink-0 pt-0.5">
              <button
                type="button"
                role="switch"
                aria-checked={cloudFallbackPref.enabled}
                disabled={prefSaving || prefLoading}
                onClick={() => handleToggleFallback(!cloudFallbackPref.enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                  cloudFallbackPref.enabled ? "bg-brand-600" : "bg-slate-300"
                } ${prefSaving || prefLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="sr-only">Toggle automatic cloud fallback</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    cloudFallbackPref.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Operational Policy Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div
              className={`p-3 rounded-lg border ${
                cloudFallbackPref.enabled
                  ? "bg-brand-50/50 border-brand-200 ring-1 ring-brand-200"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                <span>Setting ON — Automatic Cloud Fallback</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                <li>Uses Firebase AI Logic <code>PREFER_ON_DEVICE</code>.</li>
                <li>Target cloud model: <code>gemini-3.5-flash-lite</code>.</li>
                <li>Initializes on-device model without blocking inference.</li>
                <li>Seamless cloud fallback during background model download.</li>
                <li>Does not show a per-request cloud consent modal.</li>
              </ul>
            </div>

            <div
              className={`p-3 rounded-lg border ${
                !cloudFallbackPref.enabled
                  ? "bg-brand-50/50 border-brand-200 ring-1 ring-brand-200"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Setting OFF — Consent-Controlled (Default)</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                <li>Uses Firebase AI Logic <code>ONLY_ON_DEVICE</code>.</li>
                <li>Awaits on-device model download (with % progress bar).</li>
                <li>If on-device inference fails, halts before cloud transmission.</li>
                <li>Requires explicit user consent via Cloud Consent Dialog.</li>
                <li>If declined, cancels AI processing; manual authoring continues.</li>
              </ul>
            </div>
          </div>

          {/* Mandatory Privacy & Data Terms Disclosures */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-600" />
              <span>Data Protection & Privacy Terms</span>
            </div>
            <p className="text-slate-600">
              <strong>Google Gemini Developer API Free-Tier Terms:</strong> Under Google&apos;s Gemini Developer API free-tier terms, content submitted to the API (including inspection photographs and notes) may be processed by Google and used to improve Google products and services.
            </p>
            <p className="text-slate-600">
              <strong>IndexedDB & Firestore Data Isolation:</strong> Original photo binaries remain in browser IndexedDB. ForeSite does not upload them to Firestore or cloud storage. Declining cloud AI processing prevents transmission of photographs and notes for AI processing, but does <em>not</em> disable ordinary Firestore synchronization of saved structured inspection records.
            </p>
          </div>

          {/* Chrome Built-in AI Prerequisites */}
          <div className="pt-2 border-t border-slate-100">
            <h4 className="font-semibold text-slate-900 mb-1">
              Chrome Desktop Prerequisites for On-Device Gemini Nano:
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>Google Chrome Desktop version 139 or later (Windows, macOS, Linux).</li>
              <li>Approximately 22 GB free disk space on the volume containing your Chrome profile.</li>
              <li>Hardware requirements: GPU with strictly more than 4 GB VRAM, OR CPU with at least 16 GB system RAM and 4 or more cores.</li>
              <li>Flag: <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> set to <strong>Enabled</strong>.</li>
              <li>Flag: <code>chrome://flags/#optimization-guide-on-device-model</code> set to <strong>Enabled</strong>.</li>
              <li className="text-slate-500 italic">Note: Gemini Nano model availability is managed by Chrome; exact sub-version identifiers (e.g. &quot;Nano 4&quot;) remain unverified at runtime.</li>
            </ul>
          </div>
        </CardBody>
      </Card>

      {/* Section 4: No-Cost Policy & Security Rules */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Zero-Billing & Data Security Invariants
            </h2>
            <p className="text-xs text-slate-500">
              Mandatory Spark plan and path-scoped security isolation
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 text-xs text-slate-700 leading-relaxed">
          <p>
            ForeSite operates strictly under the <strong>Firebase Spark Plan</strong> ($0/month, no credit card, no billing account attached):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block">Firebase Auth</span>
              <span className="text-slate-500">50k MAUs Free</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block">Cloud Firestore</span>
              <span className="text-slate-500">50k Reads / 20k Writes Day</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block">Firebase Hosting</span>
              <span className="text-slate-500">10 GB Free Storage</span>
            </div>
          </div>
          <p className="text-slate-600 pt-1">
            Firestore paths are strictly isolated under <code>/users/&#123;uid&#125;/...</code>. Database security rules enforce deny-by-default multi-tenancy.
          </p>
        </CardBody>
      </Card>

      {/* Section 5: Application & Hackathon Details */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
            <HardHat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Application Build Information
            </h2>
            <p className="text-xs text-slate-500">
              Version and hackathon submission details
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-2 text-xs text-slate-600">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Application Name:</span>
            <span className="font-semibold text-slate-900">{config.appName}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Build Phase:</span>
            <span className="font-semibold text-slate-900">Phase 3: Local Evidence & IndexedDB Management</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Target Platform:</span>
            <span className="font-semibold text-slate-900">Web (Google Chrome Desktop)</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Competition:</span>
            <span className="font-semibold text-slate-900">BuildHybridAI 2026 Hackathon</span>
          </div>
          <div className="flex justify-between py-1">
            <span>License:</span>
            <span className="font-semibold text-slate-900">MIT Open Source License</span>
          </div>
        </CardBody>
      </Card>

      {/* Clear Database Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span>Confirm Reset of Local Evidence</span>
          </div>
        }
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setIsClearModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={isClearing}
              onClick={handleClearAllEvidence}
            >
              {isClearing ? "Resetting..." : "Permanently Clear Local Storage"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p>
            Are you sure you want to completely erase all local photographic evidence Blobs and unfinished inspection drafts stored in IndexedDB?
          </p>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <span className="font-bold block">Destructive Action:</span>
            This will purge {localPhotoCount} photograph(s) and {localDraftCount} local draft(s). Stored structured records in Cloud Firestore will not be affected.
          </div>
        </div>
      </Modal>
    </div>
  );
};
