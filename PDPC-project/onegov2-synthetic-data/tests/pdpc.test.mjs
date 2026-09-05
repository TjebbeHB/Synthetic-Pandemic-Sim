import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const loader = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
const model = await loader.ssrLoadModule('/src/pdpc/model.ts');
const { buildRotterdamMicroWorld } = await loader.ssrLoadModule('/src/simulation/netherlandsSeed.ts');
const { simulate, normaliseConfig } = await loader.ssrLoadModule('/src/simulation/engine.ts');
const { PROFILES, PROFILE_IDS, POPULATION } = await loader.ssrLoadModule('/src/pdpc/data.ts');
await loader.close();

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`);
test('settings reject unsupported values and match engine normalization', () => {
  assert.deepEqual(model.validateSettings(model.DEFAULT_SETTINGS, PROFILE_IDS), model.DEFAULT_SETTINGS);
  for (const change of [{ latentDays: 15 }, { infectiousDays: 22 }, { mortalityMultiplier: 0 }, { infectionRate: 1.5 }, { runs: 0 }, { days: 181 }, { scale: 2 }, { seed: NaN }, { seedProfileId: 'unknown' }]) {
    assert.throws(() => model.validateSettings({ ...model.DEFAULT_SETTINGS, ...change }, PROFILE_IDS));
  }
  for (const change of [{}, { latentDays: 14, infectiousDays: 21, mortalityMultiplier: 0.05, infectionRate: 1.4 }, { schoolClosure: 1, maskMandate: .7 }]) {
    const config = model.scenarioConfig(model.validateSettings({ ...model.DEFAULT_SETTINGS, ...change }, PROFILE_IDS), 0);
    assert.deepEqual(normaliseConfig(config), config);
  }
});
test('quantiles are interpolated per run and do not alter the input', () => {
  const values = [100, 0];
  assert.deepEqual(model.interval(values), { mean: 50, p10: 10, p90: 90 });
  assert.deepEqual(values, [100, 0]);
  assert.deepEqual(model.interval([12]), { mean: 12, p10: 12, p90: 12 });
});
test('seven-day incidence excludes seeds and has quantiles of differences', () => {
  const frame = n => { const counts = { susceptible: 100 - n, exposed: n, infectious: 0, recovered: 0, deceased: 0 }; return { total: counts, areas: { a: counts } }; };
  const runs = [[frame(0), ...Array.from({ length: 8 }, () => frame(100))], Array.from({ length: 9 }, () => frame(100))];
  const result = model.aggregateRuns(runs, ['a']);
  assert.deepEqual(result[0].total.incidence, { mean: 0, p10: 0, p90: 0 });
  assert.deepEqual(result[1].total.incidence, { mean: 50, p10: 10, p90: 90 });
  assert.equal(result[7].total.incidence.mean, 50);
  assert.equal(result[8].total.incidence.mean, 0);
  assert.deepEqual(result[1].total, result[1].areas.a);
});
test('rates use resident denominators, with fixed map scales and explicit missing data', () => {
  const p = { population: 2000, facilityContext: { density: 12000 } };
  const estimates = { infectious: { mean: 20 }, cumulative: { mean: 40 } };
  assert.equal(model.metricValue('infectious', p, estimates), 1000);
  assert.equal(model.metricValue('cumulative', p, estimates), 2);
  assert.equal(model.metricValue('density', p), 12000);
  assert.equal(model.metricValue('infectious', p), null);
  assert.notEqual(model.colorFor(null, 'infectious'), model.colorFor(0, 'infectious'));
  assert.equal(model.colorFor(1000, 'infectious'), model.METRICS.infectious.colors[3]);
});
test('all model buurten have unique official geometry and positive population', async () => {
  const geo = JSON.parse(await readFile(new URL('../src/data/rotterdamBuurten.json', import.meta.url)));
  const codes = geo.features.map(f => f.properties.code);
  assert.equal(new Set(PROFILE_IDS).size, PROFILE_IDS.length);
  for (const p of PROFILES) { assert.equal(codes.filter(code => code === p.id).length, 1); assert.ok(p.population > 0); }
});
test('Rotterdam ensemble is reproducible, stochastic, and conserves residents', { timeout: 120000 }, () => {
  const world = buildRotterdamMicroWorld(model.WORLD_SEED, 28);
  close(world.representedPopulation, POPULATION);
  const weights = new Map();
  for (const a of world.agents) weights.set(a.homeProfileId, (weights.get(a.homeProfileId) ?? 0) + a.representedPeople);
  for (const p of PROFILES) close(weights.get(p.id), p.population);
  const settings = { ...model.DEFAULT_SETTINGS, scale: 28, days: 30, infectionRate: .6, initialCases: 20 };
  const run = i => model.compactRun(simulate(world, model.scenarioConfig(settings, i)));
  const first = run(0), repeat = run(0), second = run(1);
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, second);
  const summary = model.aggregateRuns([first, second], PROFILE_IDS);
  assert.equal(summary.length, 31);
  for (const f of summary) {
    close(['susceptible','exposed','infectious','recovered','deceased'].reduce((s,k) => s + f.total[k].mean, 0), POPULATION);
    for (const p of PROFILES) {
      for (const interval of Object.values(f.areas[p.id])) { assert.ok(interval.mean >= 0); assert.ok(interval.p10 <= interval.p90); }
      close(['susceptible','exposed','infectious','recovered','deceased'].reduce((s,k) => s + f.areas[p.id][k].mean, 0), p.population);
    }
    close(Object.values(f.areas).reduce((s,a) => s + a.infectious.mean, 0), f.total.infectious.mean);
  }
});
