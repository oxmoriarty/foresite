import React, { useState } from "react";
import {
  FolderKanban,
  ClipboardCheck,
  Clock,
  Sparkles,
  Plus,
  ArrowRight,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import { Project, Inspection, AppStats, ViewMode } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import {
  useInspectionPhotoMap,
  formatRelativeTime,
} from "../services/inspectionPhotoLoader";

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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const recentInspections = inspections.slice(0, 6);
  const { photoUrls, photoCounts } = useInspectionPhotoMap(recentInspections);

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Inspection Overview
          </h1>
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
        <Card className="hover:border-brand-300 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 rounded-2xl group cursor-default">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-brand-100/80 transition-all duration-300">
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
        <Card className="hover:border-brand-300 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 rounded-2xl group cursor-default">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-brand-100/80 transition-all duration-300">
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
        <Card className="hover:border-amber-300 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 rounded-2xl group cursor-default">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-amber-100/80 transition-all duration-300">
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
        <Card className="hover:border-emerald-300 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 rounded-2xl group cursor-default">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-emerald-100/80 transition-all duration-300">
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

      {/* Recent Inspections Section (matching reference card grid and list view) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Recent Inspections
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="Grid View"
                aria-label="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                title="List View"
                aria-label="List View"
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
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
        </div>

        {recentInspections.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200/80">
            <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No inspections recorded yet</p>
            <p className="text-xs text-slate-500 mt-1">Start by capturing field observations.</p>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentInspections.map((insp) => {
              const photoUrl = photoUrls[insp.id];
              const imageCount = photoCounts[insp.id] ?? (insp.photoIds?.length || (insp.photoMeta ? 1 : 0));

              return (
                <div
                  key={insp.id}
                  onClick={() => onNavigate("inspections")}
                  className="group relative rounded-2xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-card-hover hover:-translate-y-1 active:scale-[0.99] transition-all duration-300 flex flex-col justify-between cursor-pointer overflow-hidden"
                >
                  {/* Top: Image or No Image Placeholder */}
                  <div className={`relative aspect-[16/10] w-full overflow-hidden ${photoUrl ? "bg-slate-900" : "bg-slate-100/90 border-b border-slate-200/70"}`}>
                    {photoUrl ? (
                      <>
                        <img
                          src={photoUrl}
                          alt={insp.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent pointer-events-none" />
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full bg-slate-100/90 text-slate-400">
                        <div className="w-16 h-16 rounded-2xl bg-white shadow-2xs border border-slate-200/70 flex items-center justify-center">
                          <ImageIcon className="w-9 h-9 text-slate-400 stroke-[1.5]" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-2.5">
                          No Image
                        </span>
                      </div>
                    )}

                    {/* Badges Overlay on Image */}
                    <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold tracking-wider shadow-xs bg-slate-900/90 text-white backdrop-blur-xs border border-white/10">
                        {insp.id.slice(0, 12).toUpperCase()}
                      </span>
                    </div>

                    <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5">
                      <Badge variant="status" status={insp.reviewStatus} className="text-[10px]" />
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5">
                      {/* Title & Arrow */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                          {insp.title}
                        </h3>
                        <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200 shrink-0 mt-0.5" />
                      </div>

                      {/* Project / Location */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{insp.projectName}</span>
                      </div>

                      {/* Observation snippet */}
                      <p className="pt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed min-h-[32px]">
                        {insp.observation || "Field audit observation findings captured on site."}
                      </p>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 gap-2">
                      <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {imageCount > 0 ? `${imageCount} image${imageCount > 1 ? "s" : ""}` : "No images"}
                        </span>
                      </div>

                      <span className="text-slate-400 text-[11px] whitespace-nowrap">
                        {formatRelativeTime(insp.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-3 px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider items-center">
              <div className="col-span-6 sm:col-span-5">Inspection / Title</div>
              <div className="col-span-3 hidden sm:block">Project / Location</div>
              <div className="col-span-6 sm:col-span-2">Status</div>
              <div className="col-span-2 hidden sm:block text-right">Activity</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100">
              {recentInspections.map((insp) => {
                const photoUrl = photoUrls[insp.id];

                return (
                  <div
                    key={insp.id}
                    onClick={() => onNavigate("inspections")}
                    className="grid grid-cols-12 gap-3 px-5 py-3.5 hover:bg-slate-50 transition-all duration-150 cursor-pointer items-center group active:bg-slate-100/80"
                  >
                    {/* Column 1: Thumbnail + Title + ID */}
                    <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
                      <div className="w-14 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200/70 relative">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full bg-slate-100 text-slate-400">
                            <ImageIcon className="w-5 h-5 text-slate-400/80 stroke-[1.5]" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-600 transition-colors truncate">
                          {insp.title}
                        </h4>
                        <span className="text-[11px] font-mono text-slate-400 truncate block">
                          {insp.id.slice(0, 12).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Column 2: Project / Location */}
                    <div className="col-span-3 hidden sm:flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{insp.projectName}</span>
                    </div>

                    {/* Column 3: Status */}
                    <div className="col-span-6 sm:col-span-2">
                      <Badge variant="status" status={insp.reviewStatus} className="text-[10px]" />
                    </div>

                    {/* Column 4: Activity & Arrow */}
                    <div className="col-span-2 hidden sm:flex items-center justify-end gap-2 text-right">
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {formatRelativeTime(insp.createdAt)}
                      </span>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200 shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
