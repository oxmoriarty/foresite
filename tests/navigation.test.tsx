import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { App } from "../src/App";

describe("ForeSite Application Shell Navigation", () => {
  it("renders the header with ForeSite branding and navigation landmarks", () => {
    render(<App />);
    expect(screen.getByText("ForeSite")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("defaults to Overview screen and displays metric statistics", () => {
    render(<App />);
    expect(screen.getByText("Inspection Workspace Overview")).toBeInTheDocument();
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Pending Reviews")).toBeInTheDocument();
  });

  it("navigates to Projects screen when Projects tab is clicked", () => {
    render(<App />);
    const projectsTab = screen.getByRole("button", { name: /projects/i });
    fireEvent.click(projectsTab);

    expect(screen.getByText("Inspection Projects")).toBeInTheDocument();
    expect(screen.getByText("Metro North Station Redevelopment")).toBeInTheDocument();
  });

  it("navigates to Inspections screen and displays inspection items", () => {
    render(<App />);
    const inspectionsTab = screen.getByRole("button", { name: /inspections/i });
    fireEvent.click(inspectionsTab);

    expect(screen.getByText("Site Inspections")).toBeInTheDocument();
    expect(screen.getByText("Rebar Spacing & Cover Depth — Pier Footing 4")).toBeInTheDocument();
  });

  it("navigates to Settings screen and shows storage invariants", () => {
    render(<App />);
    const settingsTab = screen.getByRole("button", { name: /settings/i });
    fireEvent.click(settingsTab);

    expect(screen.getByText("Settings & Architecture Policy")).toBeInTheDocument();
    expect(screen.getByText("Local Photograph Retention (IndexedDB)")).toBeInTheDocument();
    expect(screen.getByText("Zero-Billing & Data Security Invariants")).toBeInTheDocument();
  });
});
