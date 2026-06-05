import { useEffect, useMemo, useState } from "react";
import { Activity, FlaskConical, Pause, Play, RotateCcw, Settings2, SkipForward, Waves } from "lucide-react";
import CellularAutomatonCanvas from "./CellularAutomatonCanvas";
import {
  CA_GRID,
  CA_SEED_LOCATION_OPTIONS,
  simulateCellularAutomaton,
  type CellularConfig,
  type CellularFrame,
} from "../simulation/cellularAutomaton";

const DEFAULT_CA_CONFIG: CellularConfig = {
  seed: 20260604,
  infectionRate: 0.78,
  incubationDays: 5,
  infectiousDays: 7,
  localSpread: 1.18,
  longRangeMixing: 0.28,
  densityContact: 1.15,
  initialCases: 80,
  seedLocation: "randstad",
  maxDays: 150,
  priorImmunity: 0.03,
  mortality: 0.006,
  quarantineStartDay: 34,
  quarantineEffect: 0.38,
};

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function formatDecimal(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1);
}

function updateCaConfig<K extends keyof CellularConfig>(
  setter: React.Dispatch<React.SetStateAction<CellularConfig>>,
  key: K,
  value: CellularConfig[K],
) {
  setter((current) => ({ ...current, [key]: value }));
}

function caConfigsEqual(left: CellularConfig, right: CellularConfig) {
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
        <strong>{formatValue ? formatValue(value) : `${formatDecimal(value)}${suffix}`}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function CaMetric({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn" | "danger" | "good";
  icon: React.ReactNode;
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function pathFor(frames: CellularFrame[], key: "exposed" | "infectious" | "recovered", maxY: number, width: number, height: number) {
  const pad = { left: 44, right: 18, top: 18, bottom: 26 };
  const usableW = width - pad.left - pad.right;
  const usableH = height - pad.top - pad.bottom;
  const lastDay = frames[frames.length - 1]?.day ?? 1;
  return frames
    .map((frame, index) => {
      const x = pad.left + (frame.day / Math.max(1, lastDay)) * usableW;
      const y = pad.top + usableH - (frame.totals[key] / maxY) * usableH;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function CaTimeline({ frames, currentDay }: { frames: CellularFrame[]; currentDay: number }) {
  const width = 820;
  const height = 190;
  const maxY = Math.max(1, ...frames.map((frame) => Math.max(frame.totals.exposed, frame.totals.infectious, frame.totals.recovered)));
  const currentX = 44 + (currentDay / Math.max(1, frames.length - 1)) * (width - 62);
  return (
    <div className="timelinePanel">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cellular automaton epidemic timeline">
        {[0.25, 0.5, 0.75, 1].map((value) => {
          const y = 18 + (height - 44) - value * (height - 44);
          return (
            <g key={value}>
              <line x1="44" x2={width - 18} y1={y} y2={y} className="chartGrid" />
              <text x="8" y={y + 4} className="chartAxis">
                {formatNumber(maxY * value)}
              </text>
            </g>
          );
        })}
        <path d={pathFor(frames, "exposed", maxY, width, height)} fill="none" stroke="#f1b84b" strokeWidth="3" />
        <path d={pathFor(frames, "infectious", maxY, width, height)} fill="none" stroke="#e84d4f" strokeWidth="3" />
        <path d={pathFor(frames, "recovered", maxY, width, height)} fill="none" stroke="#2aa884" strokeWidth="3" />
        <line x1={currentX} x2={currentX} y1="14" y2={height - 24} className="dayGuide" />
        <text x={currentX + 6} y="18" className="dayText">
          Day {currentDay}
        </text>
        <line x1="44" x2={width - 18} y1={height - 26} y2={height - 26} className="chartAxisLine" />
      </svg>
      <div className="legendRow">
        <span className="legendItem">
          <i style={{ background: "#f1b84b" }} />
          Exposed
        </span>
        <span className="legendItem">
          <i style={{ background: "#e84d4f" }} />
          Infectious
        </span>
        <span className="legendItem">
          <i style={{ background: "#2aa884" }} />
          Recovered
        </span>
      </div>
    </div>
  );
}

export default function CellularAutomatonView() {
  const [draftConfig, setDraftConfig] = useState<CellularConfig>(DEFAULT_CA_CONFIG);
  const [config, setConfig] = useState<CellularConfig>(DEFAULT_CA_CONFIG);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const scenarioDirty = !caConfigsEqual(draftConfig, config);
  const result = useMemo(() => simulateCellularAutomaton(config), [config]);
  const frame = result.frames[Math.min(day, result.frames.length - 1)];
  const active = frame.totals.exposed + frame.totals.infectious;
  const baselineImmune = result.representedPopulation * config.priorImmunity;
  const outbreakRecovered = Math.max(0, frame.totals.recovered - baselineImmune);
  const attackRate = (active + outbreakRecovered + frame.totals.deceased) / result.representedPopulation;

  useEffect(() => {
    setDay(0);
    setPlaying(false);
  }, [result]);

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
    }, Math.max(45, 450 / speed));
    return () => window.clearInterval(interval);
  }, [playing, result.frames.length, speed]);

  function reset() {
    setDraftConfig(DEFAULT_CA_CONFIG);
    setConfig(DEFAULT_CA_CONFIG);
    setDay(0);
    setPlaying(false);
  }

  function applyScenario() {
    setConfig(draftConfig);
    setDay(0);
    setPlaying(false);
  }

  return (
    <section className="dashboard caDashboard">
      <aside className="controlPanel panel">
        <div className="panelTitle">
          <Settings2 size={18} />
          <h2>Cellular model</h2>
        </div>

        <label className="selectBlock">
          <span>Seed focus</span>
          <select
            value={draftConfig.seedLocation}
            onChange={(event) => updateCaConfig(setDraftConfig, "seedLocation", event.target.value as CellularConfig["seedLocation"])}
          >
            {CA_SEED_LOCATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <SliderControl
          label="Infection rate"
          value={draftConfig.infectionRate}
          min={0.05}
          max={1.6}
          step={0.01}
          onChange={(value) => updateCaConfig(setDraftConfig, "infectionRate", value)}
        />
        <SliderControl
          label="Incubation"
          value={draftConfig.incubationDays}
          min={1}
          max={12}
          step={0.5}
          suffix=" d"
          onChange={(value) => updateCaConfig(setDraftConfig, "incubationDays", value)}
        />
        <SliderControl
          label="Infectious period"
          value={draftConfig.infectiousDays}
          min={2}
          max={16}
          step={0.5}
          suffix=" d"
          onChange={(value) => updateCaConfig(setDraftConfig, "infectiousDays", value)}
        />
        <SliderControl
          label="Local spread"
          value={draftConfig.localSpread}
          min={0}
          max={2.2}
          step={0.02}
          onChange={(value) => updateCaConfig(setDraftConfig, "localSpread", value)}
        />
        <SliderControl
          label="Long-range mixing"
          value={draftConfig.longRangeMixing}
          min={0}
          max={1.4}
          step={0.02}
          onChange={(value) => updateCaConfig(setDraftConfig, "longRangeMixing", value)}
        />
        <SliderControl
          label="Density contact"
          value={draftConfig.densityContact}
          min={0.2}
          max={2.4}
          step={0.02}
          onChange={(value) => updateCaConfig(setDraftConfig, "densityContact", value)}
        />
        <SliderControl
          label="Initial cases"
          value={draftConfig.initialCases}
          min={1}
          max={800}
          step={1}
          onChange={(value) => updateCaConfig(setDraftConfig, "initialCases", value)}
        />
        <SliderControl
          label="Prior immunity"
          value={draftConfig.priorImmunity}
          min={0}
          max={0.8}
          step={0.01}
          formatValue={formatPercent}
          onChange={(value) => updateCaConfig(setDraftConfig, "priorImmunity", value)}
        />
        <SliderControl
          label="Mortality"
          value={draftConfig.mortality}
          min={0}
          max={0.08}
          step={0.001}
          formatValue={formatPercent}
          onChange={(value) => updateCaConfig(setDraftConfig, "mortality", value)}
        />
        <SliderControl
          label="Quarantine start"
          value={draftConfig.quarantineStartDay}
          min={0}
          max={120}
          step={1}
          suffix=" d"
          onChange={(value) => updateCaConfig(setDraftConfig, "quarantineStartDay", value)}
        />
        <SliderControl
          label="Quarantine effect"
          value={draftConfig.quarantineEffect}
          min={0}
          max={0.9}
          step={0.01}
          formatValue={formatPercent}
          onChange={(value) => updateCaConfig(setDraftConfig, "quarantineEffect", value)}
        />

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
          <button className="iconButton" title="Reset scenario" onClick={reset}>
            <RotateCcw size={18} />
          </button>
        </div>
        {scenarioDirty && <div className="pendingNotice">Settings changed. Run model to update the grid and charts.</div>}

        <label className="controlBlock">
          <span>
            Speed
            <strong>{speed}x</strong>
          </span>
          <input type="range" min="1" max="8" step="1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
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

      <section className="mapColumn">
        <div className="metricGrid">
          <CaMetric label="Exposed" value={formatNumber(frame.totals.exposed)} tone="warn" icon={<Activity size={17} />} />
          <CaMetric label="Infectious" value={formatNumber(frame.totals.infectious)} tone="danger" icon={<Activity size={17} />} />
          <CaMetric label="Active share" value={formatPercent(active / result.representedPopulation)} tone="danger" icon={<Waves size={17} />} />
          <CaMetric label="R estimate" value={frame.rEffective.toFixed(2)} tone={frame.rEffective > 1 ? "danger" : "good"} icon={<FlaskConical size={17} />} />
        </div>

        <div className="mapPanel panel caPanel">
          <CellularAutomatonCanvas grid={CA_GRID} frame={frame} />
        </div>

        <CaTimeline frames={result.frames} currentDay={day} />
      </section>

      <aside className="insightPanel panel">
        <div className="panelTitle">
          <Activity size={18} />
          <h2>Grid state</h2>
        </div>

        <div className="focusBlock">
          <span>Density source</span>
          <strong>{formatNumber(CA_GRID.metadata.activeCells)} cells</strong>
          <p>{formatNumber(CA_GRID.metadata.totalPopulationFromFeatures)} residents, p99 {formatNumber(CA_GRID.metadata.densityP99)} /km2</p>
        </div>

        <div className="miniStats">
          <div>
            <span>Peak infectious</span>
            <strong>{formatNumber(result.peakInfectious)}</strong>
            <small>day {result.peakDay}</small>
          </div>
          <div>
            <span>Attack rate</span>
            <strong>{formatPercent(attackRate)}</strong>
            <small>cumulative</small>
          </div>
        </div>

        <section className="transmissionList">
          <h3>Cell totals</h3>
          {(["susceptible", "exposed", "infectious", "recovered", "deceased"] as const).map((key) => (
            <div className="layerRow" key={key}>
              <span>{key}</span>
              <i>
                <b style={{ width: `${Math.min(100, (frame.totals[key] / result.representedPopulation) * 100)}%` }} />
              </i>
              <em>{formatNumber(frame.totals[key])}</em>
            </div>
          ))}
        </section>

        <section className="profileFacts">
          <h3>Density classes</h3>
          <div className="densityLegend">
            <span>
              <i className="densityLow" />
              low
            </span>
            <span>
              <i className="densityMid" />
              medium
            </span>
            <span>
              <i className="densityHigh" />
              high
            </span>
            <span>
              <i className="densityHot" />
              active
            </span>
          </div>
        </section>
      </aside>
    </section>
  );
}
