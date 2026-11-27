import React, { useState } from "react";
import {
  ArrowRight,
  Flame,
} from "lucide-react";
import { ViewMode } from "../types";
import { useAuth } from "../context/AuthContext";
import { AuthModal } from "../components/auth/AuthModal";
import { ScrollReveal } from "../components/ui/ScrollReveal";

export interface LandingScreenProps {
  onNavigate: (view: ViewMode) => void;
  onCreateProject?: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onNavigate,
  onCreateProject,
}) => {
  const { currentUser, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-brand-500 selection:text-white">
      {/* Top Sticky Nav (Remains visible when scrolled up or down) */}
      <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all duration-200">
        <nav className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs font-medium text-slate-700">
          {/* Left: Monogram Circle & Navigation Links */}
          <div className="flex items-center gap-8 sm:gap-12">
            {/* Black circle monogram logo */}
            <button
              type="button"
              onClick={() => onNavigate("landing")}
              className="flex items-center gap-2 group cursor-pointer focus:outline-none"
              title="ForeSite Home"
            >
              <img
                src="/ForeSiteLogo.svg?v=2"
                alt="ForeSite"
                className="h-7 w-auto object-contain group-hover:scale-105 transition-transform duration-200"
              />
            </button>

            <div className="hidden md:flex items-center space-x-7 text-[13px] text-slate-600 font-medium">
              <button
                type="button"
                onClick={() => onNavigate("demo")}
                className="text-brand-600 hover:text-brand-700 transition-colors cursor-pointer font-semibold"
              >
                Demo
              </button>
              <button
                type="button"
                onClick={() => onNavigate("projects")}
                className="hover:text-slate-950 transition-colors cursor-pointer"
              >
                Projects
              </button>
              <button
                type="button"
                onClick={() => onNavigate("inspections")}
                className="hover:text-slate-950 transition-colors cursor-pointer"
              >
                Inspections
              </button>
              <button
                type="button"
                onClick={() => onNavigate("uploads")}
                className="hover:text-slate-950 transition-colors cursor-pointer"
              >
                Uploads
              </button>
            </div>
          </div>

          {/* Right: Sign in Action Button */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate("overview")}
                  className="group inline-flex items-center gap-2.5 pl-4 pr-1.5 py-1.5 rounded-full bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                >
                  <span>Dashboard</span>
                  <span className="w-6 h-6 rounded-full bg-white text-brand-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="text-xs text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate("signin")}
                className="group inline-flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
              >
                <span>Sign in</span>
                <span className="w-6 h-6 rounded-full bg-white text-brand-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section with Diagonal Brushstroke Texture (Reference Layout Match) */}
      <section className="relative overflow-hidden pt-12 pb-24 sm:pt-20 sm:pb-36">
        {/* Artistic Diagonal Sweeping Brushstrokes Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 select-none overflow-hidden"
          aria-hidden="true"
        >
          <svg
            className="w-full h-full object-cover"
            viewBox="0 0 1440 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="brush1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0" />
                <stop offset="30%" stopColor="#e2e8f0" stopOpacity="0.8" />
                <stop offset="60%" stopColor="#cbd5e1" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="brush2" x1="20%" y1="0%" x2="100%" y2="80%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="40%" stopColor="#e0e7ff" stopOpacity="0.5" />
                <stop offset="70%" stopColor="#dbeafe" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M-200,100 Q400,200 1200,-50 L1500,200 Q700,600 -100,450 Z"
              fill="url(#brush1)"
              transform="rotate(22 600 300)"
            />
            <path
              d="M-100,250 Q600,400 1600,150 L1700,450 Q800,800 -200,600 Z"
              fill="url(#brush2)"
              transform="rotate(24 700 400)"
            />
            <path
              d="M100,50 Q800,250 1700,-50 L1800,250 Q900,650 0,500 Z"
              fill="url(#brush1)"
              transform="rotate(20 800 250)"
            />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <ScrollReveal delay={50}>
            {/* Display Headline: ForeSite Construction Inspection Mission */}
            <div className="max-w-4xl">
              <h1 className="font-display text-4xl sm:text-6xl lg:text-[72px] font-semibold tracking-[-0.03em] text-slate-950 leading-[1.08] mb-10">
                Inspection intelligence for construction teams ready to build with speed.
              </h1>

              {/* Action Row: Blue Pill Button + View Demo Button */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Primary Electric Blue Pill Button */}
                <button
                  type="button"
                  onClick={() => onNavigate("inspections")}
                  className="group inline-flex items-center gap-3 pl-6 pr-2 py-2.5 rounded-full bg-brand-600 text-white font-semibold text-sm sm:text-base hover:bg-brand-700 active:scale-95 transition-all duration-200 cursor-pointer shadow-pill"
                >
                  <span>Start an inspection</span>
                  <span className="w-7 h-7 rounded-full bg-white text-brand-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200 shadow-xs">
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </button>

                {/* Try Demo Button */}
                <button
                  type="button"
                  onClick={() => onNavigate("demo")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-slate-200 text-slate-800 font-semibold text-xs sm:text-sm hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all duration-200 cursor-pointer shadow-xs"
                >
                  <span>Try Demo</span>
                </button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Section 1: Introducing ForeSite (Asymmetrical Editorial Layout) */}
      <section className="py-20 sm:py-32 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            {/* Section Headline */}
            <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-slate-950 max-w-4xl mb-16 leading-[1.12]">
              Field ready inspection tools delivering clear verification on site and in the office.
            </h2>
          </ScrollReveal>

          {/* Two Column Layout with Asymmetrical Visual Storytelling */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: ForeSite Narrative + Action Pill Button + Small Visual Card */}
            <ScrollReveal delay={100} className="lg:col-span-5 space-y-8">
              <div className="space-y-4">
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
                  Inspectors capture photographic evidence on site without network delay.
                  Verified findings move directly to project managers for review,
                  replacing lost paperwork and slow manual transcription.
                </p>

                {/* Powered by Firebase AI Logic Badge */}
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-xs text-xs font-semibold text-slate-800">
                    <span className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                      <Flame className="w-2.5 h-2.5" />
                    </span>
                    <span>Powered by Firebase</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider">
                      AI Logic
                    </span>
                  </div>
                </div>
              </div>

              {/* Small Visual Card: Inspector examining construction site on tablet */}
              <div className="rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg border border-slate-200/80 bg-slate-100 group hover:-translate-y-1 transition-all duration-300">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
                  <img
                    src="/images/inspector-tablet.jpg"
                    alt="Civil engineer inspecting construction site with digital tablet"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
              </div>
            </ScrollReveal>

            {/* Right Column: Large Wide Collaboration Card (Field engineering team at site board) */}
            <ScrollReveal delay={200} className="lg:col-span-7">
              <div className="rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl border border-slate-200/80 bg-slate-50 group hover:-translate-y-1 transition-all duration-300">
                <div className="relative aspect-[16/11] w-full overflow-hidden bg-slate-100">
                  <img
                    src="/images/engineers-collaboration.jpg"
                    alt="Engineers collaborating in field office over structural blueprints and inspection schedule"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Section 2: Our Inspection Projects (Two Large Rounded-3xl Cards) */}
      <section className="py-20 sm:py-32 bg-slate-50 border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            {/* Section Headline */}
            <h2 className="font-display text-3xl sm:text-5xl font-semibold leading-[1.1] tracking-[-0.03em] text-slate-950 mb-10 sm:mb-14">
              Site inspection projects
            </h2>
          </ScrollReveal>

          {/* Two Large Showcase Cards Side by Side (Exact Payroost Match) */}
          <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
            {/* Card 1: Dark Card */}
            <ScrollReveal delay={100} className="h-full">
              <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="relative overflow-hidden aspect-[4/3] w-full bg-slate-900">
                  <img
                    src="/images/ConstructionAudit.jpg"
                    alt="Inspector verifying construction audit on tablet with approved sign off"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between p-6 sm:p-8">
                  <div>
                    <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
                      Audits everyone understands
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                      Break inspections into clear phases so project teams always know what is verified, reviewed, and scheduled next.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Card 2: Light Card */}
            <ScrollReveal delay={200} className="h-full">
              <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white text-slate-950 shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="relative overflow-hidden aspect-[4/3] w-full bg-slate-100">
                  <img
                    src="/images/VerifiedRecords.jpg"
                    alt="Field engineers verifying inspection findings on tablet and blueprints"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between p-6 sm:p-8">
                  <div>
                    <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-3xl">
                      Verified records at every step
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                      Keep photo evidence, structural findings, and sign off decisions documented cleanly in one timeline.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Conversion Banner: Clean, Spacious, Startup Level */}
      <section className="py-24 sm:py-32 bg-white text-slate-900 border-t border-slate-100">
        <ScrollReveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <img
            src="/ForeSiteLogo.svg?v=2"
            alt="ForeSite"
            className="h-8 w-auto object-contain mx-auto mb-8"
          />

          <h2 className="font-display text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em] text-slate-950 mb-6 leading-[1.1]">
            Ready to inspect with speed and complete field reliability?
          </h2>

          <p className="text-slate-600 text-base sm:text-lg mb-10 max-w-xl mx-auto leading-relaxed font-normal">
            Create a project to manage inspections, record observations offline, and sign off verified structural records.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (onCreateProject) {
                  onCreateProject();
                } else {
                  onNavigate("projects");
                }
              }}
              className="group inline-flex items-center gap-3 pl-6 pr-2 py-3 rounded-full bg-brand-600 text-white font-semibold text-sm sm:text-base hover:bg-brand-700 active:scale-95 transition-all duration-200 cursor-pointer shadow-pill"
            >
              <span>Create Project</span>
              <span className="w-7 h-7 rounded-full bg-white text-brand-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200">
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("signin")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-slate-200 text-slate-800 font-semibold text-sm sm:text-base hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all duration-200 cursor-pointer shadow-xs"
            >
              <span>Sign in</span>
            </button>
          </div>
        </ScrollReveal>
      </section>

      {/* Minimalist Studio Footer */}
      <footer className="border-t border-slate-100 py-6" />

      {/* Inspector Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};
