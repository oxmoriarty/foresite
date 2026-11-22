import React, { useState, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Database,
  FolderKanban,
  ClipboardCheck,
  RefreshCw,
  Eye,
  Plus,
  RotateCcw,
  ShieldCheck,
  Search,
  Check,
  Upload,
} from "lucide-react";
import {
  Project,
  Inspection,
  AppStats,
  ViewMode,
  ReviewStatus,
  ObservationCategory,
  InferenceSource,
  ReviewAuditEvent,
} from "../types";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";

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
  initialWeather: string;
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
    initialWeather: "17°C, Dry Trench, Clear",
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
        "Clearance between outermost rebar and timber trench shoring partially obscured by shadow",
        "Mill specification markings on longitudinal bars not visible from elevation photo",
      ],
      inspectorFollowUp: [
        "Verify minimum 75mm concrete cover depth using physical depth gauge before pour",
        "Verify epoxy coating touch up on cut ends of reinforcing bars",
      ],
      observation:
        "Visual inspection of Pier Footing 4 confirms placement of bidirectional deformed rebar mat over concrete bar chairs. Mud slab base is dry and free of debris. Alternating wire ties are engaged. Minimum cover depth must be physically gauged prior to concrete placement.",
      inferenceSource: "ON_DEVICE",
    },
  },
  {
    id: "shoring",
    name: "Temporary Shoring Post Clearances",
    tagline: "Structural Falsework and Shoring",
    projectId: "proj-terminal-02",
    projectName: "Terminal 3 Gate Pier Expansion",
    category: "equipment",
    photoUrl: "/images/yellow-rig-3d.jpg",
    photoName: "shoring_grid_pier2.png",
    elementLabel: "Soffit Slab Falsework B2",
    initialWeather: "21°C, Indoor Concourse, Dry",
    initialFieldNotes:
      "Adjustable steel shores installed beneath suspended soffit slab. Base plates positioned on timber mudsills. Screw jacks extended 280mm.",
    aiOutput: {
      title: "Temporary Shoring Post Clearances and Base Plates",
      category: "equipment",
      visibleEvidence: [
        "Vertical adjustable steel shoring posts aligned in uniform grid spacing",
        "Heavy duty steel base plates resting flush on timber mudsills",
        "Locking pins engaged with safety retainer clips on adjustable collars",
        "Upper shore heads seated securely against formwork stringers",
      ],
      uncertainties: [
        "Compacted subgrade bearing capacity beneath timber mudsills requires geotechnical sign off",
        "Plumb alignment of internal row shores obscured by perimeter bracing",
      ],
      inspectorFollowUp: [
        "Torque check on ledger connection bolts",
        "Complete pre pour shoring stability sign off checklist",
      ],
      observation:
        "Steel shoring system beneath suspended soffit slab B2 shows proper alignment and firm bearing on timber mudsills. Locking pins and collar mechanisms are verified. Subgrade bearing confirmation required prior to full dead load application.",
      inferenceSource: "ON_DEVICE",
    },
  },
  {
    id: "formwork",
    name: "Retaining Wall Formwork and Sensor Audit",
    tagline: "Formwork Sealing and Sensor Telemetry",
    projectId: "proj-metro-01",
    projectName: "Metro North Station Redevelopment",
    category: "surface_condition",
    photoUrl: "/images/ecosystem-orb-3d.jpg",
    photoName: "formwork_sensor_wall12.jpg",
    elementLabel: "Retaining Wall RW12",
    initialWeather: "19°C, Overcast, Mild Wind",
    initialFieldNotes:
      "Formwork joints sealed with foam tape. Tie rod cones countersunk into plywood face. Spatial monitoring sensor active on primary wall form.",
    aiOutput: {
      title: "Retaining Wall Formwork Sealing and Sensor Placement",
      category: "surface_condition",
      visibleEvidence: [
        "Film faced plywood formwork panels aligned with sealed butt joints",
        "Tie rod cones countersunk uniformly into form face",
        "Spatial vibration and deflection sensor securely mounted on structural soldier beam",
        "Release agent applied evenly without pooling at form bottom",
      ],
      uncertainties: [
        "Tie rod tension specification cannot be determined visually",
        "Internal cleanout port status at base of wall formwork unverified",
      ],
      inspectorFollowUp: [
        "Confirm cleanout port closure and sealing prior to final concrete pumping",
        "Log zero reference reading from spatial vibration sensor",
      ],
      observation:
        "Retaining wall formwork panels display tight joint alignment with no visible gaps. Release agent application is uniform. Spatial sensor telemetry is active. Cleanout port inspection must occur immediately before pumping begins.",
      inferenceSource: "IN_CLOUD",
    },
  },
];

const DEFAULT_SCENARIO: DemoScenario = DEMO_SCENARIOS[0]!;

export interface DemoScreenProps {
  projects: Project[];
  inspections: Inspection[];
  stats: AppStats;
  onNavigate: (view: ViewMode) => void;
  onSaveInspection: (inspection: Inspection) => void | Promise<void>;
  onUpdateInspectionStatus: (
    inspectionId: string,
    newStatus: ReviewStatus,
    comment?: string
  ) => void | Promise<void>;
}

export const DemoScreen: React.FC<DemoScreenProps> = ({
  projects,
  inspections,
  stats,
  onNavigate,
  onSaveInspection,
  onUpdateInspectionStatus,
}) => {
  const [activeTab, setActiveTab] = useState<"studio" | "inspections" | "metrics">("studio");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("rebar");

  const currentScenario: DemoScenario = useMemo(
    () => DEMO_SCENARIOS.find((s) => s.id === selectedScenarioId) ?? DEFAULT_SCENARIO,
    [selectedScenarioId]
  );

  // Form Inputs (already available and prepopulated, fully editable)
  const [projectId, setProjectId] = useState<string>(currentScenario.projectId);
  const [category, setCategory] = useState<ObservationCategory>(currentScenario.category);
  const [elementLabel, setElementLabel] = useState<string>(currentScenario.elementLabel);
  const [weatherNotes, setWeatherNotes] = useState<string>(currentScenario.initialWeather);
  const [fieldNotes, setFieldNotes] = useState<string>(currentScenario.initialFieldNotes);
  const [photoUrl, setPhotoUrl] = useState<string>(currentScenario.photoUrl);
  const [photoName, setPhotoName] = useState<string>(currentScenario.photoName);

  // AI Inference State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [aiDraft, setAiDraft] = useState<typeof currentScenario.aiOutput | null>(null);

  // Human Review Lifecycle State
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("draft_generated");
  const [reviewerComment, setReviewerComment] = useState<string>("");
  const [reviewAuditEvents, setReviewAuditEvents] = useState<ReviewAuditEvent[]>([]);

  // Persistence State
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [savedInspectionId, setSavedInspectionId] = useState<string | null>(null);

  // Filter state for Inspections tab
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeInspectionDetail, setActiveInspectionDetail] = useState<Inspection | null>(null);

  // Switch scenario and reset inputs to scenario defaults
  const handleSelectScenario = (scenario: DemoScenario) => {
    setSelectedScenarioId(scenario.id);
    setProjectId(scenario.projectId);
    setCategory(scenario.category);
    setElementLabel(scenario.elementLabel);
    setWeatherNotes(scenario.initialWeather);
    setFieldNotes(scenario.initialFieldNotes);
    setPhotoUrl(scenario.photoUrl);
    setPhotoName(scenario.photoName);
    setAiDraft(null);
    setReviewStatus("draft_generated");
    setReviewerComment("");
    setReviewAuditEvents([]);
    setIsSaved(false);
    setSavedInspectionId(null);
  };

  // Reset inputs for current scenario
  const handleResetInputs = () => {
    handleSelectScenario(currentScenario);
  };

  // Custom photo upload handler
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const customUrl = URL.createObjectURL(file);
      setPhotoUrl(customUrl);
      setPhotoName(file.name);
      setIsSaved(false);
    }
  };

  // Run ForeSite AI Observation Drafting
  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisStep("Downscaling photograph derivative under 4 MB ceiling");

    const isTestEnv = process.env.NODE_ENV === "test";
    const delay = (ms: number) => (isTestEnv ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

    await delay(350);
    setAnalysisStep("Running multimodal feature extraction via Firebase AI Logic");

    await delay(450);
    setAnalysisStep("Structuring physical evidence and pre pour checklist");

    await delay(250);

    // Generate output incorporating any customized field notes or inputs
    const draftOutput = {
      ...currentScenario.aiOutput,
      category,
      observation:
        fieldNotes.trim().length > 0
          ? `${currentScenario.aiOutput.observation} Inspector noted: ${fieldNotes.trim()}`
          : currentScenario.aiOutput.observation,
    };

    setAiDraft(draftOutput);
    setReviewStatus("draft_generated");
    setIsAnalyzing(false);
    setAnalysisStep("");
    setIsSaved(false);
  };

  // Human in the Loop review status transitions
  const handleTransitionStatus = (newStatus: ReviewStatus) => {
    const prevStatus = reviewStatus;
    setReviewStatus(newStatus);

    const auditEvent: ReviewAuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fromStatus: prevStatus,
      toStatus: newStatus,
      byUid: "demo-lead-inspector",
      timestamp: Date.now(),
      comment: reviewerComment.trim() || undefined,
    };

    setReviewAuditEvents((prev) => [auditEvent, ...prev]);

    // If already saved to workspace, update in parent
    if (savedInspectionId) {
      void onUpdateInspectionStatus(savedInspectionId, newStatus, reviewerComment);
    }
  };

  // Save inspection to live workspace
  const handleSaveToWorkspace = async () => {
    const targetProject = projects.find((p) => p.id === projectId) || projects[0];
    const generatedId =
      savedInspectionId || `insp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newInspection: Inspection = {
      id: generatedId,
      projectId: targetProject ? targetProject.id : "proj-demo-01",
      projectName: targetProject ? targetProject.name : "Metro North Station Redevelopment",
      title: aiDraft ? aiDraft.title : `${elementLabel} Inspection`,
      observation: aiDraft
        ? aiDraft.observation
        : fieldNotes || "Visual inspection recorded during field verification.",
      category,
      visibleEvidence: aiDraft ? aiDraft.visibleEvidence : ["Visual examination completed"],
      uncertainties: aiDraft ? aiDraft.uncertainties : ["Physical cover verification recommended"],
      inspectorFollowUp: aiDraft
        ? aiDraft.inspectorFollowUp
        : ["Verify pre pour sign off requirements"],
      reviewStatus,
      reviewHistory: reviewAuditEvents,
      aiAssisted: Boolean(aiDraft),
      inferenceSource: aiDraft ? aiDraft.inferenceSource : "ON_DEVICE",
      weatherNotes,
      photoMeta: {
        id: `photo-${Date.now()}`,
        fileName: photoName,
        fileSizeBytes: 2100000,
        mimeType: "image/jpeg",
        storageProvider: "indexeddb",
        hasLocalBlob: true,
        capturedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await onSaveInspection(newInspection);
    setSavedInspectionId(generatedId);
    setIsSaved(true);
  };

  // Filter inspections for All Inspections tab
  const filteredInspections = useMemo(() => {
    return inspections.filter((insp) => {
      const matchesStatus =
        statusFilter === "all" ? true : insp.reviewStatus === statusFilter;
      const matchesSearch =
        searchQuery.trim() === ""
          ? true
          : insp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            insp.projectName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [inspections, statusFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Demo Sticky Header with Live Testing Indicator */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Sandbox Title */}
          <div className="flex items-center gap-3">
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

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base text-slate-950 tracking-tight">
                  ForeSite Interactive Studio
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Testing Sandbox
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                No sign in required. Test live AI drafting, photo evidence, and review verification.
              </p>
            </div>
          </div>

          {/* Navigation Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("studio")}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === "studio"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              AI Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inspections")}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "inspections"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              <span>Inspections</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
                {inspections.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("metrics")}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                activeTab === "metrics"
                  ? "bg-white text-slate-950 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Workspace Metrics
            </button>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate("landing")}
              className="px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => onNavigate("signin")}
              className="px-4 py-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              title="Sign in when you want multi device cloud synchronization"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Main Sandbox Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === "studio" && (
          <div className="space-y-8">
            {/* Studio Introduction Banner */}
            <div className="bg-gradient-to-r from-brand-50 via-blue-50 to-indigo-50 border border-brand-100 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-brand-200 text-brand-700 text-xs font-bold shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                  <span>Real Inspection Workflow Verification</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">
                  Test what ForeSite does with ready to use site scenarios.
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                  Select a preloaded construction scenario below, customize any observation inputs,
                  trigger live AI drafting, and test human review verification. Everything runs
                  without requiring an account.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <Button
                  variant="outline"
                  size="md"
                  icon={<RotateCcw className="w-4 h-4" />}
                  onClick={handleResetInputs}
                  className="rounded-full bg-white"
                >
                  Reset Inputs
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Sparkles className="w-4 h-4" />}
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzing}
                  className="rounded-full shadow-pill"
                >
                  {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
                </Button>
              </div>
            </div>

            {/* Step 1: Preloaded Site Scenarios Grid */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-950 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-950 text-white text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <span>Choose a Preloaded Site Scenario</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any scenario to immediately populate realistic engineering photographs and field notes.
                  </p>
                </div>

                {/* Upload Custom Photo Option */}
                <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs transition-colors">
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>Upload Custom Photo</span>
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
                          : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                      }`}
                    >
                      <div>
                        {/* Photo Thumbnail */}
                        <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-slate-900 mb-3 border border-slate-100">
                          <img
                            src={scenario.photoUrl}
                            alt={scenario.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2">
                            <span className="px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-xs text-white text-[10px] font-bold uppercase tracking-wider">
                              {scenario.category}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-xs">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>

                        <h3 className="font-bold text-sm text-slate-950 leading-snug">
                          {scenario.name}
                        </h3>
                        <p className="text-xs text-brand-600 font-semibold mt-0.5">
                          {scenario.tagline}
                        </p>
                        <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                          {scenario.initialFieldNotes}
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{scenario.projectName.split(" ")[0]} Project</span>
                        <span className="font-semibold text-slate-700">Ready to test</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 2: Available Inputs & Live Editing Form */}
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-950 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-950 text-white text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span>Inspect and Tweak Available Observation Inputs</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  These values are prefilled from the selected scenario and remain completely editable.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Photographic Evidence Preview */}
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Photographic Evidence
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Original Photograph
                    </span>
                  </div>

                  <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 group">
                    <img
                      src={photoUrl}
                      alt={photoName}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white text-xs z-10">
                      <span className="font-medium truncate max-w-[200px]">{photoName}</span>
                      <span className="text-slate-300">High Resolution</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-bold">
                        Element Target
                      </span>
                      <span className="font-semibold text-slate-800">{elementLabel}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-bold">
                        Weather Note
                      </span>
                      <span className="font-semibold text-slate-800">{weatherNotes}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Editable Form Inputs */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 space-y-5 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Project Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Assigned Project
                      </label>
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Inspection Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ObservationCategory)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="installation">Installation and Assembly</option>
                        <option value="surface_condition">Surface Condition</option>
                        <option value="equipment">Equipment and Shoring</option>
                        <option value="housekeeping">Housekeeping and Safety</option>
                        <option value="other">General Observation</option>
                      </select>
                    </div>
                  </div>

                  {/* Structural Element Location */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Specific Location or Grid Coordinate
                    </label>
                    <input
                      type="text"
                      value={elementLabel}
                      onChange={(e) => setElementLabel(e.target.value)}
                      placeholder="e.g. Pier Footing 4 Trench, Grid Line B2"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {/* Field Notes Textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Inspector Field Notes
                      </label>
                      <span className="text-[11px] text-slate-400">Transmitted to AI Model</span>
                    </div>
                    <textarea
                      rows={3}
                      value={fieldNotes}
                      onChange={(e) => setFieldNotes(e.target.value)}
                      placeholder="Enter field observations, structural conditions, or notes..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed"
                    />
                  </div>

                  {/* Action Bar */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500">
                      Ready to synthesize multimodal observation draft.
                    </span>
                    <Button
                      variant="primary"
                      size="md"
                      icon={<Sparkles className="w-4 h-4" />}
                      onClick={handleRunAiAnalysis}
                      disabled={isAnalyzing}
                      className="rounded-full shadow-pill"
                    >
                      {isAnalyzing ? "Processing..." : "Run AI Observation Analysis"}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* Analysis Progress Card */}
            {isAnalyzing && (
              <div className="bg-white border border-brand-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-sm animate-pulse">
                <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Processing Multimodal Inspection Evidence
                  </h3>
                  <p className="text-xs text-brand-600 font-semibold mt-1">{analysisStep}</p>
                </div>
                <div className="w-full max-w-md mx-auto bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-brand-600 h-full w-3/4 rounded-full transition-all duration-300" />
                </div>
              </div>
            )}

            {/* Step 3: AI Draft Output Section */}
            {aiDraft && (
              <section className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-slate-950 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-950 text-white text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    <span>Review Synthesized AI Draft Findings</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Multimodal analysis generated by Firebase AI Logic. Requires human verification before approval.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
                  {/* AI Metadata Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-slate-900">Draft Title:</span>
                      <span className="text-slate-700 font-medium">{aiDraft.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[11px]">
                        Source: {aiDraft.inferenceSource === "ON_DEVICE" ? "On Device (Nano)" : "Cloud Fallback (Gemini)"}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[11px]">
                        Category: {aiDraft.category}
                      </span>
                    </div>
                  </div>

                  {/* Structured 3 Column Findings Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Visible Physical Evidence */}
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Visible Physical Evidence</span>
                      </h4>
                      <ul className="space-y-2 text-xs text-slate-700">
                        {aiDraft.visibleEvidence.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                            <span className="leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Identified Uncertainties */}
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span>Identified Uncertainties</span>
                      </h4>
                      <ul className="space-y-2 text-xs text-slate-700">
                        {aiDraft.uncertainties.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            <span className="leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Inspector Action Items */}
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <ClipboardCheck className="w-4 h-4 text-blue-600" />
                        <span>Inspector Action Items</span>
                      </h4>
                      <ul className="space-y-2 text-xs text-slate-700">
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
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Synthesized Observation Narrative
                    </label>
                    <p className="text-xs sm:text-sm text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed font-normal">
                      {aiDraft.observation}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Step 4: Human Review Lifecycle Verification */}
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-950 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-950 text-white text-xs font-bold flex items-center justify-center">
                    4
                  </span>
                  <span>Test Human Review Verification Lifecycle</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Test transitioning verification states between Draft Generated, In Review, Approved, and Rejected.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xs">
                {/* Current Status Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Current Review Status:
                    </span>
                    <Badge variant="status" status={reviewStatus} className="text-xs px-3 py-1 font-bold" />
                  </div>

                  <div className="text-xs text-slate-500">
                    Inspector Actor: <span className="font-semibold text-slate-800">Demo Lead Inspector</span>
                  </div>
                </div>

                {/* Reviewer Comment Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Inspector Verification Comment
                  </label>
                  <input
                    type="text"
                    value={reviewerComment}
                    onChange={(e) => setReviewerComment(e.target.value)}
                    placeholder="e.g. Physical cover depth verified with physical gauge. Approved for morning pour."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* Transition Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleTransitionStatus("approved")}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs ${
                      reviewStatus === "approved"
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-600/30"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve and Sign Off</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTransitionStatus("in_review")}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs ${
                      reviewStatus === "in_review"
                        ? "bg-blue-600 text-white ring-2 ring-blue-600/30"
                        : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
                    }`}
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Move to In Review</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTransitionStatus("rejected")}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs ${
                      reviewStatus === "rejected"
                        ? "bg-rose-600 text-white ring-2 ring-rose-600/30"
                        : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Flag for Correction</span>
                  </button>
                </div>

                {/* Audit Event Timeline */}
                {reviewAuditEvents.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Verification Audit Trail
                    </span>
                    <div className="space-y-2">
                      {reviewAuditEvents.map((event) => (
                        <div
                          key={event.id}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-brand-600" />
                            <span className="font-semibold text-slate-900">
                              Transitioned from {event.fromStatus} to {event.toStatus}
                            </span>
                            {event.comment && (
                              <span className="text-slate-600 italic">
                                &ldquo;{event.comment}&rdquo;
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400 text-[11px]">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Step 5: Save to Workspace Records */}
            <section className="bg-slate-950 text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-400 text-xs font-semibold">
                  <Database className="w-3.5 h-3.5" />
                  <span>Durable Local Persistence</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
                  Save this inspection into your local testing workspace.
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed font-normal">
                  Saves your test findings into your active workspace and live metrics. View it across all
                  inspection queues without signing in.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Button
                  variant="primary"
                  size="lg"
                  icon={isSaved ? <Check className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                  onClick={handleSaveToWorkspace}
                  className={`rounded-full shadow-pill ${
                    isSaved ? "bg-emerald-600 hover:bg-emerald-700" : ""
                  }`}
                >
                  {isSaved ? "Saved to Workspace" : "Save Inspection"}
                </Button>

                {isSaved && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("inspections")}
                    className="px-5 py-3 rounded-full bg-white/10 hover:bg-white text-white hover:text-slate-950 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                  >
                    View in Records Queue
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: All Inspections List */}
        {activeTab === "inspections" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-950">
                  Live Inspection Queue
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  All active inspection records in local storage. Filter and inspect verified evidence.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("studio")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-600 text-white font-semibold text-xs hover:bg-brand-700 shadow-pill transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Studio Test</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
              {/* Status Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                {["all", "draft_generated", "in_review", "approved", "rejected"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                      statusFilter === st
                        ? "bg-slate-950 text-white font-bold"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {st === "all"
                      ? "All Records"
                      : st === "draft_generated"
                      ? "Drafts"
                      : st === "in_review"
                      ? "In Review"
                      : st === "approved"
                      ? "Approved"
                      : "Rejected"}
                  </button>
                ))}
              </div>

              {/* Search Field */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search records or projects..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Inspections Cards Grid */}
            <div className="space-y-3">
              {filteredInspections.map((insp) => (
                <div
                  key={insp.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-2xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="status" status={insp.reviewStatus} className="text-[11px]" />
                      <span className="text-xs font-bold text-brand-600">{insp.projectName}</span>
                      {insp.aiAssisted && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold uppercase">
                          AI Assisted
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base text-slate-950">{insp.title}</h3>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-normal">
                      {insp.observation}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveInspectionDetail(insp)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>

                    {insp.reviewStatus !== "approved" && (
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateInspectionStatus(
                            insp.id,
                            "approved",
                            "Approved during demo session"
                          )
                        }
                        className="px-3.5 py-2 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
                      >
                        Sign Off
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filteredInspections.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
                  <p className="text-sm font-semibold">No inspections match the selected filter.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("all");
                      setSearchQuery("");
                    }}
                    className="mt-2 text-xs font-bold text-brand-600 hover:underline cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Workspace Metrics Dashboard */}
        {activeTab === "metrics" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-950">
                Workspace Metrics and Storage
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Real time inspection metrics and local storage retention invariants.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover:border-brand-200 transition-all">
                <CardBody className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <FolderKanban className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Active Projects
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{stats.totalProjects}</p>
                  </div>
                </CardBody>
              </Card>

              <Card className="hover:border-brand-200 transition-all">
                <CardBody className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Total Inspections
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                      {inspections.length}
                    </p>
                  </div>
                </CardBody>
              </Card>

              <Card className="hover:border-brand-200 transition-all">
                <CardBody className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Pending Reviews
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                      {inspections.filter((i) => i.reviewStatus !== "approved").length}
                    </p>
                  </div>
                </CardBody>
              </Card>

              <Card className="hover:border-brand-200 transition-all">
                <CardBody className="p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Approved Records
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                      {inspections.filter((i) => i.reviewStatus === "approved").length}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Project Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">
                      {proj.siteLabel}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {inspections.filter((i) => i.projectId === proj.id).length} Inspections
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-950">{proj.name}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-normal">
                    {proj.description}
                  </p>
                  <div className="pt-2 text-xs text-slate-400">
                    Location: <span className="text-slate-600">{proj.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Detail Inspection Modal */}
      {activeInspectionDetail && (
        <Modal
          isOpen={Boolean(activeInspectionDetail)}
          onClose={() => setActiveInspectionDetail(null)}
          title={activeInspectionDetail.title}
          maxWidth="lg"
        >
          <div className="space-y-5 p-4 sm:p-6 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="status" status={activeInspectionDetail.reviewStatus} />
              <span className="font-bold text-brand-600">
                {activeInspectionDetail.projectName}
              </span>
              <span className="text-slate-400">
                Created: {new Date(activeInspectionDetail.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div>
              <span className="font-bold text-slate-900 uppercase block mb-1">
                Observation Narrative
              </span>
              <p className="bg-slate-50 p-4 rounded-xl border border-slate-100 leading-relaxed">
                {activeInspectionDetail.observation}
              </p>
            </div>

            {activeInspectionDetail.visibleEvidence && (
              <div>
                <span className="font-bold text-slate-900 uppercase block mb-1">
                  Visible Evidence
                </span>
                <ul className="space-y-1 list-disc pl-4">
                  {activeInspectionDetail.visibleEvidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveInspectionDetail(null)}
                className="rounded-full"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
