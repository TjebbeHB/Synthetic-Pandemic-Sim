import type { Population, Trace } from './types';
import { GEOMETRY, wijkCode } from './geography';
import { sewageName } from './sewage';

export interface ObservationOptions {
  detection: number; reportDelay: number; admission: number; admissionDelay: number; stay: number;
  sewageDelay: number; sewageInterval: number; sheddingDays: number;
}
export const DEFAULT_OBSERVATION: ObservationOptions = {
  detection: .35, reportDelay: 3, admission: .015, admissionDelay: 7, stay: 7,
  sewageDelay: 2, sewageInterval: 3, sheddingDays: 10,
};
export type MonitorLevel = 'wijk' | 'buurt' | 'sewage';
export interface ObservationRow {
  id: string; name: string; n: number; sewageN: number;
  reports: number[]; admissions: number[]; occupied: number[]; sewage: (number | null)[];
}
function draw(person: number, seed: number, stream: number) {
  let value = (person + 1) ^ seed ^ stream;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
export function validateObservation(o: ObservationOptions) {
  for (const p of [o.detection, o.admission]) if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Ongeldige observatiekans.');
  for (const d of [o.reportDelay, o.admissionDelay, o.sewageDelay]) if (!Number.isInteger(d) || d < 0 || d > 30) throw new Error('Ongeldige vertraging.');
  for (const d of [o.stay, o.sewageInterval, o.sheddingDays]) if (!Number.isInteger(d) || d < 1 || d > 30) throw new Error('Ongeldige observatieduur.');
}
export function latestSampleDay(day: number, o: ObservationOptions) {
  const available = day - o.sewageDelay;
  return available < 0 ? null : Math.floor(available / o.sewageInterval) * o.sewageInterval;
}
/** Observation-only layer: probabilities, delays and shedding are scenario
 * assumptions, never clinical estimates or real RIVM measurements. */
export function observationRows(population: Population, trace: Trace, o: ObservationOptions, level: MonitorLevel): ObservationRow[] {
  validateObservation(o);
  const length = trace.options.days + 1, rows = new Map<string, ObservationRow>();
  const deltas = new Map<string, { beds: number[]; shed: number[] }>();
  const zero = () => Array<number>(length).fill(0);
  const names = new Map(level === 'sewage' ? [] : GEOMETRY[level].features.map(f => [f.properties.code, f.properties.name]));
  for (const p of population.people) {
    const id = level === 'sewage' ? p.sewageId ?? 'unlinked' : level === 'wijk' ? wijkCode(p.area) : p.area;
    if (!rows.has(id)) {
      rows.set(id, { id, name: level === 'sewage' ? sewageName(id) : names.get(id) ?? id, n: 0, sewageN: 0, reports: zero(), admissions: zero(), occupied: zero(), sewage: Array(length).fill(null) });
      deltas.set(id, { beds: Array(length + 1).fill(0), shed: Array(length + 1).fill(0) });
    }
    const row = rows.get(id)!, diff = deltas.get(id)!;
    row.n++; if (p.sewageId) row.sewageN++;
    const infected = trace.infectedOn[p.id]; if (infected < 0 || infected >= length) continue;
    const reported = infected + o.reportDelay, admission = infected + o.admissionDelay;
    if (reported < length && draw(p.id, trace.options.seed, 0x13579) < o.detection) row.reports[reported]++;
    if (admission < length && draw(p.id, trace.options.seed, 0x97531) < o.admission) {
      row.admissions[admission]++; diff.beds[admission]++; diff.beds[Math.min(length, admission + o.stay)]--;
    }
    if (p.sewageId) { diff.shed[infected]++; diff.shed[Math.min(length, infected + o.sheddingDays)]--; }
  }
  for (const row of rows.values()) {
    const diff = deltas.get(row.id)!, shed: number[] = [];
    let beds = 0, contributors = 0;
    for (let day = 0; day < length; day++) {
      beds += diff.beds[day]; contributors += diff.shed[day]; row.occupied[day] = beds; shed.push(contributors);
      const sample = latestSampleDay(day, o);
      row.sewage[day] = sample === null || !row.sewageN ? null : shed[sample] / row.sewageN * 1000;
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}
export function sumWindow(values: number[], end: number, width = 7) {
  return end < 0 ? 0 : values.slice(Math.max(0, end - width + 1), end + 1).reduce((a, b) => a + b, 0);
}
export function totalObservations(rows: ObservationRow[]): ObservationRow {
  const n = rows.reduce((s, r) => s + r.n, 0), sewageN = rows.reduce((s, r) => s + r.sewageN, 0);
  const length = rows[0]?.reports.length ?? 0;
  return { id: 'all', name: 'Gegenereerde populatie', n, sewageN,
    reports: Array.from({ length }, (_, d) => rows.reduce((s, r) => s + r.reports[d], 0)),
    admissions: Array.from({ length }, (_, d) => rows.reduce((s, r) => s + r.admissions[d], 0)),
    occupied: Array.from({ length }, (_, d) => rows.reduce((s, r) => s + r.occupied[d], 0)),
    sewage: Array.from({ length }, (_, d) => !sewageN || rows.every(r => r.sewage[d] === null) ? null : rows.reduce((s, r) => s + (r.sewage[d] ?? 0) * r.sewageN, 0) / sewageN),
  };
}
