/**
 * ForeSite Domain Types and Interfaces
 * Construction Site Inspection & Observation Workspace
 */

export type ViewMode = "overview" | "projects" | "inspections" | "settings";

export type ReviewStatus = "draft_generated" | "in_review" | "approved" | "rejected";

export type ObservationCategory =
  | "surface_condition"
  | "installation"
  | "housekeeping"
  | "equipment"
  | "other";

export type InferenceSource = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";

export type StorageProvider = "indexeddb" | "cloud_pending" | "cloud_synced";

/**
 * ForeSite Authenticated Inspector Profile
 * Stored in Firestore under `/users/{uid}`
 */
export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  createdAt: number;
  lastLoginAt: number;
  role?: string;
  company?: string;
}

export interface Project {
  id: string;
  ownerUid?: string;
  name: string;
  siteLabel: string;
  location?: string;
  inspectionCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface InspectionPhotoMeta {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: "image/jpeg" | "image/png";
  storageProvider: StorageProvider;
  storagePath?: string;
  hasLocalBlob: boolean;
  capturedAt: number;
}

export interface Inspection {
  id: string;
  ownerUid?: string;
  projectId: string;
  projectName: string;
  title: string;
  observation: string;
  category: ObservationCategory;
  visibleEvidence: string[];
  uncertainties: string[];
  inspectorFollowUp: string[];
  reviewStatus: ReviewStatus;
  aiAssisted: boolean;
  inferenceSource?: InferenceSource;
  photoMeta?: InspectionPhotoMeta;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewedByUid?: string;
}

export interface AppStats {
  totalProjects: number;
  totalInspections: number;
  pendingReviews: number;
  approvedCount: number;
  rejectedCount: number;
  onDeviceInferences: number;
  cloudInferences: number;
}
