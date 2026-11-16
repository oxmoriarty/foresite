import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Button } from "../src/components/ui/Button";
import { Badge } from "../src/components/ui/Badge";
import { Modal } from "../src/components/ui/Modal";
import { EmptyState } from "../src/components/ui/EmptyState";
import { DisclaimerBanner } from "../src/components/ui/DisclaimerBanner";

describe("ForeSite Reusable UI Components", () => {
  describe("Button Component", () => {
    it("renders children and handles click events", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Save Record</Button>);
      const button = screen.getByRole("button", { name: "Save Record" });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("disables interaction when loading", () => {
      render(<Button loading>Processing</Button>);
      const button = screen.getByRole("button", { name: "Processing" });
      expect(button).toBeDisabled();
    });
  });

  describe("Badge Component", () => {
    it("renders correct label for review statuses", () => {
      const { rerender } = render(<Badge variant="status" status="draft_generated" />);
      expect(screen.getByText("Draft Generated")).toBeInTheDocument();

      rerender(<Badge variant="status" status="approved" />);
      expect(screen.getByText("Approved")).toBeInTheDocument();

      rerender(<Badge variant="status" status="rejected" />);
      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });

    it("renders correct label for inference sources", () => {
      const { rerender } = render(<Badge variant="source" source="ON_DEVICE" />);
      expect(screen.getByText("On-Device (Nano)")).toBeInTheDocument();

      rerender(<Badge variant="source" source="IN_CLOUD" />);
      expect(screen.getByText("Cloud (Gemini)")).toBeInTheDocument();
    });
  });

  describe("Modal Component", () => {
    it("renders content when open and fires onClose on close button", () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Inspection Modal">
          <p>Modal body content</p>
        </Modal>
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Inspection Modal")).toBeInTheDocument();
      expect(screen.getByText("Modal body content")).toBeInTheDocument();

      const closeBtn = screen.getByRole("button", { name: /close dialog/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("does not render when isOpen is false", () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Hidden Modal">
          <p>Hidden</p>
        </Modal>
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("EmptyState Component", () => {
    it("renders title, description and calls onAction", () => {
      const handleAction = vi.fn();
      render(
        <EmptyState
          title="No Items"
          description="Nothing to display"
          actionLabel="Add Item"
          onAction={handleAction}
        />
      );

      expect(screen.getByText("No Items")).toBeInTheDocument();
      expect(screen.getByText("Nothing to display")).toBeInTheDocument();
      const actionBtn = screen.getByRole("button", { name: "Add Item" });
      fireEvent.click(actionBtn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("DisclaimerBanner Component", () => {
    it("renders mandatory human-in-the-loop warning", () => {
      render(<DisclaimerBanner />);
      expect(screen.getByText("Mandatory Human-in-the-Loop Review")).toBeInTheDocument();
    });
  });
});
