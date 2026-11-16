import React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export interface DisclaimerBannerProps {
  compact?: boolean;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
        <span>
          <strong>AI Draft Mode:</strong> AI observations are preliminary and require qualified human review before finalization.
        </span>
      </div>
    );
  }

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700 shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-amber-900 mb-1">
            Mandatory Human-in-the-Loop Review
          </h4>
          <p className="text-xs text-amber-800 leading-relaxed">
            ForeSite leverages on-device and cloud hybrid AI to generate structured draft inspection records. AI suggestions do <strong>not</strong> constitute structural, safety, or regulatory certifications. Every observation, category, and follow-up item must be reviewed, edited, and approved by a qualified inspector or supervisor.
          </p>
        </div>
      </div>
    </div>
  );
};
