import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { User } from "firebase/auth";

const UNVERIFIED_USER: User = {
  uid: "unverified-user-123",
  email: "inspector.unverified@citygov.org",
  displayName: "Jane Inspector",
  emailVerified: false,
} as unknown as User;

const VERIFIED_USER: User = {
  uid: "verified-user-123",
  email: "inspector.verified@citygov.org",
  displayName: "Jane Inspector",
  emailVerified: true,
} as unknown as User;

describe("ForeSite Email Verification Mandatory Security Gate", () => {
  it("strictly intercepts unverified users and displays the Verify Email security gate", () => {
    render(<App initialView="overview" initialUser={UNVERIFIED_USER} />);

    // Must show security gate header and title
    expect(screen.getByText("Verify Your Email Address")).toBeInTheDocument();
    expect(screen.getByText("Security Gate")).toBeInTheDocument();
    expect(screen.getByText("Awaiting Email Verification")).toBeInTheDocument();
    expect(screen.getByText(/inspector\.unverified@citygov\.org/i)).toBeInTheDocument();

    // Must NOT render protected dashboard landmarks or inspection components
    expect(screen.queryByRole("navigation", { name: "Main Navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Inspection Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Active Projects")).not.toBeInTheDocument();
  });

  it("provides I Have Verified My Email and Resend Verification Email actions", () => {
    render(<App initialView="overview" initialUser={UNVERIFIED_USER} />);

    expect(screen.getByRole("button", { name: /i have verified my email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("allows verified users to access the application dashboard immediately", () => {
    render(<App initialView="overview" initialUser={VERIFIED_USER} />);

    // Should render the overview dashboard immediately
    expect(screen.getByText("Inspection Overview")).toBeInTheDocument();
    expect(screen.queryByText("Verify Your Email Address")).not.toBeInTheDocument();
  });

  it("handles sign out from the verification screen and redirects to landing", async () => {
    render(<App initialView="overview" initialUser={UNVERIFIED_USER} />);

    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Inspection intelligence for construction teams ready to build with speed.")
      ).toBeInTheDocument();
    });
  });
});
