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
import { StorageEstimateInfo } from "../types";

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

      {/* Section 3: Hybrid AI & Chrome Prerequisites */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Chrome Built-in AI & Hybrid Fallback
            </h2>
            <p className="text-xs text-slate-500">
              On-device Gemini Nano and cloud Gemini Flash configuration
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 text-xs text-slate-700 leading-relaxed">
          <p>
            ForeSite uses the official <code>firebase/ai</code> Web SDK configured in <code>PREFER_ON_DEVICE</code> mode:
          </p>
          <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
            {`// Hybrid Routing Contract\nconst model = getGenerativeModel(ai, {\n  mode: InferenceMode.PREFER_ON_DEVICE,\n  inCloudParams: { model: "gemini-2.5-flash-lite" }\n});`}
          </div>
          <div className="pt-2 border-t border-slate-100">
            <h4 className="font-semibold text-slate-900 mb-1">Chrome Prerequisites for On-Device Inference:</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>Google Chrome Desktop version 138 or higher.</li>
              <li>Chrome Flag: <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> (Enabled).</li>
              <li>Chrome Flag: <code>chrome://flags/#optimization-guide-on-device-model</code> (Enabled BypassPerfRequirement).</li>
              <li>When local inference is unavailable, requests automatically fall back to cloud-hosted Gemini Flash.</li>
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
