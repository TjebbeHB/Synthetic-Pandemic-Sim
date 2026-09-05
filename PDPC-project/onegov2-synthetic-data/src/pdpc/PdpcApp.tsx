import { lazy, Suspense, useState } from 'react';
import { Activity, Map, PanelTop } from 'lucide-react';
import RotterdamWorkspace from './RotterdamWorkspace';

const LegacyApp = lazy(() => import('../App'));
const TABLET_BUILD = import.meta.env.VITE_TABLET === '1';
type Dashboard = 'rotterdam-new' | 'agent' | 'rotterdam' | 'surveillance' | 'netherlands' | 'cellular';

export default function PdpcApp() {
  const [dashboard, setDashboard] = useState<Dashboard>('rotterdam-new');
  return <div className="pdpc-shell">
    <header className="pdpc-topbar">
      <a className="pdpc-brand" href="#rotterdam" onClick={() => setDashboard('rotterdam-new')}><Activity size={23}/><span>PDPC<span>SCENARIO LAB</span></span></a>
      <nav aria-label="Dashboards">
        <button aria-current={dashboard === 'rotterdam-new' ? 'page' : undefined} onClick={() => setDashboard('rotterdam-new')}><Map size={16}/> Rotterdam</button>
        <label className="pdpc-dashboard-select"><PanelTop size={15}/><select aria-label="Eerdere dashboards" value={dashboard === 'rotterdam-new' ? '' : dashboard} onChange={e => setDashboard(e.target.value as Dashboard)}>
          <option value="" disabled>Eerdere dashboards</option><option value="agent">Netwerkmodel</option><option value="surveillance">Surveillance</option>{!TABLET_BUILD && <><option value="rotterdam">Rotterdam · eerdere versie</option><option value="netherlands">Nederland</option><option value="cellular">Cellulaire automaat</option></>}
        </select></label>
      </nav>
      <span className="pdpc-prototype"><i/> Onderzoeksprototype</span>
    </header>
    <div className="pdpc-current" hidden={dashboard !== 'rotterdam-new'}><RotterdamWorkspace/></div>
    {dashboard !== 'rotterdam-new' && <div className="pdpc-legacy"><Suspense fallback={<p className="pdpc-loading">Dashboard wordt geladen…</p>}><LegacyApp key={dashboard} initialView={dashboard}/></Suspense></div>}
  </div>;
}
