import { Random, clamp } from "./random";
import {
  STATE,
  type Agent,
  type AreaStats,
  type EnsembleFrame,
  type EnsembleResult,
  type MetricInterval,
  type RwziSignal,
  type ScenarioConfig,
  type SimFrame,
  type SimulationResult,
  type StateCode,
  type World,
} from "./types";

export type Layer = "household" | "work" | "event" | "commute" | "community";

/**
 * Per-contact-layer base transmission coefficients. These are the "magic
 * constants" that shape the relative contribution of each setting to the force
 * of infection. They are intentionally exported so the calibration module
 * (see calibration.ts) and the docs can reason about R0 from the exact values
 * used at runtime. Rationale and literature anchors live in docs/calibration.md.
 */
export const LAYER_COEFFICIENTS: Record<Layer, number> = {
  household: 0.38,
  work: 0.105,
  commute: 0.075,
  event: 0.13,
  community: 0.075,
};

const EMPTY_TRANSMISSION: Record<Layer, number> = {
  household: 0,
  work: 0,
  event: 0,
  commute: 0,
  community: 0,
};

const TOTAL_KEYS = ["susceptible", "exposed", "infectious", "recovered", "deceased"] as const;

type TotalKey = (typeof TOTAL_KEYS)[number];

function increment(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

export function normaliseConfig(config: ScenarioConfig): ScenarioConfig {
  return {
    ...config,
    infectionRate: clamp(config.infectionRate, 0.01, 1.4),
    incubationDays: clamp(config.incubationDays, 1, 14),
    infectiousDays: clamp(config.infectiousDays, 2, 21),
    mobilityIntensity: clamp(config.mobilityIntensity, 0, 1.8),
    eventIntensity: clamp(config.eventIntensity, 0, 1.8),
    householdIntensity: clamp(config.householdIntensity, 0.2, 1.8),
    initialCases: Math.max(1, Math.round(config.initialCases)),
    maxDays: Math.max(10, Math.round(config.maxDays)),
    ensembleRuns: Math.max(1, Math.round(config.ensembleRuns)),
    priorImmunity: clamp(config.priorImmunity, 0, 0.95),
    vaccinationStartDay: Math.max(0, Math.round(config.vaccinationStartDay)),
    vaccinationCoverage: clamp(config.vaccinationCoverage, 0, 0.98),
    vaccineEffectiveness: clamp(config.vaccineEffectiveness, 0, 0.98),
    // Upper bound raised so extreme / engineered pathogens (IFR up to ~80%) are
    // reachable; the per-agent death risk saturates at 1 inside progressDisease.
    mortalityMultiplier: clamp(config.mortalityMultiplier, 0.05, 400),
    baseLethality: clamp(config.baseLethality ?? 0, 0, 0.95),
    policyStartDay: Math.max(0, Math.round(config.policyStartDay)),
    mobilityReduction: clamp(config.mobilityReduction, 0, 0.95),
    eventReduction: clamp(config.eventReduction, 0, 0.98),
  };
}

function initialState(world: World, config: ScenarioConfig): {
  states: Uint8Array;
  diseaseDays: Float32Array;
  exposedTargets: Float32Array;
  infectiousTargets: Float32Array;
} {
  const rng = new Random(config.seed + 103);
  const states = new Uint8Array(world.agents.length);
  const diseaseDays = new Float32Array(world.agents.length);
  const exposedTargets = new Float32Array(world.agents.length);
  const infectiousTargets = new Float32Array(world.agents.length);
  const seedCandidates = world.agents
    .filter((agent) => agent.homeProfileId === config.seedProfileId)
    .map((agent) => agent.id);
  const fallbackCandidates = seedCandidates.length > 0 ? seedCandidates : world.agents.map((agent) => agent.id);
  const used = new Set<number>();

  while (used.size < Math.min(config.initialCases, fallbackCandidates.length)) {
    used.add(fallbackCandidates[rng.int(0, fallbackCandidates.length - 1)]);
  }

  for (const id of used) {
    // Seed introductions as exposed (latent), not yet shedding. They pass
    // through incubation before becoming infectious, so surveillance signals
    // (wastewater, hospital) rise with a realistic lag instead of spiking at t0.
    states[id] = STATE.exposed;
    exposedTargets[id] = Math.max(1, config.incubationDays * rng.range(0.55, 1.15));
    diseaseDays[id] = rng.range(0, Math.max(0.5, exposedTargets[id] * 0.4));
  }

  return { states, diseaseDays, exposedTargets, infectiousTargets };
}

function initialProtection(world: World, config: ScenarioConfig): {
  protection: Float32Array;
  vaccinated: Uint8Array;
} {
  const rng = new Random(config.seed + 881);
  const protection = new Float32Array(world.agents.length);
  const vaccinated = new Uint8Array(world.agents.length);

  for (const agent of world.agents) {
    const ageModifier = agent.ageBand === "65+" ? 0.88 : agent.ageBand === "0-14" ? 0.72 : 1;
    if (rng.chance(config.priorImmunity * ageModifier)) {
      protection[agent.id] = clamp(0.42 + rng.range(0, 0.36), 0, 0.9);
    }
  }

  return { protection, vaccinated };
}

export interface InfectiousPressure {
  byHousehold: Record<string, number>;
  byDaytime: Record<string, number>;
  byEvent: Record<string, number>;
  byRoute: Record<string, number>;
  byProfile: Record<string, number>;
}

function countInfectiousPressure(world: World, states: Uint8Array): InfectiousPressure {
  const byHousehold: Record<string, number> = {};
  const byDaytime: Record<string, number> = {};
  const byEvent: Record<string, number> = {};
  const byRoute: Record<string, number> = {};
  const byProfile: Record<string, number> = {};

  for (const agent of world.agents) {
    if (states[agent.id] !== STATE.infectious) continue;
    increment(byHousehold, agent.householdId);
    increment(byDaytime, agent.daytimeNodeId);
    increment(byEvent, agent.eventNodeId);
    if (agent.routeNodeId) increment(byRoute, agent.routeNodeId);
    increment(byProfile, agent.homeProfileId);
  }

  return { byHousehold, byDaytime, byEvent, byRoute, byProfile };
}

function pickStrongestLayer(terms: Record<Layer, number>): Layer {
  let best: Layer = "community";
  let bestValue = terms.community;
  for (const layer of Object.keys(terms) as Layer[]) {
    if (terms[layer] > bestValue) {
      best = layer;
      bestValue = terms[layer];
    }
  }
  return best;
}

export function susceptibleRisk(
  agent: Agent,
  world: World,
  config: ScenarioConfig,
  pressure: InfectiousPressure,
  protection: Float32Array,
  day: number,
  rng: Random,
): { risk: number; layer: Layer } {
  const profile = world.profileById[agent.homeProfileId];
  const urbanFactor = 1.48 - (profile.urbanity - 1) * 0.11;
  const policyActive = day >= config.policyStartDay;
  const mobilityScale = policyActive ? 1 - config.mobilityReduction * agent.compliance : 1;
  const eventScale = policyActive ? 1 - config.eventReduction * agent.compliance : 1;
  const householdScale = policyActive ? 1 + config.mobilityReduction * agent.compliance * 0.08 : 1;
  const householdPressure =
    (pressure.byHousehold[agent.householdId] ?? 0) / Math.max(1, (world.householdSizes[agent.householdId] ?? 1) - 1);

  const daytimeActive = agent.workSector !== "home" && agent.workSector !== "retired";
  const daytimePressure = daytimeActive
    ? (pressure.byDaytime[agent.daytimeNodeId] ?? 0) / Math.sqrt(Math.max(2, world.daytimeNodeSizes[agent.daytimeNodeId] ?? 2))
    : 0;

  const routePressure =
    agent.routeNodeId && daytimeActive
      ? (pressure.byRoute[agent.routeNodeId] ?? 0) / Math.sqrt(Math.max(2, world.routeNodeSizes[agent.routeNodeId] ?? 2))
      : 0;

  const ageEventModifier = agent.ageBand === "65+" ? 0.54 : agent.ageBand === "0-14" ? 0.68 : 1;
  const eventAttendance = rng.chance(clamp(agent.eventAffinity * config.eventIntensity * eventScale * ageEventModifier, 0, 0.96));
  const eventPressure = eventAttendance
    ? (pressure.byEvent[agent.eventNodeId] ?? 0) / Math.sqrt(Math.max(4, world.eventNodeSizes[agent.eventNodeId] ?? 4))
    : 0;

  const communityPressure =
    ((pressure.byProfile[agent.homeProfileId] ?? 0) / Math.max(1, world.profileAgentCounts[agent.homeProfileId] ?? 1)) *
    urbanFactor;

  const terms: Record<Layer, number> = {
    household: LAYER_COEFFICIENTS.household * config.householdIntensity * householdScale * householdPressure,
    work: LAYER_COEFFICIENTS.work * config.mobilityIntensity * mobilityScale * daytimePressure,
    commute: LAYER_COEFFICIENTS.commute * config.mobilityIntensity * mobilityScale * routePressure,
    event: LAYER_COEFFICIENTS.event * config.eventIntensity * eventScale * eventPressure,
    community:
      LAYER_COEFFICIENTS.community * (0.66 + config.mobilityIntensity * mobilityScale * 0.34) * communityPressure,
  };

  const totalPressure = terms.household + terms.work + terms.commute + terms.event + terms.community;
  const immuneScale = 1 - clamp(protection[agent.id], 0, 0.96);
  const risk = 1 - Math.exp(-config.infectionRate * agent.susceptibility * immuneScale * totalPressure);
  return { risk: clamp(risk, 0, 0.82), layer: pickStrongestLayer(terms) };
}

function progressDisease(
  world: World,
  states: Uint8Array,
  diseaseDays: Float32Array,
  exposedTargets: Float32Array,
  infectiousTargets: Float32Array,
  protection: Float32Array,
  config: ScenarioConfig,
  rng: Random,
): void {
  for (const agent of world.agents) {
    const state = states[agent.id] as StateCode;
    if (state === STATE.exposed) {
      diseaseDays[agent.id] += 1;
      if (diseaseDays[agent.id] >= exposedTargets[agent.id]) {
        states[agent.id] = STATE.infectious;
        diseaseDays[agent.id] = 0;
        infectiousTargets[agent.id] = Math.max(2, config.infectiousDays * rng.range(0.72, 1.42));
      }
    } else if (state === STATE.infectious) {
      diseaseDays[agent.id] += 1;
      if (diseaseDays[agent.id] >= infectiousTargets[agent.id]) {
        const mortalityProtection = 1 - clamp(protection[agent.id] * 0.72, 0, 0.92);
        const baseLethality = config.baseLethality ?? 0;
        const deathRisk = clamp(
          (baseLethality + agent.severeRisk * 0.65 * config.mortalityMultiplier) * mortalityProtection,
          0,
          1,
        );
        states[agent.id] = rng.chance(deathRisk) ? STATE.deceased : STATE.recovered;
        diseaseDays[agent.id] = 0;
      }
    }
  }
}

function vaccinationPriority(agent: Agent, rolloutDay: number): number {
  if (rolloutDay < 12) {
    return agent.ageBand === "65+" || agent.workSector === "healthcare" ? 0.92 : 0.12;
  }
  if (rolloutDay < 24) {
    return agent.ageBand === "65+" || agent.ageBand === "45-64" || agent.workSector === "healthcare" ? 0.82 : 0.24;
  }
  if (rolloutDay < 38) {
    return agent.ageBand === "0-14" ? 0.24 : 0.72;
  }
  return agent.ageBand === "0-14" ? 0.42 : 0.66;
}

function applyVaccination(
  world: World,
  states: Uint8Array,
  protection: Float32Array,
  vaccinated: Uint8Array,
  vaccinatedPeople: number,
  day: number,
  config: ScenarioConfig,
  rng: Random,
): number {
  if (day < config.vaccinationStartDay || config.vaccinationCoverage <= 0 || config.vaccineEffectiveness <= 0) {
    return 0;
  }

  const targetPeople = world.representedPopulation * config.vaccinationCoverage;
  if (vaccinatedPeople >= targetPeople) return 0;

  const rolloutDay = day - config.vaccinationStartDay;
  const dailyTarget = Math.min(targetPeople - vaccinatedPeople, targetPeople / 54);
  let newlyVaccinatedPeople = 0;
  let attempts = 0;
  const maxAttempts = world.agents.length * 4;

  while (newlyVaccinatedPeople < dailyTarget && attempts < maxAttempts) {
    attempts += 1;
    const agent = world.agents[rng.int(0, world.agents.length - 1)];
    if (vaccinated[agent.id] || states[agent.id] === STATE.deceased || states[agent.id] === STATE.infectious) continue;
    if (!rng.chance(vaccinationPriority(agent, rolloutDay) * agent.compliance)) continue;

    vaccinated[agent.id] = 1;
    protection[agent.id] = Math.max(
      protection[agent.id],
      clamp(config.vaccineEffectiveness * rng.range(0.76, 1.04), 0, 0.96),
    );
    newlyVaccinatedPeople += agent.representedPeople;
  }

  return newlyVaccinatedPeople;
}

function applyNewExposures(
  world: World,
  states: Uint8Array,
  diseaseDays: Float32Array,
  exposedTargets: Float32Array,
  config: ScenarioConfig,
  rng: Random,
  exposures: Array<{ id: number; layer: Layer }>,
): Record<Layer, number> {
  const transmission = { ...EMPTY_TRANSMISSION };
  for (const exposure of exposures) {
    if (states[exposure.id] !== STATE.susceptible) continue;
    const agent = world.agents[exposure.id];
    states[exposure.id] = STATE.exposed;
    diseaseDays[exposure.id] = 0;
    exposedTargets[exposure.id] = Math.max(1, config.incubationDays * rng.range(0.62, 1.4));
    transmission[exposure.layer] += agent.representedPeople;
  }
  return transmission;
}

function buildFrame(
  world: World,
  states: Uint8Array,
  day: number,
  newExposures: number,
  rEffective: number,
  transmissionByLayer: Record<Layer, number>,
): SimFrame {
  const totals = {
    susceptible: 0,
    exposed: 0,
    infectious: 0,
    recovered: 0,
    deceased: 0,
  };

  const areaById: Record<string, AreaStats> = {};
  for (const profile of world.profiles) {
    areaById[profile.id] = {
      profileId: profile.id,
      name: profile.name,
      municipality: profile.municipality,
      representedPopulation: 0,
      susceptible: 0,
      exposed: 0,
      infectious: 0,
      recovered: 0,
      deceased: 0,
      activeRate: 0,
      signal: 0,
    };
  }

  for (const agent of world.agents) {
    const weight = agent.representedPeople;
    const area = areaById[agent.homeProfileId];
    area.representedPopulation += weight;
    const state = states[agent.id];
    if (state === STATE.susceptible) {
      totals.susceptible += weight;
      area.susceptible += weight;
    } else if (state === STATE.exposed) {
      totals.exposed += weight;
      area.exposed += weight;
    } else if (state === STATE.infectious) {
      totals.infectious += weight;
      area.infectious += weight;
    } else if (state === STATE.recovered) {
      totals.recovered += weight;
      area.recovered += weight;
    } else if (state === STATE.deceased) {
      totals.deceased += weight;
      area.deceased += weight;
    }
  }

  const rwziById: Record<string, RwziSignal> = {};
  for (const profile of world.profiles) {
    const area = areaById[profile.id];
    const activeWastewater = area.infectious + area.exposed * 0.45 + area.recovered * 0.05;
    const landUseMultiplier = 1 + profile.landUse.residential * 0.22 + profile.landUse.industry * 0.12;
    area.activeRate = (area.exposed + area.infectious) / Math.max(1, area.representedPopulation);
    area.signal = (activeWastewater / Math.max(1, area.representedPopulation)) * 100000 * landUseMultiplier;

    rwziById[profile.rwziId] = rwziById[profile.rwziId] ?? {
      rwziId: profile.rwziId,
      rwziName: profile.rwziName,
      representedPopulation: 0,
      signal: 0,
      infectious: 0,
      exposed: 0,
    };
    rwziById[profile.rwziId].representedPopulation += area.representedPopulation;
    rwziById[profile.rwziId].infectious += area.infectious;
    rwziById[profile.rwziId].exposed += area.exposed;
    rwziById[profile.rwziId].signal += activeWastewater * landUseMultiplier;
  }

  const rwziSignals = Object.values(rwziById)
    .map((signal) => ({
      ...signal,
      signal: (signal.signal / Math.max(1, signal.representedPopulation)) * 100000,
    }))
    .sort((a, b) => b.signal - a.signal);

  return {
    day,
    states: new Uint8Array(states),
    totals,
    newExposures,
    rEffective,
    transmissionByLayer,
    areaStats: Object.values(areaById).sort((a, b) => b.activeRate - a.activeRate),
    rwziSignals,
  };
}

export function simulate(world: World, config: ScenarioConfig): SimulationResult {
  const normalisedConfig = normaliseConfig(config);

  const rng = new Random(normalisedConfig.seed + 19);
  const { states, diseaseDays, exposedTargets, infectiousTargets } = initialState(world, normalisedConfig);
  const { protection, vaccinated } = initialProtection(world, normalisedConfig);
  const frames: SimFrame[] = [];
  let vaccinatedPeople = 0;

  let initialFrame = buildFrame(world, states, 0, 0, 0, { ...EMPTY_TRANSMISSION });
  frames.push(initialFrame);
  let previousInfectious = initialFrame.totals.infectious;
  let peakDay = 0;
  let peakInfectious = initialFrame.totals.infectious;

  for (let day = 1; day <= normalisedConfig.maxDays; day += 1) {
    vaccinatedPeople += applyVaccination(world, states, protection, vaccinated, vaccinatedPeople, day, normalisedConfig, rng);
    const pressure = countInfectiousPressure(world, states);
    const exposures: Array<{ id: number; layer: Layer }> = [];
    let newExposurePeople = 0;

    for (const agent of world.agents) {
      if (states[agent.id] !== STATE.susceptible) continue;
      const { risk, layer } = susceptibleRisk(agent, world, normalisedConfig, pressure, protection, day, rng);
      if (rng.chance(risk)) {
        exposures.push({ id: agent.id, layer });
        newExposurePeople += agent.representedPeople;
      }
    }

    progressDisease(world, states, diseaseDays, exposedTargets, infectiousTargets, protection, normalisedConfig, rng);
    const transmissionByLayer = applyNewExposures(
      world,
      states,
      diseaseDays,
      exposedTargets,
      normalisedConfig,
      rng,
      exposures,
    );

    const rEffective =
      previousInfectious > 0 ? clamp((newExposurePeople * normalisedConfig.infectiousDays) / previousInfectious, 0, 9.99) : 0;
    const frame = buildFrame(world, states, day, newExposurePeople, rEffective, transmissionByLayer);
    frames.push(frame);
    previousInfectious = frame.totals.infectious;

    if (frame.totals.infectious > peakInfectious) {
      peakInfectious = frame.totals.infectious;
      peakDay = day;
    }

    if (day > 30 && frame.totals.exposed + frame.totals.infectious < 1) {
      for (let pad = day + 1; pad <= normalisedConfig.maxDays; pad += 1) {
        frames.push(buildFrame(world, states, pad, 0, 0, { ...EMPTY_TRANSMISSION }));
      }
      break;
    }
  }

  return {
    config: normalisedConfig,
    world,
    frames,
    peakDay,
    peakInfectious,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function interval(values: number[]): MetricInterval {
  return {
    mean: mean(values),
    p10: quantile(values, 0.1),
    p90: quantile(values, 0.9),
  };
}

function aggregateEnsemble(runs: SimulationResult[], maxDays: number): EnsembleFrame[] {
  const frames: EnsembleFrame[] = [];
  for (let day = 0; day <= maxDays; day += 1) {
    const totals = Object.fromEntries(
      TOTAL_KEYS.map((key) => [key, interval(runs.map((run) => run.frames[Math.min(day, run.frames.length - 1)].totals[key]))]),
    ) as Record<TotalKey, MetricInterval>;

    frames.push({
      day,
      totals,
      newExposures: interval(runs.map((run) => run.frames[Math.min(day, run.frames.length - 1)].newExposures)),
      rEffective: interval(runs.map((run) => run.frames[Math.min(day, run.frames.length - 1)].rEffective)),
    });
  }
  return frames;
}

export function simulateEnsemble(world: World, config: ScenarioConfig): EnsembleResult {
  const normalisedConfig = normaliseConfig(config);
  const runCount = Math.max(1, Math.min(32, normalisedConfig.ensembleRuns));
  const runs: SimulationResult[] = [];

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    runs.push(
      simulate(world, {
        ...normalisedConfig,
        seed: normalisedConfig.seed + runIndex * 9973,
        ensembleRuns: 1,
      }),
    );
  }

  const representative = runs[0];
  return {
    representative,
    frames: aggregateEnsemble(runs, normalisedConfig.maxDays),
    peakDay: interval(runs.map((run) => run.peakDay)),
    peakInfectious: interval(runs.map((run) => run.peakInfectious)),
    runCount,
  };
}
