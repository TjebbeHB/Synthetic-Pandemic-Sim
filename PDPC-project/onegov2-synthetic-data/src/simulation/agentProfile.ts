import { Random, clamp } from "./random";
import type {
  AgeGroup,
  ContactGroup,
  MobilityFrequency,
  NeighbourhoodProfile,
  TransportMode,
  WorkSector,
} from "./types";

/**
 * Agent "callsign" system. Every synthetic agent is tagged with four
 * epidemiologically-meaningful traits and gets a compact, decodeable codename so
 * an individual can be followed through the outbreak:
 *
 *   AGE - HOUSEHOLD - CONTACT - MOBILITY · #ID
 *   e.g.  YTH-DUO-HC-RAIL+ · #R7
 *         = adolescent, duo household, high-contact work, rail commuter (often)
 *
 * Segment dictionaries are exported as CODENAME_LEGEND for the UI.
 */

export function ageGroupForAge(age: number): AgeGroup {
  if (age <= 11) return "child";
  if (age <= 17) return "teen";
  if (age <= 25) return "adolescent";
  if (age <= 64) return "adult";
  return "senior";
}

/** Contact intensity of the work/role — the lever that matters for spread. */
export function contactGroupForSector(sector: WorkSector): ContactGroup {
  switch (sector) {
    case "healthcare":
    case "hospitality":
    case "education":
      return "high";
    case "services":
    case "logistics":
      return "medium";
    case "industry":
    case "home":
    case "retired":
    default:
      return "low";
  }
}

/** Deterministic (seeded) transport mode + how often the agent travels. */
export function mobilityFor(
  profile: NeighbourhoodProfile,
  sector: WorkSector,
  ageGroup: AgeGroup,
  isCommuter: boolean,
  rng: Random,
): { transportMode: TransportMode; mobilityFrequency: MobilityFrequency } {
  const urbanity = profile.urbanity; // 1 = most urban .. 5 = rural
  const trainKm = profile.facilityContext?.trainDistanceKm ?? 2.5;
  const trainAccess = clamp(1.7 - trainKm * 0.4, 0.1, 1.5);

  let carW = 0.3 + (urbanity - 1) * 0.2;
  let bikeW = 0.55 + (5 - urbanity) * 0.13;
  let trainW = 0.12 + trainAccess * (0.2 + profile.commuterShare * 0.5);
  let footW = 0.3;

  if (ageGroup === "child") {
    carW *= 0.5;
    trainW *= 0.2;
    bikeW *= 1.25;
    footW *= 1.4;
  } else if (ageGroup === "senior" || sector === "retired" || sector === "home") {
    trainW *= 0.45;
    carW *= 0.95;
    footW *= 1.2;
  }
  if (!isCommuter) trainW *= 0.4;

  const transportMode = rng.pickWeighted<TransportMode>({
    car: carW,
    train: trainW,
    bike: bikeW,
    foot: footW,
  });

  let mobilityFrequency: MobilityFrequency;
  if (sector === "retired" || sector === "home") {
    mobilityFrequency = rng.chance(0.25) ? "sometimes" : "rarely";
  } else if (isCommuter || ageGroup === "child" || ageGroup === "teen" || contactGroupForSector(sector) === "high") {
    mobilityFrequency = rng.chance(0.85) ? "often" : "sometimes";
  } else {
    mobilityFrequency = rng.chance(0.6) ? "sometimes" : "often";
  }

  return { transportMode, mobilityFrequency };
}

const AGE_CODE: Record<AgeGroup, string> = {
  child: "KID",
  teen: "TEN",
  adolescent: "YTH",
  adult: "ADT",
  senior: "SNR",
};

const HOUSEHOLD_CODE: Record<string, string> = {
  single: "SOLO",
  couple: "DUO",
  family: "FAM",
  shared: "SHR",
  multigen: "MGN",
};

const CONTACT_CODE: Record<ContactGroup, string> = {
  high: "HC",
  medium: "MC",
  low: "LC",
};

const MODE_CODE: Record<TransportMode, string> = {
  car: "CAR",
  train: "RAIL",
  bike: "BIKE",
  foot: "FOOT",
};

const FREQUENCY_SUFFIX: Record<MobilityFrequency, string> = {
  often: "+",
  sometimes: "~",
  rarely: "-",
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  child: "Child (0–11)",
  teen: "Teen (12–17)",
  adolescent: "Adolescent (18–25)",
  adult: "Adult (26–64)",
  senior: "Senior (65+)",
};

export const CONTACT_GROUP_LABELS: Record<ContactGroup, string> = {
  high: "High-contact work",
  medium: "Medium-contact work",
  low: "Low-contact work",
};

const HOUSEHOLD_LABELS: Record<string, string> = {
  single: "solo household",
  couple: "duo household",
  family: "family household",
  shared: "house-share",
  multigen: "multigen household",
};

const MODE_LABELS: Record<TransportMode, string> = {
  car: "car",
  train: "train",
  bike: "bike",
  foot: "on foot",
};

const FREQUENCY_LABELS: Record<MobilityFrequency, string> = {
  often: "often",
  sometimes: "sometimes",
  rarely: "rarely",
};

export interface CodenameParts {
  id: number;
  ageGroup: AgeGroup;
  householdType: string;
  contactGroup: ContactGroup;
  transportMode: TransportMode;
  mobilityFrequency: MobilityFrequency;
}

export function buildCodename(parts: CodenameParts): string {
  const age = AGE_CODE[parts.ageGroup];
  const hh = HOUSEHOLD_CODE[parts.householdType] ?? "HH";
  const contact = CONTACT_CODE[parts.contactGroup];
  const mobility = `${MODE_CODE[parts.transportMode]}${FREQUENCY_SUFFIX[parts.mobilityFrequency]}`;
  const tag = parts.id.toString(36).toUpperCase();
  return `${age}-${hh}-${contact}-${mobility} · #${tag}`;
}

export function describeAgent(parts: CodenameParts): string {
  return [
    AGE_GROUP_LABELS[parts.ageGroup].replace(/\s*\(.*\)/, ""),
    HOUSEHOLD_LABELS[parts.householdType] ?? "household",
    CONTACT_GROUP_LABELS[parts.contactGroup].toLowerCase(),
    `${MODE_LABELS[parts.transportMode]} (${FREQUENCY_LABELS[parts.mobilityFrequency]})`,
  ].join(" · ");
}

/** Human-readable decoding table for the UI legend. */
export const CODENAME_LEGEND = {
  age: [
    { code: "KID", label: AGE_GROUP_LABELS.child },
    { code: "TEN", label: AGE_GROUP_LABELS.teen },
    { code: "YTH", label: AGE_GROUP_LABELS.adolescent },
    { code: "ADT", label: AGE_GROUP_LABELS.adult },
    { code: "SNR", label: AGE_GROUP_LABELS.senior },
  ],
  household: [
    { code: "SOLO", label: "Single-person" },
    { code: "DUO", label: "Couple / duo" },
    { code: "FAM", label: "Family with children" },
    { code: "SHR", label: "House-share" },
    { code: "MGN", label: "Multigenerational" },
  ],
  contact: [
    { code: "HC", label: "High-contact (care, hospitality, school)" },
    { code: "MC", label: "Medium-contact (services, logistics)" },
    { code: "LC", label: "Low-contact (industry, home, retired)" },
  ],
  mobility: [
    { code: "CAR / RAIL / BIKE / FOOT", label: "Main transport mode" },
    { code: "+  ~  −", label: "Travels often / sometimes / rarely" },
  ],
} as const;
