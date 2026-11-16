/**
 * ForeSite Cloud Firestore Service Layer
 *
 * Implements owner-scoped subcollection access:
 * - /users/{uid} (User Profile)
 * - /users/{uid}/projects/{projectId} (Owner Projects)
 * - /users/{uid}/inspections/{inspectionId} (Owner Inspections)
 *
 * Invariants:
 * 1. Owner-scoped paths only: every read/write operates within /users/{uid}/...
 * 2. Immutable ownerUid: every record includes ownerUid matching the caller.
 * 3. Zero Binary Blobs: photos are never stored as binary in Firestore.
 */

import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db, hasValidConfig } from "../lib/firebase";
import { Project, Inspection, UserProfile } from "../types";

// ============================================================================
// 1. User Profile Management (/users/{uid})
// ============================================================================

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!hasValidConfig) return null;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export async function syncUserProfile(user: User): Promise<UserProfile> {
  const userRef = doc(db, "users", user.uid);
  const existing = await getUserProfile(user.uid);

  if (existing) {
    const updated: UserProfile = {
      ...existing,
      email: user.email,
      displayName: user.displayName || existing.displayName,
      emailVerified: user.emailVerified,
      lastLoginAt: Date.now(),
    };
    if (hasValidConfig) {
      await updateDoc(userRef, {
        email: updated.email,
        displayName: updated.displayName,
        emailVerified: updated.emailVerified,
        lastLoginAt: updated.lastLoginAt,
      });
    }
    return updated;
  }

  // Create initial profile document
  const newProfile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || (user.email ? (user.email.split("@")[0] ?? "Inspector") : "Inspector"),
    photoURL: user.photoURL || null,
    emailVerified: user.emailVerified,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    role: "Site Inspector",
  };

  if (hasValidConfig) {
    await setDoc(userRef, newProfile);
  }

  return newProfile;
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, "uid" | "createdAt">>
): Promise<void> {
  if (!hasValidConfig) return;
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, updates);
}

// ============================================================================
// 2. Project Subcollection (/users/{uid}/projects/{projectId})
// ============================================================================

export async function getUserProjects(uid: string): Promise<Project[]> {
  if (!hasValidConfig) return [];
  const projectsRef = collection(db, "users", uid, "projects");
  const q = query(projectsRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      name: data.name,
      siteLabel: data.siteLabel,
      location: data.location,
      inspectionCount: data.inspectionCount || 0,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
    } as Project;
  });
}

export async function createProject(
  uid: string,
  projectData: Omit<Project, "id" | "ownerUid" | "createdAt" | "updatedAt" | "inspectionCount"> & {
    inspectionCount?: number;
  }
): Promise<Project> {
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const newProject: Project = {
    id: projectId,
    ownerUid: uid,
    name: projectData.name,
    siteLabel: projectData.siteLabel,
    location: projectData.location,
    inspectionCount: projectData.inspectionCount || 0,
    createdAt: now,
    updatedAt: now,
  };

  if (hasValidConfig) {
    const projectRef = doc(db, "users", uid, "projects", projectId);
    await setDoc(projectRef, newProject);
  }

  return newProject;
}

export async function updateProject(
  uid: string,
  projectId: string,
  updates: Partial<Omit<Project, "id" | "ownerUid" | "createdAt">>
): Promise<void> {
  if (!hasValidConfig) return;
  const projectRef = doc(db, "users", uid, "projects", projectId);
  await updateDoc(projectRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteProject(uid: string, projectId: string): Promise<void> {
  if (!hasValidConfig) return;
  const projectRef = doc(db, "users", uid, "projects", projectId);
  await deleteDoc(projectRef);
}

// ============================================================================
// 3. Inspection Subcollection (/users/{uid}/inspections/{inspectionId})
// ============================================================================

export async function getUserInspections(
  uid: string,
  projectId?: string
): Promise<Inspection[]> {
  if (!hasValidConfig) return [];
  const inspectionsRef = collection(db, "users", uid, "inspections");
  const q = projectId
    ? query(
        inspectionsRef,
        where("projectId", "==", projectId),
        orderBy("createdAt", "desc")
      )
    : query(inspectionsRef, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ownerUid: data.ownerUid || uid,
      projectId: data.projectId,
      projectName: data.projectName,
      title: data.title,
      observation: data.observation,
      category: data.category,
      visibleEvidence: data.visibleEvidence || [],
      uncertainties: data.uncertainties || [],
      inspectorFollowUp: data.inspectorFollowUp || [],
      reviewStatus: data.reviewStatus,
      aiAssisted: data.aiAssisted ?? false,
      inferenceSource: data.inferenceSource,
      photoMeta: data.photoMeta,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      reviewedAt: data.reviewedAt,
      reviewedByUid: data.reviewedByUid,
    } as Inspection;
  });
}

export async function createInspection(
  uid: string,
  inspectionData: Omit<Inspection, "id" | "ownerUid" | "createdAt" | "updatedAt">
): Promise<Inspection> {
  const inspectionId = `insp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const newInspection: Inspection = {
    id: inspectionId,
    ownerUid: uid,
    ...inspectionData,
    createdAt: now,
    updatedAt: now,
  };

  if (hasValidConfig) {
    const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
    await setDoc(inspectionRef, newInspection);
  }

  return newInspection;
}

export async function updateInspection(
  uid: string,
  inspectionId: string,
  updates: Partial<Omit<Inspection, "id" | "ownerUid" | "createdAt">>
): Promise<void> {
  if (!hasValidConfig) return;
  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
  await updateDoc(inspectionRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

export async function deleteInspection(uid: string, inspectionId: string): Promise<void> {
  if (!hasValidConfig) return;
  const inspectionRef = doc(db, "users", uid, "inspections", inspectionId);
  await deleteDoc(inspectionRef);
}
