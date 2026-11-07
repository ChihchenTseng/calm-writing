'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const CW=require('../app/assets/engine.js');
const P=require('../candidate/assets/personalization.js').create(CW);
function record(i,overrides={}){
  const r=CW.summary(CW.demo().session,{person:'local-owner',environment:'canvas-1',input:'pen',task:'h01'},'r'+i,1000+i);
  r.local='saved';r.features.values.pressure=.1+i/1000;r.features.counts.pressure=10;r.features.metricEligible.pressure=true;
  r.features.values.speed=20+i;r.features.values.pause=1+i/100;
  r.radar={schema:P.RADAR_SCHEMA,scores:Array(5).fill(Math.min(100,20+i))};
  return Object.assign(r,overrides);
}
const current=()=>record(100),history=(n=10)=>Array.from({length:n},(_,i)=>record(i));
function condition(r,field,value){r[field]=value;const k=JSON.parse(r.key);k[{environment:1,input:2,task:3}[field]]=value;r.key=JSON.stringify(k);return r;}
test('same condition baseline and exact robust radar formula',()=>{
 const h=history(),c=current(),a=P.compare(c,h,'speed');assert.equal(a.status,'ready');assert.equal(a.n,10);assert.equal(a.base,24.5);
 c.radar.scores.fill(25);const radar=P.personalizeRadar(c,h);assert.equal(radar.status,'personalized');assert.equal(radar.axes[0].value,50+15*.5/(1.4826*2.5));
});
test('condition, owner, feature and radar versions are isolated',()=>{
 for(const f of ['task','input','environment'])assert.equal(P.eligibleHistory(current(),history().map(r=>condition(r,f,'different'))).length,0);
 for(const mutate of [r=>{let k=JSON.parse(r.key);k[0]='other';r.key=JSON.stringify(k);},r=>r.features.schema='old',r=>r.local='demo-memory',r=>r.key='bad']){
  assert.equal(P.eligibleHistory(current(),history().map(r=>{mutate(r);return r;})).length,0);
 }
 const h=history();h[0].radar.schema='old';assert.equal(P.personalizeRadar(current(),h).axes[0].n,9);
});
test('task switching freely falls back instead of borrowing other tasks',()=>{
 const c=condition(current(),'task','h02'),r=P.personalizeRadar(c,history());assert.equal(r.status,'raw-fallback');assert.equal(r.axes[0].reason,'insufficient-axis-history');assert.equal(r.axes[0].value,c.radar.scores[0]);
});
test('each metric and axis needs ten valid values',()=>{
 const h=history(12);for(let i=0;i<3;i++){h[i].features.values.pressure=null;h[i].features.metricEligible.pressure=false;}
 assert.equal(P.compare(current(),h,'speed').status,'ready');assert.equal(P.compare(current(),h,'pressure').status,'building');assert.equal(P.compare(current(),h,'pressure').n,9);
 const a=history();a[0].radar.scores[1]=null;const radar=P.personalizeRadar(current(),a);assert.equal(radar.status,'mixed');assert.equal(radar.axes[0].status,'personalized');assert.equal(radar.axes[1].n,9);
});
test('excludes current, same-time and future records; limits latest unique pool',()=>{
 const c=current(),h=history(50);h.push(c,record(101),record(99,{id:c.id}),record(2,{endedAt:c.endedAt}));h.push(...h);
 const pool=P.eligibleHistory(c,h);assert.equal(pool.length,30);assert.equal(pool[0].id,'r49');assert.equal(pool[29].id,'r20');assert.equal(new Set(pool.map(r=>r.id)).size,30);
 const metricHistory=history(40);for(let i=10;i<40;i++)metricHistory[i].features.values.pressure=null;
 assert.equal(P.compare(c,metricHistory,'pressure').n,0); // Never reach behind the latest 30.
});
test('zero MAD and unavailable pressure never fabricate personalization',()=>{
 const c=current(),h=history().map(r=>{r.radar.scores.fill(30);r.features.values.speed=30;return r;});
 assert.equal(P.compare(c,h,'speed').status,'zero-mad');const a=P.personalizeRadar(c,h).axes[0];assert.equal(a.reason,'zero-mad');assert.equal(a.value,c.radar.scores[0]);
 c.features.values.pressure=null;assert.equal(P.personalizeRadar(c,h).axes[0].reason,'current-unqualified');assert.equal(P.compare(c,h,'pressure').status,'unavailable');
});
test('corrupt history and malformed current are safe',()=>{
 const bad=[null,undefined,{},[],{features:null},record(1,{key:'{'}),record(2,{endedAt:NaN})];
 const r=record(3);r.features.counts.points=Infinity;bad.push(r);
 assert.deepEqual(P.eligibleHistory(current(),bad),[]);assert.deepEqual(P.eligibleHistory(null,history()),[]);
 assert.equal(P.compare(null,history(),'pressure').status,'unavailable');assert.equal(P.personalizeRadar(null,bad).status,'unavailable');
 assert.equal(P.radarSummary({scores:[{score:4}]}),null);assert.equal(P.radarSummary({scores:Array(5).fill({score:Infinity})}),null);
});
test('no labels or research participation influence a baseline or raw summary',()=>{
 const c=current(),h=history();const before=P.personalizeRadar(c,h);
 c.stressLabel=100;c.researchConsent=true;h.forEach(r=>{r.stressLabel=0;r.emotion='anger';r.researchConsent=false;});
 assert.deepEqual(P.personalizeRadar(c,h),before);
 assert.deepEqual(P.radarSummary({scores:Array.from({length:5},(_,i)=>({score:i,name:'label'})),stressLabel:50}),{schema:P.RADAR_SCHEMA,scores:[0,1,2,3,4]});
});
test('does not mutate inputs and clamps relative axes',()=>{
 const c=current(),h=history(),before=JSON.stringify({c,h});P.compare(c,h,'speed');const a=P.personalizeRadar(c,h);assert.equal(JSON.stringify({c,h}),before);assert.equal(a.axes[0].value,100);
 c.radar.scores.fill(0);assert.equal(P.personalizeRadar(c,h).axes[0].value,0);
});
test('duplicate copies count once and blocked summaries stay excluded',()=>{
 const one=record(1);assert.equal(P.compare(current(),Array(20).fill(one),'speed').n,1);
 const h=history();h[0].features.flags=['輸入中斷'];assert.equal(P.eligibleHistory(current(),h).length,9);
 const x=history();x[0].features.counts.pressure=Infinity;assert.equal(P.compare(current(),x,'pressure').n,9);
});
test('browser export and CommonJS factory have the same contract',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),context={CW};vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../candidate/assets/personalization.js'),'utf8'),context);
 assert.equal(context.CWPersonalization.RADAR_SCHEMA,P.RADAR_SCHEMA);
 assert.equal(context.CWPersonalization.compare(current(),history(),'speed').status,'ready');
});
test('latest candidate base formula equals independently calculated pressure and velocity coefficients',()=>{
 const engine=require('../candidate/assets/engine.js');
 // Contacts p=.2,.5,.8. Distances 1 and 5 over 100 ms give speeds 1 and 5 CSS px/100 ms.
 const session={flags:[],strokes:[{points:[
  {x:0,y:0,t:0,pressure:.2,pointerType:'pen'},
  {x:1,y:0,t:100,pressure:.5,pointerType:'pen'},
  {x:6,y:0,t:200,pressure:.8,pointerType:'pen'},
  {x:1000,y:1000,t:201,pressure:0,pointerType:'pen',phase:'up'}]}]};
 const pMean=.5,pStd=Math.sqrt((.09+0+.09)/3),vMean=3,vStd=2,slow=.5;
 const expected=[.45*pMean+1.1*pStd+.35*vMean/300+.2*vStd/300,
  .4*(1-1.8*pStd)+.35*(1-vStd/200)+.25*slow,
  .4*.8+.3*vMean/300+.3*vStd/200,
  .4*(1-vMean/300)+.35*slow+.25*(1-pMean),
  .35*(1-2*Math.abs(pMean-.45))+.35*(1-vStd/200)+.3*(1-slow)].map(v=>Math.min(1,Math.max(0,v)));
 const actual=engine.emotionFeatures(session).scores;
 actual.forEach((axis,i)=>{assert.ok(Math.abs(axis.value-expected[i])<1e-12);assert.equal(axis.score,Math.round(expected[i]*100));});
 assert.deepEqual(P.radarSummary({scores:actual}).scores,expected.map(v=>Math.round(v*100)));
 session.strokes[0].points.forEach(p=>{p.pointerType='mouse';p.pressure=.5;});assert.equal(engine.emotionFeatures(session).scores,null);
});
