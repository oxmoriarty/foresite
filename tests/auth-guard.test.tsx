import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import * as aiService from "../src/services/ai";

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
      screen.getByRole("button", { name: /continue as demo inspector/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/inspector@agency\.gov/i)
    ).toBeInTheDocument();

    // Click "Continue as Demo Inspector"
    const demoLoginBtn = screen.getByRole("button", { name: /continue as demo inspector/i });
    fireEvent.click(demoLoginBtn);

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
      screen.getByRole("button", { name: /continue as demo inspector/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/inspector@agency\.gov/i)
    ).toBeInTheDocument();

    // Authenticate
    const demoLoginBtn = screen.getByRole("button", { name: /continue as demo inspector/i });
    fireEvent.click(demoLoginBtn);

    // Should be redirected to Projects and show Create Project modal
    await waitFor(() => {
      expect(screen.getByText("Create Inspection Project")).toBeInTheDocument();
    });
  });

  it("renders View Demo button and Powered by Firebase AI Logic badge on landing page", () => {
    render(<App initialView="landing" initialUser={null} />);
    expect(screen.getByRole("button", { name: /view demo/i })).toBeInTheDocument();
    expect(screen.getByText("AI Logic")).toBeInTheDocument();
  });

  it("navigates directly to the interactive Demo Studio when clicking View Demo without authentication", async () => {
    render(<App initialView="landing" initialUser={null} />);

    // Click "View Demo" CTA in hero
    const viewDemoBtn = screen.getByRole("button", { name: /view demo/i });
    fireEvent.click(viewDemoBtn);

    // It MUST NOT require authentication; opens Demo Studio directly
    expect(screen.getByText(/ForeSite Demo Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/live sandbox/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a Site Scenario/i)).toBeInTheDocument();
  });

  it("allows testing live AI analysis and review verification in demo mode without signing in", async () => {
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
    });

    // Test Human review verification: Approve and Sign Off
    const approveBtn = screen.getByRole("button", { name: /approve and sign off/i });
    fireEvent.click(approveBtn);

    // Save inspection into isolated Demo Studio sandbox
    const saveBtn = screen.getByRole("button", { name: /save inspection/i });
    fireEvent.click(saveBtn);

    await waitFor(
      () => {
        expect(screen.getByText("Saved in Sandbox")).toBeInTheDocument();
        expect(screen.getByText(/Sandbox Saved Inspections \(1\)/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Sign into real workspace and verify Demo Studio inspection did NOT leak
    const signInWorkspaceBtn = screen.getByRole("button", { name: /sign in to real workspace/i });
    fireEvent.click(signInWorkspaceBtn);

    const demoLoginBtn = screen.getByRole("button", { name: /continue as demo inspector/i });
    fireEvent.click(demoLoginBtn);

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
      screen.getByRole("button", { name: /continue as demo inspector/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/inspector@agency\.gov/i)
    ).toBeInTheDocument();
  });
});