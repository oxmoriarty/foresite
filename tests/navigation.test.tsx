import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "../src/App";

describe("ForeSite Application Shell Navigation", () => {
  it("renders the header and navigation landmarks with ForeSite branding", () => {
    render(<App />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByText("ForeSite").length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Main Navigation" })).toBeInTheDocument();
  });

  it("defaults to Overview screen and displays metric statistics", () => {
    render(<App />);
    expect(screen.getByText("Inspection Overview")).toBeInTheDocument();
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

  it("navigates to Settings screen and shows storage configuration", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const settingsTab = within(nav).getByRole("button", { name: /^settings$/i });
    fireEvent.click(settingsTab);

    expect(screen.getByText("Settings & Preferences")).toBeInTheDocument();
    expect(screen.getByText("Local Storage & Capacity")).toBeInTheDocument();
  });

  it("navigates to Uploads screen when Uploads is clicked in navigation", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    const syncTab = within(nav).getByRole("button", { name: /uploads/i });
    fireEvent.click(syncTab);

    expect(screen.getByRole("heading", { name: "Uploads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export diagnostics/i })).toBeInTheDocument();
  });

  it("navigates back to Dashboard when Dashboard is clicked in sidebar", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main Navigation" });
    // Navigate away to projects
    fireEvent.click(within(nav).getByRole("button", { name: /^projects$/i }));
    expect(screen.getByText("Inspection Projects")).toBeInTheDocument();

    // Navigate back to Dashboard
    fireEvent.click(within(nav).getByRole("button", { name: /dashboard/i }));
    expect(screen.getByText("Inspection Overview")).toBeInTheDocument();
  });

  it("collapses and expands the sidebar using the collapse control", () => {
    render(<App />);
    const collapseBtn = screen.getByRole("button", { name: /collapse sidebar/i });
    fireEvent.click(collapseBtn);

    // Expand control is now visible
    const expandBtn = screen.getByRole("button", { name: /expand sidebar/i });
    expect(expandBtn).toBeInTheDocument();

    // Click expand
    fireEvent.click(expandBtn);
    expect(screen.getByRole("button", { name: /collapse sidebar/i })).toBeInTheDocument();
  });

  it("opens the user profile menu in top navbar and shows inspector details and sign out", () => {
    render(<App />);
    const profileBtn = screen.getByRole("button", { name: /user profile menu/i });
    fireEvent.click(profileBtn);

    expect(screen.getByText("Lead Site Inspector")).toBeInTheDocument();
    expect(screen.getByText("inspector@foresite.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("opens mobile navigation drawer and navigates to selected destination", () => {
    render(<App />);
    const menuBtn = screen.getByRole("button", { name: /open navigation menu/i });
    fireEvent.click(menuBtn);

    // Mobile drawer is open
    const drawer = screen.getByRole("dialog", { name: /navigation drawer/i });
    expect(drawer).toBeInTheDocument();

    // Click Projects within mobile drawer
    const mobileProjectsBtn = within(drawer).getByRole("button", { name: /^projects$/i });
    fireEvent.click(mobileProjectsBtn);

    // Drawer closes and Projects screen is rendered
    expect(screen.getByText("Inspection Projects")).toBeInTheDocument();
  });
});
