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

import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";
import {
  Inspection,
  Project,
  ReviewStatus,
  LocalDraftInspection,
  LocalEvidencePhoto,
} from "../types";
import { Card, CardBody, CardFooter } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import { DisclaimerBanner } from "../components/ui/DisclaimerBanner";
import { InspectionEditorModal } from "../components/inspection/InspectionEditorModal";
import { PhotoEvidenceManager } from "../components/evidence/PhotoEvidenceManager";
import {
  getAllLocalDrafts,
  deleteLocalDraft,
  getEvidencePhotosByInspection,
} from "../services/indexeddb";

export interface InspectionsScreenProps {
  inspections: Inspection[];
  projects: Project[];
  onUpdateStatus: (inspectionId: string, newStatus: ReviewStatus) => void;
  onSaveInspection?: (inspection: Inspection) => void | Promise<void>;
  onDeleteInspection?: (inspectionId: string) => void | Promise<void>;
  selectedProjectId?: string | null;
  onClearProjectFilter?: () => void;
  isNewInspectionModalOpen?: boolean;
  setIsNewInspectionModalOpen?: (open: boolean) => void;
}

export const InspectionsScreen: React.FC<InspectionsScreenProps> = ({
  inspections,
  projects,
  onUpdateStatus,
  onSaveInspection,
  onDeleteInspection,
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

  // Convert unsynced local drafts into Inspection-compatible view objects
  const draftInspectionItems: Inspection[] = localDrafts.map((d) => ({
    id: d.id,
    projectId: d.projectId,
    projectName: d.projectName || projects.find((p) => p.id === d.projectId)?.name || "Local Project",
    title: d.title,
    observation: d.observation,
    category: d.category,
    visibleEvidence: d.visibleEvidence,
    uncertainties: d.uncertainties,
    inspectorFollowUp: d.inspectorFollowUp,
    reviewStatus: "draft_generated",
    aiAssisted: false,
    photoIds: d.photoIds,
    isLocalDraft: true,
    createdAt: d.createdAt,
    updatedAt: d.lastSavedAt,
  }));

  // Combined inspections list (deduplicating by ID)
  const allDisplayInspections: Inspection[] = [
    ...draftInspectionItems,
    ...inspections.filter((i) => !draftInspectionItems.some((d) => d.id === i.id)),
  ];

  // Filter inspections
  const filteredInspections = allDisplayInspections.filter((insp) => {
    if (selectedProjectId && insp.projectId !== selectedProjectId) {
      return false;
    }
    if (statusFilter === "draft_generated") {
      return insp.reviewStatus === "draft_generated" || insp.isLocalDraft;
    }
    if (statusFilter !== "all" && insp.reviewStatus !== statusFilter) {
      return false;
    }
    return true;
  });

  const handleOpenDetail = (insp: Inspection) => {
    setActiveInspection(insp);
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

  const handleStatusChange = (newStatus: ReviewStatus) => {
    if (activeInspection) {
      onUpdateStatus(activeInspection.id, newStatus);
      setActiveInspection({
        ...activeInspection,
        reviewStatus: newStatus,
        reviewedAt: Date.now(),
      });
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
    if (inspectionToDelete.isLocalDraft) {
      await deleteLocalDraft(inspectionToDelete.id);
    } else if (onDeleteInspection) {
      await onDeleteInspection(inspectionToDelete.id);
    }
    setInspectionToDelete(null);
    setIsDetailModalOpen(false);
    await loadDrafts();
  };

  return (
    <div className="space-y-6">
      {/* Screen Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Site Inspections
            </h1>
            {selectedProjectId && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-brand-100 text-brand-800 rounded">
                Filtered by Project
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Capture field observations, attach local photograph evidence, and record human review sign-offs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedProjectId && onClearProjectFilter && (
            <Button variant="outline" size="md" onClick={onClearProjectFilter}>
              Show All Projects
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={handleOpenEditorForNew}
          >
            New Inspection
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1 pl-1 pr-2">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        {[
          { id: "all", label: "All Records" },
          { id: "draft_generated", label: `Drafts (${localDrafts.length})` },
          { id: "in_review", label: "In Review" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === tab.id
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
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
          {filteredInspections.map((insp) => (
            <Card
              key={insp.id}
              hoverable
              onClick={() => handleOpenDetail(insp)}
              className="flex flex-col justify-between group"
            >
              <CardBody className="p-5 space-y-3">
                {/* Meta Header */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-brand-600 uppercase tracking-wide truncate max-w-[150px]">
                    {insp.projectName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {insp.isLocalDraft ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Database className="w-3 h-3 text-amber-500" />
                        Local Draft
                      </span>
                    ) : (
                      <Badge variant="status" status={insp.reviewStatus} />
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
                <div>
                  <h3 className="text-base font-semibold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                    {insp.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                    {insp.observation || "(No observation recorded yet)"}
                  </p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="category" category={insp.category} />
                  {insp.inferenceSource && (
                    <Badge variant="source" source={insp.inferenceSource} />
                  )}
                </div>
              </CardBody>

              {/* Footer */}
              <CardFooter className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {insp.photoIds && insp.photoIds.length > 0
                      ? `${insp.photoIds.length} photo(s) in IndexedDB`
                      : insp.photoMeta
                      ? `${insp.photoMeta.fileName}`
                      : "No photo attached"}
                  </span>
                </div>
                {insp.isLocalDraft ? (
                  <button
                    type="button"
                    onClick={(e) => handleOpenEditorForDraft(insp, e)}
                    className="text-brand-600 font-semibold inline-flex items-center gap-1 hover:underline"
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
              </CardFooter>
            </Card>
          ))}
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
                {activeInspection.reviewStatus !== "rejected" && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<XCircle className="w-4 h-4" />}
                    onClick={() => handleStatusChange("rejected")}
                  >
                    Reject Draft
                  </Button>
                )}
                {activeInspection.reviewStatus !== "approved" && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    onClick={() => handleStatusChange("approved")}
                  >
                    Approve Inspection
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-sm">
            {/* Disclaimer */}
            <DisclaimerBanner compact />

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
                <span className="text-xs text-slate-400 block">Storage Provider</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                  <Database className="w-3 h-3" />
                  IndexedDB Local Blobs
                </span>
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
          </div>
        </Modal>
      )}

      {/* Delete Inspection Confirmation Modal */}
      <Modal
        isOpen={Boolean(inspectionToDelete)}
        onClose={() => setInspectionToDelete(null)}
        title={
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span>Confirm Inspection Deletion</span>
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
            <Button variant="danger" size="md" onClick={confirmDeleteInspection}>
              Permanently Delete Inspection
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p>
            Are you sure you want to delete inspection record &quot;{inspectionToDelete?.title}&quot;?
          </p>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 space-y-1">
            <span className="font-semibold block">Local Evidence Notice:</span>
            <p>
              Deleting this inspection will permanently remove all attached photographic evidence Blobs stored locally in IndexedDB.
            </p>
          </div>
        </div>
      </Modal>

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
    </div>
  );
};
