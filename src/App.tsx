import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from "react";
import { Activity, ChevronDown, Download, FlaskConical, LineChart, Map as MapIcon, Pause, Play, RotateCcw, Settings2, SkipForward, Skull, Users } from "lucide-react";

/**
 * Tablet build (`VITE_TABLET=1`) ships only the Agent-network + Surveillance
 * views. The heavy Rotterdam-micro and experimental Cellular views are gated
 * behind a build-time env literal, so Vite/Rollup tree-shakes both the
 * components AND their bulky JSON data (rotterdamBuurten.json,
 * netherlandsCaDensity.json) out of the bundle entirely.
 */
const TABLET_BUILD = import.meta.env.VITE_TABLET === "1";
const CellularAutomatonView: ComponentType | null = TABLET_BUILD
  ? null
  : lazy(() => import("./components/CellularAutomatonView"));
const RotterdamMicroView: ComponentType | null = TABLET_BUILD
  ? null
  : lazy(() => import("./components/RotterdamMicroView"));

import NetherlandsMap from "./components/NetherlandsMap";
import TimelineChart from "./components/TimelineChart";
import AgentInspector from "./components/AgentInspector";
import SurveillanceView from "./components/SurveillanceView";
import { simulateEnsemble } from "./simulation/engine";
import { calibrateInfectionRate, estimateR0 } from "./simulation/calibration";
import { computeDetection } from "./simulation/detection";
import { AVAILABLE_CITIES, buildSyntheticWorld } from "./simulation/netherlandsSeed";
import { STATE, STATE_LABELS, type DataMode, type MetricInterval, type ScenarioConfig, type World } from "./simulation/types";

const DEFAULT_CONFIG: ScenarioConfig = {
  dataMode: "nation",
  seed: 20260604,
  // Calibrated so the fully-susceptible model R₀ ≈ 2.6 (COVID-19 wild-type).
  // See docs/calibration.md and src/simulation/calibration.ts.
  infectionRate: 0.26,
  incubationDays: 5,
  infectiousDays: 7,
  mobilityIntensity: 1,
  eventIntensity: 0.85,
  householdIntensity: 1,
  initialCases: 12,
  seedProfileId: "utrecht",
  maxDays: 150,
  ensembleRuns: 7,
  priorImmunity: 0.04,
  vaccinationStartDay: 46,
  vaccinationCoverage: 0.64,
  vaccineEffectiveness: 0.72,
  mortalityMultiplier: 1,
  baseLethality: 0.0056, // ≈ 0.7% IFR (COVID-19 wild type)
  policyStartDay: 24,
  mobilityReduction: 0.32,
  eventReduction: 0.58,
};

/**
 * Scenario presets. Each one is a *partial* config override applied on top of
 * the current scenario, plus a literature-anchored target R0 used by the
 * "Calibrate" button. The non-pharma settings (mobility / events / household)
 * are pushed to realistic extremes so a full lockdown really does silence
 * events and a "no measures" run lets transmission run hot. See
 * docs/calibration.md for the rationale and sources.
 */
interface ScenarioPreset {
  id: string;
  label: string;
  description: string;
  targetR0: number;
  patch: Partial<ScenarioConfig>;
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "covid-baseline",
    label: "COVID-19 baseline · R₀≈2.6",
    description: "Wild-type respiratory pandemic, society open, no measures yet.",
    targetR0: 2.6,
    patch: {
      incubationDays: 5,
      infectiousDays: 7,
      mobilityIntensity: 1,
      eventIntensity: 0.85,
      householdIntensity: 1,
      mobilityReduction: 0,
      eventReduction: 0,
      policyStartDay: 1000,
      mortalityMultiplier: 1,
    },
  },
  {
    id: "seasonal-flu",
    label: "Seasonal influenza · R₀≈1.3",
    description: "Milder, shorter generation time, partial prior immunity.",
    targetR0: 1.3,
    patch: {
      incubationDays: 2,
      infectiousDays: 5,
      mobilityIntensity: 1,
      eventIntensity: 0.8,
      householdIntensity: 1,
      priorImmunity: 0.3,
      mobilityReduction: 0,
      eventReduction: 0,
      policyStartDay: 1000,
      mortalityMultiplier: 0.4,
    },
  },
  {
    id: "mild-measures",
    label: "Mild measures · R₀≈1.8",
    description: "Advisories: events thinned, some working from home, day 14.",
    targetR0: 1.8,
    patch: {
      mobilityIntensity: 0.8,
      eventIntensity: 0.45,
      householdIntensity: 1.1,
      policyStartDay: 14,
      mobilityReduction: 0.35,
      eventReduction: 0.7,
    },
  },
  {
    id: "full-lockdown",
    label: "Full lockdown · R₀≈0.8",
    description: "Events ~off, mobility cut hard, contacts pushed into the home.",
    targetR0: 0.8,
    patch: {
      mobilityIntensity: 0.35,
      eventIntensity: 0.05,
      householdIntensity: 1.35,
      policyStartDay: 7,
      mobilityReduction: 0.8,
      eventReduction: 0.95,
    },
  },
  {
    id: "no-measures",
    label: "No measures, dense mixing · R₀≈3.6",
    description: "Worst case: high mobility, festivals on, no response.",
    targetR0: 3.6,
    patch: {
      mobilityIntensity: 1.5,
      eventIntensity: 1.6,
      householdIntensity: 1,
      mobilityReduction: 0,
      eventReduction: 0,
      policyStartDay: 1000,
    },
  },
];

type ViewMode = "agent" | "cellular" | "surveillance" | "rotterdam";

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function formatDecimal(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function formatInterval(interval: MetricInterval) {
  return `${formatNumber(interval.mean)}`;
}

function formatIntervalRange(interval: MetricInterval) {
  if (Math.round(interval.p10) === Math.round(interval.p90)) return undefined;
  return `${formatNumber(interval.p10)}-${formatNumber(interval.p90)}`;
}

function updateConfigValue<K extends keyof ScenarioConfig>(
  setter: React.Dispatch<React.SetStateAction<ScenarioConfig>>,
  key: K,
  value: ScenarioConfig[K],
) {
  setter((current) => ({ ...current, [key]: value }));
}

function configsEqual(left: ScenarioConfig, right: ScenarioConfig) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  formatValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="controlBlock">
      <span>
        {label}
        <strong>
          {formatValue ? formatValue(value) : `${formatDecimal(value)}${suffix}`}
        </strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

// Disease lethality presets (target infection-fatality ratio, IFR %), incl. extreme/engineered.
const DISEASE_PRESETS: { label: string; ifr: number }[] = [
  { label: "Seasonal flu", ifr: 0.1 },
  { label: "COVID-19", ifr: 0.7 },
  { label: "1918 flu", ifr: 2.5 },
  { label: "SARS", ifr: 10 },
  { label: "Smallpox", ifr: 30 },
  { label: "Ebola / engineered", ifr: 60 },
];

function Accordion({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: Set<string>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = open.has(id);
  return (
    <div className={`ctrlAccordion ${isOpen ? "open" : ""}`}>
      <button type="button" className="ctrlAccordionHead" onClick={() => onToggle(id)}>
        <span>{title}</span>
        <ChevronDown size={15} className="ctrlChevron" />
      </button>
      {isOpen && <div className="ctrlAccordionBody">{children}</div>}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warn" | "danger" | "good";
  icon: React.ReactNode;
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function csvEscape(value: string | number | boolean | null) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadPopulation(world: World) {
  const headers = [
    "person_id",
    "codename",
    "represented_people",
    "household_id",
    "buurt_code",
    "home_area",
    "work_area",
    "age",
    "age_band",
    "age_group",
    "household_type",
    "housing_type",
    "work_sector",
    "contact_group",
    "transport_mode",
    "mobility_frequency",
    "sewer_catchment",
    "daytime_node",
    "event_node",
    "route_node",
    "lat",
    "lon",
    "regulation_compliance",
    "synthetic",
  ];
  const rows = world.agents.map((agent) =>
    [
      agent.id,
      agent.codename,
      agent.representedPeople.toFixed(2),
      agent.householdId,
      agent.homeProfileId,
      world.profileById[agent.homeProfileId].name,
      world.profileById[agent.workProfileId].name,
      agent.age,
      agent.ageBand,
      agent.ageGroup,
      agent.householdType,
      agent.housingType,
      agent.workSector,
      agent.contactGroup,
      agent.transportMode,
      agent.mobilityFrequency,
      world.profileById[agent.homeProfileId].rwziName,
      agent.daytimeNodeId,
      agent.eventNodeId,
      agent.routeNodeId ?? "",
      agent.lat.toFixed(5),
      agent.lon.toFixed(5),
      agent.compliance.toFixed(3),
      true,
    ]
      .map(csvEscape)
      .join(","),
  );

  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "onegov-synthetic-pandemic-population.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("agent");
  // In a tablet build the heavy views don't exist — guard against stale state
  // pointing at them (e.g. after a hot-reload across modes).
  useEffect(() => {
    if (TABLET_BUILD && (viewMode === "cellular" || viewMode === "rotterdam")) {
      setViewMode("agent");
    }
  }, [viewMode]);
  const [draftConfig, setDraftConfig] = useState<ScenarioConfig>(DEFAULT_CONFIG);
  const [config, setConfig] = useState<ScenarioConfig>(DEFAULT_CONFIG);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [selectedProfileId, setSelectedProfileId] = useState(DEFAULT_CONFIG.seedProfileId);
  const [presetId, setPresetId] = useState("");
  const [focusedAgentId, setFocusedAgentId] = useState<number | null>(null);
  const [agentPinned, setAgentPinned] = useState(false);
  const [targetR0, setTargetR0] = useState(2.6);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationNote, setCalibrationNote] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["disease", "transmission"]));
  const [middleView, setMiddleView] = useState<"map" | "trends">("map");

  const toggleGroup = (id: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const currentIFR = ((draftConfig.baseLethality ?? 0) + 0.0014) * 100;
  const setIFR = (ifrPct: number) =>
    updateConfigValue(setDraftConfig, "baseLethality", Math.max(0, ifrPct / 100 - 0.0014));

  const controlWorld = useMemo(() => buildSyntheticWorld(draftConfig.dataMode, draftConfig.seed), [draftConfig.dataMode, draftConfig.seed]);
  const world = useMemo(() => buildSyntheticWorld(config.dataMode, config.seed), [config.dataMode, config.seed]);
  const safeSelectedProfileId = world.profileById[selectedProfileId] ? selectedProfileId : world.profiles[0].id;
  const safeDraftSeedProfileId = controlWorld.profileById[draftConfig.seedProfileId] ? draftConfig.seedProfileId : controlWorld.profiles[0].id;
  const scenarioDirty = !configsEqual(draftConfig, config);
  const ensemble = useMemo(() => simulateEnsemble(world, config), [config, world]);
  const impliedR0 = useMemo(() => estimateR0(world, config, { sampleSize: 180 }), [world, config]);
  const result = ensemble.representative;
  const detection = useMemo(() => computeDetection(result, world), [result, world]);
  const frame = result.frames[Math.min(day, result.frames.length - 1)];
  const ensembleFrame = ensemble.frames[Math.min(day, ensemble.frames.length - 1)];
  const selectedProfile = world.profileById[safeSelectedProfileId];
  const selectedStats = frame.areaStats.find((area) => area.profileId === safeSelectedProfileId) ?? frame.areaStats[0];
  const activeTotal = ensembleFrame.totals.exposed.mean + ensembleFrame.totals.infectious.mean;
  const attackRate =
    (ensembleFrame.totals.exposed.mean +
      ensembleFrame.totals.infectious.mean +
      ensembleFrame.totals.recovered.mean +
      ensembleFrame.totals.deceased.mean) /
    world.representedPopulation;
  const transmissionTotal = Object.values(frame.transmissionByLayer).reduce((sum, value) => sum + value, 0);

  useEffect(() => {
    setDay(0);
    setPlaying(false);
  }, [result]);

  // Unpin the followed agent whenever the area or world changes, so the default
  // picker can choose a fresh, relevant agent for the new context.
  useEffect(() => {
    setAgentPinned(false);
  }, [safeSelectedProfileId, world]);

  // Keep a sensible "followed agent": unless the user pinned one, default to an
  // agent in the selected area that actually gets infected during the run.
  useEffect(() => {
    const areaAgents = world.agents.filter((agent) => agent.homeProfileId === safeSelectedProfileId);
    if (areaAgents.length === 0) {
      setFocusedAgentId(null);
      return;
    }
    if (agentPinned && focusedAgentId !== null) {
      const current = world.agents[focusedAgentId];
      if (current && current.homeProfileId === safeSelectedProfileId) return; // respect manual pick
    }
    const infected = areaAgents.find((agent) => result.frames.some((frame) => frame.states[agent.id] === STATE.infectious));
    setFocusedAgentId((infected ?? areaAgents[0]).id);
  }, [world, result, safeSelectedProfileId, agentPinned, focusedAgentId]);

  function selectFocusAgent(id: number) {
    setFocusedAgentId(id);
    setAgentPinned(true);
  }

  useEffect(() => {
    if (controlWorld.profileById[draftConfig.seedProfileId]) return;
    const fallbackProfile =
      controlWorld.profiles.find((profile) => profile.id === DEFAULT_CONFIG.seedProfileId) ?? controlWorld.profiles[0];
    setSelectedProfileId(fallbackProfile.id);
    updateConfigValue(setDraftConfig, "seedProfileId", fallbackProfile.id);
  }, [controlWorld, draftConfig.dataMode, draftConfig.seedProfileId]);

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => {
      setDay((current) => {
        if (current >= result.frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(55, 520 / speed));
    return () => window.clearInterval(interval);
  }, [playing, result.frames.length, speed]);

  function resetScenario() {
    setDraftConfig(DEFAULT_CONFIG);
    setConfig(DEFAULT_CONFIG);
    setSelectedProfileId(DEFAULT_CONFIG.seedProfileId);
    setPresetId("");
    setTargetR0(2.6);
    setCalibrationNote(null);
    setDay(0);
    setPlaying(false);
  }

  function applyPreset(preset: ScenarioPreset) {
    setPresetId(preset.id);
    setTargetR0(preset.targetR0);
    setDraftConfig((current) => ({ ...current, ...preset.patch }));
    setCalibrationNote(`Loaded "${preset.label}". Calibrate β to lock R₀≈${preset.targetR0}, then Run model.`);
  }

  function calibrateBeta() {
    setCalibrating(true);
    setCalibrationNote("Calibrating β to target R₀…");
    // Defer so the "Calibrating…" state paints before the synchronous search.
    window.setTimeout(() => {
      const calibration = calibrateInfectionRate(controlWorld, draftConfig, targetR0, { sampleSize: 150 });
      setDraftConfig((current) => ({ ...current, infectionRate: calibration.infectionRate }));
      setCalibrationNote(
        `β set to ${calibration.infectionRate.toFixed(2)} → model R₀≈${calibration.achievedR0.toFixed(2)} (target ${targetR0.toFixed(1)}). Run model to apply.`,
      );
      setCalibrating(false);
    }, 30);
  }

  function applyScenario() {
    setConfig(draftConfig);
    setDay(0);
    setPlaying(false);
  }

  function selectDataMode(dataMode: DataMode) {
    updateConfigValue(setDraftConfig, "dataMode", dataMode);
    setDay(0);
    setPlaying(false);
  }

  function selectSeedProfile(profileId: string) {
    setSelectedProfileId(profileId);
    updateConfigValue(setDraftConfig, "seedProfileId", profileId);
  }

  return (
    <main className="app">
      <header className="appHeader">
        <div>
          <p>OneGov #2 synthetic data</p>
          <h1>Synthetic Netherlands Pandemic Simulator</h1>
        </div>
        <nav className="viewTabs" aria-label="Simulation view">
          <button className={viewMode === "agent" ? "active" : ""} onClick={() => setViewMode("agent")}>
            Agent network
          </button>
          <button className={viewMode === "surveillance" ? "active" : ""} onClick={() => setViewMode("surveillance")}>
            Surveillance
          </button>
          {RotterdamMicroView && (
            <button className={`heavyTab ${viewMode === "rotterdam" ? "active" : ""}`} onClick={() => setViewMode("rotterdam")}>
              Rotterdam micro
            </button>
          )}
          {CellularAutomatonView && (
            <button
              className={`experimentalTab ${viewMode === "cellular" ? "active" : ""}`}
              title="Experimental: cellular-automaton density model"
              onClick={() => setViewMode((m) => (m === "cellular" ? "agent" : "cellular"))}
            >
              🧪
            </button>
          )}
        </nav>
        <div className="headerStats">
          {viewMode === "rotterdam" ? (
            <>
              <span>Rotterdam micro model</span>
              <span>672,935 synthetic residents</span>
              <span>GenSynthPop + CBS buurten</span>
            </>
          ) : viewMode !== "cellular" ? (
            <>
              <span>{formatNumber(world.agents.length)} agents</span>
              <span>{formatNumber(world.representedPopulation)} represented residents</span>
              <span>
                {world.profiles.length}{" "}
                {world.mode === "nation"
                  ? "city averages"
                  : `${AVAILABLE_CITIES.find((city) => city.id === world.mode)?.name ?? "city"} buurten`}
              </span>
              <span>{ensemble.runCount} stochastic runs</span>
            </>
          ) : (
            <>
              <span>CBS/PDOK 2024 grid</span>
              <span>cellular automaton</span>
              <span>density-weighted spread</span>
            </>
          )}
        </div>
      </header>

      {viewMode === "cellular" && CellularAutomatonView ? (
        <Suspense fallback={<div className="lazyFallback">Loading…</div>}>
          <CellularAutomatonView />
        </Suspense>
      ) : viewMode === "rotterdam" && RotterdamMicroView ? (
        <Suspense fallback={<div className="lazyFallback">Loading…</div>}>
          <RotterdamMicroView />
        </Suspense>
      ) : (
      <section className="dashboard">
        <aside className="controlPanel panel">
          <div className="panelTitle">
            <Settings2 size={18} />
            <h2>Scenario</h2>
          </div>

          <label className="selectBlock">
            <span>Data scope</span>
            <select value={draftConfig.dataMode} onChange={(event) => selectDataMode(event.target.value as DataMode)}>
              <option value="nation">National (city network)</option>
              <optgroup label="City (buurt-level)">
                {AVAILABLE_CITIES.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="selectBlock">
            <span>Index area</span>
            <select value={safeDraftSeedProfileId} onChange={(event) => selectSeedProfile(event.target.value)}>
              {controlWorld.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          <label className="selectBlock">
            <span>Scenario preset</span>
            <select
              value={presetId}
              onChange={(event) => {
                const preset = SCENARIO_PRESETS.find((item) => item.id === event.target.value);
                if (preset) applyPreset(preset);
                else setPresetId("");
              }}
            >
              <option value="">Custom…</option>
              {SCENARIO_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <div className="calibrationBlock">
            <SliderControl
              label="Target R₀"
              value={targetR0}
              min={0.5}
              max={6}
              step={0.1}
              onChange={(value) => setTargetR0(value)}
            />
            <button className="textButton" disabled={calibrating} onClick={calibrateBeta}>
              <FlaskConical size={15} />
              {calibrating ? "Calibrating…" : "Calibrate β → target R₀"}
            </button>
            {calibrationNote && <small className="calibrationNote">{calibrationNote}</small>}
          </div>

          <Accordion id="disease" title="Disease characteristics" open={openGroups} onToggle={toggleGroup}>
            <SliderControl
              label="Infection rate (β)"
              value={draftConfig.infectionRate}
              min={0.05}
              max={1.6}
              step={0.01}
              onChange={(value) => updateConfigValue(setDraftConfig, "infectionRate", value)}
            />
            <SliderControl
              label="Incubation"
              value={draftConfig.incubationDays}
              min={1}
              max={12}
              step={0.5}
              suffix=" d"
              onChange={(value) => updateConfigValue(setDraftConfig, "incubationDays", value)}
            />
            <SliderControl
              label="Infectious period"
              value={draftConfig.infectiousDays}
              min={2}
              max={16}
              step={0.5}
              suffix=" d"
              onChange={(value) => updateConfigValue(setDraftConfig, "infectiousDays", value)}
            />
            <SliderControl
              label="Lethality — IFR"
              value={currentIFR}
              min={0.01}
              max={75}
              step={0.01}
              formatValue={(value) => `${value < 1 ? value.toFixed(2) : value.toFixed(1)}%`}
              onChange={setIFR}
            />
            <div className="diseasePresets">
              {DISEASE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  className={`presetChip ${Math.abs(currentIFR - preset.ifr) < 0.05 ? "active" : ""}`}
                  title={`IFR ${preset.ifr}%`}
                  onClick={() => setIFR(preset.ifr)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <SliderControl
              label="Mortality multiplier (age skew)"
              value={draftConfig.mortalityMultiplier}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(value) => updateConfigValue(setDraftConfig, "mortalityMultiplier", value)}
            />
            <small className="ctrlNote">IFR = infection-fatality ratio (deaths ÷ infections). Presets use published estimates; high values model engineered, age-independent lethality. The multiplier scales the natural age-skew on top.</small>
          </Accordion>

          <Accordion id="transmission" title="Transmission settings" open={openGroups} onToggle={toggleGroup}>
            <SliderControl
              label="Mobility (work + commute)"
              value={draftConfig.mobilityIntensity}
              min={0}
              max={2}
              step={0.05}
              onChange={(value) => updateConfigValue(setDraftConfig, "mobilityIntensity", value)}
            />
            <SliderControl
              label="Events (0 = lockdown, 1.6+ = festivals)"
              value={draftConfig.eventIntensity}
              min={0}
              max={2}
              step={0.05}
              onChange={(value) => updateConfigValue(setDraftConfig, "eventIntensity", value)}
            />
            <SliderControl
              label="Household exposure"
              value={draftConfig.householdIntensity}
              min={0.4}
              max={2}
              step={0.05}
              onChange={(value) => updateConfigValue(setDraftConfig, "householdIntensity", value)}
            />
          </Accordion>

          <Accordion id="seeding" title="Outbreak seeding" open={openGroups} onToggle={toggleGroup}>
            <SliderControl
              label="Initial cases"
              value={draftConfig.initialCases}
              min={1}
              max={draftConfig.dataMode === "nation" ? 420 : 200}
              step={1}
              onChange={(value) => updateConfigValue(setDraftConfig, "initialCases", value)}
            />
            <SliderControl
              label="Ensemble runs"
              value={draftConfig.ensembleRuns}
              min={1}
              max={16}
              step={1}
              onChange={(value) => updateConfigValue(setDraftConfig, "ensembleRuns", value)}
            />
          </Accordion>

          <Accordion id="policy" title="Policy timing & effectiveness" open={openGroups} onToggle={toggleGroup}>
            <SliderControl
              label="Policy start"
              value={draftConfig.policyStartDay}
              min={0}
              max={120}
              step={1}
              suffix=" d"
              onChange={(value) => updateConfigValue(setDraftConfig, "policyStartDay", value)}
            />
            <SliderControl
              label="Mobility reduction"
              value={draftConfig.mobilityReduction}
              min={0}
              max={0.9}
              step={0.01}
              formatValue={(value) => formatPercent(value)}
              onChange={(value) => updateConfigValue(setDraftConfig, "mobilityReduction", value)}
            />
            <SliderControl
              label="Event reduction"
              value={draftConfig.eventReduction}
              min={0}
              max={0.98}
              step={0.01}
              formatValue={(value) => formatPercent(value)}
              onChange={(value) => updateConfigValue(setDraftConfig, "eventReduction", value)}
            />
          </Accordion>

          <Accordion id="immunity" title="Immunity & vaccination" open={openGroups} onToggle={toggleGroup}>
            <SliderControl
              label="Prior immunity"
              value={draftConfig.priorImmunity}
              min={0}
              max={0.8}
              step={0.01}
              formatValue={(value) => formatPercent(value)}
              onChange={(value) => updateConfigValue(setDraftConfig, "priorImmunity", value)}
            />
            <SliderControl
              label="Vaccination start"
              value={draftConfig.vaccinationStartDay}
              min={0}
              max={140}
              step={1}
              suffix=" d"
              onChange={(value) => updateConfigValue(setDraftConfig, "vaccinationStartDay", value)}
            />
            <SliderControl
              label="Vaccination coverage"
              value={draftConfig.vaccinationCoverage}
              min={0}
              max={0.95}
              step={0.01}
              formatValue={(value) => formatPercent(value)}
              onChange={(value) => updateConfigValue(setDraftConfig, "vaccinationCoverage", value)}
            />
            <SliderControl
              label="Vaccine effectiveness"
              value={draftConfig.vaccineEffectiveness}
              min={0}
              max={0.95}
              step={0.01}
              formatValue={(value) => formatPercent(value)}
              onChange={(value) => updateConfigValue(setDraftConfig, "vaccineEffectiveness", value)}
            />
          </Accordion>

          <div className="buttonRow">
            <button className="textButton runButton" disabled={!scenarioDirty} onClick={applyScenario}>
              <FlaskConical size={17} />
              Run model
            </button>
            <button className="iconButton primary" title={playing ? "Pause" : "Play"} onClick={() => setPlaying((value) => !value)}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="iconButton" title="Step one day" onClick={() => setDay((value) => Math.min(result.frames.length - 1, value + 1))}>
              <SkipForward size={18} />
            </button>
            <button className="iconButton" title="Reset scenario" onClick={resetScenario}>
              <RotateCcw size={18} />
            </button>
            <button className="textButton" onClick={() => downloadPopulation(world)}>
              <Download size={17} />
              CSV
            </button>
          </div>
          {scenarioDirty && <div className="pendingNotice">Settings changed. Run model to update the map and charts.</div>}

          <label className="controlBlock">
            <span>
              Speed
              <strong>{speed}x</strong>
            </span>
            <input type="range" min="1" max="6" step="1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
          </label>

          <label className="controlBlock dayScrubber">
            <span>
              Day
              <strong>{day}</strong>
            </span>
            <input
              type="range"
              min="0"
              max={result.frames.length - 1}
              step="1"
              value={day}
              onChange={(event) => {
                setPlaying(false);
                setDay(Number(event.target.value));
              }}
            />
          </label>
        </aside>

        <section className={`mapColumn ${viewMode === "surveillance" ? "surveillanceColumn" : ""}`}>
          <div className="metricGrid">
            <Metric
              label={STATE_LABELS[1]}
              value={formatInterval(ensembleFrame.totals.exposed)}
              hint={formatIntervalRange(ensembleFrame.totals.exposed)}
              tone="warn"
              icon={<Activity size={17} />}
            />
            <Metric
              label={STATE_LABELS[2]}
              value={formatInterval(ensembleFrame.totals.infectious)}
              hint={formatIntervalRange(ensembleFrame.totals.infectious)}
              tone="danger"
              icon={<Activity size={17} />}
            />
            <Metric label="Active share" value={formatPercent(activeTotal / world.representedPopulation)} tone="danger" icon={<Users size={17} />} />
            <Metric
              label="R effective"
              value={ensembleFrame.rEffective.mean.toFixed(2)}
              hint={ensemble.runCount > 1 ? `${ensembleFrame.rEffective.p10.toFixed(2)}-${ensembleFrame.rEffective.p90.toFixed(2)}` : undefined}
              tone={ensembleFrame.rEffective.mean > 1 ? "danger" : "good"}
              icon={<FlaskConical size={17} />}
            />
            <Metric
              label="Model R₀"
              value={impliedR0.toFixed(2)}
              hint="fully-susceptible baseline"
              tone={impliedR0 > 1 ? "warn" : "good"}
              icon={<FlaskConical size={17} />}
            />
            <Metric
              label={STATE_LABELS[4]}
              value={formatInterval(ensembleFrame.totals.deceased)}
              hint={formatIntervalRange(ensembleFrame.totals.deceased)}
              tone="danger"
              icon={<Skull size={17} />}
            />
          </div>

          {viewMode === "surveillance" ? (
            <SurveillanceView world={world} detection={detection} day={day} onSelectArea={selectSeedProfile} />
          ) : (
            <>
              <div className="middleToggle">
                <button className={middleView === "map" ? "active" : ""} onClick={() => setMiddleView("map")}>
                  <MapIcon size={15} /> Map
                </button>
                <button className={middleView === "trends" ? "active" : ""} onClick={() => setMiddleView("trends")}>
                  <LineChart size={15} /> Trends
                </button>
              </div>
              {middleView === "map" ? (
                <div className="mapPanel panel">
                  <NetherlandsMap world={world} frame={frame} selectedProfileId={safeSelectedProfileId} onSelectProfile={selectSeedProfile} />
                </div>
              ) : (
                <div className="trendsPanel panel">
                  <TimelineChart frames={result.frames} ensembleFrames={ensemble.frames} currentDay={day} runCount={ensemble.runCount} />
                </div>
              )}
            </>
          )}
        </section>

        <aside className="insightPanel panel">
          <div className="panelTitle">
            <Activity size={18} />
            <h2>Outbreak</h2>
          </div>

          <div className="focusBlock">
            <span>Selected area</span>
            <strong>{selectedProfile.name}</strong>
            <p>{formatPercent(selectedStats.activeRate)} active, signal {selectedStats.signal.toFixed(0)} per 100k</p>
          </div>

          <AgentInspector
            world={world}
            result={result}
            day={day}
            agentId={focusedAgentId}
            areaProfileId={safeSelectedProfileId}
            onSelectAgent={selectFocusAgent}
          />

          <div className="miniStats">
            <div>
              <span>Peak infectious</span>
              <strong>{formatNumber(ensemble.peakInfectious.mean)}</strong>
              <small>day {ensemble.peakDay.mean.toFixed(0)}</small>
            </div>
            <div>
              <span>Attack rate</span>
              <strong>{formatPercent(attackRate)}</strong>
              <small>cumulative</small>
            </div>
          </div>

          <section className="rankedList">
            <h3>Active areas</h3>
            {frame.areaStats.slice(0, 8).map((area) => (
              <button
                className={`rankItem ${area.profileId === safeSelectedProfileId ? "selected" : ""}`}
                key={area.profileId}
                onClick={() => selectSeedProfile(area.profileId)}
              >
                <span>
                  <strong>{area.municipality}</strong>
                  <small>{area.name}</small>
                </span>
                <i>
                  <b style={{ width: `${Math.min(100, area.activeRate * 450)}%` }} />
                </i>
                <em>{formatPercent(area.activeRate)}</em>
              </button>
            ))}
          </section>

          <section className="rwziList">
            <h3>RWZI proxy</h3>
            {frame.rwziSignals.slice(0, 5).map((signal) => (
              <div className="rwziItem" key={signal.rwziId}>
                <span>
                  <strong>{signal.rwziName}</strong>
                  <small>{signal.rwziId}</small>
                </span>
                <em>{signal.signal.toFixed(0)}</em>
              </div>
            ))}
          </section>

          <section className="transmissionList">
            <h3>New transmissions</h3>
            {Object.entries(frame.transmissionByLayer).map(([layer, value]) => (
              <div className="layerRow" key={layer}>
                <span>{layer}</span>
                <i>
                  <b style={{ width: `${transmissionTotal ? (value / transmissionTotal) * 100 : 0}%` }} />
                </i>
                <em>{formatNumber(value)}</em>
              </div>
            ))}
          </section>

          <section className="profileFacts">
            <h3>Catalogue fields</h3>
            <div className="pillGrid">
              <span>age bands</span>
              <span>households</span>
              <span>housing type</span>
              <span>income</span>
              <span>urbanity</span>
              <span>commute</span>
              {selectedProfile.facilityContext && <span>{selectedProfile.facilityContext.cafeCount1Km.toFixed(1)} cafes/km</span>}
              {selectedProfile.facilityContext && <span>{selectedProfile.facilityContext.trainDistanceKm.toFixed(1)} km rail</span>}
              <span>land use</span>
              <span>RWZI</span>
            </div>
          </section>
        </aside>
      </section>
      )}

      <footer className="sourceBar">
        {viewMode === "agent" ? (
          world.sourceNotes.map((note) => <span key={note}>{note}</span>)
        ) : (
          <>
            <span>CBS/PDOK Wijk- en Buurtkaart 2024 buurten: bevolkingsdichtheid_inwoners_per_km2.</span>
            <span>Cellular automaton inspired by the epidemic CA paper; this is an exploratory raster model.</span>
          </>
        )}
        <strong>Research prototype, not an operational forecast.</strong>
      </footer>
    </main>
  );
}
