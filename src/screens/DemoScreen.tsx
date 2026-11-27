import React, { useState, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Check,
  Upload,
  Loader2,
  X,
  ClipboardCheck,
} from "lucide-react";
import {
  ViewMode,
  ObservationCategory,
  InferenceSource,
} from "../types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import {
  generateInspectionDraft,
  isQuotaExceededError,
} from "../services/ai";

export interface DemoScenario {
  id: string;
  name: string;
  tagline: string;
  projectId: string;
  projectName: string;
  category: ObservationCategory;
  photoUrl: string;
  photoName: string;
  elementLabel: string;
  initialFieldNotes: string;
  aiOutput: {
    title: string;
    category: ObservationCategory;
    visibleEvidence: string[];
    uncertainties: string[];
    inspectorFollowUp: string[];
    observation: string;
    inferenceSource: InferenceSource;
  };
}

function mapCategory(aiCategory: string): ObservationCategory {
  switch (aiCategory) {
    case "structural":
    case "installation":
      return "installation";
    case "equipment":
    case "hvac":
      return "equipment";
    case "fire_safety":
    case "environmental":
    case "housekeeping":
      return "housekeeping";
    case "finishes":
    case "surface_condition":
      return "surface_condition";
    case "plumbing":
      return "installation";
    case "general":
    case "other":
    default:
      return "other";
  }
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "rebar",
    name: "Pier Footing Rebar Audit",
    tagline: "Civil Foundation Reinforcement",
    projectId: "proj-metro-01",
    projectName: "Metro North Station Redevelopment",
    category: "installation",
    photoUrl: "/images/inspector-tablet.jpg",
    photoName: "rebar_pier4_elevation.jpg",
    elementLabel: "Pier Footing 4 Trench",
    initialFieldNotes:
      "Grade 60 deformed rebar layout in two way mat. Bar chairs set 75mm clear above mud slab. Check tie wire spacing before morning concrete pour.",
    aiOutput: {
      title: "Rebar Spacing and Cover Depth Verification",
      category: "installation",
      visibleEvidence: [
        "Bidirectional reinforcement rebar mat positioned in excavated footing trench",
        "Concrete bar chairs elevating lower rebar steel 75mm above mud slab",
        "Galvanized tie wire secured at alternating grid intersections",
        "Excavation trench bottom is free from accumulated mud or standing water",
      ],
      uncertainties: [
        "Exact rebar bar diameter cannot be confirmed solely from wide frame view",
        "Concrete cover clearance to outer soil wall requires physical tape gauge check",
      ],
      inspectorFollowUp: [
        "Confirm minimum 75mm bottom clearance with physical measuring gauge",
        "Verify tie wire securement along perimeter edge bars prior to concrete pour",
      ],
      observation:
        "Visual examination of Pier Footing 4 shows the lower reinforcement mat arranged in a uniform two way grid supported by concrete spacers. Tie wire intersections appear consistent across visible bays. Final cover clearances require physical tape verification before concrete placement.",
      inferenceSource: "ON_DEVICE",
    },
  },
  {
    id: "scaffold",
    name: "Exterior Curtain Wall Scaffolding",
    tagline: "Access & Fall Protection Check",
    projectId: "proj-terminal-02",
    projectName: "Terminal 3 Gate Pier Expansion",
    category: "equipment",
    photoUrl: "/images/ConstructionAudit.jpg",
    photoName: "scaffold_west_facade.jpg",
    elementLabel: "West Elevation Bay 12",
    initialFieldNotes:
      "Tubular frame scaffolding erected to fourth tier. Guardrails and toe boards visible on upper platform. Verify base plate bearing on compacted gravel.",
    aiOutput: {
      title: "Scaffold Guardrail and Base Bearing Assessment",
      category: "equipment",
      visibleEvidence: [
        "Tubular steel frame scaffolding erected vertically along west facade",
        "Top rails and mid rails installed on upper work decks",
        "Timber toe boards positioned along platform perimeter",
        "Cross bracing couplers connected across visible vertical bays",
      ],
      uncertainties: [
        "Tie anchor spacing to primary concrete column behind cladding is obscured",
        "Soil compaction beneath mudsills cannot be determined visually",
      ],
      inspectorFollowUp: [
        "Inspect tie anchor torque and spacing against structural layout",
        "Check base plates and soleboards for settlement or uneven bearing",
      ],
      observation:
        "The West Elevation scaffolding assembly includes visible top guardrails, mid rails, and perimeter toe boards across active working tiers. Cross braces are engaged on exterior frames. Anchor pull capacities and subgrade compaction require physical verification.",
      inferenceSource: "ON_DEVICE",
    },
  },
  {
    id: "electrical",
    name: "Main Switchgear Conduit Rough In",
    tagline: "MEP Distribution & Bonding",
    projectId: "proj-metro-01",
    projectName: "Metro North Station Redevelopment",
    category: "installation",
    photoUrl: "/images/engineers-collaboration.jpg",
    photoName: "conduit_riser_vault_b2.jpg",
    elementLabel: "Electrical Room B2",
    initialFieldNotes:
      "Parallel EMT conduit runs entering upper distribution gutter. Strut trapeze hangers anchored into concrete deck. Check grounding bushing continuity.",
    aiOutput: {
      title: "EMT Conduit Alignment and Strut Support Check",
      category: "installation",
      visibleEvidence: [
        "Parallel galvanized EMT conduits terminating cleanly into steel enclosure",
        "Galvanized strut channel trapeze hangers suspended via threaded rods",
        "Compression couplings and locknuts seated on visible conduit joints",
      ],
      uncertainties: [
        "Internal wire fill percentage and insulation integrity are concealed",
        "Torque values on enclosure grounding lugs cannot be measured from photograph",
      ],
      inspectorFollowUp: [
        "Verify grounding bushing continuity and conductor sizing inside panel",
        "Confirm strut hanger spacing meets mechanical support intervals",
      ],
      observation:
        "Parallel conduit runs entering Electrical Room B2 appear aligned and mechanically supported by overhead strut trapeze hangers. Visible connectors are seated squarely at the enclosure entry. Internal conductor terminations and grounding continuity require physical testing.",
      inferenceSource: "IN_CLOUD",
    },
  },
];

const DEFAULT_SCENARIO: DemoScenario = DEMO_SCENARIOS[0]!;

export interface DemoScreenProps {
  onNavigate: (view: ViewMode) => void;
}

export const DemoScreen: React.FC<DemoScreenProps> = ({
  onNavigate,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("rebar");

  const currentScenario: DemoScenario = useMemo(
    () => DEMO_SCENARIOS.find((s) => s.id === selectedScenarioId) ?? DEFAULT_SCENARIO,
    [selectedScenarioId]
  );

  const [fieldNotes, setFieldNotes] = useState<string>(currentScenario.initialFieldNotes);
  const [photoUrl, setPhotoUrl] = useState<string>(currentScenario.photoUrl);
  const [photoName, setPhotoName] = useState<string>(currentScenario.photoName);
  const [customBlob, setCustomBlob] = useState<Blob | null>(null);

  // AI Inference State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [aiDraft, setAiDraft] = useState<typeof currentScenario.aiOutput | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Switch scenario and reset inputs to scenario defaults
  const handleSelectScenario = (scenario: DemoScenario) => {
    setSelectedScenarioId(scenario.id);
    setFieldNotes(scenario.initialFieldNotes);
    setPhotoUrl(scenario.photoUrl);
    setPhotoName(scenario.photoName);
    setCustomBlob(null);
    setAiDraft(null);
    setAiError(null);
  };

  // Reset inputs for current scenario
  const handleResetInputs = () => {
    setFieldNotes(currentScenario.initialFieldNotes);
    setPhotoUrl(currentScenario.photoUrl);
    setPhotoName(currentScenario.photoName);
    setCustomBlob(null);
    setAiDraft(null);
    setAiError(null);
  };

  // Handle custom photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setAiError("Please select a valid JPEG or PNG photograph.");
      return;
    }
    setAiError(null);
    setCustomBlob(file);
    setPhotoName(file.name);
    setPhotoUrl(URL.createObjectURL(file));
    setAiDraft(null);
  };

  // Trigger real Firebase AI Logic analysis
  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisStep("Preparing site photograph for AI analysis...");
    setAiError(null);

    try {
      let photoBlob: Blob;
      if (customBlob) {
        photoBlob = customBlob;
      } else {
        try {
          const fetchUrl =
            typeof window !== "undefined" && window.location?.origin && photoUrl.startsWith("/")
              ? `${window.location.origin}${photoUrl}`
              : photoUrl;
          const res = await fetch(fetchUrl);
          if (res.ok) {
            photoBlob = await res.blob();
          } else {
            photoBlob = new Blob(["scenario-photo-binary"], { type: "image/jpeg" });
          }
        } catch {
          // Graceful fallback for headless or test environments without origin
          photoBlob = new Blob(["scenario-photo-binary"], { type: "image/jpeg" });
        }
      }

      setAnalysisStep("Analyzing photograph and notes with Gemini AI...");

      const result = await generateInspectionDraft({
        photoBlob,
        notes: fieldNotes,
        preferenceSnapshot: {
          enabled: true,
          source: "default",
          syncStatus: "synced",
        },
        requestConsent: () => Promise.resolve(true),
      });

      const draft = result.draft;

      setAiDraft({
        title: draft.title || `${currentScenario.elementLabel} Inspection`,
        category: mapCategory(draft.category),
        visibleEvidence:
          draft.visibleEvidence && draft.visibleEvidence.length > 0
            ? draft.visibleEvidence
            : ["Visual inspection of site elements completed"],
        uncertainties:
          draft.uncertainties && draft.uncertainties.length > 0
            ? draft.uncertainties
            : ["Physical gauge confirmation recommended prior to pour"],
        inspectorFollowUp:
          draft.inspectorFollowUp && draft.inspectorFollowUp.length > 0
            ? draft.inspectorFollowUp
            : ["Inspect and verify field conditions with project lead"],
        observation:
          draft.observation || fieldNotes || "Visual inspection recorded during field verification.",
        inferenceSource: result.inferenceSource,
      });
    } catch (err: unknown) {
      console.warn("Demo AI analysis error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (isQuotaExceededError(err)) {
        setAiError("AI rate limit reached. Please wait a moment and try again.");
      } else {
        setAiError(`AI analysis could not complete: ${msg}`);
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      {/* Minimal Sticky Header */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate("landing")}
              className="flex items-center gap-2 group cursor-pointer focus:outline-none"
              title="ForeSite"
            >
              <img
                src="/ForeSiteLogo.svg?v=2"
                alt="ForeSite"
                className="h-7 w-auto object-contain group-hover:scale-105 transition-transform duration-200"
              />
            </button>

            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-slate-900 tracking-tight">
                ForeSite Demo Studio
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sandbox
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate("signin")}
              className="px-4 py-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Notice */}
        {aiError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm rounded-2xl flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
            <button
              type="button"
              onClick={() => setAiError(null)}
              className="text-rose-500 hover:text-rose-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Inspection Demo
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="md"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={handleResetInputs}
              className="rounded-full bg-white"
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={
                isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )
              }
              onClick={handleRunAiAnalysis}
              disabled={isAnalyzing}
              className="rounded-full shadow-pill"
            >
              {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
            </Button>
          </div>
        </div>

        {/* Step 1: Site Scenarios */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span>Choose a Site Scenario</span>
            </h2>

            <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs transition-colors">
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Upload Photo</span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DEMO_SCENARIOS.map((scenario) => {
              const isSelected = selectedScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleSelectScenario(scenario)}
                  className={`text-left rounded-2xl p-4 transition-all duration-200 border cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? "bg-white border-brand-500 ring-2 ring-brand-500/20 shadow-md"
                      : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div>
                    <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-slate-900 mb-3 border border-slate-100">
                      <img
                        src={scenario.photoUrl}
                        alt={scenario.name}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 leading-snug">
                      {scenario.name}
                    </h3>
                    <p className="text-xs text-brand-600 font-medium mt-0.5">
                      {scenario.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2: Photo & Field Notes */}
        <section className="space-y-4">
          <h2 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span>Photo and Field Notes</span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Photo Preview */}
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Site Photo
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  Ready
                </span>
              </div>

              <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-200">
                <img
                  src={photoUrl}
                  alt={photoName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-white text-xs z-10">
                  <span className="font-medium truncate max-w-[220px]">{photoName}</span>
                </div>
              </div>
            </div>

            {/* Right: Field Notes */}
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-2xs">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Inspector Field Notes
                  </label>
                </div>
                <textarea
                  rows={6}
                  value={fieldNotes}
                  onChange={(e) => setFieldNotes(e.target.value)}
                  placeholder="Enter field observations or notes..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end border-t border-slate-100">
                <Button
                  variant="primary"
                  size="md"
                  icon={
                    isAnalyzing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )
                  }
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzing}
                  className="rounded-full shadow-pill"
                >
                  {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Analysis Progress Card */}
        {isAnalyzing && (
          <div className="bg-white border border-brand-200 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xs">
            <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
              <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Generating Draft
              </h3>
              <p className="text-xs text-brand-600 font-medium mt-1">{analysisStep}</p>
            </div>
            <div className="w-full max-w-md mx-auto bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-brand-600 h-full w-3/4 rounded-full transition-all duration-300" />
            </div>
          </div>
        )}

        {/* Step 3: AI Draft Output Section */}
        {aiDraft && (
          <section className="space-y-4">
            <h2 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span>AI Draft Findings</span>
            </h2>

            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-6 shadow-2xs">
              {/* AI Metadata Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{aiDraft.title}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="source" source={aiDraft.inferenceSource} />
                </div>
              </div>

              {/* Structured 3 Column Findings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Visible Physical Evidence */}
                <div className="space-y-2.5 bg-slate-50/80 p-4 rounded-xl border border-slate-200/60">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Visible Evidence</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {aiDraft.visibleEvidence.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Identified Uncertainties */}
                <div className="space-y-2.5 bg-slate-50/80 p-4 rounded-xl border border-slate-200/60">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Uncertainties</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {aiDraft.uncertainties.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Inspector Action Items */}
                <div className="space-y-2.5 bg-slate-50/80 p-4 rounded-xl border border-slate-200/60">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <ClipboardCheck className="w-4 h-4 text-blue-600" />
                    <span>Follow Up</span>
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {aiDraft.inspectorFollowUp.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Objective Observation Narrative */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-900">
                  Observation Summary
                </label>
                <p className="text-xs sm:text-sm text-slate-600 bg-slate-50/80 p-4 rounded-xl border border-slate-200/60 leading-relaxed">
                  {aiDraft.observation}
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
