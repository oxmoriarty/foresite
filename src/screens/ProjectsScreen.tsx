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
  MapPin,
  Calendar,
  ClipboardList,
  Edit2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Project } from "../types";
import { Card, CardBody, CardFooter } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";

export interface ProjectsScreenProps {
  projects: Project[];
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
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onSelectProject,
  isCreateModalOpen,
  setIsCreateModalOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
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

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.siteLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Inspection Projects
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Organize inspections by construction site, facility parcel, or work package.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-full shadow-pill"
        >
          Create Project
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by project name, parcel label, or city..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-full text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs"
        />
      </div>

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
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              hoverable
              onClick={() => onSelectProject(project.id)}
              className="flex flex-col justify-between group"
            >
              <CardBody className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-700 tracking-wider">
                    {project.siteLabel}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <ClipboardList className="w-3.5 h-3.5 text-brand-600" />
                      <span>{project.inspectionCount} inspections</span>
                    </div>

                    {/* Quick Edit & Delete Action Icons */}
                    <button
                      type="button"
                      onClick={(e) => openEditModal(project, e)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      title="Edit Project"
                      aria-label={`Edit ${project.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => openDeleteModal(project, e)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete Project"
                      aria-label={`Delete ${project.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 group-hover:text-brand-600 transition-colors">
                    {project.name}
                  </h3>
                  {project.location && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{project.location}</span>
                    </div>
                  )}
                  {project.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </div>
              </CardBody>

              <CardFooter className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
                <span className="text-brand-600 font-medium hover:underline">
                  View Inspections &rarr;
                </span>
              </CardFooter>
            </Card>
          ))}
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
              Deleting this project will permanently remove all associated local photographic evidence Blobs, unfinished inspection drafts, and Firestore metadata linked to this project.
            </p>
            <p className="font-bold">This operation cannot be undone.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
