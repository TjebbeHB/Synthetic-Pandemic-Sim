import { simulate } from '../simulation/engine';
import { buildRotterdamMicroWorld } from '../simulation/netherlandsSeed';
import { aggregateRuns, compactRun, MODEL_VERSION, scenarioConfig, validateSettings, WORLD_SEED, type CompactFrame, type Route, type RunOutput } from './model';
import { PROFILE_IDS } from './data';

self.onmessage = (event: MessageEvent) => {
  try {
    const settings = validateSettings(event.data, PROFILE_IDS);
    const start = performance.now();
    self.postMessage({ type: 'progress', completed: 0, total: settings.runs, phase: 'Populatie opbouwen' });
    const world = buildRotterdamMicroWorld(WORLD_SEED, settings.scale);
    const runs: CompactFrame[][] = [];
    for (let i = 0; i < settings.runs; i++) {
      self.postMessage({ type: 'progress', completed: i, total: settings.runs, phase: `Simulatie ${i + 1} van ${settings.runs}` });
      // Retain only area totals across runs; person-state histories can be collected after each run.
      runs.push(compactRun(simulate(world, scenarioConfig(settings, i))));
    }
    const frames = aggregateRuns(runs, world.profiles.map(p => p.id));
    const routes = new Map<string, Route>();
    for (const a of world.agents) {
      if (!a.routeNodeId) continue;
      const route = routes.get(a.routeNodeId) ?? { id: a.routeNodeId, originId: a.homeProfileId, targetId: a.workProfileId, people: 0 };
      route.people += a.representedPeople;
      routes.set(route.id, route);
    }
    const result: RunOutput = {
      version: MODEL_VERSION, createdAt: new Date().toISOString(), settings, worldSeed: WORLD_SEED,
      agents: world.agents.length, population: world.representedPopulation, profiles: world.profiles,
      routes: [...routes.values()].sort((a, b) => b.people - a.people), frames,
      peakDay: frames.reduce((best, f) => f.total.infectious.mean > frames[best].total.infectious.mean ? f.day : best, 0),
      durationMs: performance.now() - start,
    };
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'De berekening is mislukt.' });
  }
};
