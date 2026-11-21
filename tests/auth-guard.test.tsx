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

  it("intercepts View Demo CTA when unauthenticated and redirects to overview after login", async () => {
    render(<App initialView="landing" initialUser={null} />);

    // Click "View Demo" CTA in hero
    const viewDemoBtn = screen.getByRole("button", { name: /view demo/i });
    fireEvent.click(viewDemoBtn);

    // Should be on Sign in page
    expect(
      screen.getByRole("button", { name: /continue as demo inspector/i })
    ).toBeInTheDocument();

    // Authenticate
    const demoLoginBtn = screen.getByRole("button", { name: /continue as demo inspector/i });
    fireEvent.click(demoLoginBtn);

    // Should be redirected to Overview workspace
    await waitFor(() => {
      expect(screen.getByText("Inspection Workspace Overview")).toBeInTheDocument();
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