import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
const {generatePopulation,quotas}=await loader.ssrLoadModule('/src/lives/generate.ts');
const {SNAPSHOT,parseSource}=await loader.ssrLoadModule('/src/lives/sources.ts');
const {simulateLives,attends,stateAt}=await loader.ssrLoadModule('/src/lives/transmission.ts');
const {householdPoint,insideArea}=await loader.ssrLoadModule('/src/lives/locations.ts');
const {GEOMETRY,wijkCode,matchesArea,geographicSummaries,mapPersonIds}=await loader.ssrLoadModule('/src/lives/geography.ts');
const {dailyActivities}=await loader.ssrLoadModule('/src/lives/activities.ts');
await loader.close();
const areas=SNAPSHOT.areas.filter(a=>a.ages.every(n=>n>=0)&&a.ages.some(n=>n>0)).map(a=>a.id);
const options={seed:20260915,count:5000,areas,features:['households','schools','work','events','education','income','cars'],commuteKm:7,eventParticipation:.35};
const p=generatePopulation(SNAPSHOT,options);
test('rounding conserves requested counts including small and incompatible source margins',()=>{
  assert.deepEqual(quotas(5,[1,1,1]),[2,2,1]);assert.equal(quotas(103,[15,4,19,71]).reduce((a,b)=>a+b,0),103);
  assert.throws(()=>quotas(3,[NaN,1]));assert.throws(()=>generatePopulation(SNAPSHOT,{...options,count:NaN}));
  assert.throws(()=>generatePopulation(SNAPSHOT,{...options,areas:[SNAPSHOT.areas.find(a=>a.ages.every(n=>n===0)).id]}));
});
test('multiple population seeds conserve people and buurt ages without minor-only homes',()=>{
  for(const seed of [12,42,20260915]){
    const world=seed===20260915?p:generatePopulation(SNAPSHOT,{...options,seed});
    assert.equal(world.people.length,options.count);assert.equal(new Set(world.people.map(p=>p.id)).size,options.count);
    for(const c of world.checks)assert.deepEqual(c.ageActual,c.ageTarget);
    for(const person of world.people){
      if(person.role==='child'){assert.ok(person.parents.length>=1);for(const id of person.parents){const parent=world.people[id];assert.equal(parent.role,'parent');assert.equal(parent.household,person.household);assert.ok(parent.age-person.age>=18&&parent.age-person.age<=50);}}
      if(person.role==='single'||person.role==='partner')assert.ok(person.age>=18);
      if(person.role==='unresolved'&&person.age<18)assert.ok(world.warnings.some(w=>w.includes('onopgelost')));
    }
    for(const cluster of world.clusters.filter(c=>c.kind==='household')){
      const members=cluster.members.map(id=>world.people[id]);
      if(members.some(p=>p.age<18)&&members.every(p=>p.age<18))assert.ok(members.every(p=>p.role==='unresolved'));
      const parents=members.filter(p=>p.role==='parent');if(parents.length===2)assert.ok(Math.abs(parents[0].age-parents[1].age)<=12);
    }
  }
});
test('person-level reproducibility and real work targets; education age constraints',()=>{
  assert.deepEqual(generatePopulation(SNAPSHOT,options),p);
  assert.ok(p.people.some(p=>p.age>=25&&p.age<65&&!p.employed));
  assert.ok(p.people.some(p=>p.student&&p.employed));
  for(const check of p.checks)assert.equal(check.workerActual,check.workerTarget);
  for(const person of p.people){if(person.employed)assert.ok(person.age>=15&&person.age<75);if(person.education==='Hoog')assert.ok(person.age>=21);}
  for(const c of p.clusters.filter(c=>c.kind==='school'&&c.label.includes('school'))){const ages=c.members.map(id=>p.people[id]).filter(p=>p.student).map(p=>p.age);assert.equal(Math.min(...ages),Math.max(...ages));}
});
test('feature dependencies and missing employment never silently invent workers',()=>{
  assert.throws(()=>generatePopulation(SNAPSHOT,{...options,features:['income']}));
  const source={...SNAPSHOT,areas:SNAPSHOT.areas.map(a=>({...a,workers:null}))};
  const world=generatePopulation(source,options);assert.equal(world.people.filter(p=>p.employed).length,0);assert.equal(world.clusters.filter(c=>c.kind==='work').length,0);
  const basic=generatePopulation(SNAPSHOT,{...options,features:[]});assert.equal(basic.clusters.length,0);assert.ok(basic.people.every(p=>p.household===-1&&p.education===undefined&&p.income===undefined));
  assert.ok(basic.checks.every(c=>c.householdTarget===null&&c.singleTarget===null&&c.unresolvedChildren===0));
});
test('household points are shared, reproducible, and inside official geometry',()=>{
  for(const cluster of p.clusters.filter(c=>c.kind==='household').slice(0,500)){
    const point=householdPoint(p.people[cluster.members[0]],options.seed);if(!point)continue;
    assert.ok(insideArea(point,cluster.area));for(const id of cluster.members)assert.deepEqual(householdPoint(p.people[id],options.seed),point);
  }
});
test('numbered transmission is an acyclic chronological trace through shared attendance',()=>{
  const index=p.people.find(p=>p.employed&&p.role==='parent'&&p.event!==null).id;
  const config={seed:42,index,days:60,probability:.14,latentDays:3,infectiousDays:7};
  const trace=simulateLives(p,config);assert.ok(trace.transmissions.length>10);assert.deepEqual(simulateLives(p,config),trace);
  const infected=new Set([index]);const generations=new Map([[index,0]]);
  for(const [i,t] of trace.transmissions.entries()){
    assert.equal(t.number,i+1);assert.ok(!infected.has(t.target));assert.ok(infected.has(t.source));
    assert.equal(stateAt(trace,t.source,t.day),'I');assert.equal(trace.infectedOn[t.target],t.day);
    assert.ok(trace.infectedOn[t.source]<t.day);const cluster=p.clusters[t.cluster];
    assert.equal(t.layer,cluster.kind);assert.ok(cluster.members.includes(t.source)&&cluster.members.includes(t.target));
    assert.ok(attends(p.people[t.source],cluster,t.day)&&attends(p.people[t.target],cluster,t.day));
    assert.equal(t.generation,generations.get(t.source)+1);generations.set(t.target,t.generation);infected.add(t.target);
  }
  for(let day=0;day<=config.days;day++){const counts={S:0,E:0,I:0,R:0};for(const person of p.people)counts[stateAt(trace,person.id,day)]++;assert.equal(Object.values(counts).reduce((s,n)=>s+n,0),p.people.length);}
  assert.equal(simulateLives(p,{...config,probability:0}).transmissions.length,0);
});
test('invalid simulation controls fail before computation',()=>{
  for(const change of [{index:-1},{days:Infinity},{latentDays:0},{infectiousDays:22},{probability:NaN}])assert.throws(()=>simulateLives(p,{seed:0,index:0,days:30,probability:.1,latentDays:3,infectiousDays:7,...change}));
});
test('index case with one infectious day can transmit on the first Monday',()=>{
  const world={...p,people:p.people.slice(0,2).map((p,id)=>({...p,id,role:'partner',work:null,workDays:[]})),clusters:[{id:0,kind:'household',area:'test',label:'test',members:[0,1],days:[0,1,2,3,4,5,6]}]};
  const trace=simulateLives(world,{seed:42,index:0,days:5,probability:1,latentDays:1,infectiousDays:1});
  assert.equal(stateAt(trace,0,1),'I');assert.equal(stateAt(trace,0,2),'R');assert.equal(trace.transmissions[0].day,1);
});
test('institutions and schools have employed bridges with shared daily attendance rules',()=>{
  const institution=p.clusters.find(c=>c.kind==='institution'&&c.members.some(id=>p.people[id].work===c.id));assert.ok(institution);
  const resident=p.people[institution.members.find(id=>p.people[id].role==='institutional')];
  const staff=p.people[institution.members.find(id=>p.people[id].work===institution.id)];
  assert.ok(staff.employed);assert.ok(attends(resident,institution,7));assert.ok(!attends(staff,institution,7));
});

test('wijk aggregation conserves people and infections and includes all member buurten',()=>{
  assert.equal(wijkCode('BU05990110'),'WK059901');
  assert.equal(wijkCode('outside'),'');
  assert.ok(matchesArea('BU05990110','WK059901'));
  assert.ok(!matchesArea('BU05990310','WK059901'));
  const trace=simulateLives(p,{seed:42,index:0,days:20,probability:.1,latentDays:3,infectiousDays:7});
  const rows=geographicSummaries(p,trace,10,'wijk');
  assert.equal(rows.reduce((n,r)=>n+r.n,0),p.people.length);
  assert.equal(rows.reduce((n,r)=>n+r.infectious,0),p.people.filter(person=>stateAt(trace,person.id,10)==='I').length);
  assert.equal(rows.reduce((n,r)=>n+r.cases,0),trace.infectedOn.filter(d=>d>=0&&d<=10).length);
  assert.ok(rows.every(r=>GEOMETRY.wijk.features.some(f=>f.properties.code===r.id)));
  const centre=rows.find(r=>r.id==='WK059901');
  assert.equal(centre.n,p.people.filter(person=>matchesArea(person.area,centre.id)).length);
  assert.ok(!rows.some(r=>r.n===0),'unmodelled areas are absent, never false zero outcomes');
});

test('map display sample spans the selected population without changing counts',()=>{
  const all=mapPersonIds(p,'');assert.equal(all.length,1500);assert.equal(new Set(all).size,1500);
  assert.ok(new Set(all.map(id=>p.people[id].area)).size>50,'sample must not be limited to early CBS codes');
  const local=mapPersonIds(p,'WK059901');assert.ok(local.length>0);
  assert.ok(local.every(id=>matchesArea(p.people[id].area,'WK059901')));
  assert.deepEqual(mapPersonIds(p,'WK999999'),[]);
});

test('daily agendas cover 24 hours without overlaps and follow the simulation attendance',()=>{
  for(const person of p.people)for(let weekday=0;weekday<7;weekday++){
    const agenda=dailyActivities(p,person.id,weekday);
    assert.equal(agenda[0].start,0);assert.equal(agenda.at(-1).end,1440);
    for(const [i,a] of agenda.entries()){
      assert.ok(a.end>a.start);if(i)assert.equal(a.start,agenda[i-1].end);
      if(a.kind==='travel')assert.equal(a.cluster,null);
      if(a.kind!=='home'&&a.kind!=='travel'){
        assert.ok(p.clusters[a.cluster].members.includes(person.id));
        assert.ok(attends(person,p.clusters[a.cluster],weekday+1));
      }
    }
    for(const clusterId of [person.school,person.work,person.event].filter(id=>id!==null&&id!==person.household)){
      const active=attends(person,p.clusters[clusterId],weekday+1);
      assert.equal(agenda.some(a=>a.cluster===clusterId),active);
    }
  }
  assert.throws(()=>dailyActivities(p,0,-1));assert.throws(()=>dailyActivities(p,-1,0));
  const studentWorker=p.people.find(person=>person.student&&person.employed&&person.school!==null);
  assert.ok(studentWorker);
  const agenda=dailyActivities(p,studentWorker.id,studentWorker.workDays[0]);
  assert.ok(agenda.some(a=>a.kind==='school'));assert.ok(agenda.some(a=>a.kind==='work'));
});
