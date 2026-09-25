import { useMemo } from 'react';
import type { Population, Trace } from './types';
import { LAYER_LABELS } from './types';
import { stateAt } from './transmission';
import { STATE_COLORS } from './LivesMap';
import { matchesArea } from './geography';
const PALETTE={household:'#498779',school:'#5683be',work:'#a87b34',event:'#9872b0',institution:'#7b8491'};
export default function Ecosystem({population,trace,day,selected,area,onSelect}:{population:Population;trace:Trace|null;day:number;selected:number;area:string;onSelect:(id:number)=>void}){
  const layout=useMemo(()=>{
    const p=population.people[selected],base=[p.household,p.school,p.work,p.event].filter((id):id is number=>id!==null&&id>=0);
    const eligible=(trace?.transmissions??[]).filter(t=>t.day<=day&&(matchesArea(population.people[t.source].area,area)||matchesArea(population.people[t.target].area,area)));
    // Include the selected person's ancestor chain, then nearby transmissions.
    const incoming=new Map((trace?.transmissions??[]).filter(t=>t.day<=day).map(t=>[t.target,t]));
    const ancestry=[];let cursor=selected;while(incoming.has(cursor)){const t=incoming.get(cursor)!;ancestry.push(t);cursor=t.source;}
    const edgeMap=new Map([...ancestry,...eligible.filter(t=>t.source===selected||t.target===selected),...eligible].map(t=>[t.number,t]));
    const edges=[...edgeMap.values()].slice(0,80),ids=new Set([selected,...edges.flatMap(t=>[t.source,t.target])]);
    for(const id of base)for(const member of population.clusters[id].members.slice(0,32))if(ids.size<180)ids.add(member);
    const clusterIds=new Set(base);for(const edge of edges)clusterIds.add(edge.cluster);
    const shown=[...clusterIds].slice(0,14),positions=new Map<number,{x:number;y:number}>(),centres=shown.map((id,i)=>({id,x:550+Math.cos(i/Math.max(1,shown.length)*Math.PI*2-Math.PI/2)*350,y:330+Math.sin(i/Math.max(1,shown.length)*Math.PI*2-Math.PI/2)*215}));
    const buckets=new Map<number,number[]>();for(const id of ids){const q=population.people[id];const c=[q.school,q.work,q.household,q.event].find(c=>c!==null&&shown.includes(c))??-1;if(!buckets.has(c))buckets.set(c,[]);buckets.get(c)!.push(id);}
    for(const [cid,members] of buckets){const centre=centres.find(c=>c.id===cid)??{x:550,y:330};members.forEach((id,i)=>{const radius=28+12*Math.sqrt(i),angle=i*2.39996;positions.set(id,{x:centre.x+Math.cos(angle)*radius,y:centre.y+Math.sin(angle)*radius});});}
    return {edges,positions,centres,totalEdges:eligible.length};
  },[population,trace,day,selected,area]);
  return <div className="lives-ecosystem"><svg viewBox="0 0 1100 660" role="img" aria-label="Contactnetwerk met genummerde transmissies">
    <defs><marker id="lives-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#cf3445"/></marker><pattern id="lives-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#d4dfe5"/></pattern></defs>
    <rect width="1100" height="660" fill="url(#lives-grid)"/>
    {layout.centres.map(c=>{const cluster=population.clusters[c.id];return <g key={c.id}><circle cx={c.x} cy={c.y} r="100" fill={PALETTE[cluster.kind]} fillOpacity=".06" stroke={PALETTE[cluster.kind]} strokeDasharray="4 6" strokeOpacity=".35"/><text x={c.x} y={c.y-112} textAnchor="middle" fill={PALETTE[cluster.kind]} fontSize="14" fontWeight="650">{LAYER_LABELS[cluster.kind]} · {cluster.members.length}</text>{cluster.members.filter(id=>layout.positions.has(id)).map(id=>{const p=layout.positions.get(id)!;return <line key={id} x1={c.x} y1={c.y} x2={p.x} y2={p.y} stroke={PALETTE[cluster.kind]} opacity=".18"/>;})}</g>;})}
    {layout.edges.map(t=>{const a=layout.positions.get(t.source),b=layout.positions.get(t.target);return a&&b?<g key={t.number}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cf3445" strokeWidth="1.8" opacity=".85" markerEnd="url(#lives-arrow)"/><rect x={(a.x+b.x)/2-10} y={(a.y+b.y)/2-9} width="22" height="18" rx="6" fill="white"/><text x={(a.x+b.x)/2+1} y={(a.y+b.y)/2+4} textAnchor="middle" fill="#b32334" fontSize="12" fontWeight="700">{t.number}</text><title>Transmissie {t.number} · dag {t.day} · {LAYER_LABELS[t.layer]}</title></g>:null;})}
    {[...layout.positions].map(([id,p])=><g key={id} role="button" tabIndex={0} aria-label={`Selecteer R${id+1}, ${population.people[id].age} jaar`} onClick={()=>onSelect(id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(id);}}} className="lives-node"><circle cx={p.x} cy={p.y} r={id===selected?9:6} fill={STATE_COLORS[stateAt(trace,id,day)]} stroke={id===selected?'#173e4c':'white'} strokeWidth={id===selected?3:1.5}/>{(id===selected||trace?.options.index===id)&&<text x={p.x+12} y={p.y-10} fontSize="14" fontWeight="700" fill="#173e4c">{trace?.options.index===id?'Eerste patiënt · ':''}R{id+1}</text>}<title>R{id+1} · {population.people[id].age} jaar · {population.people[id].activity}</title></g>)}
  </svg><div className="lives-canvas-caption">{layout.positions.size} personen · {layout.edges.length} van {layout.totalEdges} transmissies in selectie · schematische posities</div></div>;
}
