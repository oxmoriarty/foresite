/**
 * ForeSite Cloud AI Processing Consent Modal
 *
 * Presented when on-device Gemini Nano inference is unavailable in Mode B (Automatic cloud fallback OFF).
 *
 * Invariants:
 * 1. Halts execution immediately before network transmission.
 * 2. Plain-language disclosure of Google Cloud transmission (gemini-3.5-flash-lite).
 * 3. Gemini Developer API free-tier terms disclosure (Google may use submitted data to improve products).
 * 4. Clear distinction: Declining cloud AI does NOT disable ordinary Firestore synchronization.
 * 5. Original photograph binaries remain strictly in local browser IndexedDB.
 */

import React from "react";
import { Cloud, ShieldAlert, CheckCircle, XCircle } from "lucide-react";
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
  targetModel = "gemini-3.5-flash-lite",
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onDecline}
      title={
        <div className="flex items-center gap-2 text-amber-700">
          <div className="p-1.5 bg-amber-100 rounded-md">
            <Cloud className="w-5 h-5 text-amber-600" />
          </div>
          <span className="font-semibold text-slate-900">
            Cloud AI Inference Consent
          </span>
        </div>
      }
      footer={
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 w-full">
          <Button
            variant="secondary"
            onClick={onDecline}
            className="w-full sm:w-auto"
          >
            <XCircle className="w-4 h-4 mr-1.5" />
            Decline (Manual Authoring)
          </Button>
          <Button
            variant="primary"
            onClick={onConsent}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            Consent & Process in Cloud
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
        {/* Notice Banner */}
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">
              On-device Gemini Nano inference is unavailable on this system.
            </p>
            <p className="text-amber-800 mt-1">
              Your device lacks required hardware acceleration (WebGPU), is missing Chrome Prompt API flags, or the on-device model is not installed.
            </p>
          </div>
        </div>

        {/* Transmission Disclosure */}
        <div className="space-y-2">
          <h4 className="font-semibold text-slate-900">
            What will happen if you consent?
          </h4>
          <p>
            ForeSite will transmit an ephemeral downscaled photograph derivative (max 1600px, under 4 MB) and your current observation notes to Google Cloud for processing using <strong>{targetModel}</strong> via Firebase AI Logic.
          </p>
        </div>

        {/* Free-tier terms disclosure */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
          <span className="font-semibold text-slate-900 block">
            Google Gemini Developer API Free-Tier Terms:
          </span>
          <p className="text-slate-600">
            Under Google&apos;s Gemini Developer API free-tier terms, content submitted to the API (including inspection photographs and notes) may be processed by Google and used to improve Google products and services.
          </p>
        </div>

        {/* Privacy & Sync Delineation */}
        <div className="space-y-2 pt-1 border-t border-slate-100 text-slate-600">
          <h4 className="font-semibold text-slate-900">
            Data Isolation Invariants:
          </h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Original photographs stay local:</strong> Original full-resolution photograph binaries remain strictly in your browser&apos;s local IndexedDB and are never uploaded to Firestore or cloud storage.
            </li>
            <li>
              <strong>Declining AI does not disable normal sync:</strong> If you decline, your photographs and notes are not sent to Gemini. You can write your inspection manually, and completed structured records will continue to synchronize to Cloud Firestore as normal.
            </li>
            <li>
              <strong>Single-request authorization:</strong> This consent applies only to this specific inspection draft request.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
