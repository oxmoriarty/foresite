import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ViewMode, Project, Inspection, AppStats, ReviewStatus } from "./types";
import { parseRouteFromPath, buildPathFromState } from "./utils/router";
import { Sidebar } from "./components/layout/Sidebar";
import { TopNavbar } from "./components/layout/TopNavbar";
import { MobileNavDrawer } from "./components/layout/MobileNavDrawer";
import { LandingScreen } from "./screens/LandingScreen";
import { SignInScreen } from "./screens/SignInScreen";
import { OverviewScreen } from "./screens/OverviewScreen";
import { DemoScreen } from "./screens/DemoScreen";
import { User } from "firebase/auth";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { InspectionsScreen } from "./screens/InspectionsScreen";
import { UploadsScreen } from "./screens/UploadsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { VerifyEmailScreen } from "./screens/VerifyEmailScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  getUserProjects,
  getUserInspections,
  createProject as createFirestoreProject,
  updateProject as updateFirestoreProject,
  deleteProject as deleteFirestoreProject,
} from "./services/firestore";
import {
  saveLocalProject,
  getAllLocalProjects,
  deleteProjectCascade,
  deleteEvidencePhoto,
  deleteLocalDraft,
  getLocalDraft,
  saveLocalDraft,
  getAllEvidencePhotosCount,
  getAllLocalDrafts,
  persistLocalReviewTransition,
} from "./services/indexeddb";
import { enqueueMutation } from "./services/mutationQueue";
import { replayQueuedMutations } from "./services/mutationReplay";
import { executeReviewTransition } from "./services/review";
import {
  initiateInspectionDeletion,
  recoverPhotoCleanups,
  isInspectionEligibleForPermanentDeletion,
} from "./services/photoCleanup";
import { initRemoteConfig } from "./services/remoteConfig";

// Initial realistic seed dataset for Scaffolding & Demo preview
const INITIAL_PROJECTS: Project[] = [
  {
    id: "proj-metro-01",
    name: "Metro North Station Redevelopment",
    siteLabel: "MNS-SECTOR-4",
    location: "420 Transit Way, North Corridor",
    description: "Phase 2 underground concourse and structural pier excavation.",
    inspectionCount: 2,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: "proj-terminal-02",
    name: "Terminal 3 Gate Pier Expansion",
    siteLabel: "T3-EXP-B2",
    location: "Concourse C, International Airport",
    description: "Soffit slab falsework and heavy-duty steel shoring inspection.",
    inspectionCount: 1,
    createdAt: Date.now() - 86400000 * 10,
    updatedAt: Date.now() - 86400000 * 2,
  },
];

const INITIAL_INSPECTIONS: Inspection[] = [
  {
    id: "insp-rebar-01",
    projectId: "proj-metro-01",
    projectName: "Metro North Station Redevelopment",
    title: "Rebar Spacing & Cover Depth — Pier Footing 4",
    observation:
      "Visible reinforcement rebar grid laid in footing trench. Transverse spacing appears uniform across central grid. Corner tie wires secured. Mud slab base visible beneath rebar support chairs.",
    category: "installation",
    visibleEvidence: [
      "Grade 60 deformed rebar layout in two-way mat",
      "Concrete bar chairs supporting rebar 75mm clear above mud slab",
      "Tie wires fastened at alternate intersections",
      "Absence of standing water in excavated trench",
    ],
    uncertainties: [
      "Exact mill scale or bar diameter not verifiable from single perspective",
      "Clearance to far edge formwork partially obscured by shadow",
    ],
    inspectorFollowUp: [
      "Verify minimum 75mm concrete cover depth with physical gauge before pour",
      "Inspect epoxy coating touch-up on cut bar ends",
    ],
    reviewStatus: "draft_generated",
    aiAssisted: true,
    inferenceSource: "ON_DEVICE",
    createdAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: "insp-honeycomb-02",
    projectId: "proj-metro-01",
    projectName: "Metro North Station Redevelopment",
    title: "Surface Voids & Honeycombing — West Retaining Wall",
    observation:
      "Stripped formwork surface displays superficial honeycombing along lower joint line approximately 200mm above finished grade. Coarse aggregate partially exposed; no structural rebar exposed.",
    category: "surface_condition",
    visibleEvidence: [
      "Exposed aggregate pocket measuring approximately 300mm horizontally",
      "Surface void depth approximately 15mm-25mm",
      "Adjacent form-tie holes sealed with non-shrink grout",
    ],
    uncertainties: [
      "Depth of void behind aggregate cannot be determined non-destructively without sounding hammer",
    ],
    inspectorFollowUp: [
      "Sound area with hammer to verify consolidation depth",
      "Issue non-structural patching procedure per spec section 03300",
    ],
    reviewStatus: "in_review",
    aiAssisted: true,
    inferenceSource: "IN_CLOUD",
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: "insp-shoring-03",
    projectId: "proj-terminal-02",
    projectName: "Terminal 3 Gate Pier Expansion",
    title: "Temporary Shoring Post Clearances & Base Plates",
    observation:
      "Adjustable steel shoring posts installed beneath suspended soffit slab. Base plates set flush on timber mudsills. Locking pins fully engaged with safety clips.",
    category: "equipment",
    visibleEvidence: [
      "Vertical steel shores spaced at 1.2m grid",
      "Mudsill timbers level and in firm contact with compacted subgrade",
      "Heavy-duty screw jacks engaged without tilt",
    ],
    uncertainties: ["Subgrade moisture content beneath mudsills not verified"],
    inspectorFollowUp: [
      "Check torque on formwork ledger bolts",
      "Sign off pre-pour shoring checklist",
    ],
    reviewStatus: "approved",
    aiAssisted: true,
    inferenceSource: "ON_DEVICE",
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 2,
    reviewedAt: Date.now() - 86400000 * 2,
    reviewedByUid: "inspector-lead-uid",
  },
];

function getDeletedProjectIds(uid?: string): string[] {
  try {
    const key = uid ? `foresite_deleted_projects_${uid}` : "foresite_deleted_projects";
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function recordDeletedProjectId(projectId: string, uid?: string): void {
  try {
    const key = uid ? `foresite_deleted_projects_${uid}` : "foresite_deleted_projects";
    const existing = getDeletedProjectIds(uid);
    if (!existing.includes(projectId)) {
      localStorage.setItem(key, JSON.stringify([...existing, projectId]));
    }
  } catch {
    // ignore storage errors
  }
}

function getHasCustomProjects(uid?: string): boolean {
  try {
    const key = uid ? `foresite_has_custom_projects_${uid}` : "foresite_has_custom_projects";
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function markHasCustomProjects(uid?: string): void {
  try {
    const key = uid ? `foresite_has_custom_projects_${uid}` : "foresite_has_custom_projects";
    localStorage.setItem(key, "true");
  } catch {
    // ignore storage errors
  }
}

export interface AppProps {
  initialView?: ViewMode;
  initialUser?: User | null;
  initialPath?: string;
}

const ForeSiteApp: React.FC<AppProps> = ({ initialView, initialPath }) => {
  const { currentUser, loading: authLoading, isConfigured, logout } = useAuth();

  const initialParsedRoute = useMemo(() => {
    if (initialPath) {
      return parseRouteFromPath(initialPath);
    }
    if (!initialView && typeof window !== "undefined" && process.env.NODE_ENV !== "test") {
      return parseRouteFromPath(window.location.pathname);
    }
    return {
      view: initialView || (process.env.NODE_ENV === "test" && currentUser ? "overview" : "landing"),
      projectId: null,
      inspectionId: null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInitialProtectedUnauth =
    !currentUser &&
    !authLoading &&
    initialParsedRoute.view !== "landing" &&
    initialParsedRoute.view !== "signin" &&
    initialParsedRoute.view !== "demo";

  const [currentView, setCurrentView] = useState<ViewMode>(
    isInitialProtectedUnauth ? "signin" : initialParsedRoute.view
  );
  const [pendingDestination, setPendingDestination] = useState<{
    view: ViewMode;
    openProjectModal?: boolean;
    projectId?: string;
    inspectionId?: string;
  } | null>(
    isInitialProtectedUnauth
      ? {
          view: initialParsedRoute.view,
          projectId: initialParsedRoute.projectId || undefined,
          inspectionId: initialParsedRoute.inspectionId || undefined,
        }
      : null
  );
  const [projects, setProjects] = useState<Project[]>(() => {
    const deletedIds = getDeletedProjectIds(currentUser?.uid);
    const hasCustom = getHasCustomProjects(currentUser?.uid);
    if (hasCustom) return [];
    return INITIAL_PROJECTS.filter((p) => !deletedIds.includes(p.id));
  });
  const [inspections, setInspections] = useState<Inspection[]>(() => {
    const deletedIds = getDeletedProjectIds(currentUser?.uid);
    const hasCustom = getHasCustomProjects(currentUser?.uid);
    if (hasCustom) return [];
    return INITIAL_INSPECTIONS.filter((i) => !deletedIds.includes(i.projectId));
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialParsedRoute.projectId
  );
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(
    initialParsedRoute.inspectionId
  );
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isNewInspectionModalOpen, setIsNewInspectionModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("foresite_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [localPhotoCount, setLocalPhotoCount] = useState<number>(0);
  const [localDraftCount, setLocalDraftCount] = useState<number>(0);

  // Refresh IndexedDB statistics
  const refreshLocalStorageCounts = useCallback(async () => {
    try {
      const [photos, drafts] = await Promise.all([
        getAllEvidencePhotosCount(),
        getAllLocalDrafts(),
      ]);
      setLocalPhotoCount(photos);
      setLocalDraftCount(drafts.length);
    } catch {
      // Ignore if IndexedDB is not yet initialized
    }
  }, []);

  // Load Firestore data when authenticated
  const loadUserData = useCallback(async (uid: string) => {
    try {
      const [userProjects, userInspections] = await Promise.all([
        getUserProjects(uid),
        getUserInspections(uid),
      ]);
      const deletedIds = getDeletedProjectIds(uid);
      const hasCustom = getHasCustomProjects(uid);

      if (userProjects.length > 0) {
        markHasCustomProjects(uid);
        setProjects(userProjects.filter((p) => !deletedIds.includes(p.id)));
      } else if (hasCustom) {
        setProjects([]);
      } else {
        setProjects(INITIAL_PROJECTS.filter((p) => !deletedIds.includes(p.id)));
      }

      if (userInspections.length > 0) {
        setInspections(userInspections.filter((i) => !deletedIds.includes(i.projectId)));
      } else if (hasCustom) {
        setInspections([]);
      } else {
        setInspections(INITIAL_INSPECTIONS.filter((i) => !deletedIds.includes(i.projectId)));
      }
    } catch (err) {
      console.warn("Could not load user Firestore data, falling back to local seed:", err);
    }
  }, []);

  const isRemoteUser = Boolean(
    currentUser?.uid && currentUser.uid !== "inspector-demo-01" && isConfigured
  );

  useEffect(() => {
    let cancelled = false;
    if (isRemoteUser && currentUser?.uid) {
      if (currentUser.emailVerified) {
        loadUserData(currentUser.uid);
        void recoverPhotoCleanups(currentUser.uid).catch((err) => {
          console.warn("Startup photo cleanup recovery error:", err);
        });
      }
    } else {
      const deletedIds = getDeletedProjectIds(currentUser?.uid);
      const loadLocal = async () => {
        try {
          const localProjects = await getAllLocalProjects();
          if (cancelled) return;
          const localMap = new Map(localProjects.map((p) => [p.id, p]));
          const merged = [
            ...localProjects,
            ...INITIAL_PROJECTS.filter((p) => !localMap.has(p.id)),
          ].filter((p) => !deletedIds.includes(p.id));
          setProjects(merged);
        } catch {
          if (!cancelled) {
            setProjects(INITIAL_PROJECTS.filter((p) => !deletedIds.includes(p.id)));
          }
        }
      };
      void loadLocal();
      setInspections(INITIAL_INSPECTIONS.filter((i) => !deletedIds.includes(i.projectId)));
    }
    refreshLocalStorageCounts();
    return () => {
      cancelled = true;
    };
  }, [currentUser, isRemoteUser, loadUserData, refreshLocalStorageCounts]);

  // Safe startup initialization for Firebase Remote Config
  useEffect(() => {
    void initRemoteConfig().catch((err) => {
      console.warn("Remote Config initialization error:", err);
    });
  }, []);

  // Compute live statistics
  const stats: AppStats = {
    totalProjects: projects.length,
    totalInspections: inspections.length,
    pendingReviews: inspections.filter(
      (i) => i.reviewStatus === "draft_generated" || i.reviewStatus === "in_review"
    ).length,
    approvedCount: inspections.filter((i) => i.reviewStatus === "approved").length,
    rejectedCount: inspections.filter((i) => i.reviewStatus === "rejected").length,
    onDeviceInferences: inspections.filter((i) => i.inferenceSource === "ON_DEVICE").length,
    cloudInferences: inspections.filter((i) => i.inferenceSource === "IN_CLOUD").length,
    localPhotosCount: localPhotoCount,
    localDraftsCount: localDraftCount,
  };

  // Handler: Create new project
  const handleCreateProject = async (
    newProj: Omit<Project, "id" | "inspectionCount" | "createdAt" | "updatedAt">
  ) => {
    markHasCustomProjects(currentUser?.uid);

    if (isRemoteUser && currentUser?.uid) {
      try {
        const created = await createFirestoreProject(currentUser.uid, newProj);
        setProjects([created, ...projects]);
        await saveLocalProject(created);
        return;
      } catch (err) {
        console.warn("Firestore project creation failed, creating local project:", err);
      }
    }

    // Local / unauthenticated fallback
    const localProject: Project = {
      ...newProj,
      id: `proj-${Date.now()}`,
      ownerUid: currentUser?.uid,
      inspectionCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProjects([localProject, ...projects]);
    await saveLocalProject(localProject);
  };

  // Handler: Update project
  const handleUpdateProject = async (projectId: string, updates: Partial<Project>) => {
    if (isRemoteUser && currentUser?.uid) {
      try {
        await updateFirestoreProject(currentUser.uid, projectId, updates);
      } catch (err) {
        console.warn("Firestore project update failed:", err);
      }
    }

    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          const updated = { ...p, ...updates, updatedAt: Date.now() };
          saveLocalProject(updated);
          return updated;
        }
        return p;
      })
    );
  };

  // Handler: Cascade delete project
  const handleDeleteProject = async (projectId: string) => {
    recordDeletedProjectId(projectId, currentUser?.uid);

    if (isRemoteUser && currentUser?.uid) {
      try {
        await deleteFirestoreProject(currentUser.uid, projectId);
      } catch (err) {
        console.warn("Firestore project deletion failed:", err);
      }
    }

    // Clean up local IndexedDB evidence Blobs, drafts, and local cache
    await deleteProjectCascade(projectId);

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setInspections((prev) => prev.filter((i) => i.projectId !== projectId));
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setSelectedInspectionId(null);
    }
    await refreshLocalStorageCounts();
  };

  // Handler: Save / Publish inspection
  const handleSaveInspection = async (inspection: Inspection) => {
    const existingIndex = inspections.findIndex((i) => i.id === inspection.id);

    if (currentUser?.uid) {
      if (existingIndex >= 0) {
        const existingInspection = inspections[existingIndex];
        // Enqueue UPDATE_DRAFT only if inspection belongs to current authenticated user
        if (
          existingInspection &&
          (!inspection.ownerUid ||
            inspection.ownerUid === currentUser.uid ||
            existingInspection.ownerUid === currentUser.uid)
        ) {
          try {
            await enqueueMutation({
              ownerUid: currentUser.uid,
              targetInspectionId: inspection.id,
              type: "UPDATE_DRAFT",
              payload: {
                type: "UPDATE_DRAFT",
                baseSnapshot: existingInspection,
                title: inspection.title,
                observation: inspection.observation,
                category: inspection.category,
                visibleEvidence: inspection.visibleEvidence,
                uncertainties: inspection.uncertainties,
                inspectorFollowUp: inspection.inspectorFollowUp,
                photoIds: inspection.photoIds,
                summary: inspection.summary,
                weatherNotes: inspection.weatherNotes,
                items: inspection.items,
              },
              baseRevision: existingInspection.revision || 1,
            });

            // Trigger asynchronous replay in the background without blocking the UI
            void replayQueuedMutations().catch((err) => {
              console.warn("Background replay execution error:", err);
            });
          } catch (queueErr) {
            console.warn("Failed to enqueue UPDATE_DRAFT mutation:", queueErr);
          }
        }
      } else {
        // Enqueue CREATE_INSPECTION only if draft belongs to current authenticated user
        if (inspection.ownerUid === currentUser.uid) {
          try {
            await enqueueMutation({
              ownerUid: currentUser.uid,
              targetInspectionId: inspection.id,
              type: "CREATE_INSPECTION",
              payload: {
                type: "CREATE_INSPECTION",
                inspection: {
                  ...inspection,
                  ownerUid: currentUser.uid,
                },
              },
              baseRevision: inspection.revision || 1,
            });

            // Trigger asynchronous replay in the background without blocking the UI
            void replayQueuedMutations().catch((err) => {
              console.warn("Background replay execution error:", err);
            });
          } catch (queueErr) {
            console.warn("Failed to enqueue CREATE_INSPECTION mutation:", queueErr);
          }
        }
      }
    }

    if (existingIndex >= 0) {
      setInspections((prev) =>
        prev.map((i) => (i.id === inspection.id ? inspection : i))
      );
    } else {
      setInspections([inspection, ...inspections]);
      // Increment inspectionCount on associated project
      setProjects((prev) =>
        prev.map((p) =>
          p.id === inspection.projectId
            ? { ...p, inspectionCount: (p.inspectionCount || 0) + 1 }
            : p
        )
      );
    }

    await refreshLocalStorageCounts();
  };

  // Handler: Delete inspection (Phase 5 Stage 4C: Staged photo cleanup lifecycle)
  const handleDeleteInspection = async (inspectionId: string) => {
    let target = inspections.find((i) => i.id === inspectionId);
    if (!target) {
      const local = await getLocalDraft(inspectionId);
      if (local) {
        target = {
          ...local,
          projectName: local.projectName || "Local Draft",
          isLocalDraft: true,
          aiAssisted: false,
          reviewStatus: local.reviewStatus || "draft_generated",
          updatedAt: local.lastSavedAt,
        };
      }
    }
    if (!target) return;

    // Verify permanent deletion eligibility: active unreviewed draft only
    const eligibility = isInspectionEligibleForPermanentDeletion(target);
    if (!eligibility.eligible) {
      console.warn("Permanent inspection deletion blocked:", eligibility.reason);
      return;
    }

    if (currentUser?.uid) {
      try {
        await initiateInspectionDeletion(currentUser.uid, target);
        // Trigger asynchronous replay in the background without blocking the UI
        void replayQueuedMutations().catch((err) => {
          console.warn("Background replay execution error:", err);
        });
      } catch (err) {
        console.warn("Failed to initiate permanent inspection deletion:", err);
      }
    } else {
      // Unauthenticated / local preview: run safe unreferenced photo deletion
      try {
        const photoIds = target.photoIds || [];
        const allDrafts = await getAllLocalDrafts();
        const otherDrafts = allDrafts.filter((d) => d.id !== target.id);
        const otherPhotoIds = new Set<string>();
        otherDrafts.forEach((d) => d.photoIds?.forEach((pid) => otherPhotoIds.add(pid)));

        for (const pid of photoIds) {
          if (!otherPhotoIds.has(pid)) {
            await deleteEvidencePhoto(pid);
          }
        }
        await deleteLocalDraft(target.id);
      } catch (err) {
        console.warn("Local draft deletion failed:", err);
      }
    }

    setInspections((prev) => prev.filter((i) => i.id !== inspectionId));

    if (target?.projectId) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === target.projectId
            ? { ...p, inspectionCount: Math.max((p.inspectionCount || 1) - 1, 0) }
            : p
        )
      );
    }

    await refreshLocalStorageCounts();
  };

  // Handler: Update inspection status via durable mutation queue
  const handleUpdateInspectionStatus = async (
    inspectionId: string,
    newStatus: ReviewStatus,
    comment?: string
  ) => {
    const target = inspections.find((i) => i.id === inspectionId);
    if (!target) return;
    const reviewerUid = currentUser?.uid || "current-inspector-uid";
    const currentStatus = target.reviewStatus || "draft_generated";

    if (currentUser?.uid) {
      try {
        const { updatedInspection, auditEvent } = executeReviewTransition(
          target,
          newStatus,
          reviewerUid,
          comment
        );

        // Persist status and audit event locally to IndexedDB
        await persistLocalReviewTransition(inspectionId, updatedInspection, auditEvent);

        // Enqueue durable TRANSITION_REVIEW mutation
        await enqueueMutation({
          ownerUid: currentUser.uid,
          targetInspectionId: inspectionId,
          type: "TRANSITION_REVIEW",
          payload: {
            type: "TRANSITION_REVIEW",
            fromStatus: currentStatus,
            targetStatus: newStatus,
            reviewerUid,
            comment: comment?.trim() || undefined,
            auditEventId: auditEvent.id,
          },
          baseRevision: target.revision || 1,
        });

        // Trigger background replay
        void replayQueuedMutations().catch((err) => {
          console.warn("Background replay execution error:", err);
        });

        setInspections((prev) =>
          prev.map((insp) => (insp.id === inspectionId ? updatedInspection : insp))
        );
      } catch (err) {
        console.warn("Failed to transition review status:", err);
      }
    } else {
      // Local fallback
      setInspections((prev) =>
        prev.map((insp) => (insp.id === inspectionId ? { ...insp, reviewStatus: newStatus } : insp))
      );
    }
  };

  // Handler: Archive inspection
  const handleArchiveInspection = async (inspectionId: string, reason?: string) => {
    const target = inspections.find((i) => i.id === inspectionId);
    if (!target) return;
    const now = Date.now();

    if (currentUser?.uid) {
      try {
        const local = await getLocalDraft(inspectionId);
        if (local) {
          await saveLocalDraft({
            ...local,
            isArchived: true,
            archivedAt: now,
            archivedByUid: currentUser.uid,
            archiveReason: reason || null,
            isSynced: false,
          });
        }

        await enqueueMutation({
          ownerUid: currentUser.uid,
          targetInspectionId: inspectionId,
          type: "ARCHIVE_INSPECTION",
          payload: {
            type: "ARCHIVE_INSPECTION",
            reason,
            archivedAt: now,
          },
          baseRevision: target.revision || 1,
        });

        void replayQueuedMutations().catch((err) => {
          console.warn("Background replay execution error:", err);
        });
      } catch (err) {
        console.warn("Failed to enqueue ARCHIVE_INSPECTION mutation:", err);
      }
    }

    setInspections((prev) =>
      prev.map((i) =>
        i.id === inspectionId
          ? {
              ...i,
              isArchived: true,
              archivedAt: now,
              archivedByUid: currentUser?.uid || null,
              archiveReason: reason || null,
            }
          : i
      )
    );
  };

  // Handler: Unarchive inspection
  const handleUnarchiveInspection = async (inspectionId: string) => {
    const target = inspections.find((i) => i.id === inspectionId);
    if (!target) return;
    const now = Date.now();

    if (currentUser?.uid) {
      try {
        const local = await getLocalDraft(inspectionId);
        if (local) {
          await saveLocalDraft({
            ...local,
            isArchived: false,
            archivedAt: null,
            archivedByUid: null,
            archiveReason: null,
            isSynced: false,
          });
        }

        await enqueueMutation({
          ownerUid: currentUser.uid,
          targetInspectionId: inspectionId,
          type: "UNARCHIVE_INSPECTION",
          payload: {
            type: "UNARCHIVE_INSPECTION",
            unarchivedAt: now,
          },
          baseRevision: target.revision || 1,
        });

        void replayQueuedMutations().catch((err) => {
          console.warn("Background replay execution error:", err);
        });
      } catch (err) {
        console.warn("Failed to enqueue UNARCHIVE_INSPECTION mutation:", err);
      }
    }

    setInspections((prev) =>
      prev.map((i) =>
        i.id === inspectionId
          ? {
              ...i,
              isArchived: false,
              archivedAt: null,
              archivedByUid: null,
              archiveReason: null,
            }
          : i
      )
    );
  };

  // Handler: Update in-memory inspection for local review transitions (strictly local-only, no Firestore write)
  const handleLocalReviewTransition = (updatedInspection: Inspection) => {
    setInspections((prev) =>
      prev.map((insp) => (insp.id === updatedInspection.id ? updatedInspection : insp))
    );
  };

  // Sync browser URL via HTML5 History API without triggering full page reload
  const syncUrl = useCallback(
    (
      view: ViewMode,
      projectId?: string | null,
      inspectionId?: string | null,
      replace = false
    ) => {
      if (typeof window === "undefined" || !window.history) return;
      const nextPath = buildPathFromState(view, projectId, inspectionId);
      if (window.location.pathname === nextPath) return;
      try {
        if (replace) {
          window.history.replaceState({ view, projectId, inspectionId }, "", nextPath);
        } else {
          window.history.pushState({ view, projectId, inspectionId }, "", nextPath);
        }
      } catch {
        // Ignore history errors in restricted environments
      }
    },
    []
  );

  // Listen to browser Back / Forward buttons (popstate)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const parsed = parseRouteFromPath(window.location.pathname);
      if (
        !currentUser &&
        !authLoading &&
        parsed.view !== "landing" &&
        parsed.view !== "signin" &&
        parsed.view !== "demo"
      ) {
        setPendingDestination({
          view: parsed.view,
          projectId: parsed.projectId || undefined,
          inspectionId: parsed.inspectionId || undefined,
        });
        setCurrentView("signin");
        setSelectedProjectId(null);
        setSelectedInspectionId(null);
        return;
      }
      setCurrentView(parsed.view);
      setSelectedProjectId(parsed.projectId);
      setSelectedInspectionId(parsed.inspectionId);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentUser, authLoading]);

  // Canonical short-link resolution: if /inspection/:id was opened without projectId, resolve its projectId
  useEffect(() => {
    if (currentView === "inspections" && selectedInspectionId && !selectedProjectId) {
      const match = inspections.find((i) => i.id === selectedInspectionId);
      if (match?.projectId) {
        setSelectedProjectId(match.projectId);
        syncUrl("inspections", match.projectId, match.id, true);
      }
    }
  }, [currentView, selectedInspectionId, selectedProjectId, inspections, syncUrl]);

  // Central Guarded Navigation: Enforces authentication on all non-landing views
  const handleNavigate = useCallback(
    (
      targetView: ViewMode,
      options?: { openProjectModal?: boolean; projectId?: string; inspectionId?: string }
    ) => {
      if (targetView === "landing" || targetView === "demo" || targetView === "signin") {
        setSelectedProjectId(null);
        setSelectedInspectionId(null);
        setCurrentView(targetView);
        syncUrl(targetView, null, null);
        return;
      }

      // Check authentication for protected views: overview, projects, inspections, sync, settings
      if (!currentUser) {
        setPendingDestination({
          view: targetView,
          openProjectModal: options?.openProjectModal,
          projectId: options?.projectId,
          inspectionId: options?.inspectionId,
        });
        setCurrentView("signin");
        syncUrl("signin", null, null);
        return;
      }

      if (!currentUser.emailVerified) {
        return;
      }

      const nextProjectId = options?.projectId ?? null;
      const nextInspectionId = options?.inspectionId ?? null;

      // User is authenticated: proceed to destination
      setCurrentView(targetView);
      setSelectedProjectId(nextProjectId);
      setSelectedInspectionId(nextInspectionId);
      syncUrl(targetView, nextProjectId, nextInspectionId);

      if (options?.openProjectModal) {
        setIsProjectModalOpen(true);
      }
    },
    [currentUser, syncUrl]
  );

  // Reactive redirect: When user signs in, immediately take them to their intended destination
  useEffect(() => {
    if (authLoading) return;

    if (currentUser) {
      if (!currentUser.emailVerified) {
        return;
      }
      if (pendingDestination) {
        const dest = pendingDestination;
        setPendingDestination(null);
        setCurrentView(dest.view);
        setSelectedProjectId(dest.projectId ?? null);
        setSelectedInspectionId(dest.inspectionId ?? null);
        syncUrl(dest.view, dest.projectId ?? null, dest.inspectionId ?? null, true);
        if (dest.openProjectModal) {
          setIsProjectModalOpen(true);
        }
      } else if (currentView === "signin") {
        setCurrentView("overview");
        syncUrl("overview", null, null, true);
      }
    } else {
      // If user is unauthenticated while on a protected page, redirect to signin
      if (currentView !== "landing" && currentView !== "signin" && currentView !== "demo") {
        setPendingDestination({
          view: currentView,
          projectId: selectedProjectId || undefined,
          inspectionId: selectedInspectionId || undefined,
        });
        setCurrentView("signin");
        syncUrl("signin", null, null, true);
      }
    }
  }, [
    authLoading,
    currentUser,
    pendingDestination,
    currentView,
    selectedProjectId,
    selectedInspectionId,
    syncUrl,
  ]);

  // Handler: Select a project to filter inspections
  const handleSelectProject = (projectId: string) => {
    handleNavigate("inspections", { projectId });
  };

  // Handler: Open a specific inspection with canonical project/inspection URL
  const handleSelectInspection = (inspection: Inspection) => {
    const projId = inspection.projectId || selectedProjectId || null;
    setCurrentView("inspections");
    setSelectedProjectId(projId);
    setSelectedInspectionId(inspection.id);
    syncUrl("inspections", projId, inspection.id);
  };

  // Handler: Close inspection modal and revert URL to project or inspections list
  const handleCloseInspection = () => {
    setSelectedInspectionId(null);
    syncUrl("inspections", selectedProjectId, null);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <>
      {authLoading ? (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
          <div className="w-10 h-10 rounded-full bg-slate-950 text-white font-bold text-sm flex items-center justify-center shadow-md mb-3 animate-pulse">
            FS
          </div>
          <p className="text-xs font-medium text-slate-500">Restoring session...</p>
        </div>
      ) : currentView === "landing" ? (
        <LandingScreen
          onNavigate={handleNavigate}
          onCreateProject={() =>
            handleNavigate("projects", { openProjectModal: true })
          }
        />
      ) : currentView === "demo" ? (
        <DemoScreen onNavigate={handleNavigate} />
      ) : !currentUser ? (
        <SignInScreen
          onSuccess={() => {
            // Handled reactively by currentUser useEffect
          }}
          onNavigateHome={() => handleNavigate("landing")}
          targetDestinationName={
            pendingDestination?.openProjectModal
              ? "Project Creation"
              : pendingDestination?.view
              ? pendingDestination.view.charAt(0).toUpperCase() + pendingDestination.view.slice(1)
              : currentView !== "signin"
              ? currentView.charAt(0).toUpperCase() + currentView.slice(1)
              : undefined
          }
        />
      ) : !currentUser.emailVerified ? (
        <VerifyEmailScreen
          email={currentUser.email || ""}
          onSignOut={async () => {
            await logout();
            handleNavigate("landing");
          }}
          onVerificationSuccess={() => {
            handleNavigate("overview");
          }}
        />
      ) : (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex">
          {/* Persistent Collapsible Left Sidebar for Desktop */}
          <Sidebar
            currentView={currentView}
            onSelectView={handleNavigate}
            inspectionBadgeCount={stats.pendingReviews}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => {
              const next = !isSidebarCollapsed;
              setIsSidebarCollapsed(next);
              try {
                localStorage.setItem("foresite_sidebar_collapsed", String(next));
              } catch {
                /* ignore storage error in restricted environment */
              }
            }}
          />

          {/* Right Application Column: Compact Top Navbar + Main Content + Footer */}
          <div className="flex-1 flex flex-col min-w-0">
            <TopNavbar
              currentView={currentView}
              onSelectView={handleNavigate}
              selectedProjectId={selectedProjectId}
              selectedProjectName={selectedProject?.name}
              onClearProjectFilter={() => {
                setSelectedProjectId(null);
                setSelectedInspectionId(null);
                syncUrl("inspections", null, null);
              }}
              onOpenMobileMenu={() => setIsMobileNavOpen(true)}
            />

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {currentView === "overview" && (
                <OverviewScreen
                  projects={projects}
                  inspections={inspections}
                  stats={stats}
                  onNavigate={handleNavigate}
                  onSelectInspection={handleSelectInspection}
                  onOpenNewProjectModal={() => {
                    handleNavigate("projects", { openProjectModal: true });
                  }}
                />
              )}

              {currentView === "projects" && (
                <ProjectsScreen
                  projects={projects}
                  inspections={inspections}
                  onCreateProject={handleCreateProject}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                  onSelectProject={handleSelectProject}
                  isCreateModalOpen={isProjectModalOpen}
                  setIsCreateModalOpen={setIsProjectModalOpen}
                />
              )}

              {currentView === "inspections" && (
                <InspectionsScreen
                  inspections={inspections}
                  projects={projects}
                  onUpdateStatus={handleUpdateInspectionStatus}
                  onLocalReviewTransition={handleLocalReviewTransition}
                  onSaveInspection={handleSaveInspection}
                  onDeleteInspection={handleDeleteInspection}
                  onArchiveInspection={handleArchiveInspection}
                  onUnarchiveInspection={handleUnarchiveInspection}
                  selectedProjectId={selectedProjectId}
                  onClearProjectFilter={() => {
                    setSelectedProjectId(null);
                    setSelectedInspectionId(null);
                    syncUrl("inspections", null, null);
                  }}
                  selectedInspectionId={selectedInspectionId}
                  onSelectInspection={handleSelectInspection}
                  onCloseInspection={handleCloseInspection}
                  isNewInspectionModalOpen={isNewInspectionModalOpen}
                  setIsNewInspectionModalOpen={setIsNewInspectionModalOpen}
                />
              )}

              {currentView === "uploads" && (
                <UploadsScreen
                  onNavigateToInspections={() => handleNavigate("inspections")}
                />
              )}

              {currentView === "settings" && <SettingsScreen />}
            </main>
          </div>

          {/* Responsive Mobile Navigation Drawer */}
          <MobileNavDrawer
            isOpen={isMobileNavOpen}
            onClose={() => setIsMobileNavOpen(false)}
            currentView={currentView}
            onSelectView={(view) => {
              handleNavigate(view);
              setIsMobileNavOpen(false);
            }}
            inspectionBadgeCount={stats.pendingReviews}
          />
        </div>
      )}
    </>
  );
};

export const App: React.FC<AppProps> = ({ initialView, initialUser, initialPath }) => {
  return (
    <AuthProvider initialUser={initialUser}>
      <ForeSiteApp initialView={initialView} initialPath={initialPath} />
    </AuthProvider>
  );
};
