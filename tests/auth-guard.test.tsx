import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import * as aiService from "../src/services/ai";

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/auth")>();
  return {
    ...actual,
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({
      user: {
        uid: "test-inspector-01",
        email: "inspector@agency.gov",
        displayName: "Lead Site Inspector",
        emailVerified: true,
      },
    }),
  };
});

vi.mock("../src/services/userProfile", () => ({
  syncUserProfile: vi.fn().mockResolvedValue({
    uid: "test-inspector-01",
    email: "inspector@agency.gov",
    displayName: "Lead Site Inspector",
    emailVerified: true,
    role: "inspector",
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  }),
  updateLastLoginTimestamp: vi.fn().mockResolvedValue(undefined),
  updateUserDisplayName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof aiService>();
  return {
    ...actual,
    generateInspectionDraft: vi.fn().mockResolvedValue({
      draft: {
        title: "Rebar Spacing and Cover Depth Verification",
        category: "installation",
        visibleEvidence: ["Reinforcement rebar mat placed in trench"],
        uncertainties: ["Cover depth needs gauge check"],
        inspectorFollowUp: ["Verify depth gauge before pour"],
        observation: "Visual inspection confirms rebar mat placement.",
        aiDisclaimer: "AI_DRAFT_REQUIRES_HUMAN_REVIEW",
      },
      inferenceSource: "ON_DEVICE",
    }),
  };
});

describe("ForeSite Authentication Navigation Guard", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders the public landing page when unauthenticated", () => {
    render(<App initialView="landing" initialUser={null} />);
    expect(
      screen.getByText("Inspection intelligence for construction teams ready to build with speed.")
    ).toBeInTheDocument();
  });

  it("intercepts CTA click when unauthenticated, opens Sign in page, and redirects to target after login", async () => {
    render(<App initialView="landing" initialUser={null} />);

    // Click CTA "Start an inspection"
    const startInspectionBtn = screen.getByRole("button", { name: /start an inspection/i });
    fireEvent.click(startInspectionBtn);

    // Should now be on the Sign In page
    expect(
      screen.getByPlaceholderText(/inspector@agency\.gov/i)
    ).toBeInTheDocument();

    // Sign in with email and password
    fireEvent.change(screen.getByPlaceholderText(/inspector@agency\.gov/i), {
      target: { value: "inspector@agency.gov" },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in to workspace/i }));

    // Should now be automatically redirected to Inspections screen!
    await waitFor(() => {
      expect(screen.getByText("Site Inspections")).toBeInTheDocument();
      expect(screen.getByText("Rebar Spacing & Cover Depth — Pier Footing 4")).toBeInTheDocument();
    });
  });

  it("intercepts Create Project CTA when unauthenticated and opens project modal after login", async () => {
    render(<App initialView="landing" initialUser={null} />);

    // Click "Create Project" CTA in conversion banner
    const createProjectBtn = screen.getByRole("button", { name: /^create project$/i });
    fireEvent.click(createProjectBtn);

    // Should be on Sign in page
    expect(
      screen.getByPlaceholderText(/inspector@agency\.gov/i)
    ).toBeInTheDocument();

    // Authenticate
    fireEvent.change(screen.getByPlaceholderText(/inspector@agency\.gov/i), {
      target: { value: "inspector@agency.gov" },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in to workspace/i }));

    // Should be redirected to Projects and show Create Project modal
    await waitFor(() => {
      expect(screen.getByText("Create Inspection Project")).toBeInTheDocument();
    });
  });

  it("renders Try Demo button and Powered by Firebase AI Logic badge on landing page", () => {
    render(<App initialView="landing" initialUser={null} />);
    expect(screen.getByRole("button", { name: /try demo/i })).toBeInTheDocument();
    expect(screen.getByText("AI Logic")).toBeInTheDocument();
  });

  it("navigates directly to the interactive Demo Studio when clicking Try Demo without authentication", async () => {
    render(<App initialView="landing" initialUser={null} />);

    // Click "Try Demo" CTA in hero
    const viewDemoBtn = screen.getByRole("button", { name: /try demo/i });
    fireEvent.click(viewDemoBtn);

    // It MUST NOT require authentication; opens Demo Studio directly
    expect(screen.getByText(/ForeSite Demo Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/live sandbox/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a Site Scenario/i)).toBeInTheDocument();
  });

  it("allows testing live AI analysis in demo mode without signing in and keeps demo isolated", async () => {
    render(<App initialView="demo" initialUser={null} />);

    // Verify preloaded scenario is displayed
    expect(screen.getByText("Pier Footing Rebar Audit")).toBeInTheDocument();

    // Trigger AI analysis
    const runAiButtons = screen.getAllByRole("button", { name: /run ai analysis/i });
    expect(runAiButtons.length).toBeGreaterThan(0);
    fireEvent.click(runAiButtons[0]!);

    // Verify AI analysis output is generated
    await waitFor(() => {
      expect(screen.getByText("AI Draft Findings")).toBeInTheDocument();
      expect(screen.getByText("Rebar Spacing and Cover Depth Verification")).toBeInTheDocument();
    });

    // Sign into real workspace and verify Demo Studio findings did NOT leak
    const signInBtn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.click(signInBtn);

    fireEvent.change(screen.getByPlaceholderText(/inspector@agency\.gov/i), {
      target: { value: "inspector@agency.gov" },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in to workspace/i }));

    await waitFor(() => {
      expect(screen.getByText("Inspection Overview")).toBeInTheDocument();
    });

    // Navigate to Inspections and confirm the Demo Studio title is NOT in real records
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const inspectionsTab = nav.querySelector('button[aria-label*="Inspections"]') || screen.getByRole("button", { name: /inspections/i });
    fireEvent.click(inspectionsTab);

    await waitFor(() => {
      expect(screen.getByText("Site Inspections")).toBeInTheDocument();
    });
    expect(screen.queryByText("Rebar Spacing and Cover Depth Verification")).not.toBeInTheDocument();
  });

  it("redirects direct unauthenticated access to a protected page to Sign in screen", () => {
    render(<App initialView="projects" initialUser={null} />);
    expect(
      screen.getByPlaceholderText(/inspector@agency\.gov/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in to workspace/i })
    ).toBeInTheDocument();
  });
});