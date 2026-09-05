import { STATE, type AgeBand, type SimulationResult, type World } from "./types";

/**
 * "Real situation vs. what the government sees."
 *
 * The simulation knows the ground truth (every infection, the moment it
 * happens). A public-health authority does not: it only learns about an outbreak
 * through lagging, noisy surveillance channels. This module reconstructs those
 * channels from the ground-truth frames:
 *
 *   - Wastewater (RWZI): viral shedding pooled per sewage-treatment catchment.
 *     A leading indicator — it rises days before anyone is hospitalised — but
 *     only above a detection limit.
 *   - Hospital occupancy: a fraction of infections (age-dependent) are admitted
 *     after a delay and stay for a while. A lagging but unambiguous signal.
 *
 * "Detection day" is the first day either channel crosses its alert threshold.
 * The gap between the first infection and detection day is the window in which
 * the virus spread unseen. Per-catchment alerts tell the authority *which*
 * neighbourhoods lit up first — the candidates for localised measures.
 */

// Age-specific infection-hospitalisation ratio (COVID-like order of magnitude).
const HOSPITALISATION_RATE: Record<AgeBand, number> = {
  "0-14": 0.001,
  "15-24": 0.002,
  "25-44": 0.008,
  "45-64": 0.03,
  "65+": 0.12,
};
const HOSPITAL_DELAY_DAYS = 8; // infection (→infectious) to admission
const HOSPITAL_MEAN_STAY_DAYS = 9;

// Detection thresholds (per 100k residents).
const WASTEWATER_ALERT_PER_100K = 22; // national signal level that clears noise
const RWZI_ALERT_PER_100K = 28; // per-catchment trigger
const HOSPITAL_OCCUPANCY_ALERT_PER_100K = 1.0;

export interface RwziAlert {
  rwziId: string;
  rwziName: string;
  representedPopulation: number;
  neighbourhoods: string[];
  alertDay: number | null;
  peakSignal: number;
}

export interface DetectionResult {
  days: number[];
  /** Ground truth, in represented people. */
  trueActive: number[];
  trueCumulativeInfected: number[];
  newInfections: number[];
  /** Observed surveillance channels. */
  wastewater: number[]; // national, per 100k
  hospitalAdmissions: number[]; // people/day
  hospitalOccupancy: number[]; // people
  hospitalOccupancyPer100k: number[];
  /** Detection summary. */
  outbreakStartDay: number;
  wastewaterDetectionDay: number | null;
  hospitalDetectionDay: number | null;
  detectionDay: number | null;
  detectionChannel: "wastewater" | "hospital" | null;
  blindDays: number | null;
  infectedAtDetection: number;
  infectedShareAtDetection: number;
  rwziAlerts: RwziAlert[];
  thresholds: { wastewater: number; rwziAlert: number; hospitalOccupancyPer100k: number };
}

export function computeDetection(result: SimulationResult, world: World): DetectionResult {
  const frames = result.frames;
  const dayCount = frames.length;
  const population = Math.max(1, world.representedPopulation);
  const per100k = 100000 / population;

  const represented = world.agents.map((agent) => agent.representedPeople);
  const hospRate = world.agents.map((agent) => HOSPITALISATION_RATE[agent.ageBand]);

  const days: number[] = [];
  const trueActive: number[] = [];
  const trueCumulativeInfected: number[] = [];
  const newInfections: number[] = [];
  const wastewater: number[] = [];
  const hospitalAdmissions = new Array<number>(dayCount).fill(0);

  let previousStates: Uint8Array | null = null;
  for (let d = 0; d < dayCount; d += 1) {
    const frame = frames[d];
    days.push(frame.day);
    trueActive.push(frame.totals.exposed + frame.totals.infectious);
    trueCumulativeInfected.push(
      frame.totals.exposed + frame.totals.infectious + frame.totals.recovered + frame.totals.deceased,
    );

    // National wastewater = population-weighted mean of per-catchment signal.
    let signalWeighted = 0;
    let signalPop = 0;
    for (const rwzi of frame.rwziSignals) {
      signalWeighted += rwzi.signal * rwzi.representedPopulation;
      signalPop += rwzi.representedPopulation;
    }
    wastewater.push(signalPop > 0 ? signalWeighted / signalPop : 0);

    // New infectious onsets today → schedule delayed hospital admissions.
    let newInfectiousPeople = 0;
    let hospWeightToday = 0;
    const states = frame.states;
    for (let i = 0; i < states.length; i += 1) {
      const becameInfectious = states[i] === STATE.infectious && (!previousStates || previousStates[i] !== STATE.infectious);
      if (becameInfectious) {
        newInfectiousPeople += represented[i];
        hospWeightToday += represented[i] * hospRate[i];
      }
    }
    newInfections.push(newInfectiousPeople);
    const admitDay = d + HOSPITAL_DELAY_DAYS;
    if (admitDay < dayCount) hospitalAdmissions[admitDay] += hospWeightToday;
    previousStates = states;
  }

  // Hospital occupancy: admissions with an exponential length-of-stay decay.
  const hospitalOccupancy = new Array<number>(dayCount).fill(0);
  const dischargeRate = 1 / HOSPITAL_MEAN_STAY_DAYS;
  for (let d = 0; d < dayCount; d += 1) {
    const carried = d > 0 ? hospitalOccupancy[d - 1] * (1 - dischargeRate) : 0;
    hospitalOccupancy[d] = carried + hospitalAdmissions[d];
  }
  const hospitalOccupancyPer100k = hospitalOccupancy.map((value) => value * per100k);

  const firstCrossing = (series: number[], threshold: number): number | null => {
    for (let d = 0; d < series.length; d += 1) if (series[d] >= threshold) return d;
    return null;
  };

  const outbreakStartDay = trueActive.findIndex((value) => value > 0);
  const wastewaterDetectionDay = firstCrossing(wastewater, WASTEWATER_ALERT_PER_100K);
  const hospitalDetectionDay = firstCrossing(hospitalOccupancyPer100k, HOSPITAL_OCCUPANCY_ALERT_PER_100K);

  let detectionDay: number | null = null;
  let detectionChannel: "wastewater" | "hospital" | null = null;
  if (wastewaterDetectionDay !== null && (hospitalDetectionDay === null || wastewaterDetectionDay <= hospitalDetectionDay)) {
    detectionDay = wastewaterDetectionDay;
    detectionChannel = "wastewater";
  } else if (hospitalDetectionDay !== null) {
    detectionDay = hospitalDetectionDay;
    detectionChannel = "hospital";
  }

  const start = outbreakStartDay < 0 ? 0 : outbreakStartDay;
  const blindDays = detectionDay === null ? null : Math.max(0, detectionDay - start);
  const infectedAtDetection = detectionDay === null ? 0 : trueCumulativeInfected[detectionDay];
  const infectedShareAtDetection = infectedAtDetection / population;

  // Per-catchment alerts: first day each RWZI signal crosses its trigger.
  const neighbourhoodsByRwzi = new Map<string, string[]>();
  for (const profile of world.profiles) {
    const list = neighbourhoodsByRwzi.get(profile.rwziId) ?? [];
    list.push(profile.name);
    neighbourhoodsByRwzi.set(profile.rwziId, list);
  }

  const alertAccumulator = new Map<string, RwziAlert>();
  for (let d = 0; d < dayCount; d += 1) {
    for (const rwzi of frames[d].rwziSignals) {
      let alert = alertAccumulator.get(rwzi.rwziId);
      if (!alert) {
        alert = {
          rwziId: rwzi.rwziId,
          rwziName: rwzi.rwziName,
          representedPopulation: rwzi.representedPopulation,
          neighbourhoods: neighbourhoodsByRwzi.get(rwzi.rwziId) ?? [],
          alertDay: null,
          peakSignal: 0,
        };
        alertAccumulator.set(rwzi.rwziId, alert);
      }
      alert.peakSignal = Math.max(alert.peakSignal, rwzi.signal);
      if (alert.alertDay === null && rwzi.signal >= RWZI_ALERT_PER_100K) alert.alertDay = d;
    }
  }

  const rwziAlerts = [...alertAccumulator.values()].sort((a, b) => {
    if (a.alertDay === null && b.alertDay === null) return b.peakSignal - a.peakSignal;
    if (a.alertDay === null) return 1;
    if (b.alertDay === null) return -1;
    return a.alertDay - b.alertDay;
  });

  return {
    days,
    trueActive,
    trueCumulativeInfected,
    newInfections,
    wastewater,
    hospitalAdmissions,
    hospitalOccupancy,
    hospitalOccupancyPer100k,
    outbreakStartDay: start,
    wastewaterDetectionDay,
    hospitalDetectionDay,
    detectionDay,
    detectionChannel,
    blindDays,
    infectedAtDetection,
    infectedShareAtDetection,
    rwziAlerts,
    thresholds: {
      wastewater: WASTEWATER_ALERT_PER_100K,
      rwziAlert: RWZI_ALERT_PER_100K,
      hospitalOccupancyPer100k: HOSPITAL_OCCUPANCY_ALERT_PER_100K,
    },
  };
}

/** Build per-agent state trajectory from the representative run's frames. */
export function agentTrajectory(result: SimulationResult, agentId: number): number[] {
  return result.frames.map((frame) => frame.states[agentId]);
}
