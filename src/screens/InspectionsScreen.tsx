/**
 * ForeSite Inspections Screen
 *
 * Full manual inspection and evidence workflow:
 * - Filter by status (All Records, Drafts, In Review, Approved, Rejected)
 * - Filter by project
 * - Local drafts persistence (IndexedDB) and recovery
 * - Create & edit inspections with manual notes and photo evidence
 * - Human-in-the-loop review actions (Approve, Reject, In Review)
 * - Photo inspection & preview with zero cloud binary dependencies
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ClipboardCheck,
  Filter,
  Plus,
  Eye,
  Camera,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Edit2,
  Trash2,
  Database,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Calendar,
} from "lucide-react";
import {
  Inspection,
  Project,
  ReviewStatus,
  LocalDraftInspection,
  LocalEvidencePhoto,
  InspectionSyncStatus,
  MutationRecord,
} from "../types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import { InspectionEditorModal } from "../components/inspection/InspectionEditorModal";
import { PhotoEvidenceManager } from "../components/evidence/PhotoEvidenceManager";
import { useAuth } from "../context/AuthContext";
import {
  executeReviewTransition,
  getPermittedReviewTransitions,
  getReviewActionLabel,
  ReviewLifecycleError,
} from "../services/review";
import {
  getAllLocalDrafts,
  deleteLocalDraft,
  getEvidencePhotosByInspection,
  persistLocalReviewTransition,
} from "../services/indexeddb";
import { getInspectionSyncStatus, replayQueuedMutations } from "../services/mutationReplay";
import { getMutationsByInspection, enqueueMutation } from "../services/mutationQueue";
import { isInspectionEligibleForPermanentDeletion } from "../services/photoCleanup";
import { ConflictResolutionModal } from "../components/conflict/ConflictResolutionModal";

export interface InspectionsScreenProps {
  inspections: Inspection[];
  projects: Project[];
  onUpdateStatus?: (inspectionId: string, newStatus: ReviewStatus) => void;
  onLocalReviewTransition?: (updatedInspection: Inspection) => void;
  onSaveInspection?: (inspection: Inspection) => void | Promise<void>;
  onDeleteInspection?: (inspectionId: string) => void | Promise<void>;
  onArchiveInspection?: (inspectionId: string, reason?: string) => void | Promise<void>;
  onUnarchiveInspection?: (inspectionId: string) => void | Promise<void>;
  selectedProjectId?: string | null;
  onClearProjectFilter?: () => void;
  isNewInspectionModalOpen?: boolean;
  setIsNewInspectionModalOpen?: (open: boolean) => void;
}

export const InspectionsScreen: React.FC<InspectionsScreenProps> = ({
  inspections,
  projects,
  onUpdateStatus: _onUpdateStatus,
  onLocalReviewTransition,
  onSaveInspection,
  onDeleteInspection,
  onArchiveInspection,
  onUnarchiveInspection,
  selectedProjectId,
  onClearProjectFilter,
  isNewInspectionModalOpen: externalIsNewModalOpen,
  setIsNewInspectionModalOpen: externalSetIsNewModalOpen,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<LocalDraftInspection | null>(null);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [inspectionToDelete, setInspectionToDelete] = useState<Inspection | null>(null);

  // Local drafts retrieved from IndexedDB
  const [localDrafts, setLocalDrafts] = useState<LocalDraftInspection[]>([]);
  const [detailPhotos, setDetailPhotos] = useState<LocalEvidencePhoto[]>([]);

  // Authenticated inspector and review transition state
  const { currentUser } = useAuth();
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, InspectionSyncStatus>>({});
  const [conflictModalMutation, setConflictModalMutation] = useState<MutationRecord | null>(null);

  const handleOpenConflictModal = async (inspectionId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!currentUser?.uid) return;
    try {
      const mutations = await getMutationsByInspection(currentUser.uid, inspectionId);
      const conflicted = mutations.find((m) => m.status === "conflict");
      if (conflicted) {
        setConflictModalMutation(conflicted);
      }
    } catch (err) {
      console.warn("Failed to retrieve conflict mutation for inspection:", err);
    }
  };

  const renderSyncBadge = (status?: InspectionSyncStatus, inspectionId?: string) => {
    if (!status) return null;
    switch (status.state) {
      case "syncing":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-500 animate-spin" />
            Syncing...
          </span>
        );
      case "waiting_to_sync":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            Waiting to Sync
          </span>
        );
      case "synced":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Synced
          </span>
        );
      case "sync_failed":
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"
            title={status.failureReason || "Sync failed"}
          >
            <XCircle className="w-3 h-3 text-red-500" />
            Sync Failed
          </span>
        );
      case "conflict":
        return (
          <button
            type="button"
            onClick={(e) => inspectionId && handleOpenConflictModal(inspectionId, e)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer transition-colors"
            title={status.conflictReason || "Conflict detected - click to resolve"}
          >
            <AlertTriangle className="w-3 h-3 text-purple-600" />
            Conflict (Resolve)
          </button>
        );
      case "sync_cancelled":
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300"
            title="Synchronization cancelled by user"
          >
            <XCircle className="w-3 h-3 text-slate-500" />
            Sync Cancelled
          </span>
        );
      case "local_only":
      default:
        return null;
    }
  };

  // Track component mounted status across async calls
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Internal vs external modal open state
  const isCreateOpen = externalIsNewModalOpen ?? isEditorModalOpen;
  const setCreateOpen = externalSetIsNewModalOpen ?? setIsEditorModalOpen;

  // Load drafts from IndexedDB
  const loadDrafts = useCallback(async () => {
    try {
      const drafts = await getAllLocalDrafts();
      if (isMountedRef.current && typeof window !== "undefined") {
        setLocalDrafts(drafts);
      }
    } catch (err) {
      console.warn("Failed to load local drafts from IndexedDB:", err);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Load photos when opening inspection detail
  useEffect(() => {
    let isMounted = true;
    if (activeInspection) {
      getEvidencePhotosByInspection(activeInspection.id).then((photos) => {
        if (isMounted && typeof window !== "undefined") {
          setDetailPhotos(photos);
        }
      });
    } else {
      setDetailPhotos([]);
    }
    return () => {
      isMounted = false;
    };
  }, [activeInspection]);

  // Convert unsynced local drafts into Inspection-compatible view objects preserving all review metadata
  const draftInspectionItems: Inspection[] = useMemo(
    () =>
      localDrafts.map((d) => ({
        id: d.id,
        ownerUid: d.ownerUid,
        projectId: d.projectId,
        projectName:
          d.projectName || projects.find((p) => p.id === d.projectId)?.name || "Local Project",
        title: d.title,
        observation: d.observation,
        category: d.category,
        visibleEvidence: d.visibleEvidence,
        uncertainties: d.uncertainties,
        inspectorFollowUp: d.inspectorFollowUp,
        reviewStatus: d.reviewStatus || "draft_generated",
        reviewHistory: d.reviewHistory || [],
        reviewedAt: d.reviewedAt,
        reviewedByUid: d.reviewedByUid,
        revision: d.revision,
        aiAssisted: false,
        photoIds: d.photoIds,
        isLocalDraft: true,
        createdAt: d.createdAt,
        updatedAt: d.lastSavedAt,
      })),
    [localDrafts, projects]
  );

  // Combined inspections list (deduplicating by ID)
  const allDisplayInspections: Inspection[] = useMemo(
    () => [
      ...draftInspectionItems,
      ...inspections.filter((i) => !draftInspectionItems.some((d) => d.id === i.id)),
    ],
    [draftInspectionItems, inspections]
  );

  // Filter inspections
  const filteredInspections = useMemo(
    () =>
      allDisplayInspections.filter((insp) => {
        if (selectedProjectId && insp.projectId !== selectedProjectId) {
          return false;
        }
        if (statusFilter === "archived") {
          return insp.isArchived === true;
        }
        if (statusFilter !== "all" && insp.reviewStatus !== statusFilter) {
          return false;
        }
        return true;
      }),
    [allDisplayInspections, selectedProjectId, statusFilter]
  );

  // Load synchronization statuses from durable mutation queue for displayed items
  const inspectionIdsKey = useMemo(
    () => allDisplayInspections.map((i) => i.id).join(","),
    [allDisplayInspections]
  );

  useEffect(() => {
    let isCancelled = false;
    const fetchSyncStatuses = async () => {
      if (!currentUser?.uid) {
        if (!isCancelled && isMountedRef.current) setSyncStatuses({});
        return;
      }
      const updatedStatuses: Record<string, InspectionSyncStatus> = {};
      for (const insp of allDisplayInspections) {
        try {
          const status = await getInspectionSyncStatus(currentUser.uid, insp.id, {
            isRemote: !insp.isLocalDraft,
            isLocalDraft: !!insp.isLocalDraft,
          });
          updatedStatuses[insp.id] = status;
        } catch {
          // non-critical UI decoration failure
        }
      }
      if (!isCancelled && isMountedRef.current) {
        setSyncStatuses(updatedStatuses);
      }
    };

    fetchSyncStatuses();
    return () => {
      isCancelled = true;
    };
  }, [currentUser?.uid, inspectionIdsKey, allDisplayInspections]);

  const handleOpenDetail = (insp: Inspection) => {
    setActiveInspection(insp);
    setReviewError(null);
    setReviewComment("");
    setIsDetailModalOpen(true);
  };

  const handleOpenEditorForNew = () => {
    setEditingDraft(null);
    setEditingInspection(null);
    setCreateOpen(true);
  };

  const handleOpenEditorForDraft = (draftItem: Inspection, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const rawDraft = localDrafts.find((d) => d.id === draftItem.id);
    if (rawDraft) {
      setEditingDraft(rawDraft);
      setEditingInspection(null);
    } else {
      setEditingDraft(null);
      setEditingInspection(draftItem);
    }
    setCreateOpen(true);
  };

  const handleOpenEditorForExisting = (insp: Inspection) => {
    setEditingDraft(null);
    setEditingInspection(insp);
    setIsDetailModalOpen(false);
    setCreateOpen(true);
  };

  const handleReviewTransition = async (targetStatus: ReviewStatus) => {
    if (!activeInspection) return;
    if (!currentUser?.uid) {
      setReviewError("Authentication required: Please sign in as an inspector to record review decisions.");
      return;
    }

    setReviewError(null);
    setIsReviewing(true);

    try {
      const { updatedInspection, auditEvent } = executeReviewTransition(
        activeInspection,
        targetStatus,
        currentUser.uid,
        reviewComment.trim() || undefined
      );

      // Persist status and audit event atomically to IndexedDB
      await persistLocalReviewTransition(activeInspection.id, updatedInspection, auditEvent);

      // Notify parent for in-memory React state update
      if (onLocalReviewTransition) {
        onLocalReviewTransition(updatedInspection);
      }

      // Enqueue durable TRANSITION_REVIEW mutation
      await enqueueMutation({
        ownerUid: currentUser.uid,
        targetInspectionId: activeInspection.id,
        type: "TRANSITION_REVIEW",
        payload: {
          type: "TRANSITION_REVIEW",
          fromStatus: activeInspection.reviewStatus || "draft_generated",
          targetStatus,
          reviewerUid: currentUser.uid,
          comment: reviewComment.trim() || undefined,
          auditEventId: auditEvent.id,
        },
        baseRevision: activeInspection.revision || 1,
      });

      // Background replay
      void replayQueuedMutations().catch((err) => {
        console.warn("Background replay execution error:", err);
      });

      // Update local modal state and reset comment
      setActiveInspection(updatedInspection);
      setReviewComment("");

      // Refresh draft cache
      await loadDrafts();
    } catch (err: unknown) {
      if (err instanceof ReviewLifecycleError) {
        setReviewError(err.message);
      } else {
        const e = err as Error;
        setReviewError(`Failed to save review decision locally: ${e.message}`);
      }
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSaveSuccess = async (saved: Inspection) => {
    if (onSaveInspection) {
      await onSaveInspection(saved);
    }
    await loadDrafts();
  };

  const handleDeleteDraft = async (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteLocalDraft(draftId);
      await loadDrafts();
    } catch (err) {
      console.warn("Failed to delete local draft:", err);
    }
  };

  const confirmDeleteInspection = async () => {
    if (!inspectionToDelete) return;
    const eligibility = isInspectionEligibleForPermanentDeletion(inspectionToDelete);
    if (!eligibility.eligible) {
      return;
    }
    if (onDeleteInspection) {
      await onDeleteInspection(inspectionToDelete.id);
    } else if (inspectionToDelete.isLocalDraft) {
      await deleteLocalDraft(inspectionToDelete.id);
    }
    setInspectionToDelete(null);
    setIsDetailModalOpen(false);
    await loadDrafts();
  };

  const getReviewProgress = (status: ReviewStatus) => {
    switch (status) {
      case "approved":
      case "rejected":
        return 100;
      case "in_review":
        return 60;
      case "draft_generated":
      default:
        return 25;
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Recent Audit";
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Screen Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block mb-1">
            Field Operations
          </span>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Site Inspections
            </h1>
            {selectedProjectId && (
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-brand-100 text-brand-800 rounded-full">
                Filtered by Project
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Capture field observations, attach local photograph evidence, and record human review sign offs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {selectedProjectId && onClearProjectFilter && (
            <Button variant="outline" size="md" onClick={onClearProjectFilter} className="rounded-full text-xs">
              Show All Projects
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenEditorForNew}
            className="rounded-full shadow-pill text-xs"
          >
            New Inspection
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-semibold flex items-center gap-1 pl-1 pr-2 uppercase tracking-wider text-[11px]">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        {[
          { id: "all", label: "All Records" },
          { id: "draft_generated", label: `Drafts (${localDrafts.length})` },
          { id: "in_review", label: "In Review" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
          { id: "archived", label: "Archived" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3.5 py-1.5 font-semibold rounded-full transition-all duration-200 whitespace-nowrap cursor-pointer ${
              statusFilter === tab.id
                ? "bg-slate-900 text-white shadow-xs scale-105"
                : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inspections Grid */}
      {filteredInspections.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No inspections found"
          description={
            statusFilter !== "all"
              ? `There are no inspections matching the status filter "${statusFilter}".`
              : "No inspections recorded yet. Start by capturing field observations."
          }
          actionLabel={statusFilter !== "all" ? "Clear Filters" : "Record Inspection"}
          onAction={() => {
            if (statusFilter !== "all") setStatusFilter("all");
            else handleOpenEditorForNew();
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredInspections.map((insp) => {
            const progress = getReviewProgress(insp.reviewStatus);

            return (
              <div
                key={insp.id}
                onClick={() => handleOpenDetail(insp)}
                className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-slate-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer space-y-4"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDate(insp.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {insp.isLocalDraft && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Database className="w-3 h-3 text-amber-500" />
                        Local Draft
                      </span>
                    )}
                    {renderSyncBadge(syncStatuses[insp.id], insp.id)}
                    <Badge variant="status" status={insp.reviewStatus} />
                    {insp.isArchived && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                        <Archive className="w-2.5 h-2.5 text-slate-500" />
                        Archived
                      </span>
                    )}

                    {insp.isLocalDraft && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteDraft(insp.id, e)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Discard Draft"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title & Observation */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wide block truncate">
                    {insp.projectName}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                    {insp.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed min-h-[32px]">
                    {insp.observation || "(No observation recorded yet)"}
                  </p>
                </div>

                {/* Progress Bar Section */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-500">Progress</span>
                    <span className="font-bold text-slate-800">{progress} %</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 gap-2">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-[11px] truncate">
                      {insp.photoIds && insp.photoIds.length > 0
                        ? `${insp.photoIds.length} photo(s)`
                        : insp.photoMeta
                        ? `${insp.photoMeta.fileName}`
                        : "No photo"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="category" category={insp.category} />
                    {insp.isLocalDraft ? (
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditorForDraft(insp, e)}
                        className="text-brand-600 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Continue Draft
                      </button>
                    ) : (
                      <span className="text-brand-600 font-medium inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        Review
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspection Detail / Review Modal */}
      {activeInspection && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Inspection: ${activeInspection.title}`}
          maxWidth="lg"
          footer={
            <div className="flex flex-col gap-2.5 w-full">
              {/* Optional Review Comment Input when review transition is available */}
              {getPermittedReviewTransitions(activeInspection.reviewStatus || "draft_generated").length > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Optional review comment or justification..."
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:border-brand-500"
                    disabled={isReviewing || !currentUser}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Current Status:</span>
                  <Badge variant="status" status={activeInspection.reviewStatus} />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDetailModalOpen(false)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Edit2 className="w-3.5 h-3.5" />}
                    onClick={() => handleOpenEditorForExisting(activeInspection)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => setInspectionToDelete(activeInspection)}
                  >
                    Delete
                  </Button>

                  {/* Archive / Unarchive Action */}
                  {activeInspection.isArchived ? (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<ArchiveRestore className="w-3.5 h-3.5" />}
                      onClick={async () => {
                        if (onUnarchiveInspection) {
                          await onUnarchiveInspection(activeInspection.id);
                          setActiveInspection((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  isArchived: false,
                                  archivedAt: null,
                                  archivedByUid: null,
                                  archiveReason: null,
                                }
                              : null
                          );
                          await loadDrafts();
                        }
                      }}
                    >
                      Unarchive
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Archive className="w-3.5 h-3.5" />}
                      onClick={async () => {
                        if (onArchiveInspection) {
                          await onArchiveInspection(activeInspection.id);
                          setActiveInspection((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  isArchived: true,
                                  archivedAt: Date.now(),
                                  archivedByUid: currentUser?.uid || null,
                                }
                              : null
                          );
                          await loadDrafts();
                        }
                      }}
                    >
                      Archive
                    </Button>
                  )}

                  {/* Strictly Permitted Review Actions */}
                  {getPermittedReviewTransitions(activeInspection.reviewStatus || "draft_generated").map(
                    (targetStatus) => {
                      if (targetStatus === "in_review") {
                        return (
                          <Button
                            key={targetStatus}
                            variant="primary"
                            size="sm"
                            disabled={isReviewing || !currentUser}
                            icon={<Clock className="w-4 h-4" />}
                            onClick={() => handleReviewTransition("in_review")}
                          >
                            {getReviewActionLabel("in_review", activeInspection.reviewStatus)}
                          </Button>
                        );
                      }
                      if (targetStatus === "approved") {
                        return (
                          <Button
                            key={targetStatus}
                            variant="primary"
                            size="sm"
                            disabled={isReviewing || !currentUser}
                            icon={<CheckCircle2 className="w-4 h-4" />}
                            onClick={() => handleReviewTransition("approved")}
                          >
                            Approve Inspection
                          </Button>
                        );
                      }
                      if (targetStatus === "rejected") {
                        return (
                          <Button
                            key={targetStatus}
                            variant="danger"
                            size="sm"
                            disabled={isReviewing || !currentUser}
                            icon={<XCircle className="w-4 h-4" />}
                            onClick={() => handleReviewTransition("rejected")}
                          >
                            Reject Draft
                          </Button>
                        );
                      }
                      return null;
                    }
                  )}
                </div>
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-sm">
            {/* Review Error Notification */}
            {reviewError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Review Action Failed</span>
                  <span>{reviewError}</span>
                </div>
              </div>
            )}

            {/* Unauthenticated Inspector Notice */}
            {!currentUser && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Inspector sign-in required to record review decisions.</span>
              </div>
            )}

            {/* Project & Category Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="text-xs text-slate-400 block">Project</span>
                <span className="font-semibold text-slate-800">
                  {activeInspection.projectName}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Category</span>
                <Badge variant="category" category={activeInspection.category} />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Review Status</span>
                <Badge variant="status" status={activeInspection.reviewStatus} />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Sync Status</span>
                {renderSyncBadge(syncStatuses[activeInspection.id], activeInspection.id) || (
                  <span className="text-xs text-slate-500 font-medium">
                    {activeInspection.isLocalDraft && !activeInspection.ownerUid
                      ? "Device Only (Unassigned)"
                      : activeInspection.isLocalDraft &&
                        activeInspection.ownerUid &&
                        currentUser &&
                        activeInspection.ownerUid !== currentUser.uid
                      ? "Local Only (Other Account)"
                      : "Local Only"}
                  </span>
                )}
              </div>
            </div>

            {/* Observation Notes */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Field Observation Notes
              </h4>
              <p className="text-slate-800 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed whitespace-pre-line">
                {activeInspection.observation}
              </p>
            </div>

            {/* Photographic Evidence Section */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-slate-500" />
                Attached Photographic Evidence ({detailPhotos.length})
              </h4>
              <PhotoEvidenceManager
                inspectionId={activeInspection.id}
                projectId={activeInspection.projectId}
                photos={detailPhotos}
                onPhotosChange={setDetailPhotos}
                readOnly
              />
            </div>

            {/* Visible Evidence List */}
            {activeInspection.visibleEvidence.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Visible Evidence Checklist
                </h4>
                <ul className="space-y-1.5">
                  {activeInspection.visibleEvidence.map((ev, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1 shrink-0" />
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Uncertainties & Constraints */}
            {activeInspection.uncertainties.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1 text-amber-800">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Identified Uncertainties & Non-Destructive Limits
                </h4>
                <ul className="space-y-1">
                  {activeInspection.uncertainties.map((un, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-600 italic bg-amber-50/60 p-2 rounded border border-amber-100"
                    >
                      &quot;{un}&quot;
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inspector Follow-Up Items */}
            {activeInspection.inspectorFollowUp.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1 text-blue-800">
                  <Clock className="w-3.5 h-3.5" />
                  Inspector Recommended Actions
                </h4>
                <ul className="space-y-1">
                  {activeInspection.inspectorFollowUp.map((fu, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-700 bg-blue-50/60 p-2 rounded border border-blue-100"
                    >
                      • {fu}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Review Audit History Timeline */}
            <div className="pt-3 border-t border-slate-200">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Review Audit History ({activeInspection.reviewHistory?.length || 0})
                </span>
                {activeInspection.reviewHistory && activeInspection.reviewHistory.length >= 100 && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-normal">
                    Audit Cap Reached (100 events)
                  </span>
                )}
              </h4>
              {(!activeInspection.reviewHistory || activeInspection.reviewHistory.length === 0) ? (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded border border-slate-200">
                  No review actions recorded yet. Inspection is currently in draft state.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeInspection.reviewHistory.map((evt, idx) => (
                    <div
                      key={evt.id || idx}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <Badge variant="status" status={evt.fromStatus} />
                          <span className="text-slate-400">&rarr;</span>
                          <Badge variant="status" status={evt.toStatus} />
                        </div>
                        <span className="text-slate-400 text-[10px]">
                          {new Date(evt.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        <span>
                          Reviewer UID:{" "}
                          <span className="font-mono text-slate-700">{evt.byUid}</span>
                        </span>
                        {evt.revision && <span>Rev #{evt.revision}</span>}
                      </div>
                      {evt.comment && (
                        <p className="text-slate-600 bg-white p-1.5 rounded border border-slate-100 text-[11px] italic">
                          &quot;{evt.comment}&quot;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Inspection Confirmation Modal */}
      {inspectionToDelete && (() => {
        const eligibility = isInspectionEligibleForPermanentDeletion(inspectionToDelete);
        return (
          <Modal
            isOpen={Boolean(inspectionToDelete)}
            onClose={() => setInspectionToDelete(null)}
            title={
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Confirm Permanent Deletion</span>
              </div>
            }
            footer={
              <>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setInspectionToDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={confirmDeleteInspection}
                  disabled={!eligibility.eligible}
                >
                  Permanently Delete Inspection
                </Button>
              </>
            }
          >
            <div className="space-y-3 text-xs text-slate-700">
              <p>
                Are you sure you want to delete inspection record &quot;{inspectionToDelete?.title}&quot;?
              </p>
              {!eligibility.eligible ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                  <span className="font-semibold block">Permanent Deletion Blocked:</span>
                  <p>{eligibility.reason}</p>
                </div>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 space-y-1.5">
                  <span className="font-semibold block">Inspection Deletion:</span>
                  <p>
                    • Deletion will be queued and synchronized across your workspace.
                  </p>
                  <p>
                    • Associated evidence files will be removed.
                  </p>
                  <p className="font-medium text-red-950">
                    • Any photographs referenced by other inspections will be preserved.
                  </p>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* Manual Inspection Creation & Editor Modal */}
      <InspectionEditorModal
        isOpen={isCreateOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditingDraft(null);
          setEditingInspection(null);
        }}
        projects={projects}
        initialProjectId={selectedProjectId}
        initialDraft={editingDraft}
        initialInspection={editingInspection}
        onSaveSuccess={handleSaveSuccess}
        onDraftSaved={loadDrafts}
      />

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        isOpen={Boolean(conflictModalMutation)}
        onClose={() => setConflictModalMutation(null)}
        mutation={conflictModalMutation}
        onResolved={() => {
          loadDrafts();
          setConflictModalMutation(null);
        }}
      />
    </div>
  );
};
