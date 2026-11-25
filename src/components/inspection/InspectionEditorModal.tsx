/**
 * ForeSite Inspection Editor & Manual Creation Modal
 *
 * Implements:
 * - Complete manual inspection workflow without AI
 * - Field notes, observation category, evidence items, and uncertainties
 * - Photographic evidence attachment via PhotoEvidenceManager (IndexedDB Blobs)
 * - Automatic & explicit draft persistence to IndexedDB ('localInspections')
 * - Local-only retention disclosure
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Save,
  CheckCircle2,
  Plus,
  X,
  Clock,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  Project,
  Inspection,
  ObservationCategory,
  LocalDraftInspection,
  LocalEvidencePhoto,
  CloudFallbackPreference,
  InferenceSource,
} from "../../types";
import {
  saveLocalDraft,
  getEvidencePhotosByInspection,
} from "../../services/indexeddb";
import { PhotoEvidenceManager } from "../evidence/PhotoEvidenceManager";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { CloudConsentModal } from "./CloudConsentModal";
import {
  generateInspectionDraft,
  isQuotaExceededError,
} from "../../services/ai";
import {
  getAutoCloudFallbackPreference,
  SAFE_DEFAULT_PREFERENCE,
} from "../../services/preferences";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../lib/firebase";

export interface InspectionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  initialProjectId?: string | null;
  initialDraft?: LocalDraftInspection | null;
  initialInspection?: Inspection | null;
  onSaveSuccess: (savedInspection: Inspection) => void;
  onDraftSaved?: (draft: LocalDraftInspection) => void;
}

const CATEGORIES: { value: ObservationCategory; label: string }[] = [
  { value: "surface_condition", label: "Surface Condition (Cracks, Voids, Spalls)" },
  { value: "installation", label: "Installation & Assembly (Rebar, Anchor Bolts)" },
  { value: "equipment", label: "Equipment & Shoring (Falsework, Scaffold, Crane)" },
  { value: "housekeeping", label: "Housekeeping & Safety (Debris, Barriers, Drainage)" },
  { value: "other", label: "General / Other Observation" },
];

function mapCategory(aiCategory: string): ObservationCategory {
  switch (aiCategory) {
    case "structural":
    case "installation":
      return "installation";
    case "equipment":
    case "hvac":
      return "equipment";
    case "fire_safety":
    case "environmental":
    case "housekeeping":
      return "housekeeping";
    case "finishes":
    case "surface_condition":
      return "surface_condition";
    case "plumbing":
      return "installation";
    case "general":
    case "other":
    default:
      return "other";
  }
}

export const InspectionEditorModal: React.FC<InspectionEditorModalProps> = ({
  isOpen,
  onClose,
  projects,
  initialProjectId,
  initialDraft,
  initialInspection,
  onSaveSuccess,
  onDraftSaved,
}) => {
  // Determine working ID (use existing ID or generate stable new ID)
  const [inspectionId, setInspectionId] = useState<string>(() => {
    return (
      initialInspection?.id ||
      initialDraft?.id ||
      `insp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    );
  });

  const [projectId, setProjectId] = useState<string>(
    initialInspection?.projectId ||
      initialDraft?.projectId ||
      initialProjectId ||
      (projects[0]?.id || "")
  );

  const [title, setTitle] = useState(
    initialInspection?.title || initialDraft?.title || ""
  );
  const [category, setCategory] = useState<ObservationCategory>(
    initialInspection?.category || initialDraft?.category || "installation"
  );
  const [observation, setObservation] = useState(
    initialInspection?.observation || initialDraft?.observation || ""
  );

  // Dynamic list builders
  const [visibleEvidence, setVisibleEvidence] = useState<string[]>(
    initialInspection?.visibleEvidence || initialDraft?.visibleEvidence || []
  );
  const [newEvidenceItem, setNewEvidenceItem] = useState("");

  const [uncertainties, setUncertainties] = useState<string[]>(
    initialInspection?.uncertainties || initialDraft?.uncertainties || []
  );
  const [newUncertaintyItem, setNewUncertaintyItem] = useState("");

  const [inspectorFollowUp, setInspectorFollowUp] = useState<string[]>(
    initialInspection?.inspectorFollowUp || initialDraft?.inspectorFollowUp || []
  );
  const [newFollowUpItem, setNewFollowUpItem] = useState("");

  // Attached local photos from IndexedDB
  const [photos, setPhotos] = useState<LocalEvidencePhoto[]>([]);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<number | null>(
    initialDraft?.lastSavedAt || null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth & Cloud Fallback Preference
  const { currentUser } = useAuth();
  const [preference, setPreference] = useState<CloudFallbackPreference>(SAFE_DEFAULT_PREFERENCE);

  // Hybrid AI Drafting States
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAssisted, setAiAssisted] = useState<boolean>(initialInspection?.aiAssisted || false);
  const [inferenceSource, setInferenceSource] = useState<InferenceSource | undefined>(
    initialInspection?.inferenceSource
  );

  // Consent modal state for Mode B
  const [isConsentModalOpen, setIsConsentModalOpen] = useState<boolean>(false);
  const consentResolverRef = useRef<((consented: boolean) => void) | null>(null);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load persistent Automatic Cloud Fallback setting
  useEffect(() => {
    let isMounted = true;
    const loadPref = async () => {
      try {
        const pref = await getAutoCloudFallbackPreference(currentUser?.uid);
        if (isMounted) {
          setPreference(pref);
        }
      } catch (err) {
        console.warn("Failed to load preference:", err);
      }
    };

    if (isOpen) {
      loadPref();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser?.uid]);

  // Initialize or reset form state when modal opens or target item changes
  useEffect(() => {
    if (isOpen) {
      const activeId =
        initialInspection?.id ||
        initialDraft?.id ||
        `insp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      setInspectionId(activeId);
      setProjectId(
        initialInspection?.projectId ||
          initialDraft?.projectId ||
          initialProjectId ||
          (projects[0]?.id || "")
      );
      setTitle(initialInspection?.title || initialDraft?.title || "");
      setCategory(
        initialInspection?.category || initialDraft?.category || "installation"
      );
      setObservation(
        initialInspection?.observation || initialDraft?.observation || ""
      );
      setVisibleEvidence(
        initialInspection?.visibleEvidence || initialDraft?.visibleEvidence || []
      );
      setUncertainties(
        initialInspection?.uncertainties || initialDraft?.uncertainties || []
      );
      setInspectorFollowUp(
        initialInspection?.inspectorFollowUp || initialDraft?.inspectorFollowUp || []
      );
      setLastSavedTimestamp(initialDraft?.lastSavedAt || null);
      setFormError(null);
      setAiAssisted(initialInspection?.aiAssisted || false);
      setInferenceSource(initialInspection?.inferenceSource);
      setAiError(null);
      setIsGeneratingAI(false);

      // Load existing photos from IndexedDB for this inspection
      getEvidencePhotosByInspection(activeId).then((loadedPhotos) => {
        setPhotos(loadedPhotos);
      });
    }
  }, [isOpen, initialDraft, initialInspection, initialProjectId, projects]);

  // Construct draft object with strict owner derivation
  const buildDraftPayload = useCallback(
    (): LocalDraftInspection => {
      // Establish ownership:
      // - If editing existing draft: strictly preserve initialDraft.ownerUid (never reassign legacy drafts)
      // - If editing existing inspection: strictly preserve initialInspection.ownerUid
      // - If brand new: obtain exclusively from currently authenticated Firebase user
      const effectiveOwnerUid =
        initialDraft !== undefined && initialDraft !== null
          ? initialDraft.ownerUid
          : initialInspection !== undefined && initialInspection !== null
          ? initialInspection.ownerUid
          : auth.currentUser?.uid || currentUser?.uid || undefined;

      return {
        id: inspectionId,
        ownerUid: effectiveOwnerUid,
        projectId,
        projectName: projects.find((p) => p.id === projectId)?.name,
        title: title.trim() || "Untitled Inspection Draft",
        observation: observation.trim(),
        category,
        visibleEvidence,
        uncertainties,
        inspectorFollowUp,
        photoIds: photos.map((p) => p.id),
        isSynced: false,
        reviewStatus: initialInspection?.reviewStatus || initialDraft?.reviewStatus || "draft_generated",
        reviewHistory: initialInspection?.reviewHistory || initialDraft?.reviewHistory || [],
        reviewedAt: initialInspection?.reviewedAt || initialDraft?.reviewedAt,
        reviewedByUid: initialInspection?.reviewedByUid || initialDraft?.reviewedByUid,
        revision: initialInspection?.revision || initialDraft?.revision,
        lastSavedAt: Date.now(),
        createdAt: initialInspection?.createdAt || initialDraft?.createdAt || Date.now(),
      };
    },
    [
      inspectionId,
      projectId,
      projects,
      title,
      observation,
      category,
      visibleEvidence,
      uncertainties,
      inspectorFollowUp,
      photos,
      initialInspection,
      initialDraft,
      currentUser?.uid,
      aiAssisted,
      inferenceSource,
    ]
  );

  // Hybrid AI Draft Generation Handler
  const handleGenerateAIDraft = async () => {
    setFormError(null);
    setAiError(null);

    if (photos.length === 0) {
      setFormError("Please upload or capture at least one site photograph before generating an AI draft.");
      return;
    }

    setIsGeneratingAI(true);

    const primaryPhoto = photos[0];
    if (!primaryPhoto) {
      setFormError("Please upload or capture at least one site photograph before generating an AI draft.");
      return;
    }

    setIsGeneratingAI(true);

    try {
      const result = await generateInspectionDraft({
        photoBlob: primaryPhoto.blob,
        notes: observation,
        preferenceSnapshot: preference,
        requestConsent: () => {
          return new Promise<boolean>((resolve) => {
            consentResolverRef.current = resolve;
            setIsConsentModalOpen(true);
          });
        },
      });

      const draft = result.draft;

      if (draft.title) {
        setTitle(draft.title);
      }
      if (draft.observation) {
        setObservation(draft.observation);
      }
      if (draft.category) {
        setCategory(mapCategory(draft.category));
      }
      if (draft.visibleEvidence && draft.visibleEvidence.length > 0) {
        setVisibleEvidence(draft.visibleEvidence);
      }
      if (draft.uncertainties && draft.uncertainties.length > 0) {
        setUncertainties(draft.uncertainties);
      }
      if (draft.inspectorFollowUp && draft.inspectorFollowUp.length > 0) {
        setInspectorFollowUp(draft.inspectorFollowUp);
      }

      setAiAssisted(true);
      setInferenceSource(result.inferenceSource);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("INSPECTOR_DECLINED_CLOUD_PROCESSING")) {
        setAiError("Cloud processing was declined. You can continue drafting manually.");
      } else if (isQuotaExceededError(err)) {
        setAiError("AI rate limit reached. Please wait a moment before trying again.");
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setAiError(`AI draft generation could not be completed: ${message}`);
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Debounced auto-save to IndexedDB as user types
  useEffect(() => {
    if (!isOpen || !title.trim() && !observation.trim()) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const draft = buildDraftPayload();
        await saveLocalDraft(draft);
        setLastSavedTimestamp(Date.now());
        if (onDraftSaved) onDraftSaved(draft);
      } catch (err) {
        console.warn("Auto-save draft failed:", err);
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [title, observation, category, visibleEvidence, uncertainties, inspectorFollowUp, isOpen, buildDraftPayload, onDraftSaved]);

  // Explicit Save Draft Button Handler
  const handleManualSaveDraft = async () => {
    try {
      const draft = buildDraftPayload();
      await saveLocalDraft(draft);
      setLastSavedTimestamp(Date.now());
      if (onDraftSaved) onDraftSaved(draft);
    } catch (err: unknown) {
      const e = err as Error;
      setFormError(`Failed to save draft locally: ${e.message}`);
    }
  };

  // Add Item Helpers
  const addEvidence = () => {
    if (newEvidenceItem.trim()) {
      setVisibleEvidence([...visibleEvidence, newEvidenceItem.trim()]);
      setNewEvidenceItem("");
    }
  };

  const removeEvidence = (index: number) => {
    setVisibleEvidence(visibleEvidence.filter((_, i) => i !== index));
  };

  const addUncertainty = () => {
    if (newUncertaintyItem.trim()) {
      setUncertainties([...uncertainties, newUncertaintyItem.trim()]);
      setNewUncertaintyItem("");
    }
  };

  const removeUncertainty = (index: number) => {
    setUncertainties(uncertainties.filter((_, i) => i !== index));
  };

  const addFollowUp = () => {
    if (newFollowUpItem.trim()) {
      setInspectorFollowUp([...inspectorFollowUp, newFollowUpItem.trim()]);
      setNewFollowUpItem("");
    }
  };

  const removeFollowUp = (index: number) => {
    setInspectorFollowUp(inspectorFollowUp.filter((_, i) => i !== index));
  };

  // Final Publish / Save Inspection Handler
  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!projectId) {
      setFormError("Please select an inspection project.");
      return;
    }
    if (!title.trim()) {
      setFormError("Inspection title is required.");
      return;
    }
    if (!observation.trim()) {
      setFormError("Observation notes are required.");
      return;
    }

    setIsSubmitting(true);
    const selectedProject = projects.find((p) => p.id === projectId);
    const now = Date.now();

    // Prepare primary photo metadata if photo attached
    const primaryPhoto = photos[0];

    const effectiveOwnerUid =
      initialDraft !== undefined && initialDraft !== null
        ? initialDraft.ownerUid
        : initialInspection !== undefined && initialInspection !== null
        ? initialInspection.ownerUid
        : auth.currentUser?.uid || currentUser?.uid || undefined;

    const completedInspection: Inspection = {
      id: inspectionId,
      ownerUid: effectiveOwnerUid,
      projectId,
      projectName: selectedProject ? selectedProject.name : "Unassigned Project",
      title: title.trim(),
      observation: observation.trim(),
      category,
      visibleEvidence,
      uncertainties,
      inspectorFollowUp,
      reviewStatus: initialInspection?.reviewStatus || initialDraft?.reviewStatus || "draft_generated",
      reviewHistory: initialInspection?.reviewHistory || initialDraft?.reviewHistory || [],
      reviewedAt: initialInspection?.reviewedAt || initialDraft?.reviewedAt,
      reviewedByUid: initialInspection?.reviewedByUid || initialDraft?.reviewedByUid,
      revision: initialInspection?.revision || initialDraft?.revision,
      aiAssisted: aiAssisted || initialInspection?.aiAssisted || false,
      inferenceSource: inferenceSource || initialInspection?.inferenceSource,
      photoIds: photos.map((p) => p.id),
      photoMeta: primaryPhoto
        ? {
            id: primaryPhoto.id,
            fileName: primaryPhoto.fileName,
            fileSizeBytes: primaryPhoto.fileSizeBytes,
            mimeType: primaryPhoto.mimeType,
            storageProvider: "indexeddb",
            hasLocalBlob: true,
            capturedAt: primaryPhoto.capturedAt,
          }
        : undefined,
      createdAt: initialInspection?.createdAt || now,
      updatedAt: now,
    };

    try {
      // Save completed version to IndexedDB drafts (strictly isSynced: false until remote acknowledgment)
      await saveLocalDraft({
        ...buildDraftPayload(),
        isSynced: false,
      });

      onSaveSuccess(completedInspection);
      onClose();
    } catch (err: unknown) {
      const e = err as Error;
      setFormError(`Failed to save inspection: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-500 text-white rounded-md">
            <FileText className="w-4 h-4" />
          </div>
          <span>
            {initialInspection
              ? "Edit Site Inspection"
              : initialDraft
              ? "Continue Inspection Draft"
              : "New Site Inspection"}
          </span>
          {aiAssisted && (
            <Badge variant="source" source={inferenceSource || "ON_DEVICE"} />
          )}
        </div>
      }
      maxWidth="xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          {/* Last Saved Status */}
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {lastSavedTimestamp
                ? `Draft saved locally: ${new Date(lastSavedTimestamp).toLocaleTimeString()}`
                : "Unsaved local draft"}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-nowrap">
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isGeneratingAI}
              icon={
                isGeneratingAI ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin text-brand-600" />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0 text-brand-600" />
                )
              }
              onClick={handleGenerateAIDraft}
              className="h-10 whitespace-nowrap border-brand-300 text-brand-800 hover:bg-brand-50"
            >
              {isGeneratingAI ? "Drafting..." : "AI Draft"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              className="h-10 whitespace-nowrap"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="md"
              icon={<Save className="w-4 h-4 shrink-0" />}
              onClick={handleManualSaveDraft}
              className="h-10 whitespace-nowrap"
            >
              Save Draft
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={isSubmitting}
              icon={<CheckCircle2 className="w-4 h-4 shrink-0" />}
              onClick={handleSaveInspection}
              className="h-10 whitespace-nowrap"
            >
              {isSubmitting ? "Saving..." : "Save Inspection"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSaveInspection} className="space-y-5">
        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {aiError && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAiError(null)}
              className="text-amber-600 hover:text-amber-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Project Selector & Title Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Associated Project <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.siteLabel} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Inspection Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Footing Reinforcement & Cover Inspection"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Observation Category */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
            Observation Category <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <label
                key={cat.value}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  category === cat.value
                    ? "border-brand-500 bg-brand-50/60 font-semibold text-brand-900"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="observation-category"
                  value={cat.value}
                  checked={category === cat.value}
                  onChange={() => setCategory(cat.value)}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span>{cat.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Field Notes / Observation Text */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
            Field Observation Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Record direct field observations, equipment condition, placement, measurements, or visible anomalies..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed"
          />
        </div>

        {/* Image Evidence Attachment */}
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">
            Image Evidence <span className="sr-only">Photographic Evidence</span>
          </label>
          <PhotoEvidenceManager
            inspectionId={inspectionId}
            projectId={projectId}
            photos={photos}
            onPhotosChange={setPhotos}
          />
        </div>

        {/* Dynamic List: Visible Evidence Checklist */}
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">
            Visible Evidence Checklist
          </label>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newEvidenceItem}
              onChange={(e) => setNewEvidenceItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEvidence();
                }
              }}
              placeholder="Add physical evidence item..."
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={addEvidence}
            >
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {visibleEvidence.map((ev, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-800 text-xs border border-slate-200"
              >
                <span>{ev}</span>
                <button
                  type="button"
                  onClick={() => removeEvidence(index)}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Remove evidence item ${ev}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Dynamic List: Identified Uncertainties */}
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-xs font-semibold uppercase text-amber-800 mb-2">
            Identified Uncertainties & Non-Destructive Limits
          </label>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newUncertaintyItem}
              onChange={(e) => setNewUncertaintyItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUncertainty();
                }
              }}
              placeholder="Add limitation or uncertainty..."
              className="flex-1 px-3 py-1.5 border border-amber-200 bg-amber-50/30 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={addUncertainty}
            >
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {uncertainties.map((un, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-900 text-xs border border-amber-200"
              >
                <span>{un}</span>
                <button
                  type="button"
                  onClick={() => removeUncertainty(index)}
                  className="text-amber-500 hover:text-red-600"
                  aria-label={`Remove uncertainty ${un}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Dynamic List: Inspector Follow-Up Actions */}
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-xs font-semibold uppercase text-blue-800 mb-2">
            Inspector Recommended Follow-Up Actions
          </label>

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newFollowUpItem}
              onChange={(e) => setNewFollowUpItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFollowUp();
                }
              }}
              placeholder="Add recommended action..."
              className="flex-1 px-3 py-1.5 border border-blue-200 bg-blue-50/30 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={addFollowUp}
            >
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {inspectorFollowUp.map((fu, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-blue-900 text-xs border border-blue-200"
              >
                <span>{fu}</span>
                <button
                  type="button"
                  onClick={() => removeFollowUp(index)}
                  className="text-blue-500 hover:text-red-600"
                  aria-label={`Remove follow up item ${fu}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </form>

      {/* Cloud Consent Modal for Mode B Privacy Gate */}
      <CloudConsentModal
        isOpen={isConsentModalOpen}
        onConsent={() => {
          setIsConsentModalOpen(false);
          if (consentResolverRef.current) {
            consentResolverRef.current(true);
            consentResolverRef.current = null;
          }
        }}
        onDecline={() => {
          setIsConsentModalOpen(false);
          if (consentResolverRef.current) {
            consentResolverRef.current(false);
            consentResolverRef.current = null;
          }
        }}
      />
    </Modal>
  );
};
