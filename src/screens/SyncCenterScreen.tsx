/**
 * ForeSite Phase 5 Stage 4B: Sync Center Screen
 *
 * Dedicated dashboard for monitoring local offline synchronization activity,
 * managing queue mutations, retrying failed operations, resolving conflicts,
 * and exporting diagnostic reports.
 *
 * Invariants:
 * 1. Plain Language Presentation: Clear, accessible status descriptions without exposing confusing internal codes.
 * 2. Guarded Retries: Allows retrying 'failed' and 'failed_exhausted' mutations; prevents retrying downstream mutations
 *    when an earlier conflict on that inspection remains unresolved.
 * 3. Safe Discards: Discards require confirmation, record 'cancelled_by_user', and NEVER delete local photo Blobs.
 * 4. Tenant Isolation: Derived strictly from authenticated Firebase user; no cross-account queue inspection.
 * 5. Diagnostic Export: Sanitized JSON export of queue records and summary with zero tokens/credentials.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Trash2,
  ExternalLink,
  ShieldCheck,
  PauseCircle,
  Filter,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import {
  MutationRecord,
  MutationStatus,
  QueueSummary,
} from "../types";
import { auth } from "../lib/firebase";
import {
  getAllMutationsByOwner,
  getQueueSummary,
  retryFailedMutation,
  discardMutation,
  exportQueueDiagnostics,
} from "../services/mutationQueue";
import { replayQueuedMutations } from "../services/mutationReplay";
import { ConflictResolutionModal } from "../components/conflict/ConflictResolutionModal";

export interface SyncCenterScreenProps {
  onNavigateToInspections?: () => void;
}

type FilterTab = "all" | "attention" | "pending" | "synced" | "cancelled";

export const SyncCenterScreen: React.FC<SyncCenterScreenProps> = ({
  onNavigateToInspections,
}) => {
  const [mutations, setMutations] = useState<MutationRecord[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Active mutation for conflict resolution modal
  const [conflictMutation, setConflictMutation] = useState<MutationRecord | null>(null);

  // Discard confirmation state
  const [discardTarget, setDiscardTarget] = useState<MutationRecord | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // Retrying state per mutation ID
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Load queue records and summary
  const loadQueueData = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setMutations([]);
      setSummary(null);
      setLoading(false);
      return;
    }

    try {
      const [allMutations, queueSummary] = await Promise.all([
        getAllMutationsByOwner(currentUser.uid),
        getQueueSummary(currentUser.uid),
      ]);
      setMutations(allMutations.sort((a, b) => b.sequenceNumber - a.sequenceNumber));
      setSummary(queueSummary);
    } catch (err) {
      setActionError(`Failed to load mutation queue: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueueData();
  }, [loadQueueData]);

  // Manual replay trigger
  const handleManualSync = async () => {
    setActionError(null);
    setActionSuccess(null);
    setSyncing(true);

    try {
      const result = await replayQueuedMutations();
      if (result.status === "SUCCESS") {
        if (result.processedCount === 0) {
          setActionSuccess("Queue is clear. No offline changes to synchronize.");
        } else {
          setActionSuccess(`Synchronization complete: ${result.succeededCount} change(s) uploaded.`);
        }
      } else if (result.status === "PARTIAL_SUCCESS") {
        setActionSuccess(`Partial synchronization: ${result.succeededCount} succeeded, ${result.conflictCount} conflict(s).`);
      } else if (result.status === "UNAUTHENTICATED") {
        setActionError("Please sign in to synchronize offline changes.");
      } else if (result.status === "LOCKED_BY_ANOTHER_TAB") {
        setActionError("Synchronization is already active in another browser tab.");
      } else {
        setActionError(`Sync finished with issues: ${result.message || result.status}`);
      }
    } catch (err) {
      setActionError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
      loadQueueData();
    }
  };

  // Manual retry for failed/exhausted mutation
  const handleRetryMutation = async (mutation: MutationRecord) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== mutation.ownerUid) {
      setActionError("Cannot retry mutation: authenticated session mismatch.");
      return;
    }

    setRetryingId(mutation.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      await retryFailedMutation(currentUser.uid, mutation.id);
      setActionSuccess(`Mutation queued for retry. Initiating synchronization...`);
      // Trigger replay in background
      replayQueuedMutations().catch(() => {});
      await loadQueueData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  };

  // Discard confirmation
  const handleConfirmDiscard = async () => {
    if (!discardTarget) return;
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== discardTarget.ownerUid) {
      setActionError("Cannot discard mutation: authenticated session mismatch.");
      return;
    }

    setDiscarding(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await discardMutation(currentUser.uid, discardTarget.id, "Discarded via Sync Center");
      setActionSuccess(`Mutation ${discardTarget.id} cancelled. Local photos preserved.`);
      setDiscardTarget(null);
      await loadQueueData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscarding(false);
    }
  };

  // Export diagnostic JSON
  const handleExportDiagnostics = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setActionError("Please sign in to export diagnostic data.");
      return;
    }

    try {
      const data = await exportQueueDiagnostics(currentUser.uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `foresite-sync-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionSuccess("Diagnostic report exported successfully.");
    } catch (err) {
      setActionError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Filter mutations based on active tab
  const filteredMutations = useMemo(() => {
    switch (activeTab) {
      case "attention":
        return mutations.filter(
          (m) => m.status === "conflict" || m.status === "failed" || m.status === "failed_exhausted"
        );
      case "pending":
        return mutations.filter(
          (m) => m.status === "queued" || m.status === "in_flight" || m.status === "paused_on_conflict"
        );
      case "synced":
        return mutations.filter((m) => m.status === "succeeded");
      case "cancelled":
        return mutations.filter((m) => m.status === "cancelled_by_user");
      case "all":
      default:
        return mutations;
    }
  }, [mutations, activeTab]);

  // Helper to map status to human-readable label, color, and icon
  const getStatusDisplay = (status: MutationStatus) => {
    switch (status) {
      case "queued":
        return {
          label: "Waiting to sync",
          classes: "bg-amber-500 text-white shadow-xs font-bold tracking-wide",
          icon: Clock,
        };
      case "in_flight":
        return {
          label: "Syncing...",
          classes: "bg-blue-600 text-white shadow-xs font-bold tracking-wide animate-pulse",
          icon: RefreshCw,
        };
      case "succeeded":
        return {
          label: "Synced",
          classes: "bg-emerald-600 text-white shadow-xs font-bold tracking-wide",
          icon: CheckCircle2,
        };
      case "failed":
        return {
          label: "Sync failed - retrying",
          classes: "bg-rose-600 text-white shadow-xs font-bold tracking-wide",
          icon: AlertTriangle,
        };
      case "failed_exhausted":
        return {
          label: "Sync failed - retries exhausted",
          classes: "bg-rose-700 text-white shadow-xs font-bold tracking-wide",
          icon: XCircle,
        };
      case "conflict":
        return {
          label: "Needs conflict resolution",
          classes: "bg-purple-600 text-white shadow-xs font-bold tracking-wide",
          icon: AlertTriangle,
        };
      case "paused_on_conflict":
        return {
          label: "Waiting for earlier conflict",
          classes: "bg-slate-500 text-white shadow-xs font-bold tracking-wide",
          icon: PauseCircle,
        };
      case "cancelled_by_user":
        return {
          label: "Cancelled by user",
          classes: "bg-slate-500 text-white shadow-xs font-bold tracking-wide",
          icon: XCircle,
        };
      default:
        return {
          label: status,
          classes: "bg-slate-500 text-white shadow-xs font-bold tracking-wide",
          icon: HelpCircleIcon,
        };
    }
  };

  const formatMutationType = (type: string) => {
    return type
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Sync Center</h1>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportDiagnostics}
            disabled={loading || mutations.length === 0}
            className="flex items-center gap-1.5 rounded-full"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Export Diagnostics
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleManualSync}
            disabled={loading || syncing}
            className="flex items-center gap-1.5 rounded-full shadow-pill"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Action Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-bold"
          >
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-800 text-xs font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* KPI Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Waiting
          </span>
          <span className="text-xl font-bold text-slate-800 mt-1 block">
            {summary?.queued ?? 0}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
            In Flight
          </span>
          <span className="text-xl font-bold text-blue-700 mt-1 block">
            {summary?.inFlight ?? 0}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
            Synced
          </span>
          <span className="text-xl font-bold text-emerald-700 mt-1 block">
            {summary?.succeeded ?? 0}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider block">
            Failed
          </span>
          <span className="text-xl font-bold text-orange-700 mt-1 block">
            {(summary?.failed ?? 0) + (summary?.failedExhausted ?? 0)}
          </span>
        </div>

        <div
          className={`p-3.5 rounded-lg border shadow-2xs transition-all ${
            (summary?.conflict ?? 0) > 0
              ? "bg-purple-50/70 border-purple-300 ring-1 ring-purple-400"
              : "bg-white border-slate-200"
          }`}
        >
          <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
            Conflicts
          </span>
          <span className="text-xl font-bold text-purple-900 mt-1 block">
            {summary?.conflict ?? 0}
          </span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Cancelled
          </span>
          <span className="text-xl font-bold text-slate-600 mt-1 block">
            {summary?.cancelled ?? 0}
          </span>
        </div>
      </div>

      {/* Filter Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-semibold flex items-center gap-1 pl-1 pr-2 uppercase tracking-wider text-[11px] shrink-0">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        {[
          { id: "all", label: `All Activity (${mutations.length})` },
          {
            id: "attention",
            label: "Needs Attention",
            badgeCount: (summary?.conflict ?? 0) + (summary?.failedExhausted ?? 0) + (summary?.failed ?? 0),
          },
          {
            id: "pending",
            label: `Waiting to Sync (${(summary?.queued ?? 0) + (summary?.inFlight ?? 0) + (summary?.pausedOnConflict ?? 0)})`,
          },
          { id: "synced", label: `Synced (${summary?.succeeded ?? 0})` },
          { id: "cancelled", label: `Cancelled (${summary?.cancelled ?? 0})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as FilterTab)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold rounded-full transition-all duration-200 whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100/80"
            }`}
          >
            <span>{tab.label}</span>
            {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full font-bold text-[10px] ${
                  activeTab === tab.id
                    ? "bg-purple-500 text-white"
                    : "bg-purple-100 text-purple-800"
                }`}
              >
                {tab.badgeCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mutation Records List */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 space-y-2">
          <Clock className="w-6 h-6 animate-spin mx-auto text-brand-600" />
          <p className="text-xs">Loading synchronization records...</p>
        </div>
      ) : filteredMutations.length === 0 ? (
        <div className="py-16 bg-white border border-slate-200 rounded-lg text-center p-8 space-y-3">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            {activeTab === "attention"
              ? "No Conflicts or Failures"
              : activeTab === "pending"
              ? "No Pending Operations"
              : "No Records Found"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {activeTab === "attention"
              ? "All your local offline operations have synchronized smoothly without conflicting with remote changes."
              : "All local modifications have been synchronized."}
          </p>
          {onNavigateToInspections && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onNavigateToInspections}
              className="mt-2 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Inspections
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMutations.map((m) => {
            const statusInfo = getStatusDisplay(m.status);
            const StatusIcon = statusInfo.icon;
            const isRetrying = retryingId === m.id;

            return (
              <div
                key={m.id}
                className={`p-4 bg-white border rounded-lg shadow-2xs transition-all space-y-3 ${
                  m.status === "conflict"
                    ? "border-purple-300 ring-1 ring-purple-100"
                    : m.status === "failed_exhausted"
                    ? "border-red-300"
                    : "border-slate-200"
                }`}
              >
                {/* Card Top Row: Target & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      Inspection:{" "}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider shadow-xs bg-slate-900/90 text-white">
                        {m.targetInspectionId}
                      </span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider shadow-xs bg-slate-900/90 text-white">
                      {formatMutationType(m.type)}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Seq #{m.sequenceNumber}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-xs ${statusInfo.classes}`}
                  >
                    <StatusIcon className={`w-3 h-3 text-white shrink-0 ${m.status === "in_flight" ? "animate-spin" : ""}`} />
                    <span>{statusInfo.label}</span>
                  </span>
                </div>

                {/* Conflict or Error Explanation */}
                {m.status === "conflict" && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-md text-xs text-purple-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-purple-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                      Conflict Details
                    </div>
                    <p className="text-purple-700">
                      {m.conflictReason || "Concurrent modifications detected. Manual review required."}
                    </p>
                  </div>
                )}

                {(m.status === "failed" || m.status === "failed_exhausted") && m.failureReason && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-red-800">
                      <XCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                      Failure Reason (Attempt {m.retryCount} of {m.maxRetries})
                    </div>
                    <p className="text-red-700">{m.failureReason}</p>
                  </div>
                )}

                {m.status === "paused_on_conflict" && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600 flex items-center gap-2">
                    <PauseCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span>
                      Blocked: This mutation is waiting for earlier conflicts on inspection{" "}
                      <span className="font-mono font-medium">{m.targetInspectionId}</span> to be resolved.
                    </span>
                  </div>
                )}

                {/* Card Bottom Row: Metadata & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span>Created: {new Date(m.createdAt).toLocaleTimeString()}</span>
                    {m.lastAttemptedAt && (
                      <span>Last attempt: {new Date(m.lastAttemptedAt).toLocaleTimeString()}</span>
                    )}
                    {m.nextRetryAt && m.status === "failed" && (
                      <span className="text-orange-600 font-medium">
                        Next retry in: {Math.max(0, Math.round((m.nextRetryAt - Date.now()) / 1000))}s
                      </span>
                    )}
                  </div>

                  {/* Contextual Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Conflict Resolution Action */}
                    {m.status === "conflict" && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setConflictMutation(m)}
                        className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 border-purple-600"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Resolve Conflict
                      </Button>
                    )}

                    {/* Manual Retry Action */}
                    {(m.status === "failed_exhausted" || m.status === "failed") && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRetryMutation(m)}
                        disabled={isRetrying}
                        className="flex items-center gap-1.5 text-xs text-brand-700 border-brand-300 hover:bg-brand-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                        {isRetrying ? "Retrying..." : "Retry Sync"}
                      </Button>
                    )}

                    {/* Discard / Cancel Action */}
                    {m.status !== "succeeded" &&
                      m.status !== "in_flight" &&
                      m.status !== "cancelled_by_user" && (
                        <button
                          type="button"
                          onClick={() => setDiscardTarget(m)}
                          className="text-xs text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors inline-flex items-center gap-1"
                          title="Discard local mutation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Discard</span>
                        </button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Discard Confirmation Modal Safeguard */}
      {discardTarget && (
        <Modal
          isOpen={!!discardTarget}
          onClose={() => setDiscardTarget(null)}
          title="Confirm Discarding Mutation"
        >
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-red-900">
                  Are you sure you want to discard this offline mutation?
                </p>
                <p>
                  Mutation <span className="font-mono font-medium">{discardTarget.id}</span> ({formatMutationType(discardTarget.type)})
                  for inspection <span className="font-mono font-medium">{discardTarget.targetInspectionId}</span> will be marked as
                  cancelled and will never be synchronized.
                </p>
                <p className="font-semibold text-red-950">
                  Photographic evidence Blobs saved on this device will NOT be deleted.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <Button
                variant="secondary"
                onClick={() => setDiscardTarget(null)}
                disabled={discarding}
              >
                Keep Mutation
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDiscard}
                disabled={discarding}
              >
                {discarding ? "Discarding..." : "Yes, Discard Mutation"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Conflict Resolution Modal */}
      {conflictMutation && (
        <ConflictResolutionModal
          isOpen={!!conflictMutation}
          onClose={() => setConflictMutation(null)}
          mutation={conflictMutation}
          onResolved={() => {
            loadQueueData();
            setActionSuccess("Conflict resolved successfully. Synchronizing updated inspection...");
          }}
        />
      )}
    </div>
  );
};

// Fallback icon helper
const HelpCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <FileText className={className} />
);
