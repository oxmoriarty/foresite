import React from "react";
import { Database, ShieldCheck, Cpu, HardHat, UserCheck, Flame, AlertCircle } from "lucide-react";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { config } from "../config/env";
import { useAuth } from "../context/AuthContext";

export const SettingsScreen: React.FC = () => {
  const { currentUser, userProfile, isConfigured } = useAuth();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Settings & Architecture Policy
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review inspector identity, Firebase foundation, storage invariants, and zero-cost policy.
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

      {/* Section 1: Firebase Foundation & Infrastructure */}
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

      {/* Section 2: Local Photo Evidence Storage */}
      <Card>
        <CardHeader className="flex items-center gap-3 bg-slate-50/60">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Local Photograph Retention (IndexedDB)
            </h2>
            <p className="text-xs text-slate-500">
              Privacy and data-isolation guarantees for site photographs
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 text-xs text-slate-700 leading-relaxed">
          <p>
            ForeSite stores original site photograph binary Blobs directly inside your browser&apos;s local <strong>IndexedDB</strong> database.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li>
              <strong>Device-Local Retention:</strong> Raw evidence photos remain in local browser storage by default and are not transmitted to third-party databases without explicit authorization.
            </li>
            <li>
              <strong>Structured Metadata in Cloud:</strong> Only structured inspection summaries, observations, and timestamps are synced to Cloud Firestore.
            </li>
            <li>
              <strong>Cache Caution:</strong> Clearing browser history, deleting the Chrome profile, or using guest mode will permanently erase local IndexedDB evidence. Keep offline backups of critical inspection evidence.
            </li>
          </ul>
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
            <span className="font-semibold text-slate-900">Phase 2: Firebase Foundation & Authentication</span>
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
    </div>
  );
};
