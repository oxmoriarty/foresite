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
  shape?: "pill" | "rounded";
  showDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  status,
  source,
  category,
  shape,
  showDot = true,
  children,
  ...props
}) => {
  let badgeText = children;
  let colorStyles = "bg-slate-600 text-white shadow-xs";
  let dotColor: string | null = null;
  let shapeClass = "rounded-full";

  if (variant === "status" && status) {
    shapeClass = shape === "rounded" ? "rounded-md" : "rounded-full";
    switch (status) {
      case "draft_generated":
        // Matching vibrant purple 'Beta' pill from design example
        colorStyles = "bg-purple-600 text-white shadow-xs";
        badgeText = badgeText || "Draft Generated";
        dotColor = "bg-white";
        break;
      case "in_review":
        // Matching vibrant blue 'New' pill from design example
        colorStyles = "bg-blue-600 text-white shadow-xs";
        badgeText = badgeText || "In Review";
        dotColor = "bg-white";
        break;
      case "approved":
        // Matching vibrant green 'Active' pill with dot from design example
        colorStyles = "bg-emerald-600 text-white shadow-xs";
        badgeText = badgeText || "Approved";
        dotColor = "bg-white";
        break;
      case "rejected":
        // Vibrant rose/red pill
        colorStyles = "bg-rose-600 text-white shadow-xs";
        badgeText = badgeText || "Rejected";
        dotColor = "bg-white";
        break;
    }
  } else if (variant === "source" && source) {
    shapeClass = shape === "rounded" ? "rounded-md" : "rounded-full";
    switch (source) {
      case "ON_DEVICE":
        colorStyles = "bg-emerald-600 text-white shadow-xs";
        badgeText = badgeText || "On-Device (Nano)";
        dotColor = "bg-white";
        break;
      case "IN_CLOUD":
        colorStyles = "bg-indigo-600 text-white shadow-xs";
        badgeText = badgeText || "Cloud (Gemini)";
        dotColor = "bg-white";
        break;
      case "UNKNOWN":
        colorStyles = "bg-slate-500 text-white shadow-xs";
        badgeText = badgeText || "Source Unknown";
        break;
    }
  } else if (variant === "category" && category) {
    // Categories: matching 'Rounded Rectangle' from table example in design reference
    shapeClass = shape === "pill" ? "rounded-full" : "rounded-md";
    switch (category) {
      case "surface_condition":
        colorStyles = "bg-amber-600 text-white shadow-xs";
        badgeText = badgeText || "Surface Condition";
        break;
      case "installation":
        colorStyles = "bg-teal-600 text-white shadow-xs";
        badgeText = badgeText || "Installation";
        break;
      case "housekeeping":
        colorStyles = "bg-cyan-600 text-white shadow-xs";
        badgeText = badgeText || "Housekeeping";
        break;
      case "equipment":
        colorStyles = "bg-purple-600 text-white shadow-xs";
        badgeText = badgeText || "Equipment";
        break;
      case "other":
        colorStyles = "bg-slate-600 text-white shadow-xs";
        badgeText = badgeText || "General / Other";
        break;
    }
  }

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center px-2.5 py-0.5 text-xs font-semibold tracking-wide",
          shapeClass,
          colorStyles,
          className
        )
      )}
      {...props}
    >
      {showDot && dotColor && (
        <span className={clsx("w-1.5 h-1.5 rounded-full mr-1.5 shrink-0", dotColor)} />
      )}
      {badgeText}
    </span>
  );
};
