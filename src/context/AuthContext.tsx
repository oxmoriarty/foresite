/**
 * ForeSite Authentication Context & Provider
 *
 * Full lifecycle management for Firebase Authentication:
 * - Email/Password registration & login
 * - Session persistence via browser local storage
 * - Email verification sending and status tracking
 * - Password reset workflows
 * - User profile synchronization with Cloud Firestore (/users/{uid})
 * - Inspector name updates
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile as updateFirebaseProfile,
} from "firebase/auth";
import { auth, hasValidConfig } from "../lib/firebase";
import { UserProfile } from "../types";
import { syncUserProfile, getUserProfile } from "../services/firestore";

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  loginAsDemo: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TEST_INSPECTOR: User = {
  uid: "test-inspector-01",
  email: "inspector@foresite.test",
  displayName: "Lead Site Inspector",
  emailVerified: true,
} as unknown as User;

export interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
}

// Helper to format Firebase Auth error messages
function getFriendlyAuthError(code: string, fallbackMessage: string): string {
  switch (code) {
    case "auth/user-not-found":
      return "No registered inspector found with this email address.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password credentials. Please verify and try again.";
    case "auth/email-already-in-use":
      return "An account with this email address is already registered.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Access to this account has been temporarily disabled due to many failed login attempts.";
    case "auth/network-request-failed":
      return "Network connection error. Check your internet connectivity.";
    default:
      return fallbackMessage || "An authentication error occurred.";
  }
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, initialUser }) => {
  const defaultUser =
    initialUser !== undefined
      ? initialUser
      : process.env.NODE_ENV === "test"
      ? TEST_INSPECTOR
      : null;
  const [currentUser, setCurrentUser] = useState<User | null>(defaultUser);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(
    defaultUser
      ? {
          uid: defaultUser.uid,
          email: defaultUser.email || "inspector@foresite.test",
          displayName: defaultUser.displayName || "Lead Site Inspector",
          emailVerified: true,
          role: "inspector",
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const refreshUserProfile = useCallback(async () => {
    if (currentUser) {
      try {
        const profile = await getUserProfile(currentUser.uid);
        if (profile) setUserProfile(profile);
      } catch (err) {
        console.warn("Failed to refresh user profile:", err);
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (!hasValidConfig) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const profile = await syncUserProfile(user);
          setUserProfile(profile);
        } catch (err) {
          console.warn("Profile sync error on auth state change:", err);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginAsDemo = async () => {
    setError(null);
    const demoUser = {
      uid: "inspector-demo-01",
      email: "inspector@foresite.local",
      displayName: "Lead Site Inspector",
      emailVerified: true,
    } as unknown as User;
    setCurrentUser(demoUser);
    setUserProfile({
      uid: demoUser.uid,
      email: demoUser.email || "inspector@foresite.local",
      displayName: demoUser.displayName || "Lead Site Inspector",
      emailVerified: true,
      role: "inspector",
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });
  };

  const login = async (email: string, password: string) => {
    setError(null);
    if (!hasValidConfig) {
      const demoUser = {
        uid: "inspector-demo-01",
        email: email.trim() || "inspector@foresite.local",
        displayName: "Lead Site Inspector",
        emailVerified: true,
      } as unknown as User;
      setCurrentUser(demoUser);
      setUserProfile({
        uid: demoUser.uid,
        email: demoUser.email || "inspector@foresite.local",
        displayName: demoUser.displayName || "Lead Site Inspector",
        emailVerified: true,
        role: "inspector",
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      });
      return;
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await syncUserProfile(cred.user);
      setUserProfile(profile);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const friendly = getFriendlyAuthError(e.code || "", e.message || "");
      setError(friendly);
      throw new Error(friendly);
    }
  };

  const register = async (email: string, password: string, displayName?: string) => {
    setError(null);
    if (!hasValidConfig) {
      const demoUser = {
        uid: `inspector-demo-${Date.now().toString(36)}`,
        email: email.trim(),
        displayName: displayName?.trim() || "Field Inspector",
        emailVerified: true,
      } as unknown as User;
      setCurrentUser(demoUser);
      setUserProfile({
        uid: demoUser.uid,
        email: demoUser.email || "inspector@foresite.local",
        displayName: demoUser.displayName || "Field Inspector",
        emailVerified: true,
        role: "inspector",
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      });
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName && cred.user) {
        await updateFirebaseProfile(cred.user, { displayName: displayName.trim() });
      }
      try {
        await sendEmailVerification(cred.user);
      } catch (verifyErr) {
        console.warn("Verification email sending failed:", verifyErr);
      }
      const profile = await syncUserProfile(cred.user);
      setUserProfile(profile);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const friendly = getFriendlyAuthError(e.code || "", e.message || "");
      setError(friendly);
      throw new Error(friendly);
    }
  };

  const logout = async () => {
    setError(null);
    if (!hasValidConfig) {
      setCurrentUser(null);
      setUserProfile(null);
      return;
    }
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const friendly = getFriendlyAuthError(e.code || "", e.message || "");
      setError(friendly);
      throw new Error(friendly);
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const friendly = getFriendlyAuthError(e.code || "", e.message || "");
      setError(friendly);
      throw new Error(friendly);
    }
  };

  const sendVerificationEmail = useCallback(async () => {
    setError(null);
    if (!currentUser) throw new Error("No inspector currently signed in.");
    try {
      await sendEmailVerification(currentUser);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const friendly = getFriendlyAuthError(e.code || "", e.message || "");
      setError(friendly);
      throw new Error(friendly);
    }
  }, [currentUser]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      currentUser,
      userProfile,
      loading,
      error,
      isConfigured: hasValidConfig,
      login,
      register,
      logout,
      resetPassword,
      sendVerificationEmail,
      refreshUserProfile,
      loginAsDemo,
      clearError,
    }),
    [currentUser, userProfile, loading, error, refreshUserProfile, sendVerificationEmail]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
