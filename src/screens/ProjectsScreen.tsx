import React, { useState } from "react";
import { FolderKanban, Plus, Search, MapPin, Calendar, ClipboardList } from "lucide-react";
import { Project } from "../types";
import { Card, CardBody, CardFooter } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";

export interface ProjectsScreenProps {
  projects: Project[];
  onCreateProject: (project: Omit<Project, "id" | "inspectionCount" | "createdAt" | "updatedAt">) => void;
  onSelectProject: (projectId: string) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
}

export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({
  projects,
  onCreateProject,
  onSelectProject,
  isCreateModalOpen,
  setIsCreateModalOpen,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newSiteLabel, setNewSiteLabel] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.siteLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleFormSubmit = (e: React.FormEvent) => {
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
    });

    // Reset and close
    setNewProjectName("");
    setNewSiteLabel("");
    setNewLocation("");
    setFormError(null);
    setIsCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
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
        >
          Create Project
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by project name, parcel label, or city..."
          className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              className="flex flex-col justify-between"
            >
              <CardBody className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-700 tracking-wider">
                    {project.siteLabel}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                    <ClipboardList className="w-3.5 h-3.5 text-brand-600" />
                    <span>{project.inspectionCount} inspections</span>
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
            <Button variant="primary" size="md" onClick={handleFormSubmit}>
              Save Project
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. Metro North Station Redevelopment"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Site / Parcel Label <span className="text-red-500">*</span>
            </label>
            <input
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
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Location / Address
            </label>
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="e.g. 144 Construction Way, Sector 7"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
