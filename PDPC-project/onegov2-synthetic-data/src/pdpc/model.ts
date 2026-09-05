import type { AreaStats, MetricInterval, NeighbourhoodProfile, ScenarioConfig, SimulationResult } from '../simulation/types';

export const MODEL_VERSION = 'pdpc-rotterdam-1';
export const WORLD_SEED = 20260604;
export const DEFAULT_SETTINGS = {
  seed: 42, scale: 12, runs: 3, days: 120, seedProfileId: 'BU05990110',
  initialCases: 6, infectionRate: 0.26, latentDays: 5, infectiousDays: 7,
  priorImmunity: 0.04, mortalityMultiplier: 1,
  policyStartDay: 21, mobilityReduction: 0, eventReduction: 0,
  maskMandate: 0, schoolClosure: 0, caseIsolation: 0, travelReduction: 0,
  vaccinationStartDay: 46, vaccinationCoverage: 0, vaccineEffectiveness: 0.72,
};
export type Settings = typeof DEFAULT_SETTINGS;
export type Metric = 'infectious' | 'incidence' | 'cumulative' | 'density';
export const METRICS: Record<Metric, { label: string; unit: string; definition: string; breaks: number[]; colors: string[] }> = {
  infectious: { label: 'Besmettelijk', unit: 'per 100.000 inwoners', definition: 'Prevalentie: personen in de besmettelijke fase (I) op deze dag.', breaks: [0, 1, 100, 1000, 10000, 30000, 60000], colors: ['#f1f2f3', '#fff0ea', '#ffdccd', '#ffb6a1', '#f47b63', '#d84439', '#962337'] },
  incidence: { label: 'Nieuwe infecties · 7 dagen', unit: 'per 100.000 inwoners', definition: 'Nieuwe infecties in de laatste 7 dagen. Startinfecties op dag 0 tellen niet mee.', breaks: [0, 1, 100, 1000, 10000, 30000, 60000], colors: ['#f1f2f3', '#f1ecf7', '#e6e0f1', '#c5b6df', '#a08ac6', '#7753a1', '#4e286f'] },
  cumulative: { label: 'Ooit geïnfecteerd', unit: '% van inwoners', definition: 'Cumulatief E + I + R + D, inclusief de startinfecties. Geen herinfecties in dit model.', breaks: [0, 0.01, 1, 5, 20, 50], colors: ['#f1f2f3', '#d8e9f5', '#a8cfe8', '#6aaace', '#367aa6', '#194d74'] },
  density: { label: 'Bevolkingsdichtheid', unit: 'inwoners / km²', definition: 'Context uit de CBS-buurtprofielen. Geen simulatieresultaat.', breaks: [0, 1000, 3000, 6000, 10000, 15000], colors: ['#f1f2f3', '#d9eae4', '#acd4c4', '#79b89e', '#448969', '#235940'] },
};
export function colorFor(value: number | null, metric: Metric) {
  if (value === null || !Number.isFinite(value)) return '#e6e8ea';
  const spec = METRICS[metric];
  let index = 0;
  spec.breaks.forEach((threshold, i) => { if (value >= threshold) index = i; });
  return spec.colors[index];
}
export function interval(values: number[]): MetricInterval {
  if (!values.length) return { mean: 0, p10: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p: number) => {
    const x = (sorted.length - 1) * p;
    return sorted[Math.floor(x)] + (sorted[Math.ceil(x)] - sorted[Math.floor(x)]) * (x - Math.floor(x));
  };
  return { mean: values.reduce((sum, n) => sum + n, 0) / values.length, p10: quantile(0.1), p90: quantile(0.9) };
}
export type Counts = Pick<AreaStats, 'susceptible' | 'exposed' | 'infectious' | 'recovered' | 'deceased'>;
export type Key = keyof Counts | 'incidence' | 'cumulative';
export type Estimates = Record<Key, MetricInterval>;
export interface SummaryFrame { day: number; total: Estimates; areas: Record<string, Estimates> }
export interface Route { id: string; originId: string; targetId: string; people: number }
export interface RunOutput {
  version: typeof MODEL_VERSION; createdAt: string; settings: Settings; worldSeed: number;
  agents: number; population: number; profiles: NeighbourhoodProfile[];
  routes: Route[]; frames: SummaryFrame[]; peakDay: number; durationMs: number;
}
export interface CompactFrame { total: Counts; areas: Record<string, Counts> }
export function compactRun(result: SimulationResult): CompactFrame[] {
  return result.frames.map(frame => ({ total: frame.totals, areas: Object.fromEntries(frame.areaStats.map(a => [a.profileId, {
    susceptible: a.susceptible, exposed: a.exposed, infectious: a.infectious, recovered: a.recovered, deceased: a.deceased,
  }])) }));
}
const cumulative = (c: Counts) => c.exposed + c.infectious + c.recovered + c.deceased;
export function aggregateRuns(runs: CompactFrame[][], ids: string[]): SummaryFrame[] {
  const estimate = (day: number, id?: string): Estimates => {
    const values = runs.map(run => id ? run[day].areas[id] : run[day].total);
    const before = runs.map(run => id ? run[Math.max(0, day - 7)].areas[id] : run[Math.max(0, day - 7)].total);
    return {
      susceptible: interval(values.map(x => x.susceptible)), exposed: interval(values.map(x => x.exposed)),
      infectious: interval(values.map(x => x.infectious)), recovered: interval(values.map(x => x.recovered)), deceased: interval(values.map(x => x.deceased)),
      cumulative: interval(values.map(cumulative)), incidence: interval(values.map((x, i) => Math.max(0, cumulative(x) - cumulative(before[i])))),
    };
  };
  return runs[0].map((_, day) => ({ day, total: estimate(day), areas: Object.fromEntries(ids.map(id => [id, estimate(day, id)])) }));
}
export function metricValue(metric: Metric, profile: NeighbourhoodProfile, estimates?: Estimates): number | null {
  if (metric === 'density') return profile.facilityContext?.density ?? null;
  if (!estimates || profile.population <= 0) return null;
  return estimates[metric].mean / profile.population * (metric === 'cumulative' ? 100 : 100000);
}
export function scenarioConfig(s: Settings, run: number): ScenarioConfig {
  return {
    dataMode: 'rotterdam', seed: s.seed + run * 9973, maxDays: s.days, ensembleRuns: 1,
    seedProfileId: s.seedProfileId, initialCases: s.initialCases, infectionRate: s.infectionRate,
    incubationDays: s.latentDays, infectiousDays: s.infectiousDays, priorImmunity: s.priorImmunity,
    mortalityMultiplier: s.mortalityMultiplier, baseLethality: 0,
    mobilityIntensity: 1, eventIntensity: 0.85, householdIntensity: 1,
    policyStartDay: s.policyStartDay, mobilityReduction: s.mobilityReduction, eventReduction: s.eventReduction,
    maskMandate: s.maskMandate, schoolClosure: s.schoolClosure, caseIsolation: s.caseIsolation, travelReduction: s.travelReduction,
    vaccinationStartDay: s.vaccinationStartDay, vaccinationCoverage: s.vaccinationCoverage, vaccineEffectiveness: s.vaccineEffectiveness,
  };
}
export function validateSettings(value: unknown, ids: string[]): Settings {
  if (!value || typeof value !== 'object') throw new Error('Ongeldig scenariobestand.');
  const s = value as Record<string, unknown>;
  const bounds: Record<string, [number, number]> = {
    seed: [1, 2147483647], scale: [1, 100], runs: [1, 16], days: [30, 180], initialCases: [1, 100],
    infectionRate: [0.01, 1.4], latentDays: [1, 14], infectiousDays: [2, 21], priorImmunity: [0, 0.95], mortalityMultiplier: [0.05, 5],
    policyStartDay: [0, 180], mobilityReduction: [0, 0.95], eventReduction: [0, 0.95], maskMandate: [0, 0.7],
    schoolClosure: [0, 1], caseIsolation: [0, 0.95], travelReduction: [0, 0.95],
    vaccinationStartDay: [0, 180], vaccinationCoverage: [0, 0.95], vaccineEffectiveness: [0, 0.95],
  };
  const clean = { ...DEFAULT_SETTINGS };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const n = s[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`Ongeldige waarde: ${key}.`);
    (clean as Record<string, number | string>)[key] = n;
  }
  if (![1, 4, 12, 28].includes(clean.scale)) throw new Error('Ongeldige resolutie.');
  for (const key of ['seed', 'runs', 'days', 'initialCases', 'policyStartDay', 'vaccinationStartDay'] as const) {
    if (!Number.isInteger(clean[key])) throw new Error(`Geheel getal vereist: ${key}.`);
  }
  if (typeof s.seedProfileId !== 'string' || !ids.includes(s.seedProfileId)) throw new Error('Onbekende startbuurt.');
  clean.seedProfileId = s.seedProfileId;
  return clean;
}
export const fmt = (n: number, decimals = 0) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n);
