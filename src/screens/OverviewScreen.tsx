import React from "react";
import {
  FolderKanban,
  ClipboardCheck,
  Clock,
  Sparkles,
  Plus,
  ArrowRight,
  Database,
  ExternalLink,
} from "lucide-react";
import { Project, Inspection, AppStats, ViewMode } from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { DisclaimerBanner } from "../components/ui/DisclaimerBanner";

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
  const recentInspections = inspections.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Inspection Workspace Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Site visibility, observation drafts, and pending review queue.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={onOpenNewProjectModal}
            className="rounded-full"
          >
            New Project
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<ClipboardCheck className="w-4 h-4" />}
            onClick={() => onNavigate("inspections")}
            className="rounded-full shadow-pill"
          >
            View Inspections
          </Button>
        </div>
      </div>

      {/* Mandatory Disclaimer */}
      <DisclaimerBanner />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <Card className="hover:border-brand-200 transition-all duration-300">
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
        <Card className="hover:border-brand-200 transition-all duration-300">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
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
        <Card className="hover:border-amber-200 transition-all duration-300">
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
        <Card className="hover:border-emerald-200 transition-all duration-300">
          <CardBody className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Hybrid AI Drafts
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {stats.onDeviceInferences + stats.cloudInferences}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Main Grid: Recent Activity & Architecture Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Inspections List (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Recent Observations and Inspections
            </h2>
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => onNavigate("inspections")}
              className="rounded-full"
            >
              All Inspections
            </Button>
          </div>

          <div className="space-y-3">
            {recentInspections.map((insp) => (
              <Card key={insp.id} hoverable onClick={() => onNavigate("inspections")}>
                <CardBody className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-brand-600 uppercase">
                          {insp.projectName}
                        </span>
                        <span className="text-slate-300">•</span>
                        <Badge variant="category" category={insp.category} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{insp.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {insp.observation}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant="status" status={insp.reviewStatus} />
                      {insp.inferenceSource && (
                        <Badge variant="source" source={insp.inferenceSource} />
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        {/* Right Sidebar: Storage & Architecture Info */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            System and Storage Invariants
          </h2>

          <Card>
            <CardBody className="p-5 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-brand-50 rounded-xl text-brand-600 shrink-0 mt-0.5">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
                    Local Evidence Retention
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Original inspection photographs are retained locally in browser IndexedDB. Structured summaries sync to Firestore when authenticated.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Photo Storage:</span>
                  <span className="font-semibold text-slate-900">IndexedDB Device Local</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Inference Routing:</span>
                  <span className="font-semibold text-emerald-700">Hybrid Device and Cloud</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Firebase Pricing Tier:</span>
                  <span className="font-semibold text-slate-900">Spark Zero Cost</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs rounded-full"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => onNavigate("settings")}
              >
                Inspect Storage and Privacy Settings
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
