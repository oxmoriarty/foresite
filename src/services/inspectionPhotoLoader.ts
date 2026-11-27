/**
 * ForeSite Inspection Photo Loader
 *
 * Efficiently loads primary evidence photos for inspection cards
 * from IndexedDB Blobs, with safe fallback and object URL cleanup.
 */

import { useState, useEffect, useRef } from "react";
import { Inspection } from "../types";
import { getEvidencePhotosByInspection } from "./indexeddb";
import { createPhotoPreviewUrl, revokePhotoPreviewUrl } from "./photoValidation";

/**
 * Format relative time timestamp for cards
 */
export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "Recent";
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format category label cleanly
 */
export function formatCategory(cat: string): string {
  switch (cat) {
    case "installation":
      return "Installation & Framing";
    case "surface_condition":
      return "Surface & Concrete";
    case "equipment":
      return "Equipment & Clearances";
    case "safety":
      return "Safety Protocols";
    default:
      return cat.replace(/_/g, " ");
  }
}

/**
 * React hook to load primary photos and counts for an array of inspections
 */
export function useInspectionPhotoMap(inspections: Inspection[]): {
  photoUrls: Record<string, string>;
  photoCounts: Record<string, number>;
} {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const createdUrlsRef = useRef<Record<string, string>>({});
  const inspectionsRef = useRef<Inspection[]>(inspections);
  inspectionsRef.current = inspections;

  const inspectionKey = inspections
    .map((i) => `${i.id}:${i.photoIds?.join(",") || ""}:${i.updatedAt || i.createdAt || 0}`)
    .join("|");

  useEffect(() => {
    let isMounted = true;

    async function loadThumbnails() {
      const urls: Record<string, string> = {};
      const counts: Record<string, number> = {};
      const newCreated: Record<string, string> = {};

      for (const insp of inspectionsRef.current) {
        let loadedUrl: string | undefined = undefined;
        let count = 0;

        // Try querying local IndexedDB photos
        try {
          const photos = await getEvidencePhotosByInspection(insp.id);
          count = photos.length;
          const primary = photos[0];
          if (primary && primary.blob) {
            loadedUrl = createPhotoPreviewUrl(primary.blob);
            newCreated[insp.id] = loadedUrl;
          }
        } catch {
          // Fall back gracefully
        }

        counts[insp.id] = count;
        if (loadedUrl) {
          urls[insp.id] = loadedUrl;
        }
      }

      if (isMounted) {
        // Revoke any previous blob URLs that are no longer active
        Object.entries(createdUrlsRef.current).forEach(([id, url]) => {
          if (newCreated[id] !== url) {
            revokePhotoPreviewUrl(url);
          }
        });
        createdUrlsRef.current = newCreated;
        setPhotoUrls(urls);
        setPhotoCounts(counts);
      } else {
        Object.values(newCreated).forEach(revokePhotoPreviewUrl);
      }
    }

    loadThumbnails();

    return () => {
      isMounted = false;
      Object.values(createdUrlsRef.current).forEach(revokePhotoPreviewUrl);
      createdUrlsRef.current = {};
    };
  }, [inspectionKey]);

  return { photoUrls, photoCounts };
}
