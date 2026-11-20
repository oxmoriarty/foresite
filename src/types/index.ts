/**
 * ForeSite Domain Types and Interfaces
 * Construction Site Inspection & Observation Workspace
 */

export type ViewMode = "landing" | "overview" | "projects" | "inspections" | "sync" | "settings";

export type ReviewStatus = "draft_generated" | "in_review" | "approved" | "rejected";

/**
 * Strongly Typed Review Audit Event
 * Recorded whenever an inspection transitions through the human review lifecycle.
 */
export interface ReviewAuditEvent {
  id: string;                    // Deterministic or unique event ID
  fromStatus: ReviewStatus;      // State before transition
  toStatus: ReviewStatus;        // Target state after transition
  byUid: string;                 // Authenticated inspector UID
  timestamp: number;             // Timestamp of transition (ms)
  comment?: string;              // Optional inspector review comment
  revision?: number;             // Associated inspection revision
}

export type ObservationCategory =
  | "surface_condition"
  | "installation"
  | "housekeeping"
  | "equipment"
  | "other";

export type InferenceSource = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";

export type StorageProvider = "indexeddb" | "cloud_pending" | "cloud_synced";

export type SupportedPhotoMimeType = "image/jpeg" | "image/png" | "image/webp";

/**
 * 8 Approved Inspection Domain Categories for ForeSite Hybrid AI
 */
export type InspectionCategory =
  | "structural"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "fire_safety"
  | "general"
  | "environmental"
  | "finishes";

/**
 * State-based Automatic Cloud Fallback Preference Contract
 */
export type PreferenceSyncStatus = "synced" | "pending" | "failed" | "unavailable";
export type PreferenceSource = "firestore" | "local" | "default";

export interface CloudFallbackPreference {
  enabled: boolean;
  source: PreferenceSource;
  syncStatus: PreferenceSyncStatus;
}

/**
 * ForeSite AI Generated Draft Output Schema
 */
export interface AIInspectionDraftOutput {
  title: string;
  observation: string;
  category: InspectionCategory;
  visibleEvidence: string[];
  uncertainties: string[];
  inspectorFollowUp: string[];
  aiDisclaimer: string;
}

export interface AIInspectionDraftResult {
  draft: AIInspectionDraftOutput;
  inferenceSource: InferenceSource;
  rawResponse?: string;
}

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
  preferences?: {
    autoCloudFallback?: boolean;
  };
}

export interface Project {
  id: string;
  ownerUid?: string;
  name: string;
  siteLabel: string;
  location?: string;
  description?: string;
  inspectionCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface InspectionPhotoMeta {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: SupportedPhotoMimeType;
  storageProvider: StorageProvider;
  storagePath?: string;
  hasLocalBlob: boolean;
  capturedAt: number;
}

/**
 * Original Local Photograph Evidence Record
 * Stored exclusively in browser IndexedDB (Store: 'evidencePhotos')
 * NEVER uploaded as binary to Firestore!
 */
export interface LocalEvidencePhoto {
  id: string;
  inspectionId: string;
  projectId: string;
  blob: Blob;
  fileName: string;
  fileSizeBytes: number;
  mimeType: SupportedPhotoMimeType;
  caption?: string;
  capturedAt: number;
  createdAt: number;
}

/**
 * Structured Checklist Item (Phase 5 Section 1.1 & Section 8)
 */
export interface ChecklistItem {
  id: string;
  status?: string;
  notes?: string;
  recommendation?: string;
  [key: string]: unknown;
}

/**
 * Local Inspection Draft Record
 * Stored in browser IndexedDB (Store: 'localInspections')
 * Allows resilient recovery of unfinished inspection notes and evidence.
 */
export interface LocalDraftInspection {
  id: string;
  ownerUid?: string;
  projectId: string;
  projectName?: string;
  title: string;
  observation: string;
  category: ObservationCategory;
  summary?: string;
  weatherNotes?: string;
  items?: ChecklistItem[];
  visibleEvidence: string[];
  uncertainties: string[];
  inspectorFollowUp: string[];
  photoIds: string[];
  isSynced: boolean;
  reviewStatus?: ReviewStatus;
  reviewHistory?: ReviewAuditEvent[];
  revision?: number;
  reviewedAt?: number;
  reviewedByUid?: string;
  lastSavedAt: number;
  createdAt: number;
  isArchived?: boolean;
  archivedAt?: number | null;
  archivedByUid?: string | null;
  archiveReason?: string | null;
  appliedMutationIds?: string[];
  deletionStage?: DeletionCleanupStage;
}

export interface Inspection {
  id: string;
  ownerUid?: string;
  projectId: string;
  projectName: string;
  title: string;
  observation: string;
  category: ObservationCategory;
  summary?: string;
  weatherNotes?: string;
  items?: ChecklistItem[];
  visibleEvidence: string[];
  uncertainties: string[];
  inspectorFollowUp: string[];
  reviewStatus: ReviewStatus;
  reviewHistory?: ReviewAuditEvent[];
  revision?: number;
  aiAssisted: boolean;
  inferenceSource?: InferenceSource;
  photoMeta?: InspectionPhotoMeta;
  photoIds?: string[];
  isLocalDraft?: boolean;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewedByUid?: string;
  clientCreationNonce?: string;
  isArchived?: boolean;
  archivedAt?: number | null;
  archivedByUid?: string | null;
  archiveReason?: string | null;
  appliedMutationIds?: string[];
}

export interface AppStats {
  totalProjects: number;
  totalInspections: number;
  pendingReviews: number;
  approvedCount: number;
  rejectedCount: number;
  onDeviceInferences: number;
  cloudInferences: number;
  localPhotosCount?: number;
  localDraftsCount?: number;
}

export interface StorageEstimateInfo {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  usagePercentage: number;
  persisted: boolean;
}

export interface PhotoValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * ForeSite Phase 5 Stage 2: Offline Mutation Queue Foundation
 */

export type MutationType =
  | "CREATE_INSPECTION"
  | "UPDATE_DRAFT"
  | "TRANSITION_REVIEW"
  | "ARCHIVE_INSPECTION"
  | "UNARCHIVE_INSPECTION"
  | "DELETE_INSPECTION";

export type MutationStatus =
  | "queued"              // Ready for FIFO replay
  | "in_flight"           // Currently processing attempt
  | "succeeded"           // Confirmed committed
  | "failed"              // Retryable transient failure with backoff
  | "failed_exhausted"    // Terminal retry limit reached (5 attempts)
  | "conflict"            // Domain conflict or security rule rejection
  | "paused_on_conflict"  // Paused behind earlier conflicting mutation
  | "cancelled_by_user";  // Cancelled by user before execution

export interface CreateInspectionPayload {
  type: "CREATE_INSPECTION";
  inspection: Omit<Inspection, "id"> & { id?: string };
}

export interface UpdateDraftPayload {
  type: "UPDATE_DRAFT";
  title?: string;
  observation?: string;
  category?: ObservationCategory;
  summary?: string;
  weatherNotes?: string;
  items?: ChecklistItem[];
  visibleEvidence?: string[];
  uncertainties?: string[];
  inspectorFollowUp?: string[];
  photoIds?: string[];
  baseSnapshot?: Partial<Inspection>;
}

export interface TransitionReviewPayload {
  type: "TRANSITION_REVIEW";
  fromStatus: ReviewStatus;
  targetStatus: ReviewStatus;
  reviewerUid: string;
  comment?: string;
  auditEventId: string;
}

export interface ArchiveInspectionPayload {
  type: "ARCHIVE_INSPECTION";
  reason?: string;
  archivedAt?: number;
}

export interface UnarchiveInspectionPayload {
  type: "UNARCHIVE_INSPECTION";
  unarchivedAt?: number;
}

export interface DeleteInspectionPayload {
  type: "DELETE_INSPECTION";
  deletedAt?: number;
  cleanupReceiptId?: string;
}

export type MutationPayload =
  | CreateInspectionPayload
  | UpdateDraftPayload
  | TransitionReviewPayload
  | ArchiveInspectionPayload
  | UnarchiveInspectionPayload
  | DeleteInspectionPayload;

export interface MutationRecord {
  id: string;                         // Unique mutation ID (e.g. mut-...)
  ownerUid: string;                   // Authenticated owner UID
  targetInspectionId: string;         // Canonical inspection ID
  type: MutationType;                 // Mutation category discriminator
  payload: MutationPayload;           // Strongly typed discriminated payload
  baseRevision: number;               // Revision on which mutation was based
  sequenceNumber: number;             // Monotonic sequence number per owner
  status: MutationStatus;             // Current queue status
  retryCount: number;                 // Attempts already made (0 to maxRetries)
  maxRetries: number;                 // Maximum retry limit (default 5)
  nextRetryAt?: number | null;        // Scheduled execution timestamp (ms)
  lastAttemptedAt?: number | null;    // Timestamp of last attempt (ms)
  createdAt: number;                  // Creation timestamp (ms)
  updatedAt: number;                  // Last status change timestamp (ms)
  failureReason?: string;             // Non-sensitive error description
  conflictReason?: string;            // Non-sensitive conflict reason
  conflictDetails?: ConflictDetails;  // Structured conflict comparison details
}

export type PendingMutation = MutationRecord;

export interface QueueSummary {
  total: number;
  queued: number;
  inFlight: number;
  succeeded: number;
  failed: number;
  failedExhausted: number;
  conflict: number;
  pausedOnConflict: number;
  cancelled: number;
  pendingCount: number;
  succeededCount: number;
  failedCount: number;
  conflictCount: number;
  cancelledCount: number;
  oldestPendingCreatedAt: number | null;
  newestPendingCreatedAt: number | null;
}

export interface EnqueueMutationParams {
  ownerUid: string;
  targetInspectionId: string;
  type: MutationType;
  payload: MutationPayload;
  baseRevision?: number;
  maxRetries?: number;
  now?: number;
}

export interface TransitionStatusParams {
  ownerUid: string;
  mutationId: string;
  targetStatus: MutationStatus;
  failureReason?: string;
  conflictReason?: string;
  conflictDetails?: ConflictDetails;
  now?: number;
}

export interface RecordAttemptParams {
  ownerUid: string;
  mutationId: string;
  isTransientFailure: boolean;
  failureReason?: string;
  error?: string;
  jitterMs?: number;
  now?: number;
}

/**
 * ForeSite Phase 5 Stage 3A: Replay Infrastructure and Pilot Types
 */

export type ReplayStatus =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "LOCKED_BY_ANOTHER_TAB"
  | "WEB_LOCKS_UNAVAILABLE"
  | "UNAUTHENTICATED"
  | "USER_SWITCHED"
  | "ERROR";

export interface ReplayItemResult {
  mutationId: string;
  targetInspectionId: string;
  type: MutationType;
  status: MutationStatus;
  error?: string;
}

export interface ReplayResult {
  status: ReplayStatus;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  conflictCount: number;
  itemResults: ReplayItemResult[];
  message?: string;
}

export interface LockCoordinator {
  requestLock<T>(
    lockName: string,
    callback: () => Promise<T>
  ): Promise<{ acquired: boolean; result?: T; reason?: string; unsupported?: boolean }>;
}

export interface ReplayOptions {
  lockCoordinator?: LockCoordinator;
  maxMutations?: number;
  now?: number;
}

export type InspectionSyncState =
  | "synced"
  | "syncing"
  | "waiting_to_sync"
  | "sync_failed"
  | "conflict"
  | "sync_cancelled"
  | "local_only";

export interface GetSyncStatusOptions {
  isRemote?: boolean;
  isLocalDraft?: boolean;
}

export interface InspectionSyncStatus {
  state: InspectionSyncState;
  label: string;
  mutationId?: string;
  mutationStatus?: MutationStatus;
  retryCount?: number;
  maxRetries?: number;
  lastAttemptedAt?: number | null;
  nextRetryAt?: number | null;
  failureReason?: string;
  conflictReason?: string;
}

export interface TransactionalCreateResult {
  status: "CREATED" | "ALREADY_EXISTS_SAME_MUTATION" | "CONFLICT";
  reason?: string;
  inspection?: Inspection;
  conflictDetails?: ConflictDetails;
}

export type TransactionalMutationStatus =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "CONFLICT"
  | "DELETED"
  | "NOT_FOUND";

export interface TransactionalMutationResult {
  status: TransactionalMutationStatus;
  reason?: string;
  inspection?: Inspection;
  conflictDetails?: ConflictDetails;
}

/**
 * ForeSite Phase 5 Stage 4A: Three-Way Merge Engine & Review Reconciliation
 */

export type ConflictCategory =
  | "SCALAR_FIELD"
  | "CHECKLIST_FIELD"
  | "CHECKLIST_EDIT_DELETE"
  | "ARRAY_FIELD"
  | "REVIEW_STATUS"
  | "ARCHIVE_STATE"
  | "INCOMPATIBLE_DATA";

export interface FieldConflict {
  field: string;
  itemId?: string;
  category: ConflictCategory;
  baseValue: unknown;
  localValue: unknown;
  remoteValue: unknown;
  message?: string;
}

export interface ConflictDetails {
  conflicts: FieldConflict[];
  baseSnapshot?: Partial<Inspection>;
  localSnapshot?: Partial<Inspection>;
  remoteSnapshot?: Partial<Inspection>;
  reviewReconciliation?: ReviewReconciliationResult;
  detectedAt: number;
}

export interface ReviewReconciliationResult {
  resolved: boolean;
  outcomeStatus: ReviewStatus | null; // Strictly null on human conflict or invalid transition
  currentRemoteStatus: ReviewStatus;
  pendingLocalStatus: ReviewStatus;
  conflictType: "CONCURRENT_HUMAN_CONFLICT" | "INVALID_TRANSITION" | null;
  requiresHumanResolution: boolean;
  reason: string;
}

export type MergeConflictType =
  | "CONCURRENT_HUMAN_CONFLICT"
  | "FIELD_CONFLICT"
  | "INVALID_INPUT"
  | null;

export interface MergeResult<T = Inspection> {
  success: boolean;
  hasConflicts: boolean;
  conflictType: MergeConflictType;
  mergedData?: T;
  conflicts: FieldConflict[];
  reviewReconciliation: ReviewReconciliationResult;
  requiresHumanResolution: boolean;
  reason?: string;
}

export type FieldClassificationCategory =
  | "THREE_WAY_MERGED"
  | "HUMAN_REVIEW_PROTECTED"
  | "SYSTEM_MANAGED"
  | "IMMUTABLE_IDENTITY"
  | "CONFLICT_MANUAL_RESOLUTION"
  | "EXCLUDED_FROM_MERGE";

// ============================================================================
// Phase 5 Stage 4C: Staged Four-Stage Photo Cleanup Lifecycle & Deletion Receipts
// ============================================================================

export type DeletionCleanupStage =
  | "pending_remote_delete"               // Stage 1: Deletion enqueued; local draft marked; Blobs preserved
  | "remote_confirmed_pending_blob_purge"  // Stage 3: Remote Firestore deletion confirmed; Blobs pending safe purge
  | "completed"                           // Stage 4: Blobs purged safely; draft removed; receipt finalized
  | "failed";                             // Cleanup failed / requires retry or recovery

export interface DeletionReceipt {
  id: string;                             // Deterministic identifier: `del-rcpt-${inspectionId}`
  inspectionId: string;                   // Canonical target inspection ID
  ownerUid: string;                       // Authenticated owner UID
  mutationId?: string;                    // Associated mutation ID
  stage: DeletionCleanupStage;            // Current lifecycle stage
  photoIds: string[];                     // List of photo IDs associated with the inspection
  deletedPhotoIds: string[];              // List of photo IDs confirmed deleted from IndexedDB
  retainedPhotoIds: string[];             // List of photo IDs retained due to active cross-references
  photosDeletedCount: number;             // Count of Blobs removed
  createdAt: number;                      // Receipt creation timestamp (Stage 1)
  remoteConfirmedAt?: number;             // Timestamp remote deletion confirmed (Stage 3)
  completedAt?: number;                   // Timestamp cleanup finalized (Stage 4)
  error?: string;                         // Last error message if failed
  retryCount?: number;                    // Cleanup retry attempts
}

export interface CleanupExecutionResult {
  receiptId: string;
  inspectionId: string;
  stage: DeletionCleanupStage;
  deletedPhotosCount: number;
  retainedPhotosCount: number;
  error?: string;
  draftPurged: boolean;
}

export interface CleanupRecoveryResult {
  inspectedReceiptsCount: number;
  recoveredCount: number;
  failedCount: number;
  results: CleanupExecutionResult[];
}


