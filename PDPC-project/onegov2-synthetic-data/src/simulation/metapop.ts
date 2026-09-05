/**
 * Nationwide METAPOPULATION model — substrate for the "Netherlands macro" tab.
 *
 * The country is ~509 population clusters (from the CBS/PDOK density raster).
 * Two mobility channels couple them, and two run-modes are offered:
 *
 *   MOBILITY KERNEL
 *     • gravity   — w_ij ∝ pop_j / dist²   (simple, tunable)
 *     • radiation — Simini et al. (2012) parameter-free commuting model; flows are
 *                   derived from the population distribution alone and reproduce the
 *                   real Randstad corridors (Utrecht↔Amsterdam, Rijnmond↔Den Haag …)
 *                   without any fitted constant. This is the "free realism bump".
 *   plus the real NS intercity RAIL backbone (long-range hops between hub cities).
 *
 *   RUN MODE
 *     • deterministic — continuous SEIRD compartments (fast, smooth, ODE-like).
 *     • agent (12:1)  — each cluster is a population of integer agents, 1 agent ≙ 12
 *                       people; transitions are stochastic Binomial draws on the
 *                       agent counts. Statistically equivalent to simulating every
 *                       agent under homogeneous within-cluster mixing, but O(clusters)
 *                       not O(1.5M) — so it scales to the whole country and adds real
 *                       demographic stochasticity (fade-outs, variable invasion).
 *
 *   BEHAVIOURAL FEEDBACK (time-varying mobility)
 *     Mobility and transmission fall as people react to the *visible* hospital burden,
 *     and rebound as it recedes — producing endogenous multi-wave dynamics. How
 *     strongly the public responds ("heeding") and how early they get alarmed
 *     ("alarm sensitivity") are sliders; if people ignore the news, heeding → 0 and
 *     behaviour barely changes.
 */
import clustersData from "../data/netherlandsClusters.json";
import { Random, clamp } from "./random";

export interface Cluster { id: number; name: string; lat: number; lon: number; pop: number }

interface RawData { bbox: [number, number, number, number]; clusters: Cluster[]; rail: [number, number][]; railHubs: number[] }
const DATA = clustersData as RawData;

export const NL_BBOX = DATA.bbox;
export const CLUSTERS: Cluster[] = DATA.clusters;
export const RAIL_EDGES: [number, number][] = DATA.rail;
export const RAIL_HUBS: number[] = DATA.railHubs;
export const AGENTS_PER = 12; // 1 agent ≙ 12 people in agent mode

export type MobilityKernel = "gravity" | "radiation";

export interface MetapopConfig {
  r0: number;
  incubationDays: number;
  infectiousDays: number;
  ifr: number; // 0..1
  seedNode: number;
  initialCases: number;
  mobilityCoupling: number; // 0..1 baseline strength of local diffusion
  railCoupling: number; // 0..1 baseline strength of rail coupling
  kernel: MobilityKernel;
  // top-down policy
  measuresStartDay: number;
  measuresStrength: number; // 0..1 cut to transmission + coupling after start
  // bottom-up behaviour (time-varying mobility)
  behaviourHeeding: number; // 0..1 how much people cut contacts when alarmed (0 = ignore the news)
  behaviourAlarm: number; // 0..1 alarm sensitivity (1 = react to small signals, 0 = only to severe waves)
  // run mode
  stochastic: boolean; // agent (12:1) mode
  seed: number;
  maxDays: number;
}

export interface MetapopFrame {
  day: number;
  totals: { s: number; e: number; i: number; r: number; d: number };
  newCases: number;
  awareness: number; // 0..1 public alarm level this day
  mobilityNow: number; // 0..1 realised mobility (after policy + behaviour)
  prevalence: Float32Array;
  immune: Float32Array;
  dead: Float32Array;
  active: Float32Array;
}

export interface MetapopResult {
  frames: MetapopFrame[];
  peakDay: number;
  peakActive: number;
}

const KG = 8;  // gravity neighbours
const KR = 14; // radiation neighbours (flows are more dispersed)
const EARTH = 111; // km per degree latitude

interface Topology {
  gIdx: Int32Array; gW: Float32Array;
  rIdx: Int32Array; rW: Float32Array;
  railAdj: number[][];
}
let TOPO: Topology | null = null;

function dist2km(a: Cluster, b: Cluster): number {
  const dlat = (a.lat - b.lat) * EARTH;
  const dlon = (a.lon - b.lon) * EARTH * Math.cos((a.lat * Math.PI) / 180);
  return dlat * dlat + dlon * dlon;
}

/** Precompute gravity + radiation neighbour graphs and rail adjacency (memoised). */
export function topology(): Topology {
  if (TOPO) return TOPO;
  const n = CLUSTERS.length;
  const gIdx = new Int32Array(n * KG), gW = new Float32Array(n * KG);
  const rIdx = new Int32Array(n * KR), rW = new Float32Array(n * KR);

  for (let i = 0; i < n; i += 1) {
    const sorted = [];
    for (let j = 0; j < n; j += 1) if (j !== i) sorted.push([j, dist2km(CLUSTERS[i], CLUSTERS[j])] as [number, number]);
    sorted.sort((a, b) => a[1] - b[1]);

    // gravity: w ∝ pop_j / dist²
    let gs = 0; const gw: number[] = [];
    for (let k = 0; k < KG; k += 1) { const [j, d2] = sorted[k]; const w = CLUSTERS[j].pop / (d2 + 4); gIdx[i * KG + k] = j; gw.push(w); gs += w; }
    for (let k = 0; k < KG; k += 1) gW[i * KG + k] = gw[k] / gs;

    // radiation (Simini 2012): p_ij ∝ m·n / ((m+s)(m+n+s)), s = pop within radius dist(i,j)
    const m = CLUSTERS[i].pop;
    let s = 0; const rw: number[] = []; let rs = 0;
    for (let k = 0; k < KR; k += 1) {
      const [j] = sorted[k];
      const nj = CLUSTERS[j].pop;
      const w = (m * nj) / ((m + s) * (m + nj + s));
      rIdx[i * KR + k] = j; rw.push(w); rs += w;
      s += nj; // accumulate intervening population for the next (farther) destination
    }
    for (let k = 0; k < KR; k += 1) rW[i * KR + k] = rs > 0 ? rw[k] / rs : 0;
  }

  const railAdj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of RAIL_EDGES) { railAdj[a].push(b); railAdj[b].push(a); }
  TOPO = { gIdx, gW, rIdx, rW, railAdj };
  return TOPO;
}

export function defaultSeedNode(): number { return 0; }

/** Binomial(n, p) sampler: exact for small n, normal approximation otherwise. */
function binomial(n: number, p: number, rng: Random): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 40) {
    let c = 0;
    for (let k = 0; k < n; k += 1) if (rng.next() < p) c += 1;
    return c;
  }
  // normal approximation with continuity, clamped to [0, n]
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  const u1 = Math.max(1e-12, rng.next()), u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.min(n, Math.round(mean + sd * z)));
}

export function simulateMetapop(config: MetapopConfig): MetapopResult {
  const n = CLUSTERS.length;
  const topo = topology();
  const kIdx = config.kernel === "radiation" ? topo.rIdx : topo.gIdx;
  const kW = config.kernel === "radiation" ? topo.rW : topo.gW;
  const K = config.kernel === "radiation" ? KR : KG;
  const railAdj = topo.railAdj;
  const unit = config.stochastic ? AGENTS_PER : 1; // people per state-unit
  const rng = new Random(config.seed);

  const N = new Float64Array(n), S = new Float64Array(n), E = new Float64Array(n);
  const I = new Float64Array(n), R = new Float64Array(n), D = new Float64Array(n);
  let totalPop = 0;
  for (let i = 0; i < n; i += 1) {
    const units = config.stochastic ? Math.max(1, Math.round(CLUSTERS[i].pop / AGENTS_PER)) : CLUSTERS[i].pop;
    N[i] = units; S[i] = units; totalPop += CLUSTERS[i].pop;
  }
  const seed = Math.min(Math.max(0, config.seedNode), n - 1);
  const seededUnits = Math.min(config.stochastic ? Math.max(1, Math.round(config.initialCases / AGENTS_PER)) : config.initialCases, S[seed]);
  S[seed] -= seededUnits; E[seed] += seededUnits;

  const sigma = 1 / Math.max(1, config.incubationDays);
  const gamma = 1 / Math.max(1, config.infectiousDays);
  const beta0 = config.r0 * gamma;
  const ihr = Math.min(0.15, config.ifr * 8 + 0.005); // crude hospital-admission ratio for the alarm signal
  // alarm sensitivity → hospital-occupancy threshold (per 100k) for ~full response
  const alarmThreshold = 20 + (1 - config.behaviourAlarm) * 380; // sens 1 → 20, sens 0 → 400 per 100k
  let awareness = 0;

  const frames: MetapopFrame[] = [];
  let peakActive = 0, peakDay = 0;

  const snapshot = (day: number, newCases: number, mobilityNow: number): void => {
    const prevalence = new Float32Array(n), immune = new Float32Array(n), dead = new Float32Array(n), active = new Float32Array(n);
    let ts = 0, te = 0, ti = 0, tr = 0, td = 0;
    for (let i = 0; i < n; i += 1) {
      prevalence[i] = (E[i] + I[i]) / N[i];
      immune[i] = R[i] / N[i];
      dead[i] = D[i] / N[i];
      active[i] = (E[i] + I[i]) * unit;
      ts += S[i]; te += E[i]; ti += I[i]; tr += R[i]; td += D[i];
    }
    if ((ti + te) * unit > peakActive) { peakActive = (ti + te) * unit; peakDay = day; }
    frames.push({
      day, newCases: newCases * unit, awareness, mobilityNow,
      totals: { s: ts * unit, e: te * unit, i: ti * unit, r: tr * unit, d: td * unit },
      prevalence, immune, dead, active,
    });
  };

  snapshot(0, 0, 1);

  for (let day = 1; day <= config.maxDays; day += 1) {
    // --- behavioural feedback: awareness tracks the visible hospital burden -----
    let infPeople = 0;
    for (let i = 0; i < n; i += 1) infPeople += I[i] * unit;
    const hospPer100k = (infPeople * ihr / totalPop) * 100000;
    const target = clamp(hospPer100k / alarmThreshold, 0, 1);
    awareness += 0.25 * (target - awareness); // EMA: media/awareness lag + memory
    const behaviourCut = config.behaviourHeeding * awareness;

    // --- top-down policy (measures package) -------------------------------------
    const policyOn = day >= config.measuresStartDay ? config.measuresStrength : 0;

    // combined realised reductions (policy and behaviour stack, capped)
    const transmissionCut = clamp(1 - (1 - policyOn) * (1 - 0.5 * behaviourCut), 0, 0.97);
    const mobilityCut = clamp(1 - (1 - policyOn) * (1 - behaviourCut), 0, 0.97);
    const beta = beta0 * (1 - transmissionCut);
    const mob = config.mobilityCoupling * (1 - mobilityCut);
    const rail = config.railCoupling * (1 - mobilityCut);
    const mobilityNow = 1 - mobilityCut;

    const prev = new Float64Array(n);
    for (let i = 0; i < n; i += 1) prev[i] = I[i] / N[i];

    const newE = new Float64Array(n);
    let newCasesTotal = 0;
    for (let i = 0; i < n; i += 1) {
      if (S[i] <= 0) continue;
      let neighMix = 0;
      for (let k = 0; k < K; k += 1) neighMix += kW[i * K + k] * prev[kIdx[i * K + k]];
      let railMix = 0; const ra = railAdj[i];
      if (ra.length) { for (const j of ra) railMix += prev[j]; railMix /= ra.length; }
      const lambda = beta * (prev[i] + mob * neighMix + rail * railMix);
      const pInf = 1 - Math.exp(-lambda);
      const infected = config.stochastic ? binomial(S[i], pInf, rng) : S[i] * pInf;
      newE[i] = infected; newCasesTotal += infected;
    }

    for (let i = 0; i < n; i += 1) {
      let toI: number, leaveI: number, deaths: number;
      if (config.stochastic) {
        toI = binomial(E[i], sigma, rng);
        leaveI = binomial(I[i], gamma, rng);
        deaths = binomial(leaveI, config.ifr, rng);
      } else {
        toI = sigma * E[i]; leaveI = gamma * I[i]; deaths = config.ifr * leaveI;
      }
      S[i] -= newE[i];
      E[i] += newE[i] - toI;
      I[i] += toI - leaveI;
      R[i] += leaveI - deaths;
      D[i] += deaths;
    }
    snapshot(day, newCasesTotal, mobilityNow);

    let activeTotal = 0;
    for (let i = 0; i < n; i += 1) activeTotal += E[i] + I[i];
    if (day > 20 && activeTotal < (config.stochastic ? 1 : 1e-3)) {
      for (let pad = day + 1; pad <= config.maxDays; pad += 1) snapshot(pad, 0, 1);
      break;
    }
  }

  return { frames, peakDay, peakActive };
}
