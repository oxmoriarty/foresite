import React, { useState, useEffect } from "react";
import {
  Database,
  Cpu,
  UserCheck,
  AlertCircle,
  HardDrive,
  RefreshCw,
  Trash2,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
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
  const [persistenceFeedback, setPersistenceFeedback] = useState<string | null>(null);

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
    setPersistenceFeedback(null);
    const persisted = await requestPersistentStorage();
    setStorageInfo((prev) => ({ ...prev, persisted }));
    if (persisted) {
      setPersistenceFeedback("Persistence granted by browser.");
    } else {
      setPersistenceFeedback("Browser retained standard storage.");
    }
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
      </div>

      {/* Section 0: Profile */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/70 border-b border-slate-100 px-5 py-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-50 text-brand-600 border border-brand-100/60 shadow-2xs">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Profile
            </h2>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 text-xs text-slate-700 px-5 py-4">
          {currentUser ? (
            <div className="space-y-2">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="font-medium text-slate-600">Name</span>
                <span className="font-semibold text-slate-900">
                  {userProfile?.displayName || currentUser.displayName || "Site Inspector"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="font-medium text-slate-600">Email</span>
                <span className="font-mono text-slate-900">{currentUser.email}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="font-medium text-slate-600">Verification</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-xs ${
                    currentUser.emailVerified
                      ? "bg-emerald-600 text-white"
                      : "bg-amber-500 text-white"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  {currentUser.emailVerified ? "Verified" : "Pending Verification"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-slate-600 space-y-1">
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

      {/* Section 1: Local Storage & Capacity */}
      <Card>
        <CardHeader className="flex items-center justify-between bg-slate-50/70 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-50 text-brand-600 border border-brand-100/60 shadow-2xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Local Storage & Capacity
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={refreshingQuota}
            className="p-2 text-slate-400 hover:text-brand-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            title="Refresh Storage Quota"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingQuota ? "animate-spin" : ""}`} />
          </button>
        </CardHeader>
        <CardBody className="space-y-4 text-xs text-slate-700 leading-relaxed px-5 py-4">
          {/* Storage Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 hover:border-slate-300/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="font-medium">Photos Stored</span>
                <div className="p-1 rounded-md bg-white border border-slate-200/60 text-brand-600 shadow-2xs">
                  <Database className="w-3.5 h-3.5" />
                </div>
              </div>
              <span className="text-lg font-bold text-slate-900">
                {localPhotoCount} photos
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 hover:border-slate-300/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="font-medium">Unsynced Drafts</span>
                <div className="p-1 rounded-md bg-white border border-slate-200/60 text-brand-600 shadow-2xs">
                  <HardDrive className="w-3.5 h-3.5" />
                </div>
              </div>
              <span className="text-lg font-bold text-slate-900">
                {localDraftCount} drafts
              </span>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 hover:border-slate-300/80 transition-all shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="font-medium">Storage Persistence</span>
                <div className="p-1 rounded-md bg-white border border-slate-200/60 text-emerald-600 shadow-2xs">
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-xs ${
                    storageInfo.persisted
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-500 text-white"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  {storageInfo.persisted ? "Persisted" : "Standard"}
                </span>
                {!storageInfo.persisted && (
                  <button
                    type="button"
                    onClick={handleRequestPersistence}
                    className="text-[10px] text-brand-600 font-semibold hover:underline mt-1.5 block cursor-pointer"
                  >
                    Request Persistence &rarr;
                  </button>
                )}
                {persistenceFeedback && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    {persistenceFeedback}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Browser Storage Quota Progress */}
          {storageInfo.supported && storageInfo.quotaBytes > 0 && (
            <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl space-y-2 shadow-2xs">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-800">Storage Usage</span>
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
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 block">Clear Local Data</span>
              <span className="text-[11px] text-slate-500">
                Delete stored images and drafts from this device.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50 border-red-200 rounded-lg shadow-2xs"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setIsClearModalOpen(true)}
            >
              Clear Data
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Section 2: AI & Privacy */}
      <Card>
        <CardHeader className="flex items-center justify-between bg-slate-50/70 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100/60 shadow-2xs">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                AI & Privacy
              </h2>
            </div>
          </div>
          {/* Sync Status Badge */}
          <div>
            {prefLoading ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                Loading...
              </span>
            ) : cloudFallbackPref.syncStatus === "synced" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-emerald-600 text-white shadow-xs">
                <CheckCircle2 className="w-3 h-3 text-white shrink-0" />
                Synced with Cloud
              </span>
            ) : cloudFallbackPref.syncStatus === "failed" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-amber-500 text-white shadow-xs">
                <AlertCircle className="w-3 h-3 text-white shrink-0" />
                Local Only
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardBody className="space-y-4 text-xs text-slate-700 leading-relaxed px-5 py-4">
          {/* Main Setting Toggle Row */}
          <div className="flex items-start justify-between p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl gap-4 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">
                  Automatic cloud fallback
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-xs ${
                    cloudFallbackPref.enabled
                      ? "bg-brand-600 text-white"
                      : "bg-slate-500 text-white"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  {cloudFallbackPref.enabled ? "Enabled" : "Disabled (Default)"}
                </span>
              </div>
              <p className="text-slate-600 text-xs">
                {cloudFallbackPref.enabled
                  ? "Use cloud processing automatically when on device AI is unavailable."
                  : "Process data on device only. Asks for permission before connecting to the cloud."}
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
        </CardBody>
      </Card>

      {/* Clear Database Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span>Clear Local Data</span>
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
              {isClearing ? "Clearing..." : "Clear Local Data"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p>
            Are you sure you want to delete stored evidence photos and drafts from this device?
          </p>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <span className="font-bold block">Destructive Action:</span>
            This will delete {localPhotoCount} photo(s) and {localDraftCount} draft(s).
          </div>
        </div>
      </Modal>
    </div>
  );
};
