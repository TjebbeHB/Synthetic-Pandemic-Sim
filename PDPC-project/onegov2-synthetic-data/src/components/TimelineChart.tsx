import type { EnsembleFrame, SimFrame } from "../simulation/types";

interface TimelineChartProps {
  frames: SimFrame[];
  ensembleFrames?: EnsembleFrame[];
  currentDay: number;
  runCount?: number;
}

const SERIES = [
  { key: "exposed", label: "Exposed", color: "#f1b84b" },
  { key: "infectious", label: "Infectious", color: "#e84d4f" },
  { key: "recovered", label: "Recovered", color: "#2aa884" },
  { key: "deceased", label: "Deceased", color: "#20262b" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function xForDay(day: number, lastDay: number, width: number) {
  const pad = { left: 42, right: 18, top: 18, bottom: 26 };
  const usableW = width - pad.left - pad.right;
  return pad.left + (day / Math.max(1, lastDay)) * usableW;
}

function yForValue(value: number, maxY: number, height: number) {
  const pad = { left: 42, right: 18, top: 18, bottom: 26 };
  const usableH = height - pad.top - pad.bottom;
  return pad.top + usableH - (value / maxY) * usableH;
}

function linePath(frames: SimFrame[], key: SeriesKey, maxY: number, width: number, height: number) {
  const lastDay = frames[frames.length - 1]?.day ?? 1;
  return frames
    .map((frame, index) => {
      const x = xForDay(frame.day, lastDay, width);
      const y = yForValue(frame.totals[key], maxY, height);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function ensembleLinePath(frames: EnsembleFrame[], key: SeriesKey, maxY: number, width: number, height: number) {
  const lastDay = frames[frames.length - 1]?.day ?? 1;
  return frames
    .map((frame, index) => {
      const x = xForDay(frame.day, lastDay, width);
      const y = yForValue(frame.totals[key].mean, maxY, height);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function bandPath(frames: EnsembleFrame[], key: SeriesKey, maxY: number, width: number, height: number) {
  const lastDay = frames[frames.length - 1]?.day ?? 1;
  const upper = frames.map((frame, index) => {
    const x = xForDay(frame.day, lastDay, width);
    const y = yForValue(frame.totals[key].p90, maxY, height);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const lower = [...frames].reverse().map((frame) => {
    const x = xForDay(frame.day, lastDay, width);
    const y = yForValue(frame.totals[key].p10, maxY, height);
    return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return [...upper, ...lower, "Z"].join(" ");
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toString();
}

export default function TimelineChart({ frames, ensembleFrames, currentDay, runCount = 1 }: TimelineChartProps) {
  const width = 820;
  const height = 190;
  const chartFrames = ensembleFrames?.length ? ensembleFrames : null;
  const maxY = Math.max(
    1,
    ...frames.map((frame) => Math.max(frame.totals.exposed, frame.totals.infectious, frame.totals.recovered)),
    ...(chartFrames ?? []).map((frame) =>
      Math.max(frame.totals.exposed.p90, frame.totals.infectious.p90, frame.totals.recovered.p90),
    ),
  );
  const currentX = 42 + (currentDay / Math.max(1, frames.length - 1)) * (width - 60);
  const guideValues = [0.25, 0.5, 0.75, 1];

  return (
    <div className="timelinePanel">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pandemic simulation timeline">
        {guideValues.map((value) => {
          const y = 18 + (height - 44) - value * (height - 44);
          return (
            <g key={value}>
              <line x1="42" x2={width - 18} y1={y} y2={y} className="chartGrid" />
              <text x="10" y={y + 4} className="chartAxis">
                {formatCompact(maxY * value)}
              </text>
            </g>
          );
        })}
        {chartFrames && <path d={bandPath(chartFrames, "infectious", maxY, width, height)} className="uncertaintyBand" />}
        {SERIES.map((series) => {
          const path = chartFrames ? ensembleLinePath(chartFrames, series.key, maxY, width, height) : linePath(frames, series.key, maxY, width, height);
          return <path key={series.key} d={path} fill="none" stroke={series.color} strokeWidth="3" />;
        })}
        <line x1={currentX} x2={currentX} y1="14" y2={height - 24} className="dayGuide" />
        <text x={currentX + 6} y="18" className="dayText">
          Day {currentDay}
        </text>
        <line x1="42" x2={width - 18} y1={height - 26} y2={height - 26} className="chartAxisLine" />
        <text x="42" y={height - 7} className="chartAxis">
          0
        </text>
        <text x={width - 38} y={height - 7} className="chartAxis">
          {frames.length - 1}
        </text>
      </svg>
      <div className="legendRow">
        {SERIES.map((series) => (
          <span key={series.key} className="legendItem">
            <i style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
        {runCount > 1 && (
          <span className="legendItem">
            <i className="bandLegend" />
            10-90% infectious band from {runCount} runs
          </span>
        )}
      </div>
    </div>
  );
}
