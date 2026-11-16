import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "../src/App";

describe("ForeSite Application Shell Navigation", () => {
  it("renders the header with ForeSite branding and navigation landmarks", () => {
    render(<App />);
    const header = screen.getByRole("banner");
    expect(within(header).getByText("ForeSite")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main Navigation" })).toBeInTheDocument();
  });

  it("defaults to Overview screen and displays metric statistics", () => {
    render(<App />);
    expect(screen.getByText("Inspection Workspace Overview")).toBeInTheDocument();
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Pending Reviews")).toBeInTheDocument();
  });

  it("navigates to Projects screen when Projects tab is clicked", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const projectsTab = within(nav).getByRole("button", { name: /^projects$/i });
    fireEvent.click(projectsTab);

    expect(screen.getByText("Inspection Projects")).toBeInTheDocument();
    expect(screen.getByText("Metro North Station Redevelopment")).toBeInTheDocument();
  });

  it("navigates to Inspections screen and displays inspection items", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const inspectionsTab = within(nav).getByRole("button", { name: /inspections/i });
    fireEvent.click(inspectionsTab);

    expect(screen.getByText("Site Inspections")).toBeInTheDocument();
    expect(screen.getByText("Rebar Spacing & Cover Depth — Pier Footing 4")).toBeInTheDocument();
  });

  it("navigates to Settings screen and shows storage invariants", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const settingsTab = within(nav).getByRole("button", { name: /^settings$/i });
    fireEvent.click(settingsTab);

    expect(screen.getByText("Settings & Architecture Policy")).toBeInTheDocument();
    expect(screen.getByText("Local Photograph Retention (IndexedDB)")).toBeInTheDocument();
    expect(screen.getByText("Zero-Billing & Data Security Invariants")).toBeInTheDocument();
  });
});
