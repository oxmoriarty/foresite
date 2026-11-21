import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";

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
    expect(screen.getByText("ForeSite Interactive Studio")).toBeInTheDocument();
    expect(screen.getByText(/live testing sandbox/i)).toBeInTheDocument();
    expect(screen.getByText("Choose a Preloaded Site Scenario")).toBeInTheDocument();
  });

  it("allows testing live AI analysis and review verification in demo mode without signing in", async () => {
    render(<App initialView="demo" initialUser={null} />);

    // Verify preloaded scenario is displayed
    expect(screen.getByText("Pier Footing Rebar Audit")).toBeInTheDocument();

    // Trigger AI analysis
    const runAiBtn = screen.getByRole("button", { name: /run ai observation analysis/i });
    fireEvent.click(runAiBtn);

    // Verify AI analysis output is generated
    await waitFor(() => {
      expect(screen.getByText("Review Synthesized AI Draft Findings")).toBeInTheDocument();
      expect(screen.getByText("Mandatory Human Verification Policy")).toBeInTheDocument();
    });

    // Test Human review verification: Approve and Sign Off
    const approveBtn = screen.getByRole("button", { name: /approve and sign off/i });
    fireEvent.click(approveBtn);

    // Save inspection into local testing workspace
    const saveBtn = screen.getByRole("button", { name: /save inspection/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Saved to Workspace")).toBeInTheDocument();
    });
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