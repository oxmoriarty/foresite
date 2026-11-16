import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider } from "../src/context/AuthContext";
import { AuthModal } from "../src/components/auth/AuthModal";

// Mock Firebase Auth and Firestore dependencies
vi.mock("../src/lib/firebase", () => ({
  auth: {
    currentUser: null,
  },
  db: {},
  appCheck: null,
  hasValidConfig: false,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback) => {
    callback(null);
    return () => {};
  }),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../src/services/firestore", () => ({
  syncUserProfile: vi.fn(),
  getUserProfile: vi.fn(),
}));

describe("ForeSite Inspector Auth Modal UI", () => {
  it("renders the Auth Modal with Sign In tab selected by default", () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    expect(screen.getByText(/ForeSite Inspector Access/i)).toBeInTheDocument();
    // Both the tab button and the submit button exist
    const signInButtons = screen.getAllByRole("button", { name: /^sign in$/i });
    expect(signInButtons.length).toBe(2);
    expect(screen.getByRole("button", { name: /^register$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reset$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
  });

  it("switches to Register tab when clicked and displays inspector name and confirm password fields", () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    const registerTab = screen.getByRole("button", { name: /^register$/i });
    fireEvent.click(registerTab);

    expect(screen.getByLabelText(/Inspector Name & Credentials/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Account/i })).toBeInTheDocument();
  });

  it("switches to Reset tab when clicked and displays reset instructions", () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    const resetTab = screen.getByRole("button", { name: /^reset$/i });
    fireEvent.click(resetTab);

    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send Reset Link/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/i)).not.toBeInTheDocument();
  });

  it("validates that password must be at least 6 characters on register", async () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /^register$/i }));

    fireEvent.change(screen.getByLabelText(/Inspector Name & Credentials/i), {
      target: { value: "John Doe, PE" },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: "john@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), {
      target: { value: "123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText(/Password must be at least 6 characters long/i)).toBeInTheDocument();
    });
  });

  it("validates password mismatch on registration", async () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /^register$/i }));

    fireEvent.change(screen.getByLabelText(/Inspector Name & Credentials/i), {
      target: { value: "Jane Doe, PE" },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), {
      target: { value: "password456" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

    await waitFor(() => {
      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
    });
  });
});
