import { useMemo } from "react";
import { AlertTriangle, Eye, EyeOff, FlaskConical, Hospital } from "lucide-react";
import type { DetectionResult } from "../simulation/detection";
import type { World } from "../simulation/types";

interface SurveillanceViewProps {
  world: World;
  detection: DetectionResult;
  day: number;
  onSelectArea?: (profileId: string) => void;
}

const PAD = { left: 46, right: 18, top: 16, bottom: 26 };
const WIDTH = 860;
const HEIGHT = 220;

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toString();
}

function buildPath(series: number[], maxY: number, lastDay: number) {
  const usableW = WIDTH - PAD.left - PAD.right;
  const usableH = HEIGHT - PAD.top - PAD.bottom;
  return series
    .map((value, day) => {
      const x = PAD.left + (day / Math.max(1, lastDay)) * usableW;
      const y = PAD.top + usableH - (value / (maxY || 1)) * usableH;
      return `${day === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function dayToX(day: number, lastDay: number) {
  return PAD.left + (day / Math.max(1, lastDay)) * (WIDTH - PAD.left - PAD.right);
}

export default function SurveillanceView({ world, detection, day, onSelectArea }: SurveillanceViewProps) {
  const lastDay = detection.days.length - 1;
  const maxTrue = Math.max(1, ...detection.trueActive);
  const maxHosp = Math.max(1, ...detection.hospitalOccupancy);
  const maxWW = Math.max(1, ...detection.wastewater);

  const truePath = useMemo(() => buildPath(detection.trueActive, maxTrue, lastDay), [detection.trueActive, maxTrue, lastDay]);
  const hospPath = useMemo(() => buildPath(detection.hospitalOccupancy, maxHosp, lastDay), [detection.hospitalOccupancy, maxHosp, lastDay]);
  const wwPath = useMemo(() => buildPath(detection.wastewater, maxWW, lastDay), [detection.wastewater, maxWW, lastDay]);

  const trueNow = detection.trueCumulativeInfected[Math.min(day, lastDay)] ?? 0;
  const hospNow = detection.hospitalOccupancy[Math.min(day, lastDay)] ?? 0;
  const govKnows = detection.detectionDay !== null && day >= detection.detectionDay;

  const activeAlerts = detection.rwziAlerts.filter((alert) => alert.alertDay !== null && alert.alertDay <= day);
  const wwLead =
    detection.hospitalDetectionDay !== null && detection.wastewaterDetectionDay !== null
      ? detection.hospitalDetectionDay - detection.wastewaterDetectionDay
      : null;

  return (
    <section className="surveillance">
      <div className="surveillanceHead">
        <div>
          <h2>Real situation vs. what the government sees</h2>
          <p>
            The model knows every infection the moment it happens. A public-health authority only learns about the
            outbreak through lagging surveillance: viral load in the sewers (early warning) and hospital admissions
            (late but certain).
          </p>
        </div>
        <div className={`govStatus ${govKnows ? "aware" : "blind"}`}>
          {govKnows ? <Eye size={18} /> : <EyeOff size={18} />}
          {govKnows ? "Outbreak detected" : "Spreading undetected"}
        </div>
      </div>

      <div className="surveillanceCards">
        <div className="survCard">
          <FlaskConical size={16} />
          <span>Wastewater early-warning</span>
          <strong>{detection.wastewaterDetectionDay !== null ? `Day ${detection.wastewaterDetectionDay}` : "—"}</strong>
          <small>first catchment over threshold</small>
        </div>
        <div className="survCard">
          <Hospital size={16} />
          <span>Hospital confirmation</span>
          <strong>{detection.hospitalDetectionDay !== null ? `Day ${detection.hospitalDetectionDay}` : "—"}</strong>
          <small>{wwLead !== null ? `${wwLead} days later than sewers` : "not reached"}</small>
        </div>
        <div className="survCard danger">
          <EyeOff size={16} />
          <span>Already infected at detection</span>
          <strong>{formatCompact(detection.infectedAtDetection)}</strong>
          <small>{(detection.infectedShareAtDetection * 100).toFixed(2)}% of residents, unseen</small>
        </div>
        <div className="survCard">
          <AlertTriangle size={16} />
          <span>Catchments alerting now</span>
          <strong>
            {activeAlerts.length}/{detection.rwziAlerts.length}
          </strong>
          <small>by day {day}</small>
        </div>
      </div>

      <div className="surveillancePanel panel">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Real vs observed signals">
          {[0.25, 0.5, 0.75, 1].map((value) => {
            const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - value);
            return <line key={value} x1={PAD.left} x2={WIDTH - PAD.right} y1={y} y2={y} className="chartGrid" />;
          })}

          {/* detection markers */}
          {detection.wastewaterDetectionDay !== null && (
            <line
              x1={dayToX(detection.wastewaterDetectionDay, lastDay)}
              x2={dayToX(detection.wastewaterDetectionDay, lastDay)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              className="detectMarker ww"
            />
          )}
          {detection.hospitalDetectionDay !== null && (
            <line
              x1={dayToX(detection.hospitalDetectionDay, lastDay)}
              x2={dayToX(detection.hospitalDetectionDay, lastDay)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              className="detectMarker hosp"
            />
          )}

          <path d={truePath} className="survLine survTrue" fill="none" />
          <path d={wwPath} className="survLine survWw" fill="none" />
          <path d={hospPath} className="survLine survHosp" fill="none" />

          <line x1={dayToX(day, lastDay)} x2={dayToX(day, lastDay)} y1={PAD.top - 4} y2={HEIGHT - PAD.bottom} className="dayGuide" />
          <text x={PAD.left} y={HEIGHT - 8} className="chartAxis">
            0
          </text>
          <text x={WIDTH - PAD.right - 14} y={HEIGHT - 8} className="chartAxis">
            {lastDay}
          </text>
        </svg>
        <div className="legendRow">
          <span className="legendItem">
            <i style={{ background: "#e84d4f" }} /> Real active infections (ground truth)
          </span>
          <span className="legendItem">
            <i style={{ background: "#2b6cb0" }} /> Wastewater signal (sewers)
          </span>
          <span className="legendItem">
            <i style={{ background: "#8a5a2b" }} /> Hospital occupancy
          </span>
          <span className="legendItem muted">Each line scaled to its own peak to compare timing.</span>
        </div>
      </div>

      <div className="alertTable panel">
        <div className="alertTableHead">
          <h3>Sewer-catchment alerts — candidates for localised measures</h3>
          <span>
            {formatCompact(trueNow)} truly infected · hospital occupancy {formatCompact(hospNow)}
          </span>
        </div>
        <div className="alertRows">
          {detection.rwziAlerts.map((alert) => {
            const live = alert.alertDay !== null && alert.alertDay <= day;
            const triggered = alert.alertDay !== null;
            return (
              <div key={alert.rwziId} className={`alertRow ${live ? "live" : triggered ? "pending" : "quiet"}`}>
                <span className="alertName">
                  <strong>{alert.rwziName}</strong>
                  <small>
                    {alert.neighbourhoods.length} neighbourhood{alert.neighbourhoods.length === 1 ? "" : "s"} ·{" "}
                    {Math.round(alert.representedPopulation).toLocaleString()} residents
                  </small>
                </span>
                <span className="alertDay">{alert.alertDay !== null ? `day ${alert.alertDay}` : "no alert"}</span>
                <span className="alertSignal">peak {Math.round(alert.peakSignal)}</span>
                <span className={`alertBadge ${live ? "live" : triggered ? "pending" : "quiet"}`}>
                  {live ? "QUARANTINE WATCH" : triggered ? "later" : "clear"}
                </span>
                {onSelectArea && alert.neighbourhoods.length > 0 && (
                  <button
                    className="textButton tiny"
                    onClick={() => {
                      const match = world.profiles.find((profile) => profile.rwziId === alert.rwziId);
                      if (match) onSelectArea(match.id);
                    }}
                  >
                    locate
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
