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

const SAMPLE_PHOTO_FALLBACKS: Record<string, string> = {
  "insp-rebar-01": "/images/inspector-tablet.jpg",
  "insp-honeycomb-02": "/images/yellow-rig-3d.jpg",
  "insp-shoring-03": "/images/ecosystem-orb-3d.jpg",
  "photo-001": "/images/inspector-tablet.jpg",
  "photo-002": "/images/yellow-rig-3d.jpg",
  "photo-003": "/images/ecosystem-orb-3d.jpg",
};

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
 * React hook to load primary photos for an array of inspections
 */
export function useInspectionPhotoMap(inspections: Inspection[]) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const createdUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    async function loadThumbnails() {
      const urls: Record<string, string> = {};
      const newCreated: Record<string, string> = {};

      for (const insp of inspections) {
        let loadedUrl: string | undefined = undefined;

        // 1. Try querying local IndexedDB photos
        try {
          const photos = await getEvidencePhotosByInspection(insp.id);
          const primary = photos[0];
          if (primary && primary.blob) {
            loadedUrl = createPhotoPreviewUrl(primary.blob);
            newCreated[insp.id] = loadedUrl;
          }
        } catch {
          // Fall back gracefully
        }

        // 2. Fall back to sample photos if available
        if (!loadedUrl) {
          if (insp.photoMeta?.id && SAMPLE_PHOTO_FALLBACKS[insp.photoMeta.id]) {
            loadedUrl = SAMPLE_PHOTO_FALLBACKS[insp.photoMeta.id];
          } else if (SAMPLE_PHOTO_FALLBACKS[insp.id]) {
            loadedUrl = SAMPLE_PHOTO_FALLBACKS[insp.id];
          }
        }

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
  }, [inspections]);

  return photoUrls;
}
