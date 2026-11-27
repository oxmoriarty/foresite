import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";

vi.mock("../src/services/remoteConfig", () => ({
  initRemoteConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/services/firestore", () => ({
  getUserProjects: vi.fn().mockResolvedValue([]),
  getUserInspections: vi.fn().mockResolvedValue([]),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  syncUserProfile: vi.fn().mockResolvedValue({}),
  getUserProfile: vi.fn().mockResolvedValue(null),
}));

describe("ForeSite Project Deletion Modal & Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders sleek Delete Project modal without Cascade Cleanup Warning and persists deletion across refresh", async () => {
    const { unmount } = render(<App initialView="projects" />);

    // Confirm initial starter project is visible
    expect(screen.getByText("Metro North Station Redevelopment")).toBeInTheDocument();

    // Click Delete icon button on the first project
    const deleteButtons = screen.getAllByTitle("Delete Project");
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]!);

    // Verify clean modal text and button
    expect(screen.getByText(/Delete Metro North Station Redevelopment\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cascade Cleanup Warning/i)).not.toBeInTheDocument();
    const confirmDeleteBtn = screen.getByRole("button", { name: /^Delete Project$/i });
    expect(confirmDeleteBtn).toBeInTheDocument();

    // Confirm deletion
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.queryByText("Metro North Station Redevelopment")).not.toBeInTheDocument();
    });

    // Simulate full page refresh (unmount and remount App)
    unmount();
    render(<App initialView="projects" />);

    // Deleted project MUST remain deleted after refresh
    expect(screen.queryByText("Metro North Station Redevelopment")).not.toBeInTheDocument();
  });
});
