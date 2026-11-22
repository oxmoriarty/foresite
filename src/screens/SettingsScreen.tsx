import React, { useState, useEffect } from "react";
import {
  Database,
  ShieldCheck,
  Cpu,
  HardHat,
  UserCheck,
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
  const { currentUser, userProfile } = useAuth();

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
    const persisted = await requestPersistentStorage();
    setStorageInfo((prev) => ({ ...prev, persisted }));
  };

  const handleClearAllEvidence = async () => {
    setIsClearing(true);
    try {
      await clearAllLocalEvidence();
      setLocalPhotoCount(0);
      setLocalDraftCount(0);
      const estimate = await getStorageQuotaEstimate();
      setStorageInfo(estimate);
      setIsClearModalOpen(false);
    } catch (err) {
      console.error("Failed to clear evidence:", err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Settings & Preferences
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review inspector profile, storage management, and AI processing configuration.
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
              Inspector Profile
            </h2>
            <p className="text-xs text-slate-500">
              Account identity and verification status
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
                Preview Session
              </span>
              <p>
                You are currently viewing ForeSite with local sample data.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Section 1: Storage Management */}
      <Card>
        <CardHeader className="flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-100 text-brand-700 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Local Storage & Capacity
              </h2>
              <p className="text-xs text-slate-500">
                Local photo binary storage and browser disk capacity
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={refreshingQuota}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
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
                <span className="font-medium">Photos Stored</span>
                <Database className="w-3.5 h-3.5 text-brand-600" />
              </div>
              <span className="text-lg font-bold text-slate-900">
                {localPhotoCount} photos
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Local evidence files
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
                  className="text-[10px] text-brand-600 font-semibold hover:underline mt-0.5 cursor-pointer"
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

          {/* Reset Evidence Storage */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 block">Reset Local Evidence Database</span>
              <span className="text-[11px] text-slate-500">
                Purge all photographic evidence and local drafts stored on this device.
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

      {/* Section 2: AI & Privacy — Automatic Cloud Fallback */}
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
                Hybrid AI inference routing policy and cloud transmission control
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
                  ? "Mode A active: On-device inference is attempted first; automatically falls back to cloud AI if the local model is unavailable or unready. Per-request consent modal is bypassed."
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
                <li>Attempts on-device processing first.</li>
                <li>Seamless cloud fallback during background model download.</li>
                <li>Bypasses per-request consent modal for streamlined workflow.</li>
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
                <li>Strictly on-device processing.</li>
                <li>Halts before cloud transmission if local model is unavailable.</li>
                <li>Requires explicit inspector confirmation per request.</li>
              </ul>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Section 3: Application Information */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
            <HardHat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Application Information
            </h2>
            <p className="text-xs text-slate-500">
              Version and workspace details
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-2 text-xs text-slate-600">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Application Name:</span>
            <span className="font-semibold text-slate-900">{config.appName}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Version:</span>
            <span className="font-semibold text-slate-900">{config.appVersion}</span>
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
            Are you sure you want to completely erase all local photographic evidence files and unfinished inspection drafts stored on this device?
          </p>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <span className="font-bold block">Destructive Action:</span>
            This will purge {localPhotoCount} photograph(s) and {localDraftCount} local draft(s).
          </div>
        </div>
      </Modal>
    </div>
  );
};
