/**
 * ForeSite Projects Screen
 *
 * Full project management workflows:
 * - View user projects catalog with real-time inspection counts
 * - Create new inspection project
 * - Edit existing project details (name, siteLabel, location, description)
 * - Safe cascade deletion with confirmation warning
 * - Filter/search by project name, parcel label, or location
 */

import React, { useState } from "react";
import {
  FolderKanban,
  Plus,
  Search,
  Calendar,
  Edit2,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { Project, Inspection } from "../types";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";

export interface ProjectsScreenProps {
  projects: Project[];
  inspections?: Inspection[];
  onCreateProject: (
    project: Omit<Project, "id" | "inspectionCount" | "createdAt" | "updatedAt">
  ) => void | Promise<void>;
  onUpdateProject?: (
    projectId: string,
    updates: Partial<Project>
  ) => void | Promise<void>;
  onDeleteProject?: (projectId: string) => void | Promise<void>;
  onSelectProject: (projectId: string) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({
  projects,
  inspections,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onSelectProject,
  isCreateModalOpen,
  setIsCreateModalOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newSiteLabel, setNewSiteLabel] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Project State
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editSiteLabel, setEditSiteLabel] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Delete Project State
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const getProjectProgress = (projectId: string, inspectionCount: number) => {
    const projInspections = inspections?.filter((i) => i.projectId === projectId) || [];
    if (projInspections.length > 0) {
      const approved = projInspections.filter((i) => i.reviewStatus === "approved").length;
      return Math.round((approved / projInspections.length) * 100);
    }
    if (inspectionCount > 0) {
      return 50;
    }
    return 0;
  };

  const getProjectStatus = (progress: number, inspectionCount: number) => {
    if (progress === 100 && inspectionCount > 0) {
      return { label: "Active", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (progress > 0 || inspectionCount > 0) {
      return { label: "In Progress", bg: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    return { label: "Planning Phase", bg: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "long",
      day: "2-digit",
      year: "numeric",
    });
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.siteLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "all") return true;

    const progress = getProjectProgress(p.id, p.inspectionCount);
    if (statusFilter === "active") {
      return progress === 100 && p.inspectionCount > 0;
    }
    if (statusFilter === "in_progress") {
      return (progress > 0 && progress < 100) || (p.inspectionCount > 0 && progress < 100);
    }
    if (statusFilter === "planning") {
      return p.inspectionCount === 0 && progress === 0;
    }
    return true;
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setFormError("Project name is required.");
      return;
    }
    if (!newSiteLabel.trim()) {
      setFormError("Site identifier label is required.");
      return;
    }

    onCreateProject({
      name: newProjectName.trim(),
      siteLabel: newSiteLabel.trim().toUpperCase(),
      location: newLocation.trim() || undefined,
      description: newDescription.trim() || undefined,
    });

    setNewProjectName("");
    setNewSiteLabel("");
    setNewLocation("");
    setNewDescription("");
    setFormError(null);
    setIsCreateModalOpen(false);
  };

  const openEditModal = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditName(project.name);
    setEditSiteLabel(project.siteLabel);
    setEditLocation(project.location || "");
    setEditDescription(project.description || "");
    setFormError(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    if (!editName.trim()) {
      setFormError("Project name is required.");
      return;
    }
    if (!editSiteLabel.trim()) {
      setFormError("Site identifier label is required.");
      return;
    }

    if (onUpdateProject) {
      onUpdateProject(editingProject.id, {
        name: editName.trim(),
        siteLabel: editSiteLabel.trim().toUpperCase(),
        location: editLocation.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
    }

    setEditingProject(null);
    setFormError(null);
  };

  const openDeleteModal = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    if (onDeleteProject) {
      await onDeleteProject(projectToDelete.id);
    }
    setProjectToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block mb-1">
            Portfolio Control
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Inspection Projects
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Organize inspections by construction site, facility parcel, or work package.
          </p>
        </div>

        {/* Right Toolbar: Retained Search, Filters button, and Create Project button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Retained Search Bar */}
          <div className="relative min-w-[220px] sm:min-w-[260px]">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by project name, parcel label, or city..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200/90 rounded-full text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-2xs"
            />
          </div>

          {/* Filters Toggle Button */}
          <Button
            variant={showFilters || statusFilter !== "all" ? "primary" : "outline"}
            size="md"
            icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            onClick={() => setShowFilters(!showFilters)}
            className="rounded-full text-xs"
          >
            Filters
          </Button>

          {/* Add Project Primary Button */}
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateModalOpen(true)}
            className="rounded-full shadow-pill text-xs sm:text-sm"
          >
            Create Project
          </Button>
        </div>
      </div>

      {/* Filter Tabs when toggled or filter active */}
      {showFilters && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs animate-in fade-in duration-200">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] pl-1 pr-2">
            Status:
          </span>
          {[
            { id: "all", label: "All Projects" },
            { id: "in_progress", label: "In Progress" },
            { id: "active", label: "Active" },
            { id: "planning", label: "Planning Phase" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 font-semibold rounded-full transition-all duration-200 whitespace-nowrap cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={searchQuery ? "No matching projects found" : "No projects created yet"}
          description={
            searchQuery
              ? `No projects matched your search for "${searchQuery}". Try a different keyword.`
              : "Get started by creating your first construction inspection project."
          }
          actionLabel={searchQuery ? "Clear Search" : "Create New Project"}
          onAction={() => {
            if (searchQuery) setSearchQuery("");
            else setIsCreateModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const progress = getProjectProgress(project.id, project.inspectionCount);
            const status = getProjectStatus(progress, project.inspectionCount);

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-slate-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer space-y-4"
              >
                {/* Card Top Meta: Calendar Date & Status Pill */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${status.bg}`}
                  >
                    {status.label}
                  </span>
                </div>

                {/* Card Body: Title & Description */}
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                    {project.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
                    {project.description || project.location || "Active construction inspection project and parcel."}
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

                {/* Card Footer: Avatars, Tags, and Edit/Delete Icons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {/* Left: Avatar Stack */}
                  <div className="flex items-center">
                    <div className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-[10px] flex items-center justify-center ring-2 ring-white shadow-2xs">
                      {project.siteLabel.slice(0, 2)}
                    </div>
                    <div className="w-7 h-7 -ml-2 rounded-full bg-slate-800 text-white font-bold text-[10px] flex items-center justify-center ring-2 ring-white shadow-2xs">
                      FS
                    </div>
                  </div>

                  {/* Right: Site Tag, Audits Count, and Action Icons */}
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-700">
                      {project.siteLabel}
                    </span>
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-100 text-slate-600">
                      {project.inspectionCount} audits
                    </span>
                    <button
                      type="button"
                      onClick={(e) => openEditModal(project, e)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                      title="Edit Project"
                      aria-label={`Edit ${project.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => openDeleteModal(project, e)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Delete Project"
                      aria-label={`Delete ${project.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setFormError(null);
        }}
        title="Create Inspection Project"
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setIsCreateModalOpen(false);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleCreateSubmit}>
              Save Project
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="new-project-name" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="new-project-name"
              type="text"
              required
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. Metro North Station Redevelopment"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="new-project-site-label" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Site / Parcel Label <span className="text-red-500">*</span>
            </label>
            <input
              id="new-project-site-label"
              type="text"
              required
              value={newSiteLabel}
              onChange={(e) => setNewSiteLabel(e.target.value)}
              placeholder="e.g. BLD-A-SECTOR-4"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Short alphanumeric identifier used on reports and site tags.
            </p>
          </div>

          <div>
            <label htmlFor="new-project-location" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Location / Address
            </label>
            <input
              id="new-project-location"
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="e.g. 144 Construction Way, Sector 7"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="new-project-description" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Project Scope / Notes
            </label>
            <textarea
              id="new-project-description"
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Optional scope description or special inspection requirements..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={Boolean(editingProject)}
        onClose={() => {
          setEditingProject(null);
          setFormError(null);
        }}
        title="Edit Project Details"
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setEditingProject(null);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleEditSubmit}>
              Update Project
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="edit-project-name" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-project-name"
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="edit-project-site-label" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Site / Parcel Label <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-project-site-label"
              type="text"
              required
              value={editSiteLabel}
              onChange={(e) => setEditSiteLabel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase font-mono"
            />
          </div>

          <div>
            <label htmlFor="edit-project-location" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Location / Address
            </label>
            <input
              id="edit-project-location"
              type="text"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label htmlFor="edit-project-description" className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Project Scope / Notes
            </label>
            <textarea
              id="edit-project-description"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Project Confirmation Modal */}
      <Modal
        isOpen={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
        title={
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span>Confirm Project Deletion</span>
          </div>
        }
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => setProjectToDelete(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={confirmDelete}>
              Permanently Delete Project
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p>
            Are you sure you want to delete <strong>{projectToDelete?.name}</strong> (Site Label: {projectToDelete?.siteLabel})?
          </p>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 space-y-1">
            <span className="font-semibold block">Cascade Cleanup Warning:</span>
            <p>
              Deleting this project will permanently remove all associated inspections, photographic evidence, and project records.
            </p>
            <p className="font-bold">This operation cannot be undone.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
