import React, { useState, useEffect, useCallback } from "react";
import { ViewMode, Project, Inspection, AppStats, ReviewStatus } from "./types";
import { Header } from "./components/layout/Header";
import { Navigation } from "./components/layout/Navigation";
import { Footer } from "./components/layout/Footer";
import { OverviewScreen } from "./screens/OverviewScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { InspectionsScreen } from "./screens/InspectionsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  getUserProjects,
  getUserInspections,
  createProject as createFirestoreProject,
  updateProject as updateFirestoreProject,
  deleteProject as deleteFirestoreProject,
  createInspection as createFirestoreInspection,
  updateInspection as updateFirestoreInspection,
  deleteInspection as deleteFirestoreInspection,
} from "./services/firestore";
import {
  saveLocalProject,
  deleteProjectCascade,
  deleteEvidencePhotosByInspection,
  deleteLocalDraft,
  getAllEvidencePhotosCount,
  getAllLocalDrafts,
} from "./services/indexeddb";

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
    photoMeta: {
      id: "photo-001",
      fileName: "rebar_pier4_elevation.jpg",
      fileSizeBytes: 2450000,
      mimeType: "image/jpeg",
      storageProvider: "indexeddb",
      hasLocalBlob: true,
      capturedAt: Date.now() - 86400000 * 1,
    },
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
    photoMeta: {
      id: "photo-002",
      fileName: "wall_honeycomb_detail.jpg",
      fileSizeBytes: 3120000,
      mimeType: "image/jpeg",
      storageProvider: "indexeddb",
      hasLocalBlob: true,
      capturedAt: Date.now() - 86400000 * 2,
    },
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
    photoMeta: {
      id: "photo-003",
      fileName: "shoring_grid_pier2.png",
      fileSizeBytes: 1850000,
      mimeType: "image/png",
      storageProvider: "indexeddb",
      hasLocalBlob: true,
      capturedAt: Date.now() - 86400000 * 3,
    },
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 2,
    reviewedAt: Date.now() - 86400000 * 2,
    reviewedByUid: "inspector-lead-uid",
  },
];

const ForeSiteApp: React.FC = () => {
  const { currentUser, isConfigured } = useAuth();
  const [currentView, setCurrentView] = useState<ViewMode>("overview");
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [inspections, setInspections] = useState<Inspection[]>(INITIAL_INSPECTIONS);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isNewInspectionModalOpen, setIsNewInspectionModalOpen] = useState(false);
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
      if (userProjects.length > 0) {
        setProjects(userProjects);
      } else {
        setProjects(INITIAL_PROJECTS);
      }
      if (userInspections.length > 0) {
        setInspections(userInspections);
      } else {
        setInspections(INITIAL_INSPECTIONS);
      }
    } catch (err) {
      console.warn("Could not load user Firestore data, falling back to local seed:", err);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.uid && isConfigured) {
      loadUserData(currentUser.uid);
    } else {
      setProjects(INITIAL_PROJECTS);
      setInspections(INITIAL_INSPECTIONS);
    }
    refreshLocalStorageCounts();
  }, [currentUser, isConfigured, loadUserData, refreshLocalStorageCounts]);

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
    if (currentUser?.uid && isConfigured) {
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
    if (currentUser?.uid && isConfigured) {
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
    if (currentUser?.uid && isConfigured) {
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
    }
    await refreshLocalStorageCounts();
  };

  // Handler: Save / Publish inspection
  const handleSaveInspection = async (inspection: Inspection) => {
    const existingIndex = inspections.findIndex((i) => i.id === inspection.id);

    if (currentUser?.uid && isConfigured) {
      try {
        if (existingIndex >= 0) {
          await updateFirestoreInspection(currentUser.uid, inspection.id, inspection);
        } else {
          // Firestore receives only structured metadata, never photo binaries
          const { id: _ignoredId, ...rest } = inspection;
          await createFirestoreInspection(currentUser.uid, rest);
        }
      } catch (err) {
        console.warn("Firestore inspection sync failed, saving locally:", err);
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

  // Handler: Delete inspection
  const handleDeleteInspection = async (inspectionId: string) => {
    const target = inspections.find((i) => i.id === inspectionId);

    if (currentUser?.uid && isConfigured) {
      try {
        await deleteFirestoreInspection(currentUser.uid, inspectionId);
      } catch (err) {
        console.warn("Firestore inspection deletion failed:", err);
      }
    }

    // Clean up associated photo Blobs and draft from IndexedDB
    await deleteEvidencePhotosByInspection(inspectionId);
    await deleteLocalDraft(inspectionId);

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

  // Handler: Update inspection status
  const handleUpdateInspectionStatus = async (
    inspectionId: string,
    newStatus: ReviewStatus
  ) => {
    const reviewerUid = currentUser?.uid || "current-inspector-uid";
    const now = Date.now();

    if (currentUser?.uid && isConfigured) {
      try {
        await updateFirestoreInspection(currentUser.uid, inspectionId, {
          reviewStatus: newStatus,
          reviewedAt: now,
          reviewedByUid: reviewerUid,
        });
      } catch (err) {
        console.warn("Firestore inspection update failed, updating local state:", err);
      }
    }

    setInspections((prev) =>
      prev.map((insp) =>
        insp.id === inspectionId
          ? {
              ...insp,
              reviewStatus: newStatus,
              updatedAt: now,
              reviewedAt: now,
              reviewedByUid: reviewerUid,
            }
          : insp
      )
    );
  };

  // Handler: Select a project to filter inspections
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setCurrentView("inspections");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Accessible Header with Auth */}
      <Header />

      {/* Primary Navigation Tabs */}
      <Navigation
        currentView={currentView}
        onSelectView={setCurrentView}
        inspectionBadgeCount={stats.pendingReviews}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentView === "overview" && (
          <OverviewScreen
            projects={projects}
            inspections={inspections}
            stats={stats}
            onNavigate={setCurrentView}
            onOpenNewProjectModal={() => {
              setCurrentView("projects");
              setIsProjectModalOpen(true);
            }}
          />
        )}

        {currentView === "projects" && (
          <ProjectsScreen
            projects={projects}
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
            onSaveInspection={handleSaveInspection}
            onDeleteInspection={handleDeleteInspection}
            selectedProjectId={selectedProjectId}
            onClearProjectFilter={() => setSelectedProjectId(null)}
            isNewInspectionModalOpen={isNewInspectionModalOpen}
            setIsNewInspectionModalOpen={setIsNewInspectionModalOpen}
          />
        )}

        {currentView === "settings" && <SettingsScreen />}
      </main>

      {/* Accessible Footer */}
      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ForeSiteApp />
    </AuthProvider>
  );
};
