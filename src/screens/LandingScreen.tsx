import React, { useState } from "react";
import {
  ArrowRight,
  Flame,
  Camera,
  CheckCircle2,
  Database,
  Search,
  Sparkles,
} from "lucide-react";
import { ViewMode } from "../types";
import { useAuth } from "../context/AuthContext";
import { AuthModal } from "../components/auth/AuthModal";

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
              <div className="w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center font-bold text-xs tracking-tight group-hover:scale-105 transition-transform duration-200">
                FS
              </div>
            </button>

            <div className="hidden md:flex items-center space-x-7 text-[13px] text-slate-600 font-medium">
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
                onClick={() => onNavigate("sync")}
                className="hover:text-slate-950 transition-colors cursor-pointer"
              >
                Sync Center
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
                  className="group inline-flex items-center gap-2.5 pl-4 pr-1.5 py-1.5 rounded-full bg-slate-950 text-white text-xs font-semibold hover:bg-slate-800 active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                >
                  <span>Workspace</span>
                  <span className="w-6 h-6 rounded-full bg-white text-slate-950 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200">
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
                className="group inline-flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-slate-950 text-white text-xs font-semibold hover:bg-slate-800 active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
              >
                <span>Sign in</span>
                <span className="w-6 h-6 rounded-full bg-white text-slate-950 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-200">
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
          {/* Subtle ForeSite Category Label */}
          <p className="text-xs sm:text-sm font-semibold text-brand-600 mb-6 tracking-wide uppercase">
            ForeSite Field Intelligence
          </p>

          {/* Display Headline: ForeSite Construction Inspection Mission */}
          <div className="max-w-4xl">
            <h1 className="text-4xl sm:text-6xl lg:text-[76px] font-extrabold tracking-[-0.035em] text-slate-950 leading-[1.06] mb-10">
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

              {/* View Demo Button */}
              <button
                type="button"
                onClick={() => onNavigate("overview")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-slate-200 text-slate-800 font-semibold text-xs sm:text-sm hover:bg-slate-50 hover:border-slate-300 active:scale-95 transition-all duration-200 cursor-pointer shadow-xs"
              >
                <span>View Demo</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Introducing ForeSite (Asymmetrical Editorial Layout) */}
      <section className="py-20 sm:py-32 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Marker Badge: Circle with number + text */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-6 h-6 rounded-full bg-slate-950 text-white text-xs font-bold flex items-center justify-center">
              01
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Introducing ForeSite
            </span>
          </div>

          {/* Section Headline */}
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-0.03em] text-slate-950 max-w-4xl mb-16 leading-[1.12]">
            Field ready inspection tools delivering clear verification on site and in the office.
          </h2>

          {/* Two Column Layout with Asymmetrical Visual Storytelling */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Left Column: ForeSite Narrative + Action Pill Button + Small Visual Card */}
            <div className="lg:col-span-5 space-y-8">
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
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white text-[11px] z-10">
                    <span className="font-semibold">Pier Footing Rebar Audit</span>
                    <span className="text-slate-300">Sector 4 Field Hub</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Large Wide Collaboration Card (Field engineering team at site board) */}
            <div className="lg:col-span-7">
              <div className="rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl border border-slate-200/80 bg-slate-50 group hover:-translate-y-1 transition-all duration-300">
                <div className="relative aspect-[16/11] w-full overflow-hidden bg-slate-100">
                  <img
                    src="/images/engineers-collaboration.jpg"
                    alt="Engineers collaborating in field office over structural blueprints and inspection schedule"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-slate-800 text-xs bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-200/80 shadow-xs z-10">
                    <span className="font-semibold text-slate-900">
                      Structural inspection sign off review
                    </span>
                    <span className="text-slate-500">Field office planning board</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Our Inspection Projects (Two Large Rounded-3xl Cards) */}
      <section className="py-20 sm:py-32 bg-slate-50 border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Marker */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-6 h-6 rounded-full bg-slate-950 text-white text-xs font-bold flex items-center justify-center">
              02
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active site projects
            </span>
          </div>

          {/* Section Headline */}
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-0.03em] text-slate-950 mb-14">
            Site inspection projects
          </h2>

          {/* Two Large Showcase Cards Side by Side (Exact 2-Col Layout) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Card 1: Metro North Station with Heavy Civil 3D Structural Crane Visual */}
            <div className="rounded-[32px] bg-slate-950 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden group hover:-translate-y-1.5 transition-all duration-300 min-h-[540px] flex flex-col justify-between">
              {/* Top Card Info */}
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-yellow-300 border border-white/10 mb-3">
                    Heavy Civil Infrastructure
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    Metro North Station
                  </h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Structural pier falsework and footing excavation audit.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate("projects")}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white text-white hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
                  title="View Project"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>

              {/* Center 3D Yellow Structural Crane / Heavy Equipment Object */}
              <div className="relative my-6 flex items-center justify-center">
                <img
                  src="/images/yellow-rig-3d.jpg"
                  alt="3D rendered stylized heavy civil foundation crane rig"
                  className="w-64 h-64 sm:w-80 sm:h-80 object-contain drop-shadow-[0_25px_35px_rgba(234,179,8,0.25)] transition-transform duration-500 group-hover:scale-105 rounded-2xl"
                  loading="lazy"
                />
              </div>

              {/* Bottom Card Footer */}
              <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-800">
                <span>Verified Inspection Model</span>
                <span className="text-yellow-400 font-semibold">100% Signed Off</span>
              </div>
            </div>

            {/* Card 2: Floating Product UI Mockup for Site Inspection Workspace */}
            <div className="rounded-[32px] bg-slate-900 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden group hover:-translate-y-1.5 transition-all duration-300 min-h-[540px] flex flex-col justify-between">
              {/* Top Card Info */}
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 mb-3">
                    Field Intelligence System
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    Site Ecosystem
                  </h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Offline evidence capture with local observation intelligence.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate("inspections")}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white text-white hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
                  title="View Inspections"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>

              {/* Center Floating Glassmorphic UI Card */}
              <div className="relative my-6 flex items-center justify-center">
                <div className="w-full max-w-md bg-white/95 rounded-2xl p-6 sm:p-8 text-slate-900 shadow-2xl border border-white/20 backdrop-blur-xl">
                  {/* Mockup Headline for ForeSite */}
                  <div className="text-center mb-6">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 mb-2">
                      Local Evidence Retention
                    </span>
                    <h4 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                      An inspection solution that works for your site ecosystem
                    </h4>
                  </div>

                  {/* Central 3D Spatial Sensor & Intelligence Sphere Image */}
                  <div className="relative my-4 flex items-center justify-center">
                    <img
                      src="/images/ecosystem-orb-3d.jpg"
                      alt="3D rendered crystal spatial inspection intelligence sphere with holographic rings"
                      className="w-36 h-36 sm:w-44 sm:h-44 object-contain rounded-2xl drop-shadow-[0_15px_25px_rgba(99,102,241,0.35)] transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>

                  {/* Bottom Tool Dock with 5 Site Tool Icons */}
                  <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-100">
                    <div
                      className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer"
                      title="Camera Capture"
                    >
                      <Camera className="w-4 h-4" />
                    </div>
                    <div
                      className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer"
                      title="Local Storage"
                    >
                      <Database className="w-4 h-4" />
                    </div>
                    <div
                      className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-pill scale-110 cursor-pointer"
                      title="AI Observation Drafts"
                    >
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div
                      className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer"
                      title="Lead Inspector Verification"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div
                      className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 transition-colors shadow-2xs cursor-pointer"
                      title="Project Search"
                    >
                      <Search className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Card Footer */}
              <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-800">
                <span>Durable IndexedDB Architecture</span>
                <span className="text-emerald-400 font-semibold">Zero Cloud Lock In</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Conversion Banner: Clean, Spacious, Startup Level */}
      <section className="py-24 sm:py-32 bg-white text-slate-900 border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-950 text-white font-bold text-sm flex items-center justify-center mx-auto mb-8 shadow-sm">
            FS
          </div>

          <h2 className="text-3xl sm:text-6xl font-extrabold tracking-[-0.035em] text-slate-950 mb-6 leading-[1.08]">
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
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-slate-200 text-slate-800 font-semibold text-sm sm:text-base hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 cursor-pointer shadow-xs"
            >
              <span>Sign in</span>
            </button>
          </div>
        </div>
      </section>

      {/* Minimalist Studio Footer */}
      <footer className="border-t border-slate-100 py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-slate-950 text-white font-bold text-[10px] flex items-center justify-center">
              FS
            </div>
            <span className="font-semibold text-slate-900">ForeSite</span>
          </div>
        </div>
      </footer>

      {/* Inspector Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};
