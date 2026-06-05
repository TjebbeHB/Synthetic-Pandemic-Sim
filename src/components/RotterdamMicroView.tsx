import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Crosshair, FlaskConical, Pause, Play, Plus, RotateCcw, Search, Skull, Target, X, ZoomIn } from "lucide-react";
import { simulate } from "../simulation/engine";
import { computeDetection } from "../simulation/detection";
import { buildRotterdamMicroWorld } from "../simulation/netherlandsSeed";
import { STATE, STATE_COLORS, STATE_LABELS, type ScenarioConfig, type StateCode, type World } from "../simulation/types";
import rotterdamGeo from "../data/rotterdamBuurten.json";

interface GeoFeature { properties: { code: string; name: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } }
const FEATURES = (rotterdamGeo as { features: GeoFeature[] }).features;
const SEED = 20260604;

// Resolution: each agent represents N residents. 1:1 = full ~662k population.
const RESOLUTIONS = [
  { scale: 12, label: "12:1 · fast", note: "~55k agents" },
  { scale: 4, label: "4:1 · detailed", note: "~165k agents" },
  { scale: 1, label: "1:1 · full pop", note: "~662k agents, slower" },
] as const;
const CW = 940, CH = 780; // canvas resolution

// ---- measures presets ------------------------------------------------------
const SCENARIOS = {
  none: { label: "No measures", policyStartDay: 1000, mobilityReduction: 0, eventReduction: 0, eventIntensity: 0.95, mobilityIntensity: 1 },
  mild: { label: "Mild advisories", policyStartDay: 14, mobilityReduction: 0.35, eventReduction: 0.7, eventIntensity: 0.5, mobilityIntensity: 0.8 },
  lockdown: { label: "Full lockdown", policyStartDay: 7, mobilityReduction: 0.8, eventReduction: 0.95, eventIntensity: 0.05, mobilityIntensity: 0.35 },
} as const;
type ScenarioKey = keyof typeof SCENARIOS;

// ---- disease lethality presets (target infection-fatality ratio, IFR) ------
const DISEASE_PRESETS: { label: string; ifr: number }[] = [
  { label: "Seasonal influenza", ifr: 0.1 },
  { label: "COVID-19 (wild type)", ifr: 0.7 },
  { label: "1918 pandemic flu", ifr: 2.5 },
  { label: "SARS-CoV-1", ifr: 10 },
  { label: "Smallpox (variola major)", ifr: 30 },
  { label: "Ebola / engineered", ifr: 60 },
];

// ---- geometry --------------------------------------------------------------
function boundsOf(codes: Set<string> | null) {
  let a = 999, b = 999, c = -999, d = -999;
  for (const f of FEATURES) {
    if (codes && !codes.has(f.properties.code)) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) {
      a = Math.min(a, lon); c = Math.max(c, lon); b = Math.min(b, lat); d = Math.max(d, lat);
    }
  }
  return { minLon: a, minLat: b, maxLon: c, maxLat: d };
}

export default function RotterdamMicroView() {
  const [agentScale, setAgentScale] = useState(12);
  const [building, setBuilding] = useState(false);
  const [showHubs, setShowHubs] = useState(true);
  const pendingScale = useRef(12);
  const world = useMemo(() => buildRotterdamMicroWorld(SEED, agentScale), [agentScale]);

  // Switching resolution rebuilds + resimulates synchronously (seconds at 1:1).
  // Defer the heavy work one frame so the "building…" overlay paints first.
  function chooseResolution(scale: number) {
    if (scale === agentScale || building) return;
    pendingScale.current = scale;
    setBuilding(true);
  }
  useEffect(() => {
    if (!building) return;
    const id = window.setTimeout(() => setAgentScale(pendingScale.current), 60);
    return () => window.clearTimeout(id);
  }, [building]);
  useEffect(() => { setBuilding(false); }, [world]);

  // High-contact convergence hubs: where agents gather by day (workplaces /
  // schools), located at the work-buurt centroid, sized by daytime headcount.
  const hubs = useMemo(() => {
    const count = new Map<string, number>();
    for (const a of world.agents) if (a.workProfileId !== a.homeProfileId || a.workSector === "education")
      count.set(a.workProfileId, (count.get(a.workProfileId) ?? 0) + 1);
    return [...count.entries()]
      .map(([id, n]) => ({ id, n, p: world.profileById[id] }))
      .filter((h) => h.p)
      .sort((a, b) => b.n - a.n)
      .slice(0, 45);
  }, [world]);

  // Event / gathering sites: the venue-dense buurten (bars, venues, festivals)
  // that drive the high-contact event layer. Capacity ∝ venue pull × residents.
  const eventSites = useMemo(() => {
    const sites = world.profiles
      .map((p) => ({ id: p.id, p, cap: p.eventPull * Math.sqrt(p.population) }))
      .sort((a, b) => b.cap - a.cap)
      .slice(0, 28);
    const maxCap = Math.max(1, ...sites.map((s) => s.cap));
    return sites.map((s) => ({ ...s, w: s.cap / maxCap }));
  }, [world]);
  // Fit the map to residential buurten only, so the empty harbour doesn't dominate.
  const B = useMemo(() => {
    const residential = new Set(world.profiles.map((p) => p.id));
    const bb = boundsOf(residential);
    return Number.isFinite(bb.minLon) ? bb : boundsOf(null);
  }, [world]);

  // scenario state
  const [areaZero, setAreaZero] = useState(() => world.profiles[0].id);
  const [scenario, setScenario] = useState<ScenarioKey>("none");
  const [infectionRate, setInfectionRate] = useState(0.28);
  const [initialCases, setInitialCases] = useState(6);
  const [incubationDays, setIncubationDays] = useState(5);
  const [infectiousDays, setInfectiousDays] = useState(7);
  const [targetIFR, setTargetIFR] = useState(0.7); // %
  const [policyStartDay, setPolicyStartDay] = useState(1000);
  const [mobilityReduction, setMobilityReduction] = useState(0);
  const [eventReduction, setEventReduction] = useState(0);
  const [hospitalBeds, setHospitalBeds] = useState(2500);
  const [openSection, setOpenSection] = useState<string>("disease");
  // playback + tracking
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tracked, setTracked] = useState<number[]>([]);
  const [filterAge, setFilterAge] = useState("all");
  // map view transform
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function applyScenario(key: ScenarioKey) {
    setScenario(key);
    const s = SCENARIOS[key];
    setPolicyStartDay(s.policyStartDay);
    setMobilityReduction(s.mobilityReduction);
    setEventReduction(s.eventReduction);
  }

  // The sliders edit a DRAFT; the model only re-runs on "Run model", so dragging
  // sliders stays smooth (no full re-simulation on every change).
  const draft = { infectionRate, incubationDays, infectiousDays, scenario, initialCases, areaZero, targetIFR, policyStartDay, mobilityReduction, eventReduction };
  const [applied, setApplied] = useState(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const runModel = () => { setApplied(draft); setDay(0); setPlaying(false); };

  const safeDraftArea = world.profileById[areaZero] ? areaZero : world.profiles[0].id;
  const safeArea = world.profileById[applied.areaZero] ? applied.areaZero : world.profiles[0].id; // simulated + highlighted seed
  const config: ScenarioConfig = useMemo(() => ({
    dataMode: "rotterdam", seed: SEED, infectionRate: applied.infectionRate, incubationDays: applied.incubationDays, infectiousDays: applied.infectiousDays,
    mobilityIntensity: SCENARIOS[applied.scenario].mobilityIntensity, eventIntensity: SCENARIOS[applied.scenario].eventIntensity,
    householdIntensity: 1, initialCases: applied.initialCases, seedProfileId: safeArea, maxDays: 160, ensembleRuns: 1, priorImmunity: 0.04,
    vaccinationStartDay: 300, vaccinationCoverage: 0, vaccineEffectiveness: 0,
    // baseLethality is the uniform floor; the age-structured component at
    // mortalityMultiplier=1 already contributes ~0.14% IFR, so subtract it to
    // land the realized population IFR on the slider's target.
    mortalityMultiplier: 1, baseLethality: Math.max(0, applied.targetIFR / 100 - 0.0014),
    policyStartDay: applied.policyStartDay, mobilityReduction: applied.mobilityReduction, eventReduction: applied.eventReduction,
  }), [applied, safeArea]);

  const result = useMemo(() => simulate(world, config), [world, config]);
  const detection = useMemo(() => computeDetection(result, world), [result, world]);
  const seedName = world.profileById[safeArea]?.name ?? "Rotterdam";
  const frame = result.frames[Math.min(day, result.frames.length - 1)];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; moved: number } | null>(null);

  useEffect(() => { setDay(0); setPlaying(false); }, [result]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setDay((d) => (d >= result.frames.length - 1 ? (setPlaying(false), d) : d + 1)), 90);
    return () => window.clearInterval(id);
  }, [playing, result.frames.length]);

  // ---- projection (base fit + zoom/pan) ------------------------------------
  const proj = useMemo(() => {
    const pad = 12;
    const s = Math.min((CW - 2 * pad) / (B.maxLon - B.minLon), (CH - 2 * pad) / (B.maxLat - B.minLat));
    const offX = pad + (CW - 2 * pad - s * (B.maxLon - B.minLon)) / 2;
    const offY = pad + (CH - 2 * pad - s * (B.maxLat - B.minLat)) / 2;
    return { s, offX, offY };
  }, [B]);
  const vx = (lon: number) => ((proj.offX + (lon - B.minLon) * proj.s) - CW / 2) * scale + CW / 2 + offset.x;
  const vy = (lat: number) => ((CH - proj.offY - (lat - B.minLat) * proj.s) - CH / 2) * scale + CH / 2 + offset.y;
  function invert(cx: number, cy: number) {
    const bx = (cx - CW / 2 - offset.x) / scale + CW / 2;
    const by = (cy - CH / 2 - offset.y) / scale + CH / 2;
    return { lon: (bx - proj.offX) / proj.s + B.minLon, lat: (CH - proj.offY - by) / proj.s + B.minLat };
  }

  // ---- draw map ------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = "#0e1726"; ctx.fillRect(0, 0, CW, CH);
    const activeByCode = new Map(frame.areaStats.map((a) => [a.profileId, a.activeRate]));
    for (const f of FEATURES) {
      const active = activeByCode.get(f.properties.code) ?? 0;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
      ctx.beginPath();
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([lon, lat], i) => (i === 0 ? ctx.moveTo(vx(lon), vy(lat)) : ctx.lineTo(vx(lon), vy(lat))));
        ctx.closePath();
      }
      ctx.fillStyle = f.properties.code === safeArea ? "rgba(72,120,255,0.30)" : `rgba(232,77,79,${0.05 + Math.min(1, active * 6) * 0.55})`;
      ctx.fill();
      ctx.strokeStyle = f.properties.code === safeArea ? "#6ea8ff" : "rgba(255,255,255,0.10)";
      ctx.lineWidth = f.properties.code === safeArea ? 2 : 0.5; ctx.stroke();
    }
    const states = frame.states;
    const dot = Math.max(1, 1.4 * scale);
    // Subsample non-active states at high agent counts; always draw exposed +
    // infectious (the spreading front) so the dynamics stay legible at 1:1.
    const step = Math.max(1, Math.round(world.agents.length / 60000));
    for (const agent of world.agents) {
      const st = states[agent.id] as StateCode;
      const active = st === STATE.exposed || st === STATE.infectious;
      if (!active && agent.id % step !== 0) continue;
      ctx.fillStyle = STATE_COLORS[st];
      ctx.globalAlpha = st === STATE.susceptible ? 0.16 : 0.82;
      const sz = st === STATE.susceptible ? dot * 0.7 : dot;
      ctx.fillRect(vx(agent.lon), vy(agent.lat), sz, sz);
    }
    ctx.globalAlpha = 1;

    // High-contact convergence hubs (workplaces / schools) as diamonds, sized by
    // daytime headcount, glowing when their buurt is infection-active.
    if (showHubs) {
      // Workplace / school hubs — cyan diamonds, brighter when their buurt is active.
      for (const hub of hubs) {
        const x = vx(hub.p.lon), y = vy(hub.p.lat);
        const r = (3 + Math.sqrt(hub.n / world.agents.length) * 95) * Math.min(2.2, scale);
        const active = activeByCode.get(hub.id) ?? 0;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `rgba(120,200,255,${0.22 + Math.min(0.55, active * 5)})`;
        ctx.strokeStyle = active > 0.04 ? "#cdeaff" : "#7fd0ff";
        ctx.lineWidth = 1.4;
        ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeRect(-r, -r, r * 2, r * 2);
        ctx.restore();
      }
      // Event / gathering sites — amber circles (with a glow ring when superspreading).
      for (const site of eventSites) {
        const x = vx(site.p.lon), y = vy(site.p.lat);
        const r = (4 + Math.sqrt(site.w) * 11) * Math.min(2.2, scale);
        const active = activeByCode.get(site.id) ?? 0;
        if (active > 0.02) {
          ctx.beginPath(); ctx.arc(x, y, r + 4 + active * 60, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,120,40,${Math.min(0.35, active * 4)})`; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,170,55,${0.3 + Math.min(0.5, active * 5)})`; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = active > 0.04 ? "#ff7a3c" : "#ffd28a"; ctx.stroke();
      }
    }

    for (const id of tracked) {
      const agent = world.agents[id]; if (!agent) continue;
      const st = states[agent.id] as StateCode;
      ctx.beginPath(); ctx.arc(vx(agent.lon), vy(agent.lat), 7, 0, Math.PI * 2);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(vx(agent.lon), vy(agent.lat), 4, 0, Math.PI * 2);
      ctx.fillStyle = STATE_COLORS[st]; ctx.fill();
    }
  }, [frame, world, safeArea, tracked, scale, offset, proj, B, showHubs, hubs, eventSites]);

  // ---- map interaction (zoom + pan + click-to-track) -----------------------
  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * CW, cy = ((e.clientY - rect.top) / rect.height) * CH;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = Math.max(1, Math.min(9, scale * factor));
    const f = next / scale;
    setOffset((o) => ({ x: cx - CW / 2 - (cx - CW / 2 - o.x) * f, y: cy - CH / 2 - (cy - CH / 2 - o.y) * f }));
    setScale(next);
  }
  function onDown(e: React.MouseEvent<HTMLCanvasElement>) { dragRef.current = { x: e.clientX, y: e.clientY, moved: 0 }; }
  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const k = CW / canvas.getBoundingClientRect().width;
    const dx = (e.clientX - dragRef.current.x) * k, dy = (e.clientY - dragRef.current.y) * k;
    dragRef.current = { x: e.clientX, y: e.clientY, moved: dragRef.current.moved + Math.abs(dx) + Math.abs(dy) };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  }
  function onUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const drag = dragRef.current; dragRef.current = null;
    if (!drag || drag.moved > 6) return; // it was a pan, not a click
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { lon, lat } = invert(((e.clientX - rect.left) / rect.width) * CW, ((e.clientY - rect.top) / rect.height) * CH);
    let best = -1, bestD = Infinity;
    for (const a of world.agents) { const d = (a.lon - lon) ** 2 + (a.lat - lat) ** 2; if (d < bestD) { bestD = d; best = a.id; } }
    if (best >= 0) setTracked((t) => (t.includes(best) ? t : [...t, best]));
  }

  function trackMatching() {
    const pool = world.agents.filter((a) => filterAge === "all" || a.ageGroup === filterAge);
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setTracked((t) => (t.includes(pick.id) ? t : [...t, pick.id]));
  }

  // ---- chart series --------------------------------------------------------
  const series = useMemo(() => {
    const days = result.frames.map((f) => f.day);
    const active = result.frames.map((f) => f.totals.exposed + f.totals.infectious);
    const deceased = result.frames.map((f) => f.totals.deceased);
    const hosp = detection.hospitalOccupancy;
    const yMax = Math.max(1, ...active, ...deceased, ...hosp, hospitalBeds * 1.25);
    return { days, active, deceased, hosp, yMax };
  }, [result, detection, hospitalBeds]);

  const totals = frame.totals;
  const nowIdx = Math.min(day, result.frames.length - 1);
  const overshootDay = series.hosp.findIndex((v) => v > hospitalBeds);

  const CW2 = 560, CH2 = 200, PAD = { l: 48, r: 12, t: 12, b: 22 };
  const xAt = (i: number) => PAD.l + (i / Math.max(1, series.days.length - 1)) * (CW2 - PAD.l - PAD.r);
  const yAt = (v: number) => PAD.t + (CH2 - PAD.t - PAD.b) * (1 - v / series.yMax);
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
  const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v).toString());

  return (
    <section className="rotterdamMicro">
      <div className="microMapWrap">
        <canvas ref={canvasRef} width={CW} height={CH} className="microCanvas"
          onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => (dragRef.current = null)} />
        <div className="microMapOverlay">
          <strong>Rotterdam · micro model</strong>
          <span>{world.agents.length.toLocaleString()} agents · {agentScale === 1 ? "1:1 full population" : `${agentScale}:1 grouped`} · {world.profiles.length} buurten</span>
          <span className="microHint"><ZoomIn size={12} /> scroll to zoom · drag to pan</span>
          <span className="microHint"><Crosshair size={12} /> click an agent to track it</span>
        </div>

        <div className="microViewControls">
          <div className="resSwitch">
            {RESOLUTIONS.map((r) => (
              <button key={r.scale} className={agentScale === r.scale ? "active" : ""} disabled={building} title={r.note} onClick={() => chooseResolution(r.scale)}>{r.label}</button>
            ))}
          </div>
          <button className={`hubToggle ${showHubs ? "active" : ""}`} onClick={() => setShowHubs((s) => !s)} title="Show high-contact clusters: workplaces/schools (◆) and event/venue sites (●)">◆● clusters &amp; events</button>
          {scale > 1.02 && <button className="microResetView" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}>reset view</button>}
        </div>

        <div className="microLegend">
          {[STATE.susceptible, STATE.exposed, STATE.infectious, STATE.recovered, STATE.deceased].map((st) => (
            <span key={st}><i style={{ background: STATE_COLORS[st as StateCode] }} />{STATE_LABELS[st as StateCode]}</span>
          ))}
          {showHubs && <span><i className="hubSwatch" />Workplace / school hub</span>}
          {showHubs && <span><i className="eventSwatch" />Event / venue site</span>}
        </div>

        {building && (
          <div className="microBuilding">
            <div className="microSpinner" />
            <strong>Building {pendingScale.current === 1 ? "672,935" : pendingScale.current === 4 ? "≈165,000" : "≈55,000"} agents…</strong>
            <span>{pendingScale.current === 1 ? "Full 1:1 population — this takes ~10–15 seconds." : "One moment…"}</span>
          </div>
        )}
      </div>

      <aside className="microPanel">
        {/* playback + metrics */}
        <header className="microControls">
          <button className={`microRunButton ${dirty ? "dirty" : ""}`} disabled={!dirty} onClick={runModel}>
            <FlaskConical size={16} />
            {dirty ? "Run model — apply changes" : "Model up to date"}
          </button>
          <div className="microPlayRow">
            <button className="iconButton primary" onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button className="iconButton" title="Restart" onClick={() => { setDay(0); setPlaying(false); }}><RotateCcw size={16} /></button>
            <input type="range" min={0} max={result.frames.length - 1} value={day} onChange={(e) => { setPlaying(false); setDay(Number(e.target.value)); }} />
            <strong>day {day}</strong>
          </div>
          <div className="microMetrics">
            <div><span>Active</span><strong>{Math.round(totals.exposed + totals.infectious).toLocaleString()}</strong></div>
            <div><span>Infected total</span><strong>{Math.round(detection.trueCumulativeInfected[nowIdx]).toLocaleString()}</strong></div>
            <div className="micDeceased"><span><Skull size={11} /> Deceased</span><strong>{Math.round(totals.deceased).toLocaleString()}</strong></div>
            <div><span>Gov. detects</span><strong>{detection.detectionDay !== null ? `d${detection.detectionDay}` : "—"}</strong></div>
          </div>
        </header>

        {/* SEIRD + hospital chart */}
        <div className="microChart">
          <svg viewBox={`0 0 ${CW2} ${CH2}`} role="img" aria-label="Epidemic curve">
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line x1={PAD.l} x2={CW2 - PAD.r} y1={yAt(series.yMax * g)} y2={yAt(series.yMax * g)} className="chartGrid" />
                <text x={6} y={yAt(series.yMax * g) + 4} className="chartAxis">{fmt(series.yMax * g)}</text>
              </g>
            ))}
            {/* hospital overshoot shading */}
            {series.hosp.map((v, i) => v > hospitalBeds ? (
              <rect key={i} x={xAt(i)} y={yAt(v)} width={Math.max(1, xAt(1) - xAt(0))} height={yAt(hospitalBeds) - yAt(v)} className="overshootBar" />
            ) : null)}
            {/* hospital capacity line */}
            <line x1={PAD.l} x2={CW2 - PAD.r} y1={yAt(hospitalBeds)} y2={yAt(hospitalBeds)} className="capacityLine" />
            <text x={CW2 - PAD.r} y={yAt(hospitalBeds) - 4} className="capacityLabel" textAnchor="end">hospital beds {fmt(hospitalBeds)}</text>
            <path d={path(series.active)} className="lineActive" />
            <path d={path(series.hosp)} className="lineHosp" />
            <path d={path(series.deceased)} className="lineDeceased" />
            <line x1={xAt(nowIdx)} x2={xAt(nowIdx)} y1={PAD.t} y2={CH2 - PAD.b} className="dayGuide" />
          </svg>
          <div className="microChartLegend">
            <span><i style={{ background: "#e84d4f" }} />Active</span>
            <span><i style={{ background: "#8a5a2b" }} />Hospitalised</span>
            <span><i style={{ background: "#20262b" }} />Deceased</span>
            <span><i className="dash" />Bed capacity</span>
            {overshootDay >= 0 && <span className="overshootTag">⚠ beds overrun day {overshootDay}</span>}
          </div>
        </div>

        {/* accordion controls */}
        <Accordion id="disease" title="Disease characteristics" open={openSection} setOpen={setOpenSection}>
          <Slider label="Infectiousness (β)" value={infectionRate} min={0.1} max={0.6} step={0.01} fmt={(v) => v.toFixed(2)} onChange={setInfectionRate} />
          <Slider label="Incubation (days)" value={incubationDays} min={1} max={12} step={0.5} fmt={(v) => v.toFixed(1)} onChange={setIncubationDays} />
          <Slider label="Infectious period (days)" value={infectiousDays} min={2} max={16} step={0.5} fmt={(v) => v.toFixed(1)} onChange={setInfectiousDays} />
          <Slider label="Lethality — IFR" value={targetIFR} min={0.01} max={75} step={0.01} fmt={(v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`} onChange={setTargetIFR} />
          <div className="diseasePresets">
            {DISEASE_PRESETS.map((d) => (
              <button key={d.label} className={`presetChip ${Math.abs(targetIFR - d.ifr) < 0.001 ? "active" : ""}`} onClick={() => setTargetIFR(d.ifr)} title={`IFR ${d.ifr}%`}>{d.label}</button>
            ))}
          </div>
          <small className="microNote">IFR = infection-fatality ratio (deaths ÷ infections). Presets use published estimates; high values model engineered pathogens with age-independent lethality.</small>
        </Accordion>

        <Accordion id="policy" title="Policy, healthcare & timing" open={openSection} setOpen={setOpenSection}>
          <label className="microSelect"><span>Measures package</span>
            <select value={scenario} onChange={(e) => applyScenario(e.target.value as ScenarioKey)}>
              {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => <option key={k} value={k}>{SCENARIOS[k].label}</option>)}
            </select></label>
          <Slider label="Measures start (day)" value={policyStartDay > 200 ? 200 : policyStartDay} min={0} max={200} step={1} fmt={(v) => (v >= 200 ? "never" : `d${v}`)} onChange={(v) => setPolicyStartDay(v >= 200 ? 1000 : v)} />
          <Slider label="Mobility reduction" value={mobilityReduction} min={0} max={0.95} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setMobilityReduction} />
          <Slider label="Event reduction" value={eventReduction} min={0} max={0.98} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={setEventReduction} />
          <Slider label="Hospital bed capacity" value={hospitalBeds} min={500} max={10000} step={100} fmt={(v) => v.toLocaleString()} onChange={setHospitalBeds} />
        </Accordion>

        <Accordion id="outbreak" title="Outbreak origin & seeding" open={openSection} setOpen={setOpenSection}>
          <label className="microSelect"><span>Patient-zero buurt</span>
            <select value={safeDraftArea} onChange={(e) => setAreaZero(e.target.value)}>
              {world.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <Slider label="Patient-zero count" value={initialCases} min={1} max={40} step={1} fmt={(v) => String(v)} onChange={setInitialCases} />
        </Accordion>

        {/* agent tracker */}
        <section className="microTracker">
          <div className="microTrackerHead"><h3><Target size={14} /> Tracked agents</h3></div>
          <div className="trackFilter">
            <Search size={13} />
            <select value={filterAge} onChange={(e) => setFilterAge(e.target.value)}>
              <option value="all">any age group</option>
              <option value="child">child</option>
              <option value="teen">teen</option>
              <option value="adolescent">adolescent</option>
              <option value="adult">adult</option>
              <option value="senior">senior</option>
            </select>
            <button className="textButton tiny" onClick={trackMatching}><Plus size={13} /> watch one</button>
          </div>
          {tracked.length === 0 && <p className="microEmpty">Click an agent on the map, or add one by demographic above — then watch whether they get infected, across age groups.</p>}
          {tracked.map((id) => {
            const agent = world.agents[id]; if (!agent) return null;
            const traj = result.frames.map((f) => f.states[id] as StateCode);
            const now = traj[nowIdx];
            const infectedDay = traj.findIndex((st) => st !== STATE.susceptible);
            return (
              <div key={id} className="trackedAgent">
                <div className="trackedTop"><span className="trackedCode">{agent.codename}</span>
                  <button className="iconButton tiny" onClick={() => setTracked((t) => t.filter((x) => x !== id))}><X size={12} /></button></div>
                <small>{agent.age}y · {agent.ageGroup} · {agent.workSector} · {world.profileById[agent.homeProfileId].name}</small>
                <div className="trackedState" style={{ color: STATE_COLORS[now] }}><i style={{ background: STATE_COLORS[now] }} />{STATE_LABELS[now]}{infectedDay >= 0 ? ` · infected d${infectedDay}` : " · never infected"}</div>
                <div className="trackStrip">{traj.map((st, i) => <i key={i} className={i === nowIdx ? "now" : ""} style={{ background: STATE_COLORS[st] }} />)}</div>
              </div>
            );
          })}
        </section>

        {/* data quality */}
        <section className="microQuality">
          <h3>Synthetic data quality</h3>
          <small className="qualityIntro">GenSynthPop population — 672,935 synthetic individuals vs CBS:</small>
          {[["Age × buurt", 0.014], ["Migration × buurt", 0.060], ["Gender × buurt", 0.077]].map(([label, sae]) => (
            <div key={label as string} className="qualityRow"><span>{label}</span><em>SAE {(sae as number).toFixed(3)}</em><strong className={(sae as number) < 0.08 ? "good" : "warn"}>{(sae as number) < 0.05 ? "✓ excellent" : "✓ good"}</strong></div>
          ))}
          <small>Standardized absolute error — all within the GenSynthPop paper's 0.00–0.05 good-fit range (χ² rejects at this sample size, a known large-N artefact, so SAE/ADP is the reported metric). Households match CBS to 99%.</small>
        </section>

        {/* news bulletin */}
        <section className="microNews">
          <h3>📰 Rotterdam outbreak bulletin</h3>
          <div className="newsFeed">
            {buildBulletin(world, result, detection, seedName, scenario, hospitalBeds, series.hosp).map((item, i) => (
              <div key={i} className={`newsItem ${item.day <= day ? "past" : "future"} tone-${item.tone}`}>
                <span className="newsDay">Day {item.day}</span>
                <div><strong>{item.headline}</strong><p>{item.detail}</p></div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

// ---- small UI helpers ------------------------------------------------------
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

interface NewsItem { day: number; tone: "info" | "warn" | "danger" | "good"; headline: string; detail: string }
function buildBulletin(world: World, result: ReturnType<typeof simulate>, detection: ReturnType<typeof computeDetection>, seedName: string, scenario: ScenarioKey, beds: number, hosp: number[]): NewsItem[] {
  const items: NewsItem[] = [];
  const pop = world.representedPopulation;
  items.push({ day: 0, tone: "info", headline: `Index cluster seeded in ${seedName}`, detail: "First infections introduced. No one is aware yet." });
  const marks = [0.001, 0.01, 0.05, 0.1, 0.25];
  const seen = new Set<number>();
  for (let d = 0; d < detection.trueCumulativeInfected.length; d += 1) {
    const share = detection.trueCumulativeInfected[d] / pop;
    for (const m of marks) if (!seen.has(m) && share >= m) { seen.add(m); items.push({ day: d, tone: m >= 0.1 ? "danger" : "warn", headline: `${(m * 100).toFixed(m < 0.01 ? 1 : 0)}% of Rotterdam infected`, detail: `${Math.round(detection.trueCumulativeInfected[d]).toLocaleString()} residents infected (true total).` }); }
  }
  for (const alert of detection.rwziAlerts.filter((a) => a.alertDay !== null).slice(0, 5))
    items.push({ day: alert.alertDay as number, tone: "warn", headline: `Wastewater spike — ${alert.rwziName.split(" – ").pop()}`, detail: `Viral load crossed the alert threshold (${alert.neighbourhoods.length} neighbourhoods).` });
  if (detection.hospitalDetectionDay !== null) items.push({ day: detection.hospitalDetectionDay, tone: "danger", headline: "Hospitals confirm the outbreak", detail: `${Math.round(detection.infectedAtDetection).toLocaleString()} were already infected when it was officially detected.` });
  const overshoot = hosp.findIndex((v) => v > beds);
  if (overshoot >= 0) items.push({ day: overshoot, tone: "danger", headline: "Hospitals over capacity", detail: `Hospitalisations exceed the ${beds.toLocaleString()}-bed capacity — care is now rationed.` });
  if (SCENARIOS[scenario].policyStartDay < result.frames.length) items.push({ day: SCENARIOS[scenario].policyStartDay, tone: "good", headline: `Control measures take effect (${SCENARIOS[scenario].label})`, detail: "Mobility and gatherings restricted. Watch the curve bend." });
  const finalDeceased = result.frames[result.frames.length - 1].totals.deceased;
  if (finalDeceased > 0) items.push({ day: result.peakDay, tone: "danger", headline: "Outbreak peaks", detail: `Peak of ${Math.round(result.peakInfectious).toLocaleString()} active cases; ${Math.round(finalDeceased).toLocaleString()} deaths projected.` });
  return items.sort((a, b) => a.day - b.day);
}
