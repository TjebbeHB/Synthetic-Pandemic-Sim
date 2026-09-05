import {
  AGE_BANDS,
  type AgeBand,
  type Agent,
  type DataMode,
  type HouseholdType,
  type HousingType,
  type NeighbourhoodProfile,
  type WorkSector,
  type World,
} from "./types";
import { clamp, jitterCoordinate, Random } from "./random";
import dutchProfiles from "../data/dutchProfiles.json";
import nationProfilesData from "../data/nationProfiles.json";
import cityProfilesData from "../data/cityProfiles.json";
import type { CityId } from "./types";
import { ageGroupForAge, buildCodename, contactGroupForSector, mobilityFor } from "./agentProfile";

/** A city tab (buurt-level detail) versus the national city-average network. */
function isCityScope(mode: DataMode): mode is CityId {
  return mode !== "nation";
}

function agentScaleFor(mode: DataMode): number {
  // One agent per N represented residents. Cities run at buurt resolution; the
  // scale is deliberately small so that almost every buurt has pop > scale and
  // therefore each agent represents ~N people *uniformly*. Uniform per-agent
  // weight matters: with heterogeneous weights, a single cross-buurt contact at a
  // shared event node would transfer a wildly different number of represented
  // people, which destabilises the dynamics and the R0 estimate.
  return isCityScope(mode) ? 350 : 2500;
}

/**
 * CBS buurten include many near-empty units (industrial estates, parks, water)
 * whose handful of residents would otherwise become disproportionately-weighted
 * agents. We exclude them from the residential-spread model; this keeps per-agent
 * representation near-uniform and drops < ~1% of the city population.
 */
const MIN_CITY_BUURT_POPULATION = 250;

const DEFAULT_HOUSEHOLD_MIX: Record<HouseholdType, number> = {
  single: 0.36,
  couple: 0.25,
  family: 0.28,
  shared: 0.08,
  multigen: 0.03,
};

const DEFAULT_HOUSING_MIX: Record<HousingType, number> = {
  apartment: 0.42,
  "row-house": 0.45,
  detached: 0.13,
};

const DEFAULT_WORK_MIX: Record<Exclude<WorkSector, "home" | "retired">, number> = {
  healthcare: 0.15,
  education: 0.12,
  industry: 0.13,
  services: 0.34,
  logistics: 0.12,
  hospitality: 0.14,
};

interface GeneratedDutchProfiles {
  nationalContext: {
    population: number;
    ageDistribution: NeighbourhoodProfile["ageDistribution"];
    householdMix: NeighbourhoodProfile["householdMix"];
  };
  mobilityBaseline: {
    year: number;
    tripsPerPersonPerDay: number;
    kmPerPersonPerDay: number;
    minutesPerPersonPerDay: number;
  };
  hagueProfiles: NeighbourhoodProfile[];
  metadata: {
    notes: string[];
  };
}

const generatedDutchData = dutchProfiles as GeneratedDutchProfiles;
const HAGUE_PROFILES = generatedDutchData.hagueProfiles;

interface GeneratedNationProfiles {
  metadata: { generatedFrom: string[]; notes: string[] };
  profiles: NeighbourhoodProfile[];
}

interface GeneratedCityProfiles {
  metadata: { generatedFrom: string[]; notes: string[] };
  nationalContext?: GeneratedDutchProfiles["nationalContext"];
  cities: Array<{
    id: CityId;
    name: string;
    gemeenteCode: string;
    lat: number;
    lon: number;
    average: NeighbourhoodProfile;
    buurten: NeighbourhoodProfile[];
  }>;
}

const generatedCityData = cityProfilesData as GeneratedCityProfiles;
const CITY_BY_ID = new Map(generatedCityData.cities.map((city) => [city.id, city]));
/** City-wide average nodes (one per city) used to build the national network. */
const CITY_AVERAGE_PROFILES = generatedCityData.cities.map((city) => city.average);

export const AVAILABLE_CITIES = generatedCityData.cities.map((city) => ({ id: city.id, name: city.name }));

const generatedNationData = nationProfilesData as GeneratedNationProfiles;
/**
 * Real, CBS-derived national profiles. Empty until you run
 * scripts/build_nation_profiles.py against a national Kerncijfers CSV (all
 * gemeenten); when populated, nation mode uses these instead of the hand-built
 * scaffold below — the same way Hague mode already uses CSV-derived buurten.
 */
const NATION_PROFILES_FROM_CSV = generatedNationData.profiles ?? [];

const P: NeighbourhoodProfile[] = [
  {
    id: "ams-centrum",
    name: "Amsterdam Centrum",
    municipality: "Amsterdam",
    province: "Noord-Holland",
    lat: 52.371,
    lon: 4.895,
    population: 95500,
    urbanity: 1,
    averageIncome: 43100,
    nonWesternShare: 0.24,
    commuterShare: 0.32,
    airportDistanceKm: 13,
    eventPull: 1.0,
    rwziId: "RWZI-AMS-WEST",
    rwziName: "Amsterdam West",
    ageDistribution: { "0-14": 0.11, "15-24": 0.16, "25-44": 0.39, "45-64": 0.22, "65+": 0.12 },
    householdMix: { single: 0.55, couple: 0.2, family: 0.14, shared: 0.09, multigen: 0.02 },
    housingMix: { apartment: 0.84, "row-house": 0.14, detached: 0.02 },
    workSectorMix: { ...DEFAULT_WORK_MIX, services: 0.42, hospitality: 0.18, industry: 0.06 },
    landUse: { residential: 0.42, industry: 0.05, agriculture: 0.0, green: 0.18, water: 0.35 },
    commuteLinks: [
      { targetId: "utrecht-binnenstad", share: 0.26 },
      { targetId: "almere-stad", share: 0.23 },
      { targetId: "denhaag-centrum", share: 0.19 },
      { targetId: "rotterdam-centrum", share: 0.16 },
      { targetId: "ams-zuidoost", share: 0.16 },
    ],
  },
  {
    id: "ams-zuidoost",
    name: "Amsterdam Zuidoost",
    municipality: "Amsterdam",
    province: "Noord-Holland",
    lat: 52.312,
    lon: 4.946,
    population: 92400,
    urbanity: 1,
    averageIncome: 30200,
    nonWesternShare: 0.68,
    commuterShare: 0.43,
    airportDistanceKm: 18,
    eventPull: 0.8,
    rwziId: "RWZI-AMS-OOST",
    rwziName: "Amsterdam Oost",
    ageDistribution: { "0-14": 0.18, "15-24": 0.13, "25-44": 0.31, "45-64": 0.24, "65+": 0.14 },
    householdMix: { single: 0.42, couple: 0.18, family: 0.31, shared: 0.05, multigen: 0.04 },
    housingMix: { apartment: 0.78, "row-house": 0.2, detached: 0.02 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.2, logistics: 0.17, services: 0.32 },
    landUse: { residential: 0.51, industry: 0.08, agriculture: 0.01, green: 0.28, water: 0.12 },
    commuteLinks: [
      { targetId: "ams-centrum", share: 0.38 },
      { targetId: "almere-stad", share: 0.22 },
      { targetId: "utrecht-binnenstad", share: 0.2 },
      { targetId: "denhaag-centrum", share: 0.1 },
      { targetId: "rotterdam-centrum", share: 0.1 },
    ],
  },
  {
    id: "rotterdam-centrum",
    name: "Rotterdam Centrum",
    municipality: "Rotterdam",
    province: "Zuid-Holland",
    lat: 51.922,
    lon: 4.479,
    population: 38500,
    urbanity: 1,
    averageIncome: 36700,
    nonWesternShare: 0.41,
    commuterShare: 0.38,
    airportDistanceKm: 6,
    eventPull: 0.95,
    rwziId: "RWZI-DOKHAVEN",
    rwziName: "Dokhaven",
    ageDistribution: { "0-14": 0.12, "15-24": 0.17, "25-44": 0.37, "45-64": 0.21, "65+": 0.13 },
    householdMix: { single: 0.52, couple: 0.21, family: 0.16, shared: 0.08, multigen: 0.03 },
    housingMix: { apartment: 0.81, "row-house": 0.17, detached: 0.02 },
    workSectorMix: { ...DEFAULT_WORK_MIX, logistics: 0.2, services: 0.39, hospitality: 0.15 },
    landUse: { residential: 0.35, industry: 0.22, agriculture: 0.0, green: 0.14, water: 0.29 },
    commuteLinks: [
      { targetId: "denhaag-centrum", share: 0.3 },
      { targetId: "utrecht-binnenstad", share: 0.2 },
      { targetId: "ams-centrum", share: 0.18 },
      { targetId: "rotterdam-zuid", share: 0.18 },
      { targetId: "breda", share: 0.14 },
    ],
  },
  {
    id: "rotterdam-zuid",
    name: "Rotterdam Zuid",
    municipality: "Rotterdam",
    province: "Zuid-Holland",
    lat: 51.887,
    lon: 4.49,
    population: 205000,
    urbanity: 1,
    averageIncome: 28600,
    nonWesternShare: 0.54,
    commuterShare: 0.34,
    airportDistanceKm: 9,
    eventPull: 0.62,
    rwziId: "RWZI-DOKHAVEN",
    rwziName: "Dokhaven",
    ageDistribution: { "0-14": 0.19, "15-24": 0.13, "25-44": 0.29, "45-64": 0.25, "65+": 0.14 },
    householdMix: { single: 0.38, couple: 0.2, family: 0.34, shared: 0.04, multigen: 0.04 },
    housingMix: { apartment: 0.62, "row-house": 0.34, detached: 0.04 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.18, logistics: 0.19, industry: 0.16 },
    landUse: { residential: 0.48, industry: 0.24, agriculture: 0.0, green: 0.18, water: 0.1 },
    commuteLinks: [
      { targetId: "rotterdam-centrum", share: 0.45 },
      { targetId: "denhaag-centrum", share: 0.18 },
      { targetId: "breda", share: 0.14 },
      { targetId: "utrecht-binnenstad", share: 0.12 },
      { targetId: "tilburg", share: 0.11 },
    ],
  },
  {
    id: "denhaag-centrum",
    name: "Den Haag Centrum",
    municipality: "Den Haag",
    province: "Zuid-Holland",
    lat: 52.08,
    lon: 4.31,
    population: 106000,
    urbanity: 1,
    averageIncome: 34900,
    nonWesternShare: 0.45,
    commuterShare: 0.42,
    airportDistanceKm: 17,
    eventPull: 0.78,
    rwziId: "RWZI-HARNASCHPOLDER",
    rwziName: "Harnaschpolder",
    ageDistribution: { "0-14": 0.16, "15-24": 0.12, "25-44": 0.34, "45-64": 0.24, "65+": 0.14 },
    householdMix: { single: 0.46, couple: 0.21, family: 0.24, shared: 0.06, multigen: 0.03 },
    housingMix: { apartment: 0.72, "row-house": 0.25, detached: 0.03 },
    workSectorMix: { ...DEFAULT_WORK_MIX, services: 0.43, education: 0.14, healthcare: 0.15, industry: 0.05 },
    landUse: { residential: 0.52, industry: 0.05, agriculture: 0.02, green: 0.3, water: 0.11 },
    commuteLinks: [
      { targetId: "rotterdam-centrum", share: 0.28 },
      { targetId: "ams-centrum", share: 0.24 },
      { targetId: "utrecht-binnenstad", share: 0.21 },
      { targetId: "rotterdam-zuid", share: 0.16 },
      { targetId: "breda", share: 0.11 },
    ],
  },
  {
    id: "utrecht-overvecht",
    name: "Utrecht Overvecht",
    municipality: "Utrecht",
    province: "Utrecht",
    lat: 52.116,
    lon: 5.104,
    population: 35400,
    urbanity: 1,
    averageIncome: 29100,
    nonWesternShare: 0.46,
    commuterShare: 0.36,
    airportDistanceKm: 35,
    eventPull: 0.56,
    rwziId: "RWZI-UTRECHT",
    rwziName: "Utrecht",
    ageDistribution: { "0-14": 0.18, "15-24": 0.14, "25-44": 0.27, "45-64": 0.24, "65+": 0.17 },
    householdMix: { single: 0.42, couple: 0.2, family: 0.3, shared: 0.04, multigen: 0.04 },
    housingMix: { apartment: 0.67, "row-house": 0.3, detached: 0.03 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.2, education: 0.13, services: 0.33 },
    landUse: { residential: 0.55, industry: 0.08, agriculture: 0.03, green: 0.26, water: 0.08 },
    commuteLinks: [
      { targetId: "utrecht-binnenstad", share: 0.38 },
      { targetId: "ams-centrum", share: 0.25 },
      { targetId: "denhaag-centrum", share: 0.15 },
      { targetId: "rotterdam-centrum", share: 0.13 },
      { targetId: "almere-stad", share: 0.09 },
    ],
  },
  {
    id: "utrecht-binnenstad",
    name: "Utrecht Binnenstad",
    municipality: "Utrecht",
    province: "Utrecht",
    lat: 52.091,
    lon: 5.121,
    population: 21800,
    urbanity: 1,
    averageIncome: 41200,
    nonWesternShare: 0.21,
    commuterShare: 0.47,
    airportDistanceKm: 34,
    eventPull: 0.88,
    rwziId: "RWZI-UTRECHT",
    rwziName: "Utrecht",
    ageDistribution: { "0-14": 0.09, "15-24": 0.28, "25-44": 0.36, "45-64": 0.17, "65+": 0.1 },
    householdMix: { single: 0.58, couple: 0.18, family: 0.09, shared: 0.13, multigen: 0.02 },
    housingMix: { apartment: 0.76, "row-house": 0.21, detached: 0.03 },
    workSectorMix: { ...DEFAULT_WORK_MIX, services: 0.42, education: 0.18, hospitality: 0.17 },
    landUse: { residential: 0.46, industry: 0.04, agriculture: 0.0, green: 0.19, water: 0.31 },
    commuteLinks: [
      { targetId: "ams-centrum", share: 0.27 },
      { targetId: "denhaag-centrum", share: 0.22 },
      { targetId: "rotterdam-centrum", share: 0.2 },
      { targetId: "utrecht-overvecht", share: 0.18 },
      { targetId: "eindhoven-centrum", share: 0.13 },
    ],
  },
  {
    id: "eindhoven-centrum",
    name: "Eindhoven Centrum",
    municipality: "Eindhoven",
    province: "Noord-Brabant",
    lat: 51.441,
    lon: 5.478,
    population: 33800,
    urbanity: 1,
    averageIncome: 35400,
    nonWesternShare: 0.27,
    commuterShare: 0.39,
    airportDistanceKm: 7,
    eventPull: 0.72,
    rwziId: "RWZI-EINDHOVEN",
    rwziName: "Eindhoven",
    ageDistribution: { "0-14": 0.12, "15-24": 0.22, "25-44": 0.34, "45-64": 0.2, "65+": 0.12 },
    householdMix: { single: 0.49, couple: 0.2, family: 0.18, shared: 0.1, multigen: 0.03 },
    housingMix: { apartment: 0.71, "row-house": 0.25, detached: 0.04 },
    workSectorMix: { ...DEFAULT_WORK_MIX, industry: 0.2, services: 0.35, education: 0.14 },
    landUse: { residential: 0.45, industry: 0.14, agriculture: 0.02, green: 0.25, water: 0.14 },
    commuteLinks: [
      { targetId: "eindhoven-strijp", share: 0.3 },
      { targetId: "tilburg", share: 0.24 },
      { targetId: "breda", share: 0.17 },
      { targetId: "utrecht-binnenstad", share: 0.15 },
      { targetId: "maastricht", share: 0.14 },
    ],
  },
  {
    id: "eindhoven-strijp",
    name: "Eindhoven Strijp",
    municipality: "Eindhoven",
    province: "Noord-Brabant",
    lat: 51.448,
    lon: 5.456,
    population: 31600,
    urbanity: 2,
    averageIncome: 38100,
    nonWesternShare: 0.22,
    commuterShare: 0.44,
    airportDistanceKm: 5,
    eventPull: 0.68,
    rwziId: "RWZI-EINDHOVEN",
    rwziName: "Eindhoven",
    ageDistribution: { "0-14": 0.15, "15-24": 0.14, "25-44": 0.35, "45-64": 0.23, "65+": 0.13 },
    householdMix: { single: 0.38, couple: 0.27, family: 0.25, shared: 0.07, multigen: 0.03 },
    housingMix: { apartment: 0.5, "row-house": 0.42, detached: 0.08 },
    workSectorMix: { ...DEFAULT_WORK_MIX, industry: 0.25, services: 0.31, logistics: 0.15 },
    landUse: { residential: 0.43, industry: 0.25, agriculture: 0.01, green: 0.22, water: 0.09 },
    commuteLinks: [
      { targetId: "eindhoven-centrum", share: 0.35 },
      { targetId: "tilburg", share: 0.22 },
      { targetId: "breda", share: 0.16 },
      { targetId: "utrecht-binnenstad", share: 0.15 },
      { targetId: "maastricht", share: 0.12 },
    ],
  },
  {
    id: "groningen-centrum",
    name: "Groningen Centrum",
    municipality: "Groningen",
    province: "Groningen",
    lat: 53.219,
    lon: 6.566,
    population: 62500,
    urbanity: 1,
    averageIncome: 31800,
    nonWesternShare: 0.17,
    commuterShare: 0.28,
    airportDistanceKm: 14,
    eventPull: 0.82,
    rwziId: "RWZI-GRONINGEN",
    rwziName: "Groningen",
    ageDistribution: { "0-14": 0.1, "15-24": 0.32, "25-44": 0.28, "45-64": 0.18, "65+": 0.12 },
    householdMix: { single: 0.56, couple: 0.17, family: 0.1, shared: 0.15, multigen: 0.02 },
    housingMix: { apartment: 0.65, "row-house": 0.29, detached: 0.06 },
    workSectorMix: { ...DEFAULT_WORK_MIX, education: 0.2, healthcare: 0.18, services: 0.33 },
    landUse: { residential: 0.4, industry: 0.08, agriculture: 0.04, green: 0.28, water: 0.2 },
    commuteLinks: [
      { targetId: "leeuwarden", share: 0.25 },
      { targetId: "zwolle", share: 0.24 },
      { targetId: "enschede", share: 0.17 },
      { targetId: "utrecht-binnenstad", share: 0.17 },
      { targetId: "ams-centrum", share: 0.17 },
    ],
  },
  {
    id: "maastricht",
    name: "Maastricht",
    municipality: "Maastricht",
    province: "Limburg",
    lat: 50.851,
    lon: 5.691,
    population: 121600,
    urbanity: 2,
    averageIncome: 33200,
    nonWesternShare: 0.16,
    commuterShare: 0.26,
    airportDistanceKm: 9,
    eventPull: 0.62,
    rwziId: "RWZI-BOSSCHERVELD",
    rwziName: "Bosscherveld",
    ageDistribution: { "0-14": 0.13, "15-24": 0.18, "25-44": 0.25, "45-64": 0.25, "65+": 0.19 },
    householdMix: { single: 0.43, couple: 0.25, family: 0.21, shared: 0.07, multigen: 0.04 },
    housingMix: { apartment: 0.46, "row-house": 0.39, detached: 0.15 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.21, hospitality: 0.17, services: 0.31 },
    landUse: { residential: 0.39, industry: 0.09, agriculture: 0.17, green: 0.27, water: 0.08 },
    commuteLinks: [
      { targetId: "eindhoven-centrum", share: 0.29 },
      { targetId: "eindhoven-strijp", share: 0.18 },
      { targetId: "tilburg", share: 0.16 },
      { targetId: "breda", share: 0.14 },
      { targetId: "utrecht-binnenstad", share: 0.23 },
    ],
  },
  {
    id: "almere-stad",
    name: "Almere Stad",
    municipality: "Almere",
    province: "Flevoland",
    lat: 52.368,
    lon: 5.218,
    population: 112000,
    urbanity: 2,
    averageIncome: 34600,
    nonWesternShare: 0.39,
    commuterShare: 0.52,
    airportDistanceKm: 37,
    eventPull: 0.48,
    rwziId: "RWZI-ALMERE",
    rwziName: "Almere",
    ageDistribution: { "0-14": 0.21, "15-24": 0.12, "25-44": 0.28, "45-64": 0.27, "65+": 0.12 },
    householdMix: { single: 0.33, couple: 0.24, family: 0.35, shared: 0.04, multigen: 0.04 },
    housingMix: { apartment: 0.36, "row-house": 0.51, detached: 0.13 },
    workSectorMix: { ...DEFAULT_WORK_MIX, services: 0.34, logistics: 0.17, healthcare: 0.17 },
    landUse: { residential: 0.42, industry: 0.1, agriculture: 0.15, green: 0.22, water: 0.11 },
    commuteLinks: [
      { targetId: "ams-centrum", share: 0.46 },
      { targetId: "ams-zuidoost", share: 0.2 },
      { targetId: "utrecht-binnenstad", share: 0.17 },
      { targetId: "zwolle", share: 0.09 },
      { targetId: "denhaag-centrum", share: 0.08 },
    ],
  },
  {
    id: "arnhem",
    name: "Arnhem",
    municipality: "Arnhem",
    province: "Gelderland",
    lat: 51.985,
    lon: 5.899,
    population: 166000,
    urbanity: 2,
    averageIncome: 33100,
    nonWesternShare: 0.25,
    commuterShare: 0.31,
    airportDistanceKm: 70,
    eventPull: 0.5,
    rwziId: "RWZI-ARNHEM",
    rwziName: "Arnhem",
    ageDistribution: { "0-14": 0.16, "15-24": 0.13, "25-44": 0.27, "45-64": 0.26, "65+": 0.18 },
    householdMix: { ...DEFAULT_HOUSEHOLD_MIX, single: 0.41, family: 0.25 },
    housingMix: { apartment: 0.39, "row-house": 0.43, detached: 0.18 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.2, education: 0.13, services: 0.3 },
    landUse: { residential: 0.34, industry: 0.08, agriculture: 0.11, green: 0.41, water: 0.06 },
    commuteLinks: [
      { targetId: "utrecht-binnenstad", share: 0.26 },
      { targetId: "enschede", share: 0.2 },
      { targetId: "zwolle", share: 0.18 },
      { targetId: "eindhoven-centrum", share: 0.14 },
      { targetId: "ams-centrum", share: 0.22 },
    ],
  },
  {
    id: "enschede",
    name: "Enschede",
    municipality: "Enschede",
    province: "Overijssel",
    lat: 52.221,
    lon: 6.893,
    population: 161000,
    urbanity: 2,
    averageIncome: 30300,
    nonWesternShare: 0.23,
    commuterShare: 0.23,
    airportDistanceKm: 80,
    eventPull: 0.48,
    rwziId: "RWZI-ENSCHEDE",
    rwziName: "Enschede",
    ageDistribution: { "0-14": 0.15, "15-24": 0.2, "25-44": 0.25, "45-64": 0.24, "65+": 0.16 },
    householdMix: { single: 0.43, couple: 0.23, family: 0.22, shared: 0.09, multigen: 0.03 },
    housingMix: { apartment: 0.36, "row-house": 0.46, detached: 0.18 },
    workSectorMix: { ...DEFAULT_WORK_MIX, education: 0.17, industry: 0.17, services: 0.3 },
    landUse: { residential: 0.31, industry: 0.12, agriculture: 0.19, green: 0.34, water: 0.04 },
    commuteLinks: [
      { targetId: "arnhem", share: 0.24 },
      { targetId: "zwolle", share: 0.22 },
      { targetId: "groningen-centrum", share: 0.16 },
      { targetId: "utrecht-binnenstad", share: 0.2 },
      { targetId: "eindhoven-centrum", share: 0.18 },
    ],
  },
  {
    id: "breda",
    name: "Breda",
    municipality: "Breda",
    province: "Noord-Brabant",
    lat: 51.571,
    lon: 4.768,
    population: 185500,
    urbanity: 2,
    averageIncome: 36900,
    nonWesternShare: 0.2,
    commuterShare: 0.36,
    airportDistanceKm: 44,
    eventPull: 0.5,
    rwziId: "RWZI-BREDA",
    rwziName: "Breda",
    ageDistribution: { "0-14": 0.15, "15-24": 0.13, "25-44": 0.27, "45-64": 0.27, "65+": 0.18 },
    householdMix: { ...DEFAULT_HOUSEHOLD_MIX, single: 0.39, couple: 0.27 },
    housingMix: { apartment: 0.34, "row-house": 0.47, detached: 0.19 },
    workSectorMix: { ...DEFAULT_WORK_MIX, logistics: 0.18, services: 0.33, hospitality: 0.12 },
    landUse: { residential: 0.35, industry: 0.13, agriculture: 0.18, green: 0.29, water: 0.05 },
    commuteLinks: [
      { targetId: "rotterdam-centrum", share: 0.24 },
      { targetId: "tilburg", share: 0.23 },
      { targetId: "eindhoven-centrum", share: 0.18 },
      { targetId: "denhaag-centrum", share: 0.15 },
      { targetId: "utrecht-binnenstad", share: 0.2 },
    ],
  },
  {
    id: "tilburg",
    name: "Tilburg",
    municipality: "Tilburg",
    province: "Noord-Brabant",
    lat: 51.555,
    lon: 5.091,
    population: 225000,
    urbanity: 2,
    averageIncome: 32100,
    nonWesternShare: 0.24,
    commuterShare: 0.31,
    airportDistanceKm: 28,
    eventPull: 0.55,
    rwziId: "RWZI-TILBURG",
    rwziName: "Tilburg",
    ageDistribution: { "0-14": 0.16, "15-24": 0.17, "25-44": 0.26, "45-64": 0.25, "65+": 0.16 },
    householdMix: { single: 0.41, couple: 0.23, family: 0.24, shared: 0.09, multigen: 0.03 },
    housingMix: { apartment: 0.35, "row-house": 0.5, detached: 0.15 },
    workSectorMix: { ...DEFAULT_WORK_MIX, industry: 0.19, logistics: 0.16, services: 0.31 },
    landUse: { residential: 0.33, industry: 0.15, agriculture: 0.21, green: 0.27, water: 0.04 },
    commuteLinks: [
      { targetId: "breda", share: 0.22 },
      { targetId: "eindhoven-centrum", share: 0.25 },
      { targetId: "eindhoven-strijp", share: 0.19 },
      { targetId: "rotterdam-centrum", share: 0.14 },
      { targetId: "maastricht", share: 0.2 },
    ],
  },
  {
    id: "zwolle",
    name: "Zwolle",
    municipality: "Zwolle",
    province: "Overijssel",
    lat: 52.516,
    lon: 6.083,
    population: 132000,
    urbanity: 3,
    averageIncome: 36100,
    nonWesternShare: 0.15,
    commuterShare: 0.29,
    airportDistanceKm: 96,
    eventPull: 0.45,
    rwziId: "RWZI-ZWOLLE",
    rwziName: "Zwolle",
    ageDistribution: { "0-14": 0.17, "15-24": 0.13, "25-44": 0.26, "45-64": 0.27, "65+": 0.17 },
    householdMix: { ...DEFAULT_HOUSEHOLD_MIX, single: 0.38, family: 0.27 },
    housingMix: { apartment: 0.31, "row-house": 0.49, detached: 0.2 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.21, services: 0.29, logistics: 0.15 },
    landUse: { residential: 0.29, industry: 0.12, agriculture: 0.28, green: 0.24, water: 0.07 },
    commuteLinks: [
      { targetId: "utrecht-binnenstad", share: 0.24 },
      { targetId: "groningen-centrum", share: 0.21 },
      { targetId: "enschede", share: 0.18 },
      { targetId: "arnhem", share: 0.16 },
      { targetId: "almere-stad", share: 0.21 },
    ],
  },
  {
    id: "leeuwarden",
    name: "Leeuwarden",
    municipality: "Leeuwarden",
    province: "Friesland",
    lat: 53.201,
    lon: 5.799,
    population: 126000,
    urbanity: 3,
    averageIncome: 31500,
    nonWesternShare: 0.13,
    commuterShare: 0.22,
    airportDistanceKm: 56,
    eventPull: 0.38,
    rwziId: "RWZI-LEEUWARDEN",
    rwziName: "Leeuwarden",
    ageDistribution: { "0-14": 0.15, "15-24": 0.17, "25-44": 0.24, "45-64": 0.26, "65+": 0.18 },
    householdMix: { ...DEFAULT_HOUSEHOLD_MIX, single: 0.43, couple: 0.23 },
    housingMix: { apartment: 0.34, "row-house": 0.45, detached: 0.21 },
    workSectorMix: { ...DEFAULT_WORK_MIX, healthcare: 0.2, education: 0.15, services: 0.31 },
    landUse: { residential: 0.27, industry: 0.09, agriculture: 0.33, green: 0.24, water: 0.07 },
    commuteLinks: [
      { targetId: "groningen-centrum", share: 0.29 },
      { targetId: "zwolle", share: 0.26 },
      { targetId: "ams-centrum", share: 0.2 },
      { targetId: "almere-stad", share: 0.11 },
      { targetId: "utrecht-binnenstad", share: 0.14 },
    ],
  },
];

function ageFromBand(ageBand: AgeBand, rng: Random): number {
  switch (ageBand) {
    case "0-14":
      return rng.int(0, 14);
    case "15-24":
      return rng.int(15, 24);
    case "25-44":
      return rng.int(25, 44);
    case "45-64":
      return rng.int(45, 64);
    case "65+":
      return rng.int(65, 91);
  }
}

function ageBandForAge(age: number): AgeBand {
  if (age <= 14) return "0-14";
  if (age <= 24) return "15-24";
  if (age <= 44) return "25-44";
  if (age <= 64) return "45-64";
  return "65+";
}

function sampleProfileAge(profile: NeighbourhoodProfile, rng: Random): AgeBand {
  return rng.pickWeighted(profile.ageDistribution);
}

function plannedHouseholdAges(type: HouseholdType, profile: NeighbourhoodProfile, rng: Random): number[] {
  if (type === "single") {
    return [ageFromBand(sampleProfileAge(profile, rng), rng)];
  }
  if (type === "couple") {
    const olderCouple = rng.chance(profile.ageDistribution["65+"] * 1.45);
    const first = olderCouple ? rng.int(58, 86) : rng.int(24, 68);
    return [first, clamp(first + rng.int(-6, 7), 18, 91)];
  }
  if (type === "family") {
    const adults = rng.chance(0.78) ? 2 : 1;
    const children = rng.int(1, 3);
    const ages: number[] = [];
    for (let i = 0; i < adults; i += 1) {
      ages.push(rng.chance(0.68) ? rng.int(27, 46) : rng.int(38, 58));
    }
    for (let i = 0; i < children; i += 1) {
      ages.push(rng.chance(0.78) ? rng.int(0, 14) : rng.int(15, 21));
    }
    return ages;
  }
  if (type === "shared") {
    return Array.from({ length: rng.int(2, 4) }, () => (rng.chance(0.64) ? rng.int(18, 29) : rng.int(25, 44)));
  }
  return [rng.int(61, 88), rng.int(31, 58), rng.int(0, 16), ...(rng.chance(0.46) ? [rng.int(20, 42)] : [])];
}

function workSectorForAge(age: number, profile: NeighbourhoodProfile, rng: Random): WorkSector {
  if (age < 4) return "home";
  if (age <= 17) return "education";
  if (age <= 24 && rng.chance(0.58)) return "education";
  if (age >= 65 && rng.chance(0.86)) return "retired";
  return rng.pickWeighted(profile.workSectorMix);
}

function susceptibilityFor(ageBand: AgeBand): number {
  switch (ageBand) {
    case "0-14":
      return 0.82;
    case "15-24":
      return 1.08;
    case "25-44":
      return 1.0;
    case "45-64":
      return 0.96;
    case "65+":
      return 0.88;
  }
}

function severeRiskFor(ageBand: AgeBand): number {
  switch (ageBand) {
    case "0-14":
      return 0.0002;
    case "15-24":
      return 0.0003;
    case "25-44":
      return 0.0008;
    case "45-64":
      return 0.003;
    case "65+":
      return 0.013;
  }
}

function chooseWorkProfile(profile: NeighbourhoodProfile, sector: WorkSector, rng: Random): string {
  if (sector === "home" || sector === "retired") return profile.id;
  const educationLocalBias = sector === "education" ? 0.55 : 1;
  if (profile.commuteLinks.length > 0 && rng.chance(profile.commuterShare * educationLocalBias)) {
    return rng.pickFromLinks(profile.commuteLinks).targetId;
  }
  return profile.id;
}

function dayNodeFor(profileId: string, sector: WorkSector, rng: Random): string {
  if (sector === "home" || sector === "retired") return `home-day:${profileId}`;
  const clusterCount = sector === "education" ? 5 : 8;
  return `${sector}:${profileId}:${rng.int(1, clusterCount)}`;
}

function eventNodeFor(profile: NeighbourhoodProfile, rng: Random): string {
  const scope = profile.eventPull > 0.74 ? "hub" : profile.province.toLowerCase().replace(/\s+/g, "-");
  return `event:${scope}:${rng.int(1, profile.eventPull > 0.74 ? 7 : 4)}`;
}

function routeId(originId: string, targetId: string): string {
  return `route:${originId}->${targetId}`;
}

function increment(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function blendAgeDistribution(
  profile: NeighbourhoodProfile,
  national: NeighbourhoodProfile["ageDistribution"],
): NeighbourhoodProfile["ageDistribution"] {
  return Object.fromEntries(
    AGE_BANDS.map((band) => [band, profile.ageDistribution[band] * 0.76 + national[band] * 0.24]),
  ) as unknown as NeighbourhoodProfile["ageDistribution"];
}

function buildNationProfiles(): NeighbourhoodProfile[] {
  const totalPopulation = P.reduce((sum, profile) => sum + profile.population, 0);
  const scale = generatedDutchData.nationalContext.population / totalPopulation;
  return P.map((profile) => ({
    ...profile,
    population: Math.round(profile.population * scale),
    ageDistribution: blendAgeDistribution(profile, generatedDutchData.nationalContext.ageDistribution),
    householdMix: profile.householdMix.single > 0.5 ? profile.householdMix : generatedDutchData.nationalContext.householdMix,
  }));
}

function buildWorldFromProfiles(
  mode: DataMode,
  seed: number,
  profiles: NeighbourhoodProfile[],
  sourceNotes: string[],
  agentScaleOverride?: number,
): World {
  const rng = new Random(seed);
  const agents: Agent[] = [];
  const profileById = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  const householdSizes: Record<string, number> = {};
  const daytimeNodeSizes: Record<string, number> = {};
  const eventNodeSizes: Record<string, number> = {};
  const routeNodeSizes: Record<string, number> = {};
  const profileAgentCounts: Record<string, number> = {};
  const householdMembers: Record<string, Agent[]> = {};
  let householdSequence = 1;
  const cityScope = isCityScope(mode);
  const minAgentsPerProfile = cityScope ? 1 : 36;
  const agentScale = agentScaleOverride ?? agentScaleFor(mode);

  for (const profile of profiles) {
    const targetAgents = Math.max(minAgentsPerProfile, Math.round(profile.population / agentScale));
    const representedPeople = profile.population / targetAgents;
    profileAgentCounts[profile.id] = targetAgents;
    let profileAgents = 0;

    while (profileAgents < targetAgents) {
      const householdType = rng.pickWeighted(profile.householdMix);
      const housingType = rng.pickWeighted(profile.housingMix);
      const ages = plannedHouseholdAges(householdType, profile, rng);
      const householdId = `${profile.id}-hh-${householdSequence}`;
      householdSequence += 1;

      for (const age of ages) {
        if (profileAgents >= targetAgents) break;
        const ageBand = ageBandForAge(age);
        const workSector = workSectorForAge(age, profile, rng);
        const workProfileId = chooseWorkProfile(profile, workSector, rng);
        const daytimeNodeId = dayNodeFor(workProfileId, workSector, rng);
        const eventNodeId = eventNodeFor(profileById[workProfileId] ?? profile, rng);
        const routeNodeId = workProfileId === profile.id ? null : routeId(profile.id, workProfileId);
        const ageGroup = ageGroupForAge(age);
        const contactGroup = contactGroupForSector(workSector);
        const { transportMode, mobilityFrequency } = mobilityFor(
          profile,
          workSector,
          ageGroup,
          routeNodeId !== null,
          rng,
        );
        const lonSpread = cityScope ? 0.0028 + (profile.urbanity - 1) * 0.001 : 0.035 + (profile.urbanity - 1) * 0.014;
        const latSpread = cityScope ? 0.0019 + (profile.urbanity - 1) * 0.0008 : 0.022 + (profile.urbanity - 1) * 0.01;
        const eventAffinity =
          clamp((workSector === "hospitality" ? 0.82 : 0.42) + profile.eventPull * 0.28 + rng.range(-0.18, 0.18), 0.08, 0.95);
        const compliance = clamp(
          0.52 +
            (ageBand === "65+" ? 0.18 : ageBand === "0-14" ? 0.1 : 0) +
            (workSector === "healthcare" || workSector === "education" ? 0.06 : 0) -
            (workSector === "hospitality" ? 0.12 : 0) -
            eventAffinity * 0.11 +
            rng.range(-0.2, 0.18),
          0.08,
          0.96,
        );

        const agentId = agents.length;
        const agent: Agent = {
          id: agentId,
          representedPeople,
          homeProfileId: profile.id,
          workProfileId,
          householdId,
          daytimeNodeId,
          eventNodeId,
          routeNodeId,
          age,
          ageBand,
          ageGroup,
          householdType,
          housingType,
          workSector,
          contactGroup,
          transportMode,
          mobilityFrequency,
          codename: buildCodename({ id: agentId, ageGroup, householdType, contactGroup, transportMode, mobilityFrequency }),
          lat: jitterCoordinate(profile.lat, latSpread, rng),
          lon: jitterCoordinate(profile.lon, lonSpread, rng),
          susceptibility: susceptibilityFor(ageBand),
          severeRisk: severeRiskFor(ageBand),
          eventAffinity,
          compliance,
        };
        agents.push(agent);
        profileAgents += 1;
        increment(householdSizes, householdId);
        increment(daytimeNodeSizes, daytimeNodeId);
        increment(eventNodeSizes, eventNodeId);
        if (routeNodeId) increment(routeNodeSizes, routeNodeId);
        householdMembers[householdId] = householdMembers[householdId] ?? [];
        householdMembers[householdId].push(agent);
      }
    }
  }

  const routeLinksById: Record<string, { id: string; originId: string; targetId: string; agents: number }> = {};
  for (const agent of agents) {
    if (!agent.routeNodeId) continue;
    routeLinksById[agent.routeNodeId] = routeLinksById[agent.routeNodeId] ?? {
      id: agent.routeNodeId,
      originId: agent.homeProfileId,
      targetId: agent.workProfileId,
      agents: 0,
    };
    routeLinksById[agent.routeNodeId].agents += 1;
  }

  return {
    mode,
    agents,
    profiles,
    profileById,
    householdSizes,
    daytimeNodeSizes,
    eventNodeSizes,
    routeNodeSizes,
    profileAgentCounts,
    routeLinks: Object.values(routeLinksById).sort((a, b) => b.agents - a.agents),
    representedPopulation: profiles.reduce((sum, profile) => sum + profile.population, 0),
    sourceNotes,
  };
}

function buildCityWorld(cityId: CityId, seed: number, agentScaleOverride?: number): World {
  // Den Haag keeps its richer existing buurt dataset (with facility distances).
  if (cityId === "denhaag" && CITY_BY_ID.get("denhaag")?.buurten.length === 0) {
    return buildWorldFromProfiles(cityId, seed, HAGUE_PROFILES, [
      "Den Haag uses local 2025 CBS buurt CSV rows and 2024 facility-distance CSV fields.",
      "Buurt coordinates are generated from PDOK/CBS Wijk- en Buurtkaart 2024 geometries.",
      "Mobility uses the local 2024 ODiN mobility CSV baseline plus synthetic nearest-neighbour commute links.",
      "No real person-level data is used; every marker is a weighted synthetic agent.",
    ], agentScaleOverride);
  }

  const city = CITY_BY_ID.get(cityId);
  if (city && city.buurten.length > 0) {
    const residentialBuurten = city.buurten.filter((buurt) => buurt.population >= MIN_CITY_BUURT_POPULATION);
    const buurten = residentialBuurten.length > 0 ? residentialBuurten : city.buurten;
    return buildWorldFromProfiles(cityId, seed, buurten, [
      `${city.name} is built from ${buurten.length} CBS buurt rows (Kerncijfers wijken en buurten 2025).`,
      "Buurt demographics, household, housing and work mixes come straight from the CBS rows.",
      "Buurt coordinates are PDOK/CBS Wijk- en Buurtkaart 2024 centroids; commute links are synthetic gravity flows.",
      "No real person-level data is used; every marker is a weighted synthetic agent.",
    ], agentScaleOverride);
  }

  // Fallback: a city we only have an average for — simulate that single node.
  return buildWorldFromProfiles(cityId, seed, city ? [city.average] : HAGUE_PROFILES, [
    "City view falls back to the city-wide CBS average node.",
    "No real person-level data is used; every marker is a weighted synthetic agent.",
  ], agentScaleOverride);
}

/** Rotterdam at fine (grouped) resolution for the micro-level view. A smaller
 * agentScale = each agent stands for fewer people = more agents = finer dynamics. */
export function buildRotterdamMicroWorld(seed = 20260604, agentScale = 28): World {
  return buildCityWorld("rotterdam", seed, agentScale);
}

export function buildSyntheticWorld(mode: DataMode, seed = 20260604): World {
  if (isCityScope(mode)) {
    return buildCityWorld(mode, seed);
  }

  // Nation mode: a network of city-wide CBS averages (real per-city demographics
  // and density, so each city seeds and spreads according to its own profile).
  if (CITY_AVERAGE_PROFILES.length > 0) {
    const cityCount = CITY_AVERAGE_PROFILES.length;
    return buildWorldFromProfiles(mode, seed, CITY_AVERAGE_PROFILES, [
      `Nation mode is a network of the ${cityCount} largest Dutch cities, each a city-wide CBS average node.`,
      "Per-city age, household, housing, work and density come directly from CBS gemeente rows.",
      "Inter-city commute links are synthetic gravity flows between the city averages.",
      "No real person-level data is used; every marker is a weighted synthetic agent.",
    ]);
  }

  if (NATION_PROFILES_FROM_CSV.length > 0) {
    return buildWorldFromProfiles(mode, seed, NATION_PROFILES_FROM_CSV, [
      `Nation mode is built from ${NATION_PROFILES_FROM_CSV.length} CBS regions (Kerncijfers wijken en buurten), one synthetic agent cohort per region.`,
      "Demographics, household, housing and work mixes are derived per region directly from the CBS CSV rows.",
      "Commute links are synthetic gravity flows; RWZI catchments assigned from the wastewater register.",
      "No real person-level data is used; every marker is a weighted synthetic agent.",
    ]);
  }

  return buildWorldFromProfiles(mode, seed, buildNationProfiles(), [
    `Nation mode represents ${generatedDutchData.nationalContext.population.toLocaleString("en-US")} residents from the uploaded CBS 2025 national row.`,
    "The national network is a weighted synthetic scaffold over major Dutch urban and regional nodes.",
    "Mobility links are deterministic synthetic commuter corridors shaped by the ODiN commute-distance concept.",
    "No real person-level data is used; every marker is a weighted synthetic agent.",
  ]);
}

export function buildSyntheticNetherlands(seed = 20260604): World {
  return buildSyntheticWorld("nation", seed);
}

export { P as NEIGHBOURHOOD_PROFILES, DEFAULT_HOUSEHOLD_MIX, DEFAULT_HOUSING_MIX };
