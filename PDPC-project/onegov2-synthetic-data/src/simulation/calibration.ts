import { Random, clamp } from "./random";
import {
  type InfectiousPressure,
  normaliseConfig,
  susceptibleRisk,
} from "./engine";
import type { Agent, ScenarioConfig, World } from "./types";

/**
 * Calibration utilities: derive the basic reproduction number R0 that the agent
 * model produces for a given scenario, and invert that relationship to find the
 * `infectionRate` (the per-contact transmissibility beta) that hits a target R0.
 *
 * Method: single-index next-generation Monte-Carlo. We place exactly one
 * infectious agent in an otherwise fully-susceptible, intervention-free world
 * and count how many people it infects over one infectious period, reusing the
 * EXACT `susceptibleRisk` force-of-infection used by the live simulation. We
 * never let those secondary cases transmit onward, so the count is a clean R0
 * (generation 1 only), not an attack rate. Averaging over many index agents,
 * sampled across all neighbourhood profiles, yields the population R0.
 *
 * Because the index contributes infectious pressure only to the nodes it
 * belongs to (its household, workplace cluster, event node, commute route and
 * home-neighbourhood community pool), the only agents that can be infected are
 * the members of those nodes. We therefore restrict the inner loop to those
 * candidates, which is both faster and exactly equivalent to scanning everyone.
 */

export interface R0Options {
  /** Number of index agents to sample. More = smoother estimate, slower. */
  sampleSize?: number;
  /** RNG seed offset so estimates are reproducible. */
  seed?: number;
}

interface NodeIndex {
  household: Map<string, Agent[]>;
  daytime: Map<string, Agent[]>;
  event: Map<string, Agent[]>;
  route: Map<string, Agent[]>;
  profile: Map<string, Agent[]>;
}

function pushTo(map: Map<string, Agent[]>, key: string, agent: Agent): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(agent);
  else map.set(key, [agent]);
}

function buildNodeIndex(world: World): NodeIndex {
  const household = new Map<string, Agent[]>();
  const daytime = new Map<string, Agent[]>();
  const event = new Map<string, Agent[]>();
  const route = new Map<string, Agent[]>();
  const profile = new Map<string, Agent[]>();
  for (const agent of world.agents) {
    pushTo(household, agent.householdId, agent);
    pushTo(daytime, agent.daytimeNodeId, agent);
    pushTo(event, agent.eventNodeId, agent);
    if (agent.routeNodeId) pushTo(route, agent.routeNodeId, agent);
    pushTo(profile, agent.homeProfileId, agent);
  }
  return { household, daytime, event, route, profile };
}

/** All agents that can possibly be infected by `index` (share at least one node). */
function candidatesFor(index: Agent, nodes: NodeIndex): Agent[] {
  const seen = new Set<number>();
  const candidates: Agent[] = [];
  const collect = (bucket: Agent[] | undefined) => {
    if (!bucket) return;
    for (const agent of bucket) {
      if (agent.id === index.id || seen.has(agent.id)) continue;
      seen.add(agent.id);
      candidates.push(agent);
    }
  };
  collect(nodes.household.get(index.householdId));
  collect(nodes.daytime.get(index.daytimeNodeId));
  collect(nodes.event.get(index.eventNodeId));
  if (index.routeNodeId) collect(nodes.route.get(index.routeNodeId));
  collect(nodes.profile.get(index.homeProfileId));
  return candidates;
}

/** Infectious-pressure object describing a world where only `index` is infectious. */
function singleIndexPressure(index: Agent): InfectiousPressure {
  const pressure: InfectiousPressure = {
    byHousehold: { [index.householdId]: 1 },
    byDaytime: { [index.daytimeNodeId]: 1 },
    byEvent: { [index.eventNodeId]: 1 },
    byRoute: {},
    byProfile: { [index.homeProfileId]: 1 },
  };
  if (index.routeNodeId) pressure.byRoute[index.routeNodeId] = 1;
  return pressure;
}

/**
 * Strip out every intervention so the estimate is a true basic reproduction
 * number (a fully susceptible, no-policy, no-vaccine baseline).
 */
function baselineConfig(config: ScenarioConfig): ScenarioConfig {
  return normaliseConfig({
    ...config,
    priorImmunity: 0,
    vaccinationCoverage: 0,
    vaccineEffectiveness: 0,
    vaccinationStartDay: 1_000_000,
    policyStartDay: 1_000_000,
    mobilityReduction: 0,
    eventReduction: 0,
  });
}

export function estimateR0(world: World, config: ScenarioConfig, options: R0Options = {}): number {
  if (world.agents.length < 2) return 0;
  const normalised = baselineConfig(config);
  const rng = new Random((options.seed ?? config.seed) + 7001);
  const sampleSize = Math.max(1, Math.min(options.sampleSize ?? 220, world.agents.length));
  const nodes = buildNodeIndex(world);
  const noProtection = new Float32Array(world.agents.length); // all zero => fully susceptible

  const infectiousDays = Math.max(2, Math.round(normalised.infectiousDays));
  let secondaryPeopleSum = 0;
  let indexPeopleSum = 0;

  for (let sample = 0; sample < sampleSize; sample += 1) {
    const index = world.agents[rng.int(0, world.agents.length - 1)];
    const pressure = singleIndexPressure(index);
    const candidates = candidatesFor(index, nodes);
    const infected = new Set<number>();

    // The index is infectious for its whole period; secondaries never transmit.
    for (let dayOffset = 0; dayOffset < infectiousDays; dayOffset += 1) {
      for (const candidate of candidates) {
        if (infected.has(candidate.id)) continue;
        const { risk } = susceptibleRisk(candidate, world, normalised, pressure, noProtection, 1, rng);
        if (rng.chance(risk)) infected.add(candidate.id);
      }
    }

    let secondaryPeople = 0;
    for (const id of infected) secondaryPeople += world.agents[id].representedPeople;
    // Accumulate people-weighted so the result is the expected number of
    // secondaries from a randomly chosen infected PERSON (not a random agent).
    // This is robust to heterogeneous per-agent representation weights: an index
    // agent that stands for few people contributes proportionally less.
    secondaryPeopleSum += secondaryPeople;
    indexPeopleSum += index.representedPeople;
  }

  return secondaryPeopleSum / Math.max(1, indexPeopleSum);
}

export interface CalibrationResult {
  infectionRate: number;
  achievedR0: number;
  targetR0: number;
  iterations: number;
}

/**
 * Find the `infectionRate` (beta) that makes the model produce `targetR0`.
 *
 * R0 is monotone increasing in beta and, in the single-index low-hazard regime,
 * very nearly proportional to it (risk = 1 - exp(-beta * ...) ~ beta * ... for
 * small arguments). We exploit that with a proportional first guess, then a few
 * bisection refinements for the mild saturation curvature.
 */
export function calibrateInfectionRate(
  world: World,
  baseConfig: ScenarioConfig,
  targetR0: number,
  options: R0Options = {},
): CalibrationResult {
  const target = clamp(targetR0, 0.1, 20);
  const sampleSize = options.sampleSize ?? 160;
  const measure = (infectionRate: number, seedOffset: number) =>
    estimateR0(world, { ...baseConfig, infectionRate }, { sampleSize, seed: (options.seed ?? baseConfig.seed) + seedOffset });

  const minBeta = 0.01;
  const maxBeta = 1.6;

  // Anchor measurement at the current beta, then scale proportionally.
  const anchorBeta = clamp(baseConfig.infectionRate, minBeta, maxBeta);
  const anchorR0 = measure(anchorBeta, 11);
  let lo = minBeta;
  let hi = maxBeta;
  let guess = clamp(anchorR0 > 0.05 ? (anchorBeta * target) / anchorR0 : anchorBeta, minBeta, maxBeta);
  let achieved = measure(guess, 23);
  let iterations = 1;

  for (let step = 0; step < 7 && Math.abs(achieved - target) > 0.04 * target; step += 1) {
    if (achieved < target) lo = guess;
    else hi = guess;
    guess = clamp((lo + hi) / 2, minBeta, maxBeta);
    achieved = measure(guess, 31 + step * 7);
    iterations += 1;
  }

  return { infectionRate: Number(guess.toFixed(3)), achievedR0: achieved, targetR0: target, iterations };
}
