import React, { useState } from "react";
import {
  ClipboardCheck,
  Filter,
  Plus,
  Eye,
  Camera,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
} from "lucide-react";
import { Inspection, ReviewStatus } from "../types";
import { Card, CardBody, CardFooter } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import { DisclaimerBanner } from "../components/ui/DisclaimerBanner";

export interface InspectionsScreenProps {
  inspections: Inspection[];
  onUpdateStatus: (inspectionId: string, newStatus: ReviewStatus) => void;
  selectedProjectId?: string | null;
  onClearProjectFilter?: () => void;
}

export const InspectionsScreen: React.FC<InspectionsScreenProps> = ({
  inspections,
  onUpdateStatus,
  selectedProjectId,
  onClearProjectFilter,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isNewInspectionModalOpen, setIsNewInspectionModalOpen] = useState(false);

  // Filter inspections
  const filteredInspections = inspections.filter((insp) => {
    if (selectedProjectId && insp.projectId !== selectedProjectId) {
      return false;
    }
    if (statusFilter !== "all" && insp.reviewStatus !== statusFilter) {
      return false;
    }
    return true;
  });

  const handleOpenDetail = (insp: Inspection) => {
    setActiveInspection(insp);
    setIsDetailModalOpen(true);
  };

  const handleStatusChange = (newStatus: ReviewStatus) => {
    if (activeInspection) {
      onUpdateStatus(activeInspection.id, newStatus);
      setActiveInspection({
        ...activeInspection,
        reviewStatus: newStatus,
        reviewedAt: Date.now(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Screen Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Site Inspections
            </h1>
            {selectedProjectId && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-brand-100 text-brand-800 rounded">
                Filtered by Project
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Review AI observation drafts, assess evidence, and record human approvals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedProjectId && onClearProjectFilter && (
            <Button variant="outline" size="md" onClick={onClearProjectFilter}>
              Show All Projects
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setIsNewInspectionModalOpen(true)}
          >
            New Inspection
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1 pl-1 pr-2">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </span>
        {[
          { id: "all", label: "All Records" },
          { id: "draft_generated", label: "Drafts" },
          { id: "in_review", label: "In Review" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === tab.id
                ? "bg-slate-800 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inspections Grid */}
      {filteredInspections.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No inspections found"
          description={
            statusFilter !== "all"
              ? `There are no inspections matching the status filter "${statusFilter}".`
              : "No inspections recorded yet. Start by capturing field observations."
          }
          actionLabel={statusFilter !== "all" ? "Clear Filters" : "Record Inspection"}
          onAction={() => {
            if (statusFilter !== "all") setStatusFilter("all");
            else setIsNewInspectionModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredInspections.map((insp) => (
            <Card
              key={insp.id}
              hoverable
              onClick={() => handleOpenDetail(insp)}
              className="flex flex-col justify-between"
            >
              <CardBody className="p-5 space-y-3">
                {/* Meta Header */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-brand-600 uppercase tracking-wide truncate max-w-[150px]">
                    {insp.projectName}
                  </span>
                  <Badge variant="status" status={insp.reviewStatus} />
                </div>

                {/* Title & Observation */}
                <div>
                  <h3 className="text-base font-semibold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1">
                    {insp.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                    {insp.observation}
                  </p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="category" category={insp.category} />
                  {insp.inferenceSource && (
                    <Badge variant="source" source={insp.inferenceSource} />
                  )}
                </div>
              </CardBody>

              {/* Footer */}
              <CardFooter className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {insp.photoMeta
                      ? `${insp.photoMeta.fileName} (${(insp.photoMeta.fileSizeBytes / 1024).toFixed(0)} KB)`
                      : "No photo attached"}
                  </span>
                </div>
                <span className="text-brand-600 font-medium inline-flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  Review
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Inspection Detail / Review Modal */}
      {activeInspection && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Inspection: ${activeInspection.title}`}
          maxWidth="lg"
          footer={
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Current Status:</span>
                <Badge variant="status" status={activeInspection.reviewStatus} />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDetailModalOpen(false)}
                >
                  Close
                </Button>
                {activeInspection.reviewStatus !== "rejected" && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<XCircle className="w-4 h-4" />}
                    onClick={() => handleStatusChange("rejected")}
                  >
                    Reject Draft
                  </Button>
                )}
                {activeInspection.reviewStatus !== "approved" && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    onClick={() => handleStatusChange("approved")}
                  >
                    Approve Inspection
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-sm">
            {/* Disclaimer */}
            <DisclaimerBanner compact />

            {/* Project & Category Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="text-xs text-slate-400 block">Project</span>
                <span className="font-semibold text-slate-800">
                  {activeInspection.projectName}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Category</span>
                <Badge variant="category" category={activeInspection.category} />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Inference Source</span>
                {activeInspection.inferenceSource ? (
                  <Badge variant="source" source={activeInspection.inferenceSource} />
                ) : (
                  <Badge variant="source" source="UNKNOWN" />
                )}
              </div>
            </div>

            {/* Observation Summary */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                AI Visible Observation Summary
              </h4>
              <p className="text-slate-800 bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed">
                {activeInspection.observation}
              </p>
            </div>

            {/* Visible Evidence List */}
            {activeInspection.visibleEvidence.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Visible Evidence Checklist
                </h4>
                <ul className="space-y-1.5">
                  {activeInspection.visibleEvidence.map((ev, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1 shrink-0" />
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Uncertainties & Constraints */}
            {activeInspection.uncertainties.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1 text-amber-800">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Identified Uncertainties & Non-Destructive Limits
                </h4>
                <ul className="space-y-1">
                  {activeInspection.uncertainties.map((un, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-600 italic bg-amber-50/60 p-2 rounded border border-amber-100"
                    >
                      "{un}"
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inspector Follow-Up Items */}
            {activeInspection.inspectorFollowUp.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1 text-blue-800">
                  <Clock className="w-3.5 h-3.5" />
                  Inspector Recommended Actions
                </h4>
                <ul className="space-y-1">
                  {activeInspection.inspectorFollowUp.map((fu, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-700 bg-blue-50/60 p-2 rounded border border-blue-100"
                    >
                      • {fu}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* New Inspection Workflow Placeholder Modal */}
      <Modal
        isOpen={isNewInspectionModalOpen}
        onClose={() => setIsNewInspectionModalOpen(false)}
        title="New Inspection Observation"
        footer={
          <Button
            variant="outline"
            size="md"
            onClick={() => setIsNewInspectionModalOpen(false)}
          >
            Dismiss
          </Button>
        }
      >
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            Phase 1 Scaffolding Ready
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            The full photo capture, IndexedDB local evidence storage, and Firebase AI Logic hybrid inference workflow will be enabled in subsequent approved phases (Phase 3 & Phase 4).
          </p>
        </div>
      </Modal>
    </div>
  );
};
