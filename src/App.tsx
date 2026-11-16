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
  updateInspection as updateFirestoreInspection,
} from "./services/firestore";

// Initial realistic seed dataset for Scaffolding & Demo preview
const INITIAL_PROJECTS: Project[] = [
  {
    id: "proj-metro-01",
    name: "Metro North Station Redevelopment",
    siteLabel: "MNS-SECTOR-4",
    location: "420 Transit Way, North Corridor",
    inspectionCount: 2,
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: "proj-terminal-02",
    name: "Terminal 3 Gate Pier Expansion",
    siteLabel: "T3-EXP-B2",
    location: "Concourse C, International Airport",
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
        // If user has no projects yet, retain initial templates
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
  }, [currentUser, isConfigured, loadUserData]);

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
  };

  // Handler: Create new project
  const handleCreateProject = async (
    newProj: Omit<Project, "id" | "inspectionCount" | "createdAt" | "updatedAt">
  ) => {
    if (currentUser?.uid && isConfigured) {
      try {
        const created = await createFirestoreProject(currentUser.uid, newProj);
        setProjects([created, ...projects]);
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
            onSelectProject={handleSelectProject}
            isCreateModalOpen={isProjectModalOpen}
            setIsCreateModalOpen={setIsProjectModalOpen}
          />
        )}

        {currentView === "inspections" && (
          <InspectionsScreen
            inspections={inspections}
            onUpdateStatus={handleUpdateInspectionStatus}
            selectedProjectId={selectedProjectId}
            onClearProjectFilter={() => setSelectedProjectId(null)}
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
