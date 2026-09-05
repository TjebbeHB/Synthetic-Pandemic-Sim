import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FlaskConical, Pause, Play, RotateCcw, Skull, Train } from "lucide-react";
import {
  CLUSTERS,
  NL_BBOX,
  RAIL_EDGES,
  RAIL_HUBS,
  simulateMetapop,
  type MetapopConfig,
} from "../simulation/metapop";

const CW = 680, CH = 800;
const SEED = 20260623;
const [LON0, LAT0, LON1, LAT1] = NL_BBOX;
const LON_SCALE = Math.cos((52.2 * Math.PI) / 180); // degrees-lon → comparable km

// disease lethality presets (target IFR %)
const DISEASE_PRESETS = [
  { label: "Seasonal flu", ifr: 0.1, r0: 1.3 },
  { label: "COVID-19", ifr: 0.7, r0: 2.6 },
  { label: "1918 flu", ifr: 2.5, r0: 2.1 },
  { label: "SARS-CoV-1", ifr: 10, r0: 2.4 },
  { label: "Smallpox", ifr: 30, r0: 5 },
];

// measure packages tuned for the metapopulation (cut transmission + coupling)
const SCENARIOS = {
  none: { label: "No measures", start: 1000, strength: 0, mob: 0.6, rail: 0.5 },
  regional: { label: "Regional advisories", start: 20, strength: 0.35, mob: 0.45, rail: 0.4 },
  travel: { label: "Travel & rail curbs", start: 14, strength: 0.4, mob: 0.3, rail: 0.08 },
  national: { label: "National lockdown", start: 10, strength: 0.72, mob: 0.12, rail: 0.05 },
} as const;
type ScenarioKey = keyof typeof SCENARIOS;

// top clusters offered as named index-case options
const SEED_OPTIONS = CLUSTERS.filter((c) => c.name !== "—").slice(0, 70);

export default function NetherlandsMacroView() {
  const railHubSet = useMemo(() => new Set(RAIL_HUBS), []);

  // ---- controls (draft) ----
  const [r0, setR0] = useState(2.6);
  const [ifr, setIfr] = useState(0.7);
  const [incubationDays, setIncubation] = useState(5);
  const [infectiousDays, setInfectious] = useState(7);
  const [seedNode, setSeedNode] = useState(CLUSTERS[0].id);
  const [initialCases, setInitialCases] = useState(20);
  const [scenario, setScenario] = useState<ScenarioKey>("none");
  const [mobilityCoupling, setMobility] = useState(0.6);
  const [railCoupling, setRail] = useState(0.5);
  const [kernel, setKernel] = useState<"gravity" | "radiation">("radiation");
  const [stochastic, setStochastic] = useState(false);
  const [behaviourHeeding, setHeeding] = useState(0.35);
  const [behaviourAlarm, setAlarm] = useState(0.5);
  const [measuresStartDay, setStart] = useState(1000);
  const [measuresStrength, setStrength] = useState(0);
  const [openSection, setOpenSection] = useState("disease");
  const [showRail, setShowRail] = useState(true);

  // ---- playback ----
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function applyScenario(key: ScenarioKey) {
    setScenario(key);
    const s = SCENARIOS[key];
    setStart(s.start);
    setStrength(s.strength);
    setMobility(s.mob);
    setRail(s.rail);
  }

  const draft = { r0, ifr, incubationDays, infectiousDays, seedNode, initialCases, mobilityCoupling, railCoupling, kernel, stochastic, behaviourHeeding, behaviourAlarm, measuresStartDay, measuresStrength };
  const [applied, setApplied] = useState(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const runModel = () => { setApplied(draft); setDay(0); setPlaying(false); };

  const config: MetapopConfig = useMemo(() => ({
    r0: applied.r0, incubationDays: applied.incubationDays, infectiousDays: applied.infectiousDays,
    ifr: applied.ifr / 100, seedNode: applied.seedNode, initialCases: applied.initialCases,
    mobilityCoupling: applied.mobilityCoupling, railCoupling: applied.railCoupling,
    kernel: applied.kernel, stochastic: applied.stochastic,
    behaviourHeeding: applied.behaviourHeeding, behaviourAlarm: applied.behaviourAlarm,
    measuresStartDay: applied.measuresStartDay, measuresStrength: applied.measuresStrength,
    seed: SEED, maxDays: 180,
  }), [applied]);

  const result = useMemo(() => simulateMetapop(config), [config]);
  const frame = result.frames[Math.min(day, result.frames.length - 1)];
  const totalPop = useMemo(() => CLUSTERS.reduce((s, c) => s + c.pop, 0), []);

  useEffect(() => { setDay(0); setPlaying(false); }, [result]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setDay((d) => (d >= result.frames.length - 1 ? (setPlaying(false), d) : d + 1)), 80);
    return () => window.clearInterval(id);
  }, [playing, result.frames.length]);

  // ---- projection ----
  const proj = useMemo(() => {
    const pad = 18;
    const gw = (LON1 - LON0) * LON_SCALE, gh = LAT1 - LAT0;
    const s = Math.min((CW - 2 * pad) / gw, (CH - 2 * pad) / gh);
    const offX = (CW - s * gw) / 2, offY = (CH - s * gh) / 2;
    return { s, offX, offY };
  }, []);
  const vx = (lon: number) => proj.offX + (lon - LON0) * LON_SCALE * proj.s;
  const vy = (lat: number) => proj.offY + (LAT1 - lat) * proj.s;

  // ---- draw ----
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);
    const grad = ctx.createRadialGradient(CW * 0.4, CH * 0.35, 60, CW * 0.5, CH * 0.5, CH * 0.8);
    grad.addColorStop(0, "#152339"); grad.addColorStop(1, "#0a1120");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, CW, CH);

    const prev = frame.prevalence;
    // rail edges first (under the nodes)
    if (showRail) {
      for (const [a, b] of RAIL_EDGES) {
        const act = Math.max(prev[a], prev[b]);
        ctx.beginPath();
        ctx.moveTo(vx(CLUSTERS[a].lon), vy(CLUSTERS[a].lat));
        ctx.lineTo(vx(CLUSTERS[b].lon), vy(CLUSTERS[b].lat));
        ctx.strokeStyle = act > 0.005 ? `rgba(255,140,60,${0.25 + Math.min(0.6, act * 9)})` : "rgba(120,190,255,0.22)";
        ctx.lineWidth = act > 0.005 ? 2.2 : 1.1;
        ctx.stroke();
      }
    }

    // clusters
    for (const c of CLUSTERS) {
      const p = prev[c.id], m = frame.immune[c.id], dd = frame.dead[c.id];
      const x = vx(c.lon), y = vy(c.lat);
      const radius = 1.4 + Math.sqrt(c.pop) / 130;
      const redI = Math.min(1, p * 7);
      // base susceptible grey → recovered green tint → infected red
      let r = 124, g = 139, b = 149;
      r = r * (1 - m * 0.7) + 42 * m * 0.7; g = g * (1 - m * 0.7) + 168 * m * 0.7; b = b * (1 - m * 0.7) + 132 * m * 0.7;
      r = r * (1 - redI) + 232 * redI; g = g * (1 - redI) + 77 * redI; b = b * (1 - redI) + 79 * redI;
      if (dd > 0.01) { r = r * 0.5 + 20; g = g * 0.5; b = b * 0.5; }
      if (p > 0.01) {
        ctx.beginPath(); ctx.arc(x, y, radius + 3 + p * 26, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232,77,79,${Math.min(0.32, p * 5)})`; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.globalAlpha = p > 0.002 || m > 0.02 ? 0.95 : 0.5;
      ctx.fill(); ctx.globalAlpha = 1;
      if (railHubSet.has(c.id)) { ctx.strokeStyle = "rgba(150,205,255,0.55)"; ctx.lineWidth = 0.8; ctx.stroke(); }
    }

    // seed marker
    const seed = CLUSTERS[applied.seedNode];
    if (seed) {
      ctx.beginPath(); ctx.arc(vx(seed.lon), vy(seed.lat), 9, 0, Math.PI * 2);
      ctx.strokeStyle = "#6ea8ff"; ctx.lineWidth = 2; ctx.stroke();
    }
  }, [frame, proj, showRail, railHubSet, applied.seedNode]);

  // click → set seed to nearest cluster
  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * CW, cy = ((e.clientY - rect.top) / rect.height) * CH;
    let best = 0, bd = Infinity;
    for (const c of CLUSTERS) { const d = (vx(c.lon) - cx) ** 2 + (vy(c.lat) - cy) ** 2; if (d < bd) { bd = d; best = c.id; } }
    setSeedNode(best);
  }

  // ---- chart ----
  const series = useMemo(() => {
    const days = result.frames.map((f) => f.day);
    const active = result.frames.map((f) => f.totals.e + f.totals.i);
    const cumulative = result.frames.map((f) => f.totals.e + f.totals.i + f.totals.r + f.totals.d);
    const deceased = result.frames.map((f) => f.totals.d);
    const yMax = Math.max(1, ...cumulative);
    return { days, active, cumulative, deceased, yMax };
  }, [result]);
  const nowIdx = Math.min(day, result.frames.length - 1);
  const active = Math.round(frame.totals.e + frame.totals.i);
  const infectedTotal = Math.round(frame.totals.e + frame.totals.i + frame.totals.r + frame.totals.d);
  const deceased = Math.round(frame.totals.d);

  const CW2 = 560, CH2 = 200, PAD = { l: 52, r: 12, t: 12, b: 22 };
  const xAt = (i: number) => PAD.l + (i / Math.max(1, series.days.length - 1)) * (CW2 - PAD.l - PAD.r);
  const yAt = (v: number) => PAD.t + (CH2 - PAD.t - PAD.b) * (1 - v / series.yMax);
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
  const fmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v).toString());

  // hottest clusters now
  const hotspots = useMemo(() => {
    const idx = [...CLUSTERS.keys()].sort((a, b) => frame.active[b] - frame.active[a]).slice(0, 6);
    return idx.filter((i) => frame.active[i] > 1).map((i) => ({ name: CLUSTERS[i].name, active: Math.round(frame.active[i]) }));
  }, [frame]);

  return (
    <section className="rotterdamMicro">
      <div className="microMapWrap">
        <canvas ref={canvasRef} width={CW} height={CH} className="microCanvas" onClick={onClick} />
        <div className="microMapOverlay">
          <strong>Netherlands · macro model</strong>
          <span>{CLUSTERS.length} population clusters · {RAIL_EDGES.length} rail links · {(totalPop / 1e6).toFixed(1)}M residents</span>
          <span className="microHint">click the map to move the index case</span>
        </div>
        <div className="microViewControls">
          <button className={`hubToggle ${showRail ? "active" : ""}`} onClick={() => setShowRail((s) => !s)} title="Show the intercity rail backbone"><Train size={12} /> rail network</button>
        </div>
        <div className="microLegend">
          <span><i style={{ background: "#7c8b95" }} />Susceptible</span>
          <span><i style={{ background: "#e84d4f" }} />Active outbreak</span>
          <span><i style={{ background: "#2aa884" }} />Recovered/immune</span>
          <span><i className="railSwatch" />Rail link</span>
        </div>
      </div>

      <aside className="microPanel">
        <header className="microControls">
          <button className={`microRunButton ${dirty ? "dirty" : ""}`} disabled={!dirty} onClick={runModel}>
            <FlaskConical size={16} />{dirty ? "Run model — apply changes" : "Model up to date"}
          </button>
          <div className="microPlayRow">
            <button className="iconButton primary" onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="iconButton" title="Restart" onClick={() => { setDay(0); setPlaying(false); }}><RotateCcw size={16} /></button>
            <input type="range" min={0} max={result.frames.length - 1} value={day} onChange={(e) => { setPlaying(false); setDay(Number(e.target.value)); }} />
            <strong>day {day}</strong>
          </div>
          <div className="microMetrics">
            <div><span>Active</span><strong>{active.toLocaleString()}</strong></div>
            <div><span>Infected total</span><strong>{infectedTotal.toLocaleString()}</strong></div>
            <div className="micDeceased"><span><Skull size={11} /> Deceased</span><strong>{deceased.toLocaleString()}</strong></div>
            <div><span>Peak day</span><strong>d{result.peakDay}</strong></div>
          </div>
        </header>

        <div className="microChart">
          <svg viewBox={`0 0 ${CW2} ${CH2}`} role="img" aria-label="National epidemic curve">
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line x1={PAD.l} x2={CW2 - PAD.r} y1={yAt(series.yMax * g)} y2={yAt(series.yMax * g)} className="chartGrid" />
                <text x={6} y={yAt(series.yMax * g) + 4} className="chartAxis">{fmt(series.yMax * g)}</text>
              </g>
            ))}
            <path d={path(series.cumulative)} className="lineHosp" />
            <path d={path(series.active)} className="lineActive" />
            <path d={path(series.deceased)} className="lineDeceased" />
            <line x1={xAt(nowIdx)} x2={xAt(nowIdx)} y1={PAD.t} y2={CH2 - PAD.b} className="dayGuide" />
          </svg>
          <div className="microChartLegend">
            <span><i style={{ background: "#e84d4f" }} />Active</span>
            <span><i style={{ background: "#c08438" }} />Cumulative infected</span>
            <span><i style={{ background: "#2c3744" }} />Deceased</span>
          </div>
        </div>

        <Accordion id="disease" title="Disease characteristics" open={openSection} setOpen={setOpenSection}>
          <Slider label="Basic reproduction R₀" value={r0} min={0.6} max={6} step={0.05} fmt={(v) => v.toFixed(2)} onChange={setR0} />
          <Slider label="Incubation (days)" value={incubationDays} min={1} max={12} step={0.5} fmt={(v) => v.toFixed(1)} onChange={setIncubation} />
          <Slider label="Infectious period (days)" value={infectiousDays} min={2} max={16} step={0.5} fmt={(v) => v.toFixed(1)} onChange={setInfectious} />
          <Slider label="Lethality — IFR" value={ifr} min={0.01} max={40} step={0.01} fmt={(v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`} onChange={setIfr} />
          <div className="diseasePresets">
            {DISEASE_PRESETS.map((d) => (
              <button key={d.label} className={`presetChip ${Math.abs(ifr - d.ifr) < 0.001 ? "active" : ""}`} onClick={() => { setIfr(d.ifr); setR0(d.r0); }}>{d.label}</button>
            ))}
          </div>
        </Accordion>

        <Accordion id="spread" title="Spread & mobility" open={openSection} setOpen={setOpenSection}>
          <div className="microToggle">
            <span>Mobility model</span>
            <div className="diseasePresets">
              <button className={`presetChip ${kernel === "gravity" ? "active" : ""}`} onClick={() => setKernel("gravity")} title="w ∝ population ÷ distance²">Gravity</button>
              <button className={`presetChip ${kernel === "radiation" ? "active" : ""}`} onClick={() => setKernel("radiation")} title="Parameter-free Simini (2012) commuting model — reproduces real corridors from population alone">Radiation</button>
            </div>
          </div>
          <Slider label="🚗 Inter-town mobility" value={mobilityCoupling} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setMobility} />
          <Slider label="🚆 Rail coupling (intercity)" value={railCoupling} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setRail} />
          <div className="microToggle">
            <span>Run mode</span>
            <div className="diseasePresets">
              <button className={`presetChip ${!stochastic ? "active" : ""}`} onClick={() => setStochastic(false)} title="Continuous SEIRD compartments (ODE)">Deterministic</button>
              <button className={`presetChip ${stochastic ? "active" : ""}`} onClick={() => setStochastic(true)} title="Stochastic integer agents, 1 agent ≙ 12 people">Agent 12:1</button>
            </div>
          </div>
          <small className="microNote">{kernel === "radiation"
            ? "Radiation model: commuting flows derived from population geography alone (no fitted constant) — it reproduces the real Randstad corridors."
            : "Gravity model: flow ∝ population ÷ distance². Simple and tunable."} Rail coupling lets the outbreak jump along the NS backbone — turn it down to see travel-restriction containment.{stochastic ? " Agent mode adds demographic stochasticity (fade-outs, variable invasion); re-run to resample." : ""}</small>
        </Accordion>

        <Accordion id="behaviour" title="Public behaviour & awareness" open={openSection} setOpen={setOpenSection}>
          <Slider label="📣 Response to the news (heeding)" value={behaviourHeeding} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setHeeding} />
          <Slider label="🚨 Alarm sensitivity" value={behaviourAlarm} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setAlarm} />
          <div className="behaviourReadout">
            <div><span>Public alarm · day {day}</span><strong>{Math.round(frame.awareness * 100)}%</strong></div>
            <div><span>Realised mobility</span><strong>{Math.round(frame.mobilityNow * 100)}%</strong></div>
          </div>
          <small className="microNote">People voluntarily cut contacts as the visible hospital burden rises, and relax as it falls — which drives later waves. <b>Heeding</b> is how strongly they respond (0 = they ignore the media); <b>alarm sensitivity</b> is how early they react (high = react to small signals, low = only to severe waves). This is bottom-up behaviour, on top of any top-down measures below.</small>
        </Accordion>

        <Accordion id="measures" title="Measures & interventions" open={openSection} setOpen={setOpenSection}>
          <label className="microSelect"><span>Measures package</span>
            <select value={scenario} onChange={(e) => applyScenario(e.target.value as ScenarioKey)}>
              {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => <option key={k} value={k}>{SCENARIOS[k].label}</option>)}
            </select></label>
          <Slider label="Measures start (day)" value={measuresStartDay > 200 ? 200 : measuresStartDay} min={0} max={200} step={1} fmt={(v) => (v >= 200 ? "never" : `d${v}`)} onChange={(v) => setStart(v >= 200 ? 1000 : v)} />
          <Slider label="Measures strength" value={measuresStrength} min={0} max={0.9} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setStrength} />
          <small className="microNote">Strength cuts both transmission and mobility/rail coupling from the start day onward.</small>
        </Accordion>

        <Accordion id="origin" title="Outbreak origin" open={openSection} setOpen={setOpenSection}>
          <label className="microSelect"><span>Index-case cluster</span>
            <select value={SEED_OPTIONS.some((c) => c.id === seedNode) ? seedNode : ""} onChange={(e) => setSeedNode(Number(e.target.value))}>
              {!SEED_OPTIONS.some((c) => c.id === seedNode) && <option value="">(custom — set on map)</option>}
              {SEED_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.name} ({(c.pop / 1000).toFixed(0)}k)</option>)}
            </select></label>
          <Slider label="Initial cases" value={initialCases} min={1} max={500} step={1} fmt={(v) => String(v)} onChange={setInitialCases} />
        </Accordion>

        <section className="microQuality">
          <h3>🔥 Hottest clusters · day {day}</h3>
          {hotspots.length === 0 && <small className="qualityIntro">No active clusters yet at this day.</small>}
          {hotspots.map((h, i) => (
            <div key={i} className="qualityRow"><span>{h.name}</span><strong className="warn">{h.active.toLocaleString()} active</strong></div>
          ))}
          <small>Metapopulation SEIRD over {CLUSTERS.length} density clusters from the CBS/PDOK population raster, coupled by gravity diffusion + the real NS intercity rail backbone. National what-if model, not a street-level forecast.</small>
        </section>
      </aside>
    </section>
  );
}

function Accordion({ id, title, open, setOpen, children }: { id: string; title: string; open: string; setOpen: (s: string) => void; children: React.ReactNode }) {
  const isOpen = open === id;
  return (
    <div className={`microAccordion ${isOpen ? "open" : ""}`}>
      <button className="accordionHead" onClick={() => setOpen(isOpen ? "" : id)}>
        <span>{title}</span><ChevronDown size={16} className="accordionChevron" />
      </button>
      {isOpen && <div className="accordionBody">{children}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="microSlider">
      <span>{label}<strong>{fmt(value)}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
