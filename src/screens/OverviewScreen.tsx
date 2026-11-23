import React from "react";
import {
  FolderKanban,
  ClipboardCheck,
  Clock,
  Sparkles,
  Plus,
  ArrowRight,
  Calendar,
  Camera,
} from "lucide-react";
import { Project, Inspection, AppStats, ViewMode } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";

export interface OverviewScreenProps {
  projects: Project[];
  inspections: Inspection[];
  stats: AppStats;
  onNavigate: (view: ViewMode) => void;
  onOpenNewProjectModal: () => void;
}

export const OverviewScreen: React.FC<OverviewScreenProps> = ({
  inspections,
  stats,
  onNavigate,
  onOpenNewProjectModal,
}) => {
  const recentInspections = inspections.slice(0, 6);

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
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block mb-1">
            Portfolio Control
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Inspection Workspace Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Site visibility, observation drafts, and pending review queue.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={onOpenNewProjectModal}
            className="rounded-full text-xs"
          >
            New Project
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<ClipboardCheck className="w-4 h-4" />}
            onClick={() => onNavigate("inspections")}
            className="rounded-full shadow-pill text-xs"
          >
            View Inspections
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <Card className="hover:border-brand-200 transition-all duration-300 rounded-2xl">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Active Projects
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.totalProjects}</p>
            </div>
          </CardBody>
        </Card>

        {/* Metric 2 */}
        <Card className="hover:border-brand-200 transition-all duration-300 rounded-2xl">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Inspections
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.totalInspections}</p>
            </div>
          </CardBody>
        </Card>

        {/* Metric 3 */}
        <Card className="hover:border-amber-200 transition-all duration-300 rounded-2xl">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Pending Reviews
              </p>
              <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{stats.pendingReviews}</p>
            </div>
          </CardBody>
        </Card>

        {/* Metric 4 */}
        <Card className="hover:border-emerald-200 transition-all duration-300 rounded-2xl">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                AI Drafts
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {stats.onDeviceInferences + stats.cloudInferences}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Recent Inspections Section (matching reference card grid) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase block">
              Field Audits
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Recent Observations and Inspections
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight className="w-4 h-4" />}
            onClick={() => onNavigate("inspections")}
            className="rounded-full text-xs"
          >
            All Inspections
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {recentInspections.map((insp) => (
            <div
              key={insp.id}
              onClick={() => onNavigate("inspections")}
              className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-slate-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between cursor-pointer space-y-4"
            >
              {/* Top Row: Date and Status Badge */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{formatDate(insp.createdAt)}</span>
                </div>
                <Badge variant="status" status={insp.reviewStatus} />
              </div>

              {/* Body: Project Tag, Title, and Observation */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wide block truncate">
                  {insp.projectName}
                </span>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                  {insp.title}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
                  {insp.observation || "Field audit findings captured on site."}
                </p>
              </div>

              {/* Footer: Photos Count and Badges */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] truncate">
                    {insp.photoIds && insp.photoIds.length > 0
                      ? `${insp.photoIds.length} photos`
                      : "No photos"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Badge variant="category" category={insp.category} />
                  {insp.inferenceSource && (
                    <Badge variant="source" source={insp.inferenceSource} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
