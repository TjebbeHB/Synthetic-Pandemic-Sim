export const AGE_BANDS = ["0-14", "15-24", "25-44", "45-64", "65+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const STATE = {
  susceptible: 0,
  exposed: 1,
  infectious: 2,
  recovered: 3,
  deceased: 4,
} as const;

export type StateCode = (typeof STATE)[keyof typeof STATE];

export const STATE_LABELS: Record<StateCode, string> = {
  [STATE.susceptible]: "Susceptible",
  [STATE.exposed]: "Exposed",
  [STATE.infectious]: "Infectious",
  [STATE.recovered]: "Recovered",
  [STATE.deceased]: "Deceased",
};

export const STATE_COLORS: Record<StateCode, string> = {
  [STATE.susceptible]: "#7c8b95",
  [STATE.exposed]: "#f1b84b",
  [STATE.infectious]: "#e84d4f",
  [STATE.recovered]: "#2aa884",
  [STATE.deceased]: "#20262b",
};

export type HouseholdType = "single" | "couple" | "family" | "shared" | "multigen";
export type HousingType = "apartment" | "row-house" | "detached";

/** Selectable city tabs (each backed by real CBS buurt-level data). */
export const CITY_IDS = [
  "amsterdam",
  "rotterdam",
  "denhaag",
  "utrecht",
  "eindhoven",
  "groningen",
  "arnhem",
  "leeuwarden",
] as const;
export type CityId = (typeof CITY_IDS)[number];

/** "nation" = network of city-wide averages; a CityId = that city's buurten. */
export type DataMode = "nation" | CityId;
export type WorkSector =
  | "healthcare"
  | "education"
  | "industry"
  | "services"
  | "logistics"
  | "hospitality"
  | "home"
  | "retired";

/** Display age groups for the agent codename (distinct from the 5 CBS bands). */
export type AgeGroup = "child" | "teen" | "adolescent" | "adult" | "senior";
/** Contact intensity of the agent's work/role. */
export type ContactGroup = "high" | "medium" | "low";
export type TransportMode = "car" | "train" | "bike" | "foot";
export type MobilityFrequency = "often" | "sometimes" | "rarely";

export interface AgeDistribution {
  "0-14": number;
  "15-24": number;
  "25-44": number;
  "45-64": number;
  "65+": number;
}

export interface LandUseShare {
  residential: number;
  industry: number;
  agriculture: number;
  green: number;
  water: number;
}

export interface CommuteLink {
  targetId: string;
  share: number;
}

export interface FacilityContext {
  density: number;
  trainDistanceKm: number;
  gpDistanceKm: number;
  hospitalDistanceKm: number;
  schoolDistanceKm: number;
  supermarketDistanceKm: number;
  cafeCount1Km: number;
}

export interface NeighbourhoodProfile {
  id: string;
  name: string;
  municipality: string;
  province: string;
  lat: number;
  lon: number;
  population: number;
  urbanity: number;
  averageIncome: number;
  nonWesternShare: number;
  commuterShare: number;
  airportDistanceKm: number;
  eventPull: number;
  rwziId: string;
  rwziName: string;
  ageDistribution: AgeDistribution;
  householdMix: Record<HouseholdType, number>;
  housingMix: Record<HousingType, number>;
  workSectorMix: Record<Exclude<WorkSector, "home" | "retired">, number>;
  landUse: LandUseShare;
  commuteLinks: CommuteLink[];
  facilityContext?: FacilityContext;
}

export interface Agent {
  id: number;
  representedPeople: number;
  homeProfileId: string;
  workProfileId: string;
  householdId: string;
  daytimeNodeId: string;
  eventNodeId: string;
  routeNodeId: string | null;
  age: number;
  ageBand: AgeBand;
  ageGroup: AgeGroup;
  householdType: HouseholdType;
  housingType: HousingType;
  workSector: WorkSector;
  contactGroup: ContactGroup;
  transportMode: TransportMode;
  mobilityFrequency: MobilityFrequency;
  codename: string;
  lat: number;
  lon: number;
  susceptibility: number;
  severeRisk: number;
  eventAffinity: number;
  compliance: number;
}

export interface RouteLinkSummary {
  id: string;
  originId: string;
  targetId: string;
  agents: number;
}

export interface World {
  mode: DataMode;
  agents: Agent[];
  profiles: NeighbourhoodProfile[];
  profileById: Record<string, NeighbourhoodProfile>;
  householdSizes: Record<string, number>;
  daytimeNodeSizes: Record<string, number>;
  eventNodeSizes: Record<string, number>;
  routeNodeSizes: Record<string, number>;
  profileAgentCounts: Record<string, number>;
  routeLinks: RouteLinkSummary[];
  representedPopulation: number;
  sourceNotes: string[];
}

export interface ScenarioConfig {
  dataMode: DataMode;
  seed: number;
  infectionRate: number;
  incubationDays: number;
  infectiousDays: number;
  mobilityIntensity: number;
  eventIntensity: number;
  householdIntensity: number;
  initialCases: number;
  seedProfileId: string;
  maxDays: number;
  ensembleRuns: number;
  priorImmunity: number;
  vaccinationStartDay: number;
  vaccinationCoverage: number;
  vaccineEffectiveness: number;
  mortalityMultiplier: number;
  /** Age-independent per-infection fatality floor (0–0.95). 0 = natural disease
   *  whose lethality is age-skewed via mortalityMultiplier; >0 models an
   *  engineered pathogen that kills more uniformly across ages. */
  baseLethality?: number;
  policyStartDay: number;
  mobilityReduction: number;
  eventReduction: number;
}

export interface AreaStats {
  profileId: string;
  name: string;
  municipality: string;
  representedPopulation: number;
  susceptible: number;
  exposed: number;
  infectious: number;
  recovered: number;
  deceased: number;
  activeRate: number;
  signal: number;
}

export interface RwziSignal {
  rwziId: string;
  rwziName: string;
  representedPopulation: number;
  signal: number;
  infectious: number;
  exposed: number;
}

export interface SimFrame {
  day: number;
  states: Uint8Array;
  totals: Record<"susceptible" | "exposed" | "infectious" | "recovered" | "deceased", number>;
  newExposures: number;
  rEffective: number;
  transmissionByLayer: Record<"household" | "work" | "event" | "commute" | "community", number>;
  areaStats: AreaStats[];
  rwziSignals: RwziSignal[];
}

export interface SimulationResult {
  config: ScenarioConfig;
  world: World;
  frames: SimFrame[];
  peakDay: number;
  peakInfectious: number;
}

export interface MetricInterval {
  mean: number;
  p10: number;
  p90: number;
}

export interface EnsembleFrame {
  day: number;
  totals: Record<"susceptible" | "exposed" | "infectious" | "recovered" | "deceased", MetricInterval>;
  newExposures: MetricInterval;
  rEffective: MetricInterval;
}

export interface EnsembleResult {
  representative: SimulationResult;
  frames: EnsembleFrame[];
  peakDay: MetricInterval;
  peakInfectious: MetricInterval;
  runCount: number;
}
