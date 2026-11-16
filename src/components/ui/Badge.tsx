import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  ReviewStatus,
  InferenceSource,
  ObservationCategory,
} from "../../types";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "status" | "source" | "category";
  status?: ReviewStatus;
  source?: InferenceSource;
  category?: ObservationCategory;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  status,
  source,
  category,
  children,
  ...props
}) => {
  let badgeText = children;
  let colorStyles = "bg-slate-100 text-slate-700 border-slate-200";

  if (variant === "status" && status) {
    switch (status) {
      case "draft_generated":
        colorStyles = "bg-amber-50 text-amber-800 border-amber-300";
        badgeText = badgeText || "Draft Generated";
        break;
      case "in_review":
        colorStyles = "bg-blue-50 text-blue-800 border-blue-300";
        badgeText = badgeText || "In Review";
        break;
      case "approved":
        colorStyles = "bg-emerald-50 text-emerald-800 border-emerald-300";
        badgeText = badgeText || "Approved";
        break;
      case "rejected":
        colorStyles = "bg-rose-50 text-rose-800 border-rose-300";
        badgeText = badgeText || "Rejected";
        break;
    }
  } else if (variant === "source" && source) {
    switch (source) {
      case "ON_DEVICE":
        colorStyles = "bg-emerald-100 text-emerald-900 border-emerald-300 font-semibold";
        badgeText = badgeText || "On-Device (Nano)";
        break;
      case "IN_CLOUD":
        colorStyles = "bg-indigo-100 text-indigo-900 border-indigo-300 font-semibold";
        badgeText = badgeText || "Cloud (Gemini)";
        break;
      case "UNKNOWN":
        colorStyles = "bg-slate-100 text-slate-700 border-slate-300";
        badgeText = badgeText || "Source Unknown";
        break;
    }
  } else if (variant === "category" && category) {
    switch (category) {
      case "surface_condition":
        colorStyles = "bg-orange-50 text-orange-800 border-orange-200";
        badgeText = badgeText || "Surface Condition";
        break;
      case "installation":
        colorStyles = "bg-cyan-50 text-cyan-800 border-cyan-200";
        badgeText = badgeText || "Installation";
        break;
      case "housekeeping":
        colorStyles = "bg-teal-50 text-teal-800 border-teal-200";
        badgeText = badgeText || "Housekeeping";
        break;
      case "equipment":
        colorStyles = "bg-purple-50 text-purple-800 border-purple-200";
        badgeText = badgeText || "Equipment";
        break;
      case "other":
        colorStyles = "bg-slate-100 text-slate-700 border-slate-200";
        badgeText = badgeText || "General / Other";
        break;
    }
  }

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
          colorStyles,
          className
        )
      )}
      {...props}
    >
      {badgeText}
    </span>
  );
};
