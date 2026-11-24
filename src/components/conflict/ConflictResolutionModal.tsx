/**
 * ForeSite Phase 5 Stage 4B: Conflict Resolution Modal
 *
 * Provides a clear, side-by-side inspection and reconciliation interface for conflicted mutations.
 *
 * Invariants:
 * 1. Explicit Human Choice: Requires user selection for every conflicting field (no silent defaults).
 * 2. Human Review Precedence: Human review decisions (approvals/rejections) cannot be bypassed.
 * 3. Atomic Queue Resolution: Submits resolution via guarded queue API (`resolveConflictWithPayload`),
 *    preserving FIFO ordering, replay locks, and retry backoff.
 * 4. Safe Discard: Discarding requires confirmation, sets `cancelled_by_user`, and NEVER deletes local photo Blobs.
 * 5. Re-check Revision: Re-checks remote revision before submitting resolution; fail-closed if remote changed again.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  FileText,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import {
  MutationRecord,
  Inspection,
  FieldConflict,
  ChecklistItem,
  UpdateDraftPayload,
} from "../../types";
import { auth } from "../../lib/firebase";
import { getInspection } from "../../services/firestore";
import { getLocalDraft } from "../../services/indexeddb";
import { threeWayMerge } from "../../services/merge";
import {
  resolveConflictWithPayload,
  discardMutation,
} from "../../services/mutationQueue";
import { replayQueuedMutations } from "../../services/mutationReplay";

export interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  mutation: MutationRecord | null;
  onResolved: () => void;
}

type FieldChoice = "local" | "remote";

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  mutation,
  onResolved,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshots
  const [baseSnapshot, setBaseSnapshot] = useState<Partial<Inspection> | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<Partial<Inspection> | null>(null);
  const [remoteSnapshot, setRemoteSnapshot] = useState<Inspection | null>(null);

  // Field decisions: map of fieldKey -> 'local' | 'remote'
  const [fieldDecisions, setFieldDecisions] = useState<Record<string, FieldChoice>>({});
  // Checklist item decisions: map of itemId -> 'local' | 'remote'
  const [itemDecisions, setItemDecisions] = useState<Record<string, FieldChoice>>({});

  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);
  const [mergedSnapshot, setMergedSnapshot] = useState<Inspection | null>(null);
  const [showAutoMerged, setShowAutoMerged] = useState(false);

  // Load and reconcile data when mutation changes
  useEffect(() => {
    if (!isOpen || !mutation) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setFieldDecisions({});
    setItemDecisions({});
    setShowDiscardConfirm(false);

    const loadConflictData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser || currentUser.uid !== mutation.ownerUid) {
        if (isMounted) {
          setError("Authenticated user does not match mutation owner.");
          setLoading(false);
        }
        return;
      }

      try {
        // 1. Fetch remote document from Firestore
        const remote = await getInspection(currentUser.uid, mutation.targetInspectionId);
        if (!remote) {
          if (isMounted) {
            setError("Remote inspection record no longer exists.");
            setLoading(false);
          }
          return;
        }

        // 2. Fetch local draft from IndexedDB
        const localDraft = await getLocalDraft(mutation.targetInspectionId);

        // 3. Determine Base snapshot
        const base =
          mutation.conflictDetails?.baseSnapshot ||
          (mutation.payload as UpdateDraftPayload).baseSnapshot || {
            revision: mutation.baseRevision,
            title: localDraft?.title,
            observation: localDraft?.observation,
            category: localDraft?.category,
          };

        const localData =
          mutation.conflictDetails?.localSnapshot ||
          localDraft ||
          (mutation.payload as UpdateDraftPayload);

        // Run 3-way merge to get live, authoritative field comparison
        const mergeResult = threeWayMerge(base, localData, remote);

        if (isMounted) {
          setBaseSnapshot(base);
          setLocalSnapshot(localData);
          setRemoteSnapshot(remote);
          setConflicts(mergeResult.conflicts);
          setMergedSnapshot(mergeResult.mergedData || null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(`Failed to load conflict details: ${err instanceof Error ? err.message : String(err)}`);
          setLoading(false);
        }
      }
    };

    loadConflictData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, mutation]);

  // Separate scalar/content conflicts from checklist conflicts and review conflicts
  const { scalarConflicts, checklistConflicts, hasReviewConflict, reviewConflictMessage } = useMemo(() => {
    const scalar: FieldConflict[] = [];
    const checklist: FieldConflict[] = [];
    let reviewConflict = false;
    let reviewMsg = "";

    for (const c of conflicts) {
      if (c.category === "REVIEW_STATUS" || c.field === "reviewStatus") {
        reviewConflict = true;
        reviewMsg = c.message || "Conflicting review decisions detected.";
      } else if (c.category === "CHECKLIST_FIELD" || c.category === "CHECKLIST_EDIT_DELETE") {
        checklist.push(c);
      } else if (c.category === "SCALAR_FIELD" || c.category === "ARRAY_FIELD") {
        scalar.push(c);
      }
    }

    return {
      scalarConflicts: scalar,
      checklistConflicts: checklist,
      hasReviewConflict: reviewConflict,
      reviewConflictMessage: reviewMsg,
    };
  }, [conflicts]);

  // Check if all required choices have been explicitly made
  const isResolutionComplete = useMemo(() => {
    // Every scalar conflict must have a choice
    for (const sc of scalarConflicts) {
      if (!fieldDecisions[sc.field]) return false;
    }
    // Every checklist conflict must have a choice
    for (const cc of checklistConflicts) {
      const key = cc.itemId || cc.field;
      if (!itemDecisions[key]) return false;
    }
    return true;
  }, [scalarConflicts, checklistConflicts, fieldDecisions, itemDecisions]);

  // Handle field choice selection
  const handleSelectFieldChoice = (field: string, choice: FieldChoice) => {
    setFieldDecisions((prev) => ({ ...prev, [field]: choice }));
  };

  // Handle checklist item choice selection
  const handleSelectItemChoice = (itemId: string, choice: FieldChoice) => {
    setItemDecisions((prev) => ({ ...prev, [itemId]: choice }));
  };

  // Submit Conflict Resolution
  const handleApplyResolution = async () => {
    if (!mutation || !remoteSnapshot || !baseSnapshot) return;
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== mutation.ownerUid) {
      setError("User session changed. Re-authentication required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Re-check remote inspection in Firestore to prevent overwriting newer changes
      const latestRemote = await getInspection(currentUser.uid, mutation.targetInspectionId);
      if (!latestRemote) {
        throw new Error("Remote inspection was deleted during conflict resolution.");
      }
      if (latestRemote.revision !== remoteSnapshot.revision) {
        throw new Error(
          `Remote inspection revision advanced from ${remoteSnapshot.revision} to ${latestRemote.revision} while reviewing. Please reload and reconcile against latest state.`
        );
      }

      // 2. Build resolved draft payload combining explicit choices and auto-merged fields
      const resolvedTitle =
        fieldDecisions["title"] === "local"
          ? localSnapshot?.title ?? remoteSnapshot.title
          : fieldDecisions["title"] === "remote"
          ? remoteSnapshot.title
          : mergedSnapshot?.title ?? remoteSnapshot.title;

      const resolvedObs =
        fieldDecisions["observation"] === "local"
          ? localSnapshot?.observation ?? remoteSnapshot.observation
          : fieldDecisions["observation"] === "remote"
          ? remoteSnapshot.observation
          : mergedSnapshot?.observation ?? remoteSnapshot.observation;

      const resolvedCategory =
        fieldDecisions["category"] === "local"
          ? localSnapshot?.category ?? remoteSnapshot.category
          : fieldDecisions["category"] === "remote"
          ? remoteSnapshot.category
          : mergedSnapshot?.category ?? remoteSnapshot.category;

      const resolvedSummary =
        fieldDecisions["summary"] === "local"
          ? localSnapshot?.summary
          : fieldDecisions["summary"] === "remote"
          ? remoteSnapshot.summary
          : mergedSnapshot?.summary ?? remoteSnapshot.summary;

      const resolvedWeather =
        fieldDecisions["weatherNotes"] === "local"
          ? localSnapshot?.weatherNotes
          : fieldDecisions["weatherNotes"] === "remote"
          ? remoteSnapshot.weatherNotes
          : mergedSnapshot?.weatherNotes ?? remoteSnapshot.weatherNotes;

      // Checklist resolution
      const resolvedItems: ChecklistItem[] = [];
      const remoteItemsMap = new Map((remoteSnapshot.items || []).map((i) => [i.id, i]));
      const localItemsMap = new Map((localSnapshot?.items || []).map((i) => [i.id, i]));

      const allItemIds = new Set([
        ...Array.from(remoteItemsMap.keys()),
        ...Array.from(localItemsMap.keys()),
      ]);

      for (const id of allItemIds) {
        const choice = itemDecisions[id];
        if (choice === "local") {
          const item = localItemsMap.get(id);
          if (item) resolvedItems.push(item);
        } else if (choice === "remote") {
          const item = remoteItemsMap.get(id);
          if (item) resolvedItems.push(item);
        } else {
          // Non-conflicting item from merged snapshot
          const autoItem = mergedSnapshot?.items?.find((i) => i.id === id);
          if (autoItem) {
            resolvedItems.push(autoItem);
          } else if (remoteItemsMap.has(id)) {
            resolvedItems.push(remoteItemsMap.get(id)!);
          } else if (localItemsMap.get(id)) {
            resolvedItems.push(localItemsMap.get(id)!);
          }
        }
      }

      // Arrays: use merged symmetric set-difference
      const resolvedEvidence =
        fieldDecisions["visibleEvidence"] === "local"
          ? localSnapshot?.visibleEvidence ?? remoteSnapshot.visibleEvidence
          : fieldDecisions["visibleEvidence"] === "remote"
          ? remoteSnapshot.visibleEvidence
          : mergedSnapshot?.visibleEvidence ?? remoteSnapshot.visibleEvidence;

      const resolvedUncertainties =
        fieldDecisions["uncertainties"] === "local"
          ? localSnapshot?.uncertainties ?? remoteSnapshot.uncertainties
          : fieldDecisions["uncertainties"] === "remote"
          ? remoteSnapshot.uncertainties
          : mergedSnapshot?.uncertainties ?? remoteSnapshot.uncertainties;

      const resolvedFollowUp =
        fieldDecisions["inspectorFollowUp"] === "local"
          ? localSnapshot?.inspectorFollowUp ?? remoteSnapshot.inspectorFollowUp
          : fieldDecisions["inspectorFollowUp"] === "remote"
          ? remoteSnapshot.inspectorFollowUp
          : mergedSnapshot?.inspectorFollowUp ?? remoteSnapshot.inspectorFollowUp;

      const resolvedPhotos =
        fieldDecisions["photoIds"] === "local"
          ? localSnapshot?.photoIds ?? remoteSnapshot.photoIds
          : fieldDecisions["photoIds"] === "remote"
          ? remoteSnapshot.photoIds
          : mergedSnapshot?.photoIds ?? remoteSnapshot.photoIds;

      const resolvedPayload: UpdateDraftPayload = {
        type: "UPDATE_DRAFT",
        title: resolvedTitle,
        observation: resolvedObs,
        category: resolvedCategory,
        summary: resolvedSummary,
        weatherNotes: resolvedWeather,
        items: resolvedItems,
        visibleEvidence: resolvedEvidence,
        uncertainties: resolvedUncertainties,
        inspectorFollowUp: resolvedFollowUp,
        photoIds: resolvedPhotos,
      };

      // 3. Resolve the conflict via guarded mutation queue API
      await resolveConflictWithPayload({
        ownerUid: currentUser.uid,
        mutationId: mutation.id,
        resolvedPayload,
        baseRevision: latestRemote.revision ?? 1,
        baseSnapshot: latestRemote,
      });

      // 4. Trigger replay in the background
      replayQueuedMutations().catch(() => {});

      onResolved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Discard local changes and cancel mutation
  const handleConfirmDiscard = async () => {
    if (!mutation) return;
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== mutation.ownerUid) {
      setError("User session changed. Re-authentication required.");
      return;
    }

    setDiscarding(true);
    setError(null);

    try {
      await discardMutation(
        currentUser.uid,
        mutation.id,
        "User discarded conflicted offline changes in favor of remote inspection"
      );

      // Trigger replay for any unblocked downstream mutations
      replayQueuedMutations().catch(() => {});

      onResolved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscarding(false);
      setShowDiscardConfirm(false);
    }
  };

  if (!isOpen || !mutation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Resolve Synchronization Conflict"
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Header Notice */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-purple-900">
                Concurrent Modifications Detected
              </h3>
              <p className="text-xs text-purple-700 mt-1">
                Inspection <span className="font-mono font-medium">{mutation.targetInspectionId}</span> was updated
                remotely while you were drafting offline changes. Choose whether to keep your local edits or accept the
                remote changes for each conflicting field.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Clock className="w-6 h-6 animate-spin text-brand-600" />
            <p className="text-xs">Loading inspection snapshots and comparing differences...</p>
          </div>
        ) : (
          <>
            {/* Human Review Conflict Banner */}
            {hasReviewConflict && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-900 space-y-1.5">
                    <h4 className="font-semibold text-amber-900">Human Review Decision Invariant</h4>
                    <p>{reviewConflictMessage}</p>
                    <p className="text-amber-800">
                      ForeSite strictly protects human review decisions: you cannot automatically approve or reject this
                      inspection through the conflict resolver. Applying this resolution will synchronize observation
                      fields while preserving the authoritative remote review status (
                      <span className="font-bold">{remoteSnapshot?.reviewStatus}</span>). An authorized inspector can
                      subsequently review the synchronized inspection through the standard review process.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Field Conflicts Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Conflicting Fields ({scalarConflicts.length + checklistConflicts.length})
                </h4>
                <span className="text-xs text-slate-500">
                  {isResolutionComplete ? (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> All conflicts resolved
                    </span>
                  ) : (
                    <span className="text-amber-600 font-semibold flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" /> Selection required for all fields
                    </span>
                  )}
                </span>
              </div>

              {scalarConflicts.length === 0 && checklistConflicts.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 text-center">
                  No direct content field conflicts detected. Review state or metadata requires synchronization.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Scalar Text Conflicts */}
                  {scalarConflicts.map((c) => {
                    const choice = fieldDecisions[c.field];
                    return (
                      <div
                        key={c.field}
                        className="border border-slate-200 rounded-lg p-4 bg-white space-y-3 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-800 capitalize">
                            {c.field.replace(/([A-Z])/g, " $1")}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-purple-600 text-white shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                            Divergent Changes
                          </span>
                        </div>

                        {/* 3-Column Comparison: Base, Local, Remote */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Base (Original) */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider mb-1">
                              Original Base (Rev {baseSnapshot?.revision ?? 1})
                            </span>
                            <div className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                              {String(c.baseValue || "(empty)")}
                            </div>
                          </div>

                          {/* Local (Yours) */}
                          <button
                            type="button"
                            onClick={() => handleSelectFieldChoice(c.field, "local")}
                            className={`p-3 text-left rounded-md border-2 transition-all cursor-pointer ${
                              choice === "local"
                                ? "border-brand-600 bg-brand-50/50 ring-1 ring-brand-500"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">
                                Your Local Change
                              </span>
                              <input
                                type="radio"
                                name={`choice-${c.field}`}
                                checked={choice === "local"}
                                onChange={() => handleSelectFieldChoice(c.field, "local")}
                                className="text-brand-600 focus:ring-brand-500"
                              />
                            </div>
                            <div className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                              {String(c.localValue || "(empty)")}
                            </div>
                            <span className="mt-2 inline-block text-[10px] font-semibold text-brand-700">
                              {choice === "local" ? "✓ Selected (Keep Mine)" : "Click to select"}
                            </span>
                          </button>

                          {/* Remote (Server) */}
                          <button
                            type="button"
                            onClick={() => handleSelectFieldChoice(c.field, "remote")}
                            className={`p-3 text-left rounded-md border-2 transition-all cursor-pointer ${
                              choice === "remote"
                                ? "border-purple-600 bg-purple-50/50 ring-1 ring-purple-500"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                                Server Remote (Rev {remoteSnapshot?.revision})
                              </span>
                              <input
                                type="radio"
                                name={`choice-${c.field}`}
                                checked={choice === "remote"}
                                onChange={() => handleSelectFieldChoice(c.field, "remote")}
                                className="text-purple-600 focus:ring-purple-500"
                              />
                            </div>
                            <div className="text-xs text-slate-800 whitespace-pre-wrap break-words">
                              {String(c.remoteValue || "(empty)")}
                            </div>
                            <span className="mt-2 inline-block text-[10px] font-semibold text-purple-700">
                              {choice === "remote" ? "✓ Selected (Accept Server)" : "Click to select"}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Checklist Conflicts */}
                  {checklistConflicts.map((c) => {
                    const itemId = c.itemId || c.field;
                    const choice = itemDecisions[itemId];
                    return (
                      <div
                        key={itemId}
                        className="border border-slate-200 rounded-lg p-4 bg-white space-y-3 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-800">
                            Checklist Item: <span className="font-mono text-xs">{itemId}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-amber-500 text-white shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                            {c.category === "CHECKLIST_EDIT_DELETE" ? "Edit vs Deletion" : "Field Divergence"}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Local Item */}
                          <button
                            type="button"
                            onClick={() => handleSelectItemChoice(itemId, "local")}
                            className={`p-3 text-left rounded-md border-2 transition-all cursor-pointer ${
                              choice === "local"
                                ? "border-brand-600 bg-brand-50/50 ring-1 ring-brand-500"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">
                                Your Version
                              </span>
                              <input
                                type="radio"
                                name={`item-choice-${itemId}`}
                                checked={choice === "local"}
                                onChange={() => handleSelectItemChoice(itemId, "local")}
                                className="text-brand-600 focus:ring-brand-500"
                              />
                            </div>
                            <pre className="text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(c.localValue, null, 2) || "(Deleted locally)"}
                            </pre>
                            <span className="mt-2 inline-block text-[10px] font-semibold text-brand-700">
                              {choice === "local" ? "✓ Selected (Keep Mine)" : "Click to select"}
                            </span>
                          </button>

                          {/* Remote Item */}
                          <button
                            type="button"
                            onClick={() => handleSelectItemChoice(itemId, "remote")}
                            className={`p-3 text-left rounded-md border-2 transition-all cursor-pointer ${
                              choice === "remote"
                                ? "border-purple-600 bg-purple-50/50 ring-1 ring-purple-500"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
                                Server Version
                              </span>
                              <input
                                type="radio"
                                name={`item-choice-${itemId}`}
                                checked={choice === "remote"}
                                onChange={() => handleSelectItemChoice(itemId, "remote")}
                                className="text-purple-600 focus:ring-purple-500"
                              />
                            </div>
                            <pre className="text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(c.remoteValue, null, 2) || "(Deleted on server)"}
                            </pre>
                            <span className="mt-2 inline-block text-[10px] font-semibold text-purple-700">
                              {choice === "remote" ? "✓ Selected (Accept Server)" : "Click to select"}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Automatically Merged Non-Conflicting Fields Accordion */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
              <button
                type="button"
                onClick={() => setShowAutoMerged((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>Automatically Merged Non-Conflicting Data</span>
                </div>
                {showAutoMerged ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {showAutoMerged && (
                <div className="p-4 bg-white border-t border-slate-200 text-xs text-slate-600 space-y-2">
                  <p className="text-[11px] text-slate-500">
                    The following fields had non-conflicting updates and merged automatically according to 3-way merge rules:
                  </p>
                  <ul className="list-disc list-inside space-y-1 font-mono text-[11px]">
                    <li>
                      Evidence items: {mergedSnapshot?.visibleEvidence?.length ?? 0} items merged via string set-difference
                    </li>
                    <li>
                      Photo references: {mergedSnapshot?.photoIds?.length ?? 0} photos linked (local Blobs preserved)
                    </li>
                    <li>
                      Uncertainties: {mergedSnapshot?.uncertainties?.length ?? 0} items
                    </li>
                    <li>
                      Inspector follow-up: {mergedSnapshot?.inspectorFollowUp?.length ?? 0} items
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Discard Confirmation Modal Safeguard */}
            {showDiscardConfirm && (
              <div className="p-4 bg-red-50 border border-red-300 rounded-lg space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-red-900 space-y-1">
                    <h5 className="font-bold">Confirm Discarding Local Offline Edits</h5>
                    <p>
                      Are you sure you want to discard your local modifications for this inspection? This will cancel
                      your offline draft mutation and adopt the server inspection version entirely.
                    </p>
                    <p className="font-semibold text-red-800">
                      Photographic evidence Blobs saved in your device storage will NOT be deleted.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowDiscardConfirm(false)}
                    disabled={discarding}
                  >
                    Keep Local Changes
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={handleConfirmDiscard}
                    disabled={discarding}
                  >
                    {discarding ? "Discarding..." : "Yes, Discard Local Edits"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="w-full sm:w-auto">
            {!showDiscardConfirm && (
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(true)}
                disabled={loading || submitting || discarding}
                className="text-xs text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1.5 p-1.5 rounded hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Discard Local Draft
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} disabled={submitting || discarding}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleApplyResolution}
              disabled={loading || !isResolutionComplete || submitting || discarding}
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  Applying & Syncing...
                </span>
              ) : (
                "Apply Resolution & Sync"
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
