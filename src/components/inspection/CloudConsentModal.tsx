/**
 * ForeSite Cloud AI Processing Consent Modal
 */

import React from "react";
import { Cloud, ShieldAlert, CheckCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

export interface CloudConsentModalProps {
  isOpen: boolean;
  onConsent: () => void;
  onDecline: () => void;
  targetModel?: string;
}

export const CloudConsentModal: React.FC<CloudConsentModalProps> = ({
  isOpen,
  onConsent,
  onDecline,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onDecline}
      title="Use Cloud AI?"
      maxWidth="sm"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            variant="outline"
            onClick={onDecline}
            className="rounded-full"
          >
            Write Manually
          </Button>
          <Button
            variant="primary"
            onClick={onConsent}
            className="rounded-full shadow-pill"
          >
            Use Cloud AI
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="space-y-1 pt-0.5">
            <p className="text-sm font-semibold text-slate-900">
              On-device AI is unavailable right now.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Allow ForeSite to send a compressed copy of your photo and notes to Google Cloud AI for this draft?
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Your original full-resolution photos stay safely on this device.</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Google may process submitted drafts under free-tier terms. If you decline, you can still write and save inspections normally.
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
