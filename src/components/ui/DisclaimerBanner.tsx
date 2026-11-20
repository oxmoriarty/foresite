import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export interface DisclaimerBannerProps {
  compact?: boolean;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs rounded-full">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
        <span>
          <strong>AI Draft Mode:</strong> AI observations are preliminary and require qualified human review before finalization.
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 bg-amber-50/70 border border-amber-200/80 rounded-2xl mb-6 shadow-xs">
      <div className="flex items-start gap-3.5">
        <div className="p-2 bg-amber-100/80 rounded-xl text-amber-800 shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-950 mb-1">
            Mandatory Human-in-the-Loop Review
          </h4>
          <p className="text-xs text-amber-900 leading-relaxed">
            ForeSite leverages device and cloud hybrid AI to generate structured draft inspection records. AI suggestions do not constitute structural, safety, or regulatory certifications. Every observation, category, and follow up item must be reviewed, edited, and approved by a qualified inspector or supervisor.
          </p>
        </div>
      </div>
    </div>
  );
};
