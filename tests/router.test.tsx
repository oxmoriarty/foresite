import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { parseRouteFromPath, buildPathFromState } from "../src/utils/router";
import { App } from "../src/App";

vi.mock("../src/services/remoteConfig", () => ({
  initRemoteConfig: vi.fn().mockResolvedValue(null),
}));

describe("ForeSite URL Router & History Navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  describe("parseRouteFromPath & buildPathFromState", () => {
    it("parses and builds root, dashboard, demo, settings, sync, and signin routes", () => {
      expect(parseRouteFromPath("/")).toEqual({ view: "landing", projectId: null, inspectionId: null });
      expect(buildPathFromState("landing")).toBe("/");

      expect(parseRouteFromPath("/dashboard")).toEqual({ view: "overview", projectId: null, inspectionId: null });
      expect(buildPathFromState("overview")).toBe("/dashboard");

      expect(parseRouteFromPath("/demo")).toEqual({ view: "demo", projectId: null, inspectionId: null });
      expect(buildPathFromState("demo")).toBe("/demo");

      expect(parseRouteFromPath("/settings")).toEqual({ view: "settings", projectId: null, inspectionId: null });
      expect(buildPathFromState("settings")).toBe("/settings");

      expect(parseRouteFromPath("/uploads")).toEqual({ view: "uploads", projectId: null, inspectionId: null });
      expect(parseRouteFromPath("/sync")).toEqual({ view: "uploads", projectId: null, inspectionId: null });
      expect(buildPathFromState("uploads")).toBe("/uploads");

      expect(parseRouteFromPath("/signin")).toEqual({ view: "signin", projectId: null, inspectionId: null });
      expect(buildPathFromState("signin")).toBe("/signin");
    });

    it("parses and builds /project and /project/:projectId routes", () => {
      expect(parseRouteFromPath("/project")).toEqual({
        view: "projects",
        projectId: null,
        inspectionId: null,
      });
      expect(buildPathFromState("projects")).toBe("/project");

      expect(parseRouteFromPath("/project/proj-metro-01")).toEqual({
        view: "inspections",
        projectId: "proj-metro-01",
        inspectionId: null,
      });
      expect(buildPathFromState("inspections", "proj-metro-01")).toBe("/project/proj-metro-01");
    });

    it("parses and builds /inspection and /project/:projectId/inspection/:inspectionId routes", () => {
      expect(parseRouteFromPath("/inspection")).toEqual({
        view: "inspections",
        projectId: null,
        inspectionId: null,
      });
      expect(buildPathFromState("inspections")).toBe("/inspection");

      expect(parseRouteFromPath("/project/proj-metro-01/inspection/insp-001")).toEqual({
        view: "inspections",
        projectId: "proj-metro-01",
        inspectionId: "insp-001",
      });
      expect(buildPathFromState("inspections", "proj-metro-01", "insp-001")).toBe(
        "/project/proj-metro-01/inspection/insp-001"
      );
    });
  });

  describe("Browser History, Deep Linking & Back Button Integration", () => {
    it("updates browser URL when navigating between views and handles popstate Back button", async () => {
      render(<App initialPath="/dashboard" />);

      expect(screen.getByText("Inspection Overview")).toBeInTheDocument();

      // Navigate to Projects
      const nav = screen.getByRole("navigation", { name: "Main Navigation" });
      const projectsBtn = nav.querySelector('button[aria-label*="Projects"]') || screen.getByRole("button", { name: /^projects$/i });
      fireEvent.click(projectsBtn);

      await waitFor(() => {
        expect(screen.getByText("Inspection Projects")).toBeInTheDocument();
      });
      expect(window.location.pathname).toBe("/project");

      // Simulate browser Back button to /dashboard
      window.history.replaceState({}, "", "/dashboard");
      fireEvent(window, new PopStateEvent("popstate"));

      await waitFor(() => {
        expect(screen.getByText("Inspection Overview")).toBeInTheDocument();
      });
    });

    it("deep links directly to a specific project (/project/proj-metro-01)", async () => {
      render(<App initialPath="/project/proj-metro-01" />);

      await waitFor(() => {
        expect(screen.getByText("Site Inspections")).toBeInTheDocument();
        expect(screen.getByText("Rebar Spacing & Cover Depth — Pier Footing 4")).toBeInTheDocument();
      });
    });

    it("deep links directly to a specific inspection page (/project/proj-metro-01/inspection/insp-rebar-01)", async () => {
      render(<App initialPath="/project/proj-metro-01/inspection/insp-rebar-01" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /back to inspections/i })).toBeInTheDocument();
        expect(
          screen.getByRole("heading", { name: /Rebar Spacing & Cover Depth — Pier Footing 4/i })
        ).toBeInTheDocument();
      });

      // Simulate browser Back button returning to /project/proj-metro-01 list view
      window.history.replaceState({}, "", "/project/proj-metro-01");
      fireEvent(window, new PopStateEvent("popstate"));

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /back to inspections/i })).not.toBeInTheDocument();
        expect(screen.getByText("Site Inspections")).toBeInTheDocument();
      });
    });
  });
});
