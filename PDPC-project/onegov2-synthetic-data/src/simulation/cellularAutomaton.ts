import densityGrid from "../data/netherlandsCaDensity.json";
import { clamp, Random } from "./random";

type TotalKey = "susceptible" | "exposed" | "infectious" | "recovered" | "deceased";

export interface CellularDensityGrid {
  metadata: {
    source: string;
    sourceUrl: string;
    generatedFrom: string;
    method: string;
    totalPopulationFromFeatures: number;
    width: number;
    height: number;
    bbox: [number, number, number, number];
    densityP95: number;
    densityP99: number;
    activeCells: number;
  };
  width: number;
  height: number;
  bbox: [number, number, number, number];
  density: number[];
  population: number[];
  mask: number[];
  names: string[];
}

export interface CellularConfig {
  seed: number;
  infectionRate: number;
  incubationDays: number;
  infectiousDays: number;
  localSpread: number;
  longRangeMixing: number;
  densityContact: number;
  initialCases: number;
  seedLocation: "randstad" | "amsterdam" | "rotterdam" | "the-hague" | "utrecht" | "eindhoven" | "groningen";
  maxDays: number;
  priorImmunity: number;
  mortality: number;
  quarantineStartDay: number;
  quarantineEffect: number;
}

export interface CellularFrame {
  day: number;
  state: Uint8Array;
  intensity: Uint8Array;
  totals: Record<TotalKey, number>;
  newExposures: number;
  rEffective: number;
}

export interface CellularResult {
  config: CellularConfig;
  frames: CellularFrame[];
  peakDay: number;
  peakInfectious: number;
  representedPopulation: number;
}

export const CA_GRID = densityGrid as CellularDensityGrid;

const TOTAL_KEYS: TotalKey[] = ["susceptible", "exposed", "infectious", "recovered", "deceased"];

const SEED_LOCATIONS: Record<CellularConfig["seedLocation"], { label: string; lon: number; lat: number }> = {
  randstad: { label: "Randstad", lon: 4.72, lat: 52.08 },
  amsterdam: { label: "Amsterdam", lon: 4.9, lat: 52.37 },
  rotterdam: { label: "Rotterdam", lon: 4.48, lat: 51.92 },
  "the-hague": { label: "The Hague", lon: 4.3, lat: 52.07 },
  utrecht: { label: "Utrecht", lon: 5.12, lat: 52.09 },
  eindhoven: { label: "Eindhoven", lon: 5.48, lat: 51.44 },
  groningen: { label: "Groningen", lon: 6.57, lat: 53.22 },
};

export const CA_SEED_LOCATION_OPTIONS = Object.entries(SEED_LOCATIONS).map(([value, location]) => ({
  value: value as CellularConfig["seedLocation"],
  label: location.label,
}));

function cellIndexForLonLat(grid: CellularDensityGrid, lon: number, lat: number): number {
  const [lonMin, latMin, lonMax, latMax] = grid.bbox;
  const x = clamp(Math.floor(((lon - lonMin) / (lonMax - lonMin)) * grid.width), 0, grid.width - 1);
  const y = clamp(Math.floor(((latMax - lat) / (latMax - latMin)) * grid.height), 0, grid.height - 1);
  return y * grid.width + x;
}

function nearestActiveCell(grid: CellularDensityGrid, index: number): number {
  if (grid.mask[index] && grid.population[index] > 0) return index;
  const x0 = index % grid.width;
  const y0 = Math.floor(index / grid.width);
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx < grid.mask.length; idx += 1) {
    if (!grid.mask[idx] || grid.population[idx] <= 0) continue;
    const x = idx % grid.width;
    const y = Math.floor(idx / grid.width);
    const score = Math.abs(x - x0) + Math.abs(y - y0) - Math.log1p(grid.population[idx]) * 0.06;
    if (score < bestScore) {
      best = idx;
      bestScore = score;
    }
  }
  return best >= 0 ? best : index;
}

function seededCells(grid: CellularDensityGrid, config: CellularConfig): number[] {
  const location = SEED_LOCATIONS[config.seedLocation];
  const center = nearestActiveCell(grid, cellIndexForLonLat(grid, location.lon, location.lat));
  const cx = center % grid.width;
  const cy = Math.floor(center / grid.width);
  const candidates: Array<{ index: number; score: number }> = [];

  for (let idx = 0; idx < grid.mask.length; idx += 1) {
    if (!grid.mask[idx] || grid.population[idx] <= 0) continue;
    const x = idx % grid.width;
    const y = Math.floor(idx / grid.width);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > 14) continue;
    candidates.push({
      index: idx,
      score: Math.log1p(grid.population[idx]) * 1.8 + Math.log1p(grid.density[idx]) - distance * 0.52,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .map((candidate) => candidate.index);
}

function densityNorm(grid: CellularDensityGrid, index: number): number {
  return clamp(Math.log1p(grid.density[index]) / Math.log1p(Math.max(1, grid.metadata.densityP99)), 0, 1.15);
}

function pressureAt(index: number, width: number, height: number, population: Float64Array, infectious: Float64Array): number {
  const x = index % width;
  const y = Math.floor(index / width);
  let pressure = 0;
  let weightTotal = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const neighbour = ny * width + nx;
      const weight = dx === 0 && dy === 0 ? 0.52 : dx === 0 || dy === 0 ? 0.28 : 0.17;
      pressure += (infectious[neighbour] / Math.max(1, population[neighbour])) * weight;
      weightTotal += weight;
    }
  }
  return pressure / Math.max(0.0001, weightTotal);
}

function buildRenderFrame(
  grid: CellularDensityGrid,
  day: number,
  susceptible: Float64Array,
  exposed: Float64Array,
  infectious: Float64Array,
  recovered: Float64Array,
  deceased: Float64Array,
  newExposures: number,
  rEffective: number,
): CellularFrame {
  const state = new Uint8Array(grid.width * grid.height);
  const intensity = new Uint8Array(grid.width * grid.height);
  const totals = {
    susceptible: 0,
    exposed: 0,
    infectious: 0,
    recovered: 0,
    deceased: 0,
  };

  for (let idx = 0; idx < state.length; idx += 1) {
    if (!grid.mask[idx]) continue;
    const population = susceptible[idx] + exposed[idx] + infectious[idx] + recovered[idx] + deceased[idx];
    totals.susceptible += susceptible[idx];
    totals.exposed += exposed[idx];
    totals.infectious += infectious[idx];
    totals.recovered += recovered[idx];
    totals.deceased += deceased[idx];

    const densityLevel = densityNorm(grid, idx);
    let code = 1;
    let level = Math.round(clamp(densityLevel, 0, 1) * 135);
    const activeShare = (exposed[idx] + infectious[idx]) / Math.max(1, population);
    const infectiousShare = infectious[idx] / Math.max(1, population);
    const recoveredShare = recovered[idx] / Math.max(1, population);
    const deceasedShare = deceased[idx] / Math.max(1, population);

    if (deceasedShare > 0.035) {
      code = 5;
      level = Math.round(clamp(deceasedShare * 1800, 70, 255));
    } else if (infectiousShare > 0.00035) {
      code = 3;
      level = Math.round(clamp(Math.sqrt(infectiousShare) * 520, 50, 255));
    } else if (activeShare > 0.00035) {
      code = 2;
      level = Math.round(clamp(Math.sqrt(activeShare) * 440, 45, 235));
    } else if (recoveredShare > 0.28) {
      code = 4;
      level = Math.round(clamp(recoveredShare * 180, 45, 180));
    }

    state[idx] = code;
    intensity[idx] = level;
  }

  return {
    day,
    state,
    intensity,
    totals,
    newExposures,
    rEffective,
  };
}

export function simulateCellularAutomaton(config: CellularConfig, grid = CA_GRID): CellularResult {
  const normalised: CellularConfig = {
    ...config,
    infectionRate: clamp(config.infectionRate, 0.01, 1.8),
    incubationDays: clamp(config.incubationDays, 1, 14),
    infectiousDays: clamp(config.infectiousDays, 2, 24),
    localSpread: clamp(config.localSpread, 0, 2.5),
    longRangeMixing: clamp(config.longRangeMixing, 0, 1.6),
    densityContact: clamp(config.densityContact, 0, 2.8),
    initialCases: Math.max(1, Math.round(config.initialCases)),
    maxDays: Math.max(10, Math.round(config.maxDays)),
    priorImmunity: clamp(config.priorImmunity, 0, 0.9),
    mortality: clamp(config.mortality, 0, 0.16),
    quarantineStartDay: Math.max(0, Math.round(config.quarantineStartDay)),
    quarantineEffect: clamp(config.quarantineEffect, 0, 0.95),
  };
  const rng = new Random(normalised.seed + 404);
  const length = grid.width * grid.height;
  const population = new Float64Array(length);
  const susceptible = new Float64Array(length);
  const exposed = new Float64Array(length);
  const infectious = new Float64Array(length);
  const recovered = new Float64Array(length);
  const deceased = new Float64Array(length);
  const nextExposed = new Float64Array(length);
  const nextInfectious = new Float64Array(length);
  const nextRecovered = new Float64Array(length);
  const nextDeceased = new Float64Array(length);

  let representedPopulation = 0;
  const rawGridPopulation = grid.population.reduce((sum, value, idx) => sum + (grid.mask[idx] ? value : 0), 0);
  const populationScale = grid.metadata.totalPopulationFromFeatures / Math.max(1, rawGridPopulation);
  for (let idx = 0; idx < length; idx += 1) {
    if (!grid.mask[idx]) continue;
    const pop = Math.max(0, grid.population[idx] * populationScale);
    population[idx] = pop;
    const immune = pop * normalised.priorImmunity * (0.72 + densityNorm(grid, idx) * 0.22);
    susceptible[idx] = Math.max(0, pop - immune);
    recovered[idx] = immune;
    representedPopulation += pop;
  }

  const seedCells = seededCells(grid, normalised);
  let remainingCases = normalised.initialCases;
  let seedCursor = 0;
  while (remainingCases > 0 && seedCells.length > 0) {
    const idx = seedCells[seedCursor % seedCells.length];
    const seeded = Math.min(remainingCases, Math.max(1, susceptible[idx] * rng.range(0.0004, 0.0025)));
    susceptible[idx] -= seeded;
    infectious[idx] += seeded;
    remainingCases -= seeded;
    seedCursor += 1;
    if (seedCursor > seedCells.length * 3 && remainingCases > 0) {
      const extra = Math.min(remainingCases, susceptible[idx]);
      susceptible[idx] -= extra;
      infectious[idx] += extra;
      remainingCases -= extra;
    }
  }

  const frames: CellularFrame[] = [];
  let initialFrame = buildRenderFrame(grid, 0, susceptible, exposed, infectious, recovered, deceased, 0, 0);
  frames.push(initialFrame);
  let previousInfectious = initialFrame.totals.infectious;
  let peakDay = 0;
  let peakInfectious = previousInfectious;

  for (let day = 1; day <= normalised.maxDays; day += 1) {
    nextExposed.set(exposed);
    nextInfectious.set(infectious);
    nextRecovered.set(recovered);
    nextDeceased.set(deceased);

    const policyScale = day >= normalised.quarantineStartDay ? 1 - normalised.quarantineEffect : 1;
    const nationalPressure = previousInfectious / Math.max(1, representedPopulation);
    let newExposurePeople = 0;

    for (let idx = 0; idx < length; idx += 1) {
      if (!grid.mask[idx] || population[idx] <= 0) continue;
      const localPressure = pressureAt(idx, grid.width, grid.height, population, infectious);
      const dense = densityNorm(grid, idx);
      const densityMultiplier = 0.26 + dense * normalised.densityContact;
      const force =
        normalised.infectionRate *
        policyScale *
        densityMultiplier *
        (normalised.localSpread * localPressure + normalised.longRangeMixing * nationalPressure * dense * 0.92);
      const risk = clamp(1 - Math.exp(-force), 0, 0.86);
      const newExposed = susceptible[idx] * risk;
      if (newExposed > 0) {
        susceptible[idx] -= newExposed;
        nextExposed[idx] += newExposed;
        newExposurePeople += newExposed;
      }

      const exposedToInfectious = exposed[idx] / normalised.incubationDays;
      const infectiousOut = infectious[idx] / normalised.infectiousDays;
      const overload = clamp(nationalPressure / 0.035, 0, 2.4);
      const deathShare = clamp(normalised.mortality * (0.72 + dense * 0.38) * (1 + overload * 0.16), 0, 0.7);
      const deaths = infectiousOut * deathShare;
      const recoveries = infectiousOut - deaths;

      nextExposed[idx] -= exposedToInfectious;
      nextInfectious[idx] += exposedToInfectious - infectiousOut;
      nextRecovered[idx] += recoveries;
      nextDeceased[idx] += deaths;
    }

    exposed.set(nextExposed);
    infectious.set(nextInfectious);
    recovered.set(nextRecovered);
    deceased.set(nextDeceased);

    const rEffective = previousInfectious > 0 ? clamp((newExposurePeople * normalised.infectiousDays) / previousInfectious, 0, 12) : 0;
    const frame = buildRenderFrame(grid, day, susceptible, exposed, infectious, recovered, deceased, newExposurePeople, rEffective);
    frames.push(frame);
    previousInfectious = frame.totals.infectious;
    if (previousInfectious > peakInfectious) {
      peakInfectious = previousInfectious;
      peakDay = day;
    }
    if (day > 28 && frame.totals.exposed + frame.totals.infectious < 1) {
      for (let pad = day + 1; pad <= normalised.maxDays; pad += 1) {
        frames.push(buildRenderFrame(grid, pad, susceptible, exposed, infectious, recovered, deceased, 0, 0));
      }
      break;
    }
  }

  return {
    config: normalised,
    frames,
    peakDay,
    peakInfectious,
    representedPopulation,
  };
}
