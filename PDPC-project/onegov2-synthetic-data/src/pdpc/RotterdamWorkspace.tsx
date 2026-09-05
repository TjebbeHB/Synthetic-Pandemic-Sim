import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, CircleHelp, Download, FlaskConical, MapPin, Pause, Play, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { AGE_BANDS, type MetricInterval } from '../simulation/types';
import { CITY_POPULATION, POPULATION, PROFILE_IDS, PROFILES } from './data';
import { DEFAULT_SETTINGS, fmt, METRICS, metricValue, MODEL_VERSION, validateSettings, WORLD_SEED, type Estimates, type Metric, type RunOutput, type Settings } from './model';
import RotterdamMap from './RotterdamMap';
import Curve from './Curve';

const STORAGE = 'pdpc-rotterdam-scenario-v1';
function loadSettings(): Settings {
  try { const stored = localStorage.getItem(STORAGE); return stored ? validateSettings(JSON.parse(stored), PROFILE_IDS) : { ...DEFAULT_SETTINGS }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function estimate(n?: MetricInterval, runs = 1) {
  if (!n) return 'Nog niet berekend';
  return runs > 1 ? `p10–p90: ${fmt(n.p10)} – ${fmt(n.p90)}` : 'Eén simulatie · geen bandbreedte';
}
function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const body = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], summary, [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = body; document.removeEventListener('keydown', handler); before?.focus(); };
  }, []);
  return <div className="pdpc-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} className={`pdpc-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="pdpc-icon" aria-label="Sluiten" title="Sluiten" onClick={onClose}><X size={20}/></button></header>
      {children}
    </div>
  </div>;
}
function Range({ label, value, onChange, min, max, step = 1, unit = '', percent = false }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit?: string; percent?: boolean }) {
  return <label className="pdpc-range"><span>{label}<output>{percent ? `${fmt(value * 100)}%` : `${fmt(value, step < 1 ? 2 : 0)} ${unit}`}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>;
}

export default function RotterdamWorkspace() {
  const [draft, setDraft] = useState<Settings>(loadSettings);
  const [result, setResult] = useState<RunOutput | null>(null);
  const [baseline, setBaseline] = useState<RunOutput | null>(null);
  const [compare, setCompare] = useState(false);
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [metric, setMetric] = useState<Metric>('density');
  const [selected, setSelected] = useState('BU05990110');
  const [search, setSearch] = useState('');
  const [streets, setStreets] = useState(true);
  const [flows, setFlows] = useState(false);
  const [labels, setLabels] = useState(true);
  const [dialog, setDialog] = useState<'scenario' | 'methods' | null>(null);
  const [settingsTab, setSettingsTab] = useState<'disease' | 'policy' | 'run'>('disease');
  const [chartScope, setChartScope] = useState<'city' | 'area'>('city');
  const [progress, setProgress] = useState<{ phase: string; completed: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const dirty = !result || JSON.stringify(result.settings) !== JSON.stringify(draft);
  const frame = result?.frames[day];
  const profile = PROFILES.find(p => p.id === selected) ?? PROFILES[0];
  const area = frame?.areas[profile.id];
  const running = progress !== null;
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(draft)); } catch { /* Downloads remain available when storage is disabled. */ } }, [draft]);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => setDay(d => Math.min(result.settings.days, d + 1)), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, result]);
  useEffect(() => { if (result && day >= result.settings.days) setPlaying(false); }, [day, result]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) { setDraft(s => ({ ...s, [key]: value })); }
  function run() {
    setError('');
    try {
      const settings = validateSettings(draft, PROFILE_IDS);
      worker.current?.terminate();
      setPlaying(false); setProgress({ phase: 'Berekening starten', completed: 0, total: settings.runs });
      const w = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = e => {
        if (e.data.type === 'progress') setProgress(e.data);
        if (e.data.type === 'error') { setError(e.data.message); setProgress(null); w.terminate(); worker.current = null; }
        if (e.data.type === 'result') {
          setBaseline(result); setResult(e.data.result); setCompare(false); setDay(0); setMetric('infectious'); setProgress(null);
          w.terminate(); worker.current = null;
        }
      };
      w.onerror = e => { setError(e.message || 'Berekening mislukt. Probeer minder agents of runs.'); setProgress(null); w.terminate(); worker.current = null; };
      w.postMessage(settings);
    } catch (e) { setProgress(null); setError(e instanceof Error ? e.message : 'Ongeldig scenario.'); }
  }
  function cancel() { worker.current?.terminate(); worker.current = null; setProgress(null); }
  function saveScenario() { download('pdpc-rotterdam-scenario.json', JSON.stringify({ version: MODEL_VERSION, worldSeed: WORLD_SEED, settings: draft }, null, 2)); }
  async function importScenario(f?: File) {
    if (!f) return;
    try {
      if (f.size > 100000) throw new Error('Dit bestand is te groot voor een scenario.');
      const data = JSON.parse(await f.text());
      if (data.version !== MODEL_VERSION || data.worldSeed !== WORLD_SEED) throw new Error('Niet-ondersteunde modelversie of populatieseed.');
      setDraft(validateSettings(data.settings, PROFILE_IDS)); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Import mislukt.'); }
    if (file.current) file.current.value = '';
  }
  function exportCsv() {
    if (!result) return;
    const keys = ['infectious', 'incidence', 'cumulative', 'deceased'] as const;
    const rows: (string | number)[][] = [['model_version', 'created_at', 'day', 'buurt_code', 'buurt_name', 'population', 'metric', 'unit', 'mean', 'p10', 'p90', 'runs', 'epidemic_seed', 'world_seed', 'agent_scale', 'applied_settings_json']];
    for (const f of result.frames) for (const p of result.profiles) for (const key of keys) {
      const v = f.areas[p.id][key]; const scale = key === 'cumulative' ? 100 / p.population : 100000 / p.population;
      rows.push([MODEL_VERSION, result.createdAt, f.day, p.id, p.name, p.population, key, key === 'cumulative' ? 'percent' : 'per_100000', v.mean*scale, v.p10*scale, v.p90*scale, result.settings.runs, result.settings.seed, result.worldSeed, result.settings.scale, JSON.stringify(result.settings)]);
    }
    const quote = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
    download('pdpc-rotterdam-resultaten.csv', '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  const ranking = useMemo(() => PROFILES.filter(p => `${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase())).map(p => ({ p, value: metricValue(metric, p, frame?.areas[p.id]) })).sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.p.name.localeCompare(b.p.name)), [frame, metric, search]);
  const count = (key: keyof Estimates) => frame ? fmt(frame.total[key].mean) : '—';
  const select = (id: string) => { setSelected(id); };
  const areaValue = metricValue(metric, profile, area);
  const duration = result ? `${fmt(result.durationMs / 1000, 1)} s` : '';
  return <div className="pdpc-workspace">
    <section className="pdpc-titlebar">
      <div><div className="pdpc-eyebrow">REGIONAAL EXPERIMENT <span>/</span> GEMEENTE 0599</div><h1>Rotterdam <span>Scenario-atlas</span></h1><p>{fmt(POPULATION)} inwoners in {PROFILES.length} gemodelleerde buurten <span>·</span> CBS 2025 / grenzen 2024</p></div>
      <div className="pdpc-actions"><button className="pdpc-button" onClick={() => setDialog('scenario')}><SlidersHorizontal size={16}/> Scenario <i className={dirty ? 'pending' : 'ready'}/></button>
        <button className="pdpc-button pdpc-run" onClick={running ? cancel : run}>{running ? <X size={17}/> : <Play size={16}/>} {running ? 'Annuleren' : result && dirty ? 'Wijzigingen berekenen' : 'Simulatie starten'}</button></div>
    </section>
    {error && <div className="pdpc-error" role="alert">{error}<button aria-label="Melding sluiten" onClick={() => setError('')}><X size={16}/></button></div>}
    <section className="pdpc-summary" aria-label="Rotterdam resultaten">
      <div className="pdpc-summary-day"><span>SIMULATIEDAG</span><strong>{result ? String(day).padStart(3, '0') : '—'}<small>/ {result?.settings.days ?? draft.days}</small></strong></div>
      <div><span><i className="pdpc-dot coral"/> Besmettelijke inwoners</span><strong>{count('infectious')}</strong><small>{estimate(frame?.total.infectious, result?.settings.runs)}</small></div>
      <div><span>Nieuwe infecties · 7 dagen</span><strong>{count('incidence')}</strong><small>{estimate(frame?.total.incidence, result?.settings.runs)}</small></div>
      <div><span>Ooit geïnfecteerd</span><strong>{frame ? `${fmt(frame.total.cumulative.mean / POPULATION * 100, 1)}%` : '—'}</strong><small>Inclusief startinfecties</small></div>
      <div><span>Overleden · modeluitkomst</span><strong>{count('deceased')}</strong><small>{estimate(frame?.total.deceased, result?.settings.runs)}</small></div>
    </section>

    <div className="pdpc-main-grid">
      <section className="pdpc-map-column" aria-label="Kaart en tijdlijn">
        <div className="pdpc-map-toolbar">
          <label><span className="sr-only">Kaartmaat</span><select aria-label="Kaartmaat" value={metric} onChange={e => setMetric(e.target.value as Metric)}>{Object.entries(METRICS).map(([id, m]) => <option key={id} value={id} disabled={!result && id !== 'density'}>{m.label}</option>)}</select></label>
          <div className="pdpc-layer-options"><label><input type="checkbox" checked={streets} onChange={e => setStreets(e.target.checked)}/> Straatkaart</label><label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)}/> Namen</label><label><input type="checkbox" disabled={!result} checked={flows} onChange={e => setFlows(e.target.checked)}/> Pendel</label></div>
        </div>
        <RotterdamMap metric={metric} frame={frame} result={result} selected={selected} onSelect={select} streets={streets} labels={labels} flows={flows}/>
        <div className="pdpc-map-status"><span>{METRICS[metric].definition}</span>{result && metric !== 'density' && <strong>Gemiddelde van {result.settings.runs} runs</strong>}</div>
        <section className="pdpc-timeline">
          <div className="pdpc-chart-heading"><h2>Verloop van besmettelijkheid</h2><div className="pdpc-segment" aria-label="Grafiekgebied"><button aria-pressed={chartScope === 'city'} onClick={() => setChartScope('city')}>Rotterdam</button><button aria-pressed={chartScope === 'area'} onClick={() => setChartScope('area')}>Geselecteerde buurt</button></div></div>
          <div className="pdpc-curve-meta"><span><i/> Gemiddelde</span><span><i className="band"/> p10–p90</span><span>Inwoners · {chartScope === 'city' ? 'Rotterdam' : profile.name}</span>{baseline && <label><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)}/> Vorige berekening</label>}</div>
          <Curve result={result} baseline={compare ? baseline : null} selected={chartScope === 'area' ? selected : undefined} day={day} onDay={d => { setPlaying(false); setDay(d); }}/>
          <div className="pdpc-playback">
            <button className="pdpc-icon primary" aria-label={playing ? 'Pauzeren' : 'Afspelen'} title={playing ? 'Pauzeren' : 'Afspelen'} disabled={!result} onClick={() => { if (result && day === result.settings.days) setDay(0); setPlaying(p => !p); }}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button>
            <button className="pdpc-icon" aria-label="Terug naar dag 0" title="Terug naar dag 0" disabled={!result} onClick={() => { setDay(0); setPlaying(false); }}><RotateCcw size={16}/></button>
            <input type="range" aria-label="Simulatiedag" min={0} max={result?.settings.days ?? draft.days} value={day} disabled={!result} onChange={e => { setPlaying(false); setDay(Number(e.target.value)); }}/>
            <span>Dag {day}</span><select aria-label="Afspeelsnelheid" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={5}>5×</option><option value={10}>10×</option></select>
            <button className="pdpc-button small" disabled={!result} onClick={() => { if (result) setDay(result.peakDay); setPlaying(false); }}>Naar piek</button>
          </div>
        </section>
      </section>
      <aside className="pdpc-inspector">
        <div className="pdpc-inspector-header"><span><MapPin size={14}/> BUURTPROFIEL</span><span>{profile.id}</span></div>
        <div className="pdpc-profile-title"><h2>{profile.name}</h2><button title="Als startbuurt instellen" aria-label="Als startbuurt instellen" className="pdpc-icon" onClick={() => { update('seedProfileId', profile.id); setDialog('scenario'); }}><MapPin size={17}/></button></div>
        <div className="pdpc-area-value"><strong>{areaValue === null ? '—' : fmt(areaValue, metric === 'cumulative' ? 1 : 0)}</strong><span>{METRICS[metric].label.toLowerCase()}<br/>{METRICS[metric].unit}</span></div>
        {area && metric !== 'density' && <p className="pdpc-area-band">p10–p90: {fmt(area[metric].p10 / profile.population * (metric === 'cumulative' ? 100 : 100000), 1)} – {fmt(area[metric].p90 / profile.population * (metric === 'cumulative' ? 100 : 100000), 1)}{result?.settings.runs === 1 ? ' · één run' : ''}</p>}
        <dl className="pdpc-profile-facts"><div><dt>Inwoners</dt><dd>{fmt(profile.population)}</dd></div><div><dt>Bevolkingsdichtheid</dt><dd>{fmt(profile.facilityContext?.density ?? 0)} / km²</dd></div><div><dt>65 jaar en ouder</dt><dd>{fmt(profile.ageDistribution['65+'] * 100, 1)}%</dd></div><div><dt>Startbuurt in resultaat</dt><dd>{result ? result.settings.seedProfileId === profile.id ? 'Ja' : 'Nee' : '—'}</dd></div></dl>
        <div className="pdpc-age"><h3>Leeftijdsopbouw</h3><div className="pdpc-age-bar">{AGE_BANDS.map((age, i) => <div key={age} style={{ width: `${profile.ageDistribution[age] * 100}%`, background: ['#aed4cc', '#76b5a5', '#408875', '#3d6073', '#8c9eae'][i] }} title={`${age}: ${fmt(profile.ageDistribution[age] * 100, 1)}%`}/>)}</div><div className="pdpc-age-labels">{AGE_BANDS.map(age => <span key={age}>{age}<strong>{fmt(profile.ageDistribution[age]*100)}%</strong></span>)}</div></div>
        <div className="pdpc-ranking-header"><h3>Buurten vergelijken</h3><span>{ranking.length}</span></div>
        <label className="pdpc-search"><Search size={15}/><input type="search" aria-label="Zoek een buurt" placeholder="Zoek een buurt…" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <div className="pdpc-ranking" role="list" aria-label="Buurtranglijst">
          {ranking.map(({ p, value }, index) => <button key={p.id} role="listitem" className={selected === p.id ? 'selected' : ''} onClick={() => select(p.id)} aria-label={`Selecteer ${p.name}`}><span className="pdpc-rank-number">{index+1}</span><span>{p.name}<small>{fmt(p.population)} inwoners</small></span><strong>{value === null ? '—' : fmt(value, metric === 'cumulative' ? 1 : 0)}</strong><ChevronRight size={13}/></button>)}
          {!ranking.length && <p className="pdpc-empty">Geen buurt gevonden.</p>}
        </div>
      </aside>
    </div>
    <footer className="pdpc-bottom"><span><i className="pdpc-dot teal"/>{running ? progress.phase : result ? `${result.settings.runs} runs · ${fmt(result.agents)} agents · seed ${result.settings.seed} · ${duration}` : 'Bevolkingscontext · nog geen berekening'}{result && dirty && <b>Niet-toegepaste wijzigingen</b>}</span><div><button onClick={() => setDialog('methods')}><CircleHelp size={14}/> Bronnen & aannames</button><button disabled={!result} onClick={exportCsv}><Download size={14}/> Resultaten CSV</button></div></footer>
    {running && <div className="pdpc-progress" role="status" aria-live="polite"><span className="pdpc-spinner"/><div><strong>{progress.phase}</strong><small>{progress.completed} / {progress.total} runs afgerond</small></div><button className="pdpc-icon" aria-label="Berekening annuleren" onClick={cancel}><X size={18}/></button><progress value={progress.completed} max={progress.total}/></div>}

    {dialog === 'scenario' && <Dialog title="Scenario-instellingen" onClose={() => setDialog(null)}>
      <div className="pdpc-draft-status"><span className={dirty ? 'pending' : 'ready'}/>{dirty ? 'Conceptinstellingen' : 'Gelijk aan de huidige berekening'}<span>Automatisch bewaard</span></div>
      <div className="pdpc-settings-tabs" role="tablist" aria-label="Scenariocategorie">{[['disease','Ziekte'],['policy','Maatregelen'],['run','Experiment']].map(([id,label]) => <button key={id} role="tab" aria-selected={settingsTab === id} onClick={() => setSettingsTab(id as typeof settingsTab)}>{label}</button>)}</div>
      <div className="pdpc-dialog-content">
        {error && <p className="pdpc-error" role="alert">{error}</p>}
        {settingsTab === 'disease' && <>
          <label className="pdpc-field">Startbuurt<select value={draft.seedProfileId} onChange={e => update('seedProfileId', e.target.value)}>{[...PROFILES].sort((a,b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <Range label="Startinfecties (agents)" value={draft.initialCases} min={1} max={100} onChange={v => update('initialCases',v)}/>
          <p className="pdpc-field-note">Circa {fmt(draft.initialCases * draft.scale)} inwoners bij deze resolutie; begrensd door het aantal agents in de startbuurt.</p>
          <Range label="Transmissiecoëfficiënt β" value={draft.infectionRate} min={0.01} max={1.4} step={0.01} onChange={v => update('infectionRate',v)}/>
          <Range label="Latente periode" value={draft.latentDays} min={1} max={14} step={0.5} unit="dagen" onChange={v => update('latentDays',v)}/>
          <Range label="Besmettelijke periode" value={draft.infectiousDays} min={2} max={21} step={0.5} unit="dagen" onChange={v => update('infectiousDays',v)}/>
          <Range label="Vooraf aanwezige immuniteit" value={draft.priorImmunity} min={0} max={0.95} step={0.01} percent onChange={v => update('priorImmunity',v)}/>
          <Range label="Sterfterisico · vermenigvuldigingsfactor" value={draft.mortalityMultiplier} min={0.05} max={5} step={0.05} onChange={v => update('mortalityMultiplier',v)}/>
          <p className="pdpc-field-note">Leeftijdsafhankelijk modelrisico; deze factor is geen ingestelde IFR. De latente periode loopt van infectie tot besmettelijkheid, niet tot symptomen.</p>
        </>}
        {settingsTab === 'policy' && <>
          <div className="pdpc-form-section"><h3>Contactreductie</h3><Range label="Maatregelen vanaf dag" value={draft.policyStartDay} min={0} max={180} onChange={v => update('policyStartDay',v)}/>
          {([['mobilityReduction','Mobiliteit'],['eventReduction','Evenementen'],['maskMandate','Mondmaskers'],['schoolClosure','Schoolsluiting'],['caseIsolation','Isolatie'],['travelReduction','Reisbeperking']] as const).map(([key,label]) => <Range key={key} label={label} value={draft[key]} min={0} max={key === 'maskMandate' ? 0.7 : key === 'schoolClosure' ? 1 : 0.95} step={0.05} percent onChange={v => update(key,v)}/>)}</div>
          <div className="pdpc-form-section"><h3>Vaccinatie</h3><Range label="Vaccinatie vanaf dag" value={draft.vaccinationStartDay} min={0} max={180} onChange={v => update('vaccinationStartDay',v)}/><Range label="Doeldekking" value={draft.vaccinationCoverage} min={0} max={0.95} step={0.05} percent onChange={v => update('vaccinationCoverage',v)}/><Range label="Vaccinbescherming" value={draft.vaccineEffectiveness} min={0} max={0.95} step={0.05} percent onChange={v => update('vaccineEffectiveness',v)}/></div>
          <p className="pdpc-field-note">Naleving is een vaste synthetische aanname. De engine schaalt de meeste maatregelen met individuele naleving; isolatie geldt uniform. Vaccinatie gebruikt een vereenvoudigd uitrolschema.</p>
        </>}
        {settingsTab === 'run' && <>
          <label className="pdpc-field">Agentresolutie<select value={draft.scale} onChange={e => update('scale',Number(e.target.value))}><option value={28}>1 agent ≈ 28 inwoners</option><option value={12}>1 agent ≈ 12 inwoners</option><option value={4}>1 agent ≈ 4 inwoners</option><option value={1}>1 agent ≈ 1 inwoner</option></select></label>
          <Range label="Stochastische runs" value={draft.runs} min={1} max={16} onChange={v => update('runs',v)}/>
          <Range label="Simulatieduur" value={draft.days} min={30} max={180} step={10} unit="dagen" onChange={v => update('days',v)}/>
          <label className="pdpc-field">Epidemieseed<input type="number" min={1} max={2147483647} value={draft.seed} onChange={e => update('seed',Number(e.target.value))}/></label>
          <p className="pdpc-field-note">De populatieseed is vast ({WORLD_SEED}). Herhalingen variëren de epidemieseed met 9.973 per run. p10–p90 beschrijft uitsluitend toevalsvariatie, geen parameter- of modelonzekerheid.</p>
          <div className="pdpc-file-actions"><button className="pdpc-button" onClick={saveScenario}><ArrowDownToLine size={16}/> Scenario bewaren</button><button className="pdpc-button" onClick={() => file.current?.click()}><ArrowUpFromLine size={16}/> Importeren</button></div>
          <input className="sr-only" ref={file} type="file" accept="application/json,.json" onChange={e => void importScenario(e.target.files?.[0])}/>
          <button className="pdpc-text-button" onClick={() => setDraft({ ...DEFAULT_SETTINGS })}><RotateCcw size={14}/> Standaardwaarden herstellen</button>
        </>}
      </div>
      <footer><span>{fmt(Math.round(POPULATION/draft.scale))} agents · {draft.runs} runs · {draft.days} dagen</span><button className="pdpc-button pdpc-run" disabled={running} onClick={() => { setDialog(null); run(); }}><FlaskConical size={16}/> Berekenen</button></footer>
    </Dialog>}
    {dialog === 'methods' && <Dialog title="Bronnen, dekking en aannames" wide onClose={() => setDialog(null)}>
      <div className="pdpc-dialog-content pdpc-methods"><p className="pdpc-methods-lead">Een synthetisch scenario-experiment. De uitkomsten zijn nog niet extern gevalideerd voor voorspellingen of beleidsadvies.</p>
        <h3>Bevolking en geografie</h3><p>{fmt(POPULATION)} inwoners in {PROFILES.length} buurten met minstens 250 inwoners. De gemeenteregel bevat {fmt(CITY_POPULATION)} inwoners; de kaart dekt dus {fmt(POPULATION/CITY_POPULATION*100, 1)}% daarvan. Buurten buiten het model zijn grijs, niet infectievrij.</p>
        <p>CBS-buurtprofielen uit 2025 zijn gekoppeld aan CBS/PDOK-grenzen uit 2024. Geografische verschillen tussen jaren blijven een beperking. De simulatie genereert gewogen agents uit deze profielen; de gekopieerde GenSynthPop-CSV wordt nog niet als agentennetwerk ingelezen.</p>
        <h3>Maten en bandbreedtes</h3><p>Prevalentie telt alleen besmettelijke inwoners (I). Incidentie telt nieuwe infecties over dag t−6 tot en met t; startinfecties op dag 0 zijn uitgesloten. Cumulatieve infecties omvatten E + I + R + D. De kaart, ranglijst en curve gebruiken dezelfde gemiddelden. p10 en p90 zijn empirische percentielen over epidemieruns op één vaste populatie. Met weinig runs is de band grof.</p>
        <h3>Contacten en ziekte</h3><p>Huishouden, werk/school, pendel, evenementen en gemeenschap volgen de bestaande SEIRD-engine. Pendelverbindingen zijn synthetische modeltoewijzingen, geen waargenomen reizigersstromen. β, naleving, leeftijdsrisico's en contactgewichten zijn modelaannames. Veranderen van agentresolutie kan de dynamiek veranderen en bewijst geen hogere nauwkeurigheid.</p>
        <h3>Institutionele bewoners</h3><p>De offline generator groepeert institutionele bewoners bewust in blokken van circa 50. Die groepen kunnen collectieve zorglocaties representeren. De bekende problemen in reguliere huishoudens en partnerleeftijden zijn niet opgelost door deze kaartvernieuwing.</p>
        <h3>Herkomst en reproduceerbaarheid</h3><p>Modelversie: {MODEL_VERSION}. Populatieseed: {WORLD_SEED}. Resultaten-CSV bevat de toegepaste instellingen en percentielen. Scenario's kunnen als JSON worden bewaard en teruggezet. De vorige berekening kan als referentie in de curve worden getoond; alleen de epidemieseed varieert tussen runs.</p>
        <ul><li><a href="https://www.pdok.nl/introductie/-/article/cbs-wijken-en-buurten" target="_blank" rel="noreferrer">CBS / PDOK Wijken en buurten</a></li><li><a href="https://opendata.cbs.nl/statline/" target="_blank" rel="noreferrer">CBS StatLine</a></li><li><a href="https://doi.org/10.1007/s10458-024-09680-7" target="_blank" rel="noreferrer">GenSynthPop: methode en validatie</a></li><li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap: achtergrondkaart en attributie</a></li></ul>
      </div>
    </Dialog>}
  </div>;
}
