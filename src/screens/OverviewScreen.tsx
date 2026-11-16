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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inspection Workspace Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Site-level visibility, AI-assisted observation drafts, and pending review queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={onOpenNewProjectModal}
          >
            New Project
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<ClipboardCheck className="w-4 h-4" />}
            onClick={() => onNavigate("inspections")}
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
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Active Projects
              </p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalProjects}</p>
            </div>
          </CardBody>
        </Card>

        {/* Metric 2 */}
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Inspections
              </p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalInspections}</p>
            </div>
          </CardBody>
        </Card>

        {/* Metric 3 */}
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Pending Reviews
              </p>
              <p className="text-2xl font-bold text-amber-600">{stats.pendingReviews}</p>
            </div>
          </CardBody>
        </Card>

        {/* Metric 4 */}
        <Card>
          <CardBody className="p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Hybrid AI Drafts
              </p>
              <p className="text-2xl font-bold text-slate-900">
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
            <h2 className="text-base font-semibold text-slate-900">
              Recent Observations & Inspections
            </h2>
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight className="w-4 h-4" />}
              onClick={() => onNavigate("inspections")}
            >
              All Inspections
            </Button>
          </div>

          <div className="space-y-3">
            {recentInspections.map((insp) => (
              <Card key={insp.id} hoverable onClick={() => onNavigate("inspections")}>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-brand-600 uppercase">
                          {insp.projectName}
                        </span>
                        <span className="text-slate-300">•</span>
                        <Badge variant="category" category={insp.category} />
                      </div>
                      <h3 className="text-sm font-medium text-slate-900">{insp.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {insp.observation}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
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
          <h2 className="text-base font-semibold text-slate-900">
            System & Storage Invariants
          </h2>

          <Card>
            <CardBody className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-700 shrink-0 mt-0.5">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-700">
                    Local Evidence Retention
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Original inspection photographs are retained locally in browser IndexedDB. Structured summaries sync to Firestore when authenticated.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Photo Storage:</span>
                  <span className="font-semibold text-slate-800">IndexedDB (Device Local)</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Inference Routing:</span>
                  <span className="font-semibold text-emerald-700">Hybrid (Nano / Flash)</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Firebase Pricing Tier:</span>
                  <span className="font-semibold text-slate-800">Spark (No Billing)</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                onClick={() => onNavigate("settings")}
              >
                Inspect Storage & Privacy Settings
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};
