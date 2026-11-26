import { ViewMode } from "../types";

export interface ParsedRoute {
  view: ViewMode;
  projectId: string | null;
  inspectionId: string | null;
}

/**
 * Parses a URL pathname into ForeSite's active view, projectId, and inspectionId.
 */
export function parseRouteFromPath(pathname: string): ParsedRoute {
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");

  if (normalized === "" || normalized === "/") {
    return { view: "landing", projectId: null, inspectionId: null };
  }

  const segments = normalized.split("/").filter(Boolean);
  const first = segments[0]?.toLowerCase();

  if (first === "dashboard" || first === "overview") {
    return { view: "overview", projectId: null, inspectionId: null };
  }
  if (first === "demo") {
    return { view: "demo", projectId: null, inspectionId: null };
  }
  if (first === "signin" || first === "login") {
    return { view: "signin", projectId: null, inspectionId: null };
  }
  if (first === "settings") {
    return { view: "settings", projectId: null, inspectionId: null };
  }
  if (first === "sync" || first === "uploads") {
    return { view: "sync", projectId: null, inspectionId: null };
  }

  // /project or /projects
  if (first === "project" || first === "projects") {
    const projectId = segments[1] ? decodeURIComponent(segments[1]) : null;
    if (!projectId) {
      return { view: "projects", projectId: null, inspectionId: null };
    }

    const third = segments[2]?.toLowerCase();
    const inspectionId =
      (third === "inspection" || third === "inspections") && segments[3]
        ? decodeURIComponent(segments[3])
        : null;

    return {
      view: "inspections",
      projectId,
      inspectionId,
    };
  }

  // /inspection or /inspections
  if (first === "inspection" || first === "inspections") {
    const inspectionId = segments[1] ? decodeURIComponent(segments[1]) : null;
    return {
      view: "inspections",
      projectId: null,
      inspectionId,
    };
  }

  return { view: "landing", projectId: null, inspectionId: null };
}

/**
 * Builds the canonical URL pathname from ForeSite's navigation state.
 */
export function buildPathFromState(
  view: ViewMode,
  projectId?: string | null,
  inspectionId?: string | null
): string {
  switch (view) {
    case "landing":
      return "/";
    case "overview":
      return "/dashboard";
    case "demo":
      return "/demo";
    case "signin":
      return "/signin";
    case "settings":
      return "/settings";
    case "sync":
      return "/sync";
    case "projects":
      return "/project";
    case "inspections":
      if (projectId && inspectionId) {
        return `/project/${encodeURIComponent(projectId)}/inspection/${encodeURIComponent(inspectionId)}`;
      }
      if (projectId) {
        return `/project/${encodeURIComponent(projectId)}`;
      }
      if (inspectionId) {
        return `/inspection/${encodeURIComponent(inspectionId)}`;
      }
      return "/inspection";
    default:
      return "/";
  }
}
