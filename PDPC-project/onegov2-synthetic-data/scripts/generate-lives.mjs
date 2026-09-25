// Same population engine as the browser, for reproducible full-size exports.
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
try{
  const {SNAPSHOT,fetchSource}=await loader.ssrLoadModule('/src/lives/sources.ts');
  const {generatePopulation}=await loader.ssrLoadModule('/src/lives/generate.ts');
  const source=args.includes('--live')?await fetchSource(Number(value('--year','2024')),AbortSignal.timeout(45000)):SNAPSHOT;
  const areas=source.areas.filter(a=>a.ages.every(n=>n>=0)&&a.ages.some(n=>n>0));
  const count=Number(value('--count',String(areas.reduce((s,a)=>s+a.population,0))));
  const options={seed:Number(value('--seed','20260915')),count,areas:areas.map(a=>a.id),features:['households','schools','work','events','education','income','cars'],commuteKm:7,eventParticipation:.35};
  const p=generatePopulation(source,options),out=resolve(value('--out','output/synthetic-lives'));await mkdir(out,{recursive:true});
  const cols=['id','area','age','sex','household','role','parents','student','employed','activity','school','work','event','education','income','cars','workDays','sewageId','sewageStatus'];
  const csv=[['display_id',...cols].join(','),...p.people.map(p=>['R'+(p.id+1),...cols.map(k=>'"'+String(Array.isArray(p[k])?p[k].join('|'):p[k]??'').replaceAll('"','""')+'"')].join(','))].join('\n');
  await writeFile(resolve(out,'people.csv'),csv);
  await writeFile(resolve(out,'clusters.json'),JSON.stringify(p.clusters));
  await writeFile(resolve(out,'quality.json'),JSON.stringify({version:p.version,options,source,sewage:p.sewage,checks:p.checks,warnings:p.warnings,excluded:source.areas.filter(a=>!options.areas.includes(a.id)).map(a=>({id:a.id,name:a.name,population:a.population,reason:'No usable age margins'}))},null,2));
  console.log(JSON.stringify({people:p.people.length,clusters:p.clusters.length,unresolvedChildren:p.checks.reduce((s,c)=>s+c.unresolvedChildren,0),output:out},null,2));
}finally{await loader.close();}
