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

    // Should now be on the Sign In page with target destination banner
    expect(
      screen.getByText("Sign in to access your inspection workspace")
    ).toBeInTheDocument();
    expect(screen.getByText(/please sign in to access/i)).toBeInTheDocument();
    expect(screen.getByText("Inspections")).toBeInTheDocument();

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

    // Should be on Sign in page with Project Creation banner
    expect(
      screen.getByText("Sign in to access your inspection workspace")
    ).toBeInTheDocument();
    expect(screen.getByText("Project Creation")).toBeInTheDocument();

    // Authenticate
    const demoLoginBtn = screen.getByRole("button", { name: /continue as demo inspector/i });
    fireEvent.click(demoLoginBtn);

    // Should be redirected to Projects and show Create Project modal
    await waitFor(() => {
      expect(screen.getByText("Create Inspection Project")).toBeInTheDocument();
    });
  });

  it("redirects direct unauthenticated access to a protected page to Sign in screen", () => {
    render(<App initialView="projects" initialUser={null} />);
    expect(
      screen.getByText("Sign in to access your inspection workspace")
    ).toBeInTheDocument();
  });
});