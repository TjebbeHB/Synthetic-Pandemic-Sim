import { lazy, Suspense, useRef, useState } from 'react';
import { Database, Map, Settings, ArrowLeft } from 'lucide-react';
import PopulationLab from '../population/PopulationLab';

const LegacyApp = lazy(() => import('../App'));
const LivesWorkspace = lazy(() => import('../lives/LivesWorkspace'));
const RotterdamWorkspace = lazy(() => import('./RotterdamWorkspace'));
const TABLET_BUILD = import.meta.env.VITE_TABLET === '1';
type Archive = 'lives' | 'rotterdam-new' | 'agent' | 'rotterdam' | 'surveillance' | 'netherlands' | 'cellular';
const ARCHIVES: [Archive, string][] = [['lives','Synthetische levens & contactnetwerk'],['rotterdam-new','Eerdere scenario-atlas'],['agent','Netwerkmodel'],['surveillance','Surveillance'],...(!TABLET_BUILD ? [['rotterdam','Rotterdam · eerdere versie'],['netherlands','Nederland · eerder model'],['cellular','Cellulaire automaat']] as [Archive,string][] : [])];

export default function PdpcApp() {
  const [view, setView] = useState<'generate' | 'map'>('generate');
  const [archive, setArchive] = useState<Archive | null>(null);
  const settings = useRef<HTMLDetailsElement>(null);
  function show(next: 'generate' | 'map') { window.scrollTo({top:0}); setArchive(null); setView(next); if (settings.current) settings.current.open = false; }
  return <div className="pdpc-shell ggd-theme">
    <header className="pdpc-topbar population-topbar">
      <a className="pdpc-brand ggd-brand" href="#genereren" onClick={() => show('generate')}><img src="/ggd-rotterdam-rijnmond.svg" alt="GGD Rotterdam-Rijnmond" width="220" height="48"/><span>Populatie Lab<span>Onderzoeksprototype · geen officieel GGD-dashboard</span></span></a>
      <nav aria-label="Hoofdnavigatie">
        <button aria-current={!archive && view === 'generate' ? 'page' : undefined} onClick={() => show('generate')}><Database size={17}/> Populatie genereren</button>
        <button aria-current={!archive && view === 'map' ? 'page' : undefined} onClick={() => show('map')}><Map size={17}/> Rotterdamse kaart</button>
      </nav>
      <details className="population-settings" ref={settings} onKeyDown={e => { if (e.key === 'Escape' && settings.current) { settings.current.open = false; settings.current.querySelector('summary')?.focus(); } }}>
        <summary aria-label="Instellingen en eerdere versies" title="Instellingen en eerdere versies"><Settings size={22}/></summary>
        <div><strong>Eerdere versies</strong><p>Bewaarde modellen voor vergelijking en experimenten.</p>{ARCHIVES.map(([id,label]) => <button key={id} onClick={() => { setArchive(id); if(settings.current) settings.current.open=false; }}>{label}</button>)}</div>
      </details>
    </header>
    <div hidden={!!archive}><PopulationLab view={view} onView={show}/></div>
    {archive && <><div className="population-archive-banner"><button onClick={() => show('generate')}><ArrowLeft size={16}/> Terug naar populatiegeneratie</button><span>Eerdere versie · {ARCHIVES.find(([id]) => id === archive)?.[1]}</span></div><Suspense fallback={<p className="pdpc-loading">Eerdere versie wordt geladen…</p>}>
      {archive === 'lives' ? <LivesWorkspace/> : archive === 'rotterdam-new' ? <RotterdamWorkspace/> : <div className="pdpc-legacy"><LegacyApp key={archive} initialView={archive}/></div>}
    </Suspense></>}
  </div>;
}
