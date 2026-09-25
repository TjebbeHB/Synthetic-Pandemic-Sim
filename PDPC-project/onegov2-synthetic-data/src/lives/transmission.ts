import { RNG } from './generate';
import type { Cluster, EpidemicOptions, Person, Population, Trace, Transmission } from './types';
export function attends(person: Person, cluster: Cluster, day: number) {
  const weekday=(day-1)%7; // Simulation day 1 is Monday.
  const working=person.work===cluster.id;
  return cluster.days.includes(weekday) && (!working||!!person.workDays?.includes(weekday)) && !(cluster.kind==='household'&&person.role==='unresolved');
}
export function stateAt(trace: Trace | null, id: number, day: number): 'S'|'E'|'I'|'R' {
  if(!trace||trace.infectedOn[id]<0||day<trace.infectedOn[id])return 'S';
  if(day<trace.infectiousOn[id])return 'E';
  return day<trace.recoveredOn[id]?'I':'R';
}
export function simulateLives(population: Population, options: EpidemicOptions, progress?: (n:number,total:number)=>void): Trace {
  const n=population.people.length;
  if(!Number.isInteger(options.index)||options.index<0||options.index>=n)throw new Error('Kies een bestaande persoon als eerste patiënt.');
  if(!Number.isInteger(options.seed)||options.seed<0||options.seed>4294967295||!Number.isInteger(options.days)||options.days<1||options.days>120||!Number.isFinite(options.probability)||options.probability<0||options.probability>1||!Number.isInteger(options.latentDays)||options.latentDays<1||options.latentDays>14||!Number.isInteger(options.infectiousDays)||options.infectiousDays<1||options.infectiousDays>21)throw new Error('Ongeldige simulatie-instellingen.');
  const rng=new RNG(options.seed), infectedOn=Array(n).fill(-1),infectiousOn=Array(n).fill(-1),recoveredOn=Array(n).fill(-1),generation=new Int32Array(n),transmissions:Transmission[]=[];
  infectedOn[options.index]=0;infectiousOn[options.index]=0;recoveredOn[options.index]=options.infectiousDays+1;
  for(let day=1;day<=options.days;day++){
    const hazards=new Map<number,{hazard:number;source:number;cluster:number}>();
    for(const c of population.clusters){
      if(!c.days.includes((day-1)%7))continue;
      const present=c.members.filter(id=>attends(population.people[id],c,day));
      const infectious=present.filter(id=>infectiousOn[id]>=0&&infectiousOn[id]<=day&&recoveredOn[id]>day);
      if(!infectious.length||present.length<2)continue;
      const contacts=c.kind==='household'?present.length-1:c.kind==='school'?8:c.kind==='work'?6:c.kind==='institution'?8:10;
      const hazard=options.probability*contacts*infectious.length/(present.length-1)*(c.kind==='household'?1.5:1);
      if(hazard===0)continue;
      for(const target of present){
        if(infectedOn[target]>=0)continue;
        const old=hazards.get(target),total=(old?.hazard??0)+hazard;
        if(!old||rng.next()<hazard/total)hazards.set(target,{hazard:total,source:infectious[Math.floor(rng.next()*infectious.length)],cluster:c.id});
        else old.hazard=total;
      }
    }
    for(const [target,h] of hazards)if(rng.next()<1-Math.exp(-h.hazard)){
      infectedOn[target]=day;infectiousOn[target]=day+options.latentDays;recoveredOn[target]=infectiousOn[target]+options.infectiousDays;generation[target]=generation[h.source]+1;
      transmissions.push({number:transmissions.length+1,source:h.source,target,day,layer:population.clusters[h.cluster].kind,cluster:h.cluster,generation:generation[target]});
    }
    progress?.(day,options.days);
  }
  return {options,infectedOn,infectiousOn,recoveredOn,transmissions};
}
