'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../candidate/assets/research.js'),CW=require('../candidate/assets/engine.js');
const pre=()=>R.preflight({consent:true,confirmed:true,value:42,at:1000});
const pairing=()=>({sessionId:'session-exact',startedAt:1100,endedAt:9000});
function record(){const r=CW.summary(CW.demo().session,{person:'secret-owner',environment:'canvas',input:'pen',task:'h01'},'session-exact',9000);r.research=R.pair(pre(),pairing());return r;}
test('preflight requires explicit consent and confirmed intentional integer VAS',()=>{
 assert.equal(R.preflight(),null);
 for(const value of [undefined,null,'50',NaN,Infinity,-1,101,1.5])assert.equal(R.preflight({consent:true,confirmed:true,value,at:1000}),null);
 for(const field of ['consent','confirmed'])for(const value of [false,undefined,null,'true',1,{}])assert.equal(R.preflight({consent:true,confirmed:true,value:42,at:1000,[field]:value}),null);
 for(const value of [0,100])assert.equal(R.preflight({consent:true,confirmed:true,value,at:1000}).vasPre,value);
});
test('preflight timestamp is finite and positive, no fake defaults',()=>{
 for(const at of [undefined,null,0,-1,NaN,Infinity,'1000'])assert.equal(R.preflight({consent:true,confirmed:true,value:50,at}),null);
 assert.equal(pre().vasPre,42);assert.equal(pre().consentedAt,1000);assert.equal(pre().answeredAt,1000);
});
test('pair requires valid ordering and consent timestamps',()=>{
 const ok=R.pair(pre(),pairing());assert.equal(ok.sessionId,'session-exact');assert.equal(ok.vasPre,42);
 for(const field of ['consentedAt','answeredAt'])for(const value of [undefined,null,0,-1,NaN,Infinity,'1000',1200])assert.equal(R.pair({...pre(),[field]:value},pairing()),null,field+':'+value);
 for(const patch of [{startedAt:999},{endedAt:1099},{startedAt:NaN},{endedAt:Infinity},{sessionId:''},{sessionId:4}])assert.equal(R.pair(pre(),{...pairing(),...patch}),null);
 assert.equal(R.pair({...pre(),schema:'old'},pairing()),null);assert.equal(R.pair({...pre(),consentVersion:'old'},pairing()),null);
});
test('clean binds exact record ID and end timestamp without rewriting evidence',()=>{
 const r=record();assert.deepEqual(R.clean(r.research,r),r.research);
 for(const patch of [{sessionId:'different'},{endedAt:9001},{storage:'uploaded'},{consentedAt:999},{vasPre:undefined}])assert.equal(R.clean({...r.research,...patch},r),null);
 assert.equal(R.clean(null,r),null);assert.equal(R.clean(r.research,null),null);
 assert.equal(R.clean(r.research,{...r,id:'other'}),null);
});
test('export requires valid pairing and omits all unapproved nested information',()=>{
 const r=record();r.key='private-owner';r.strokes=[{x:1}];r.email='private@example.test';
 r.features.rawPoints=[{x:1}];r.features.owner='private-owner';r.features.values.stressLabel='private-label';r.features.support.secret='private-secret';
 r.radar={schema:'cw-radar-heuristic/1.0',scores:[1,2,3,4,5],owner:'private-owner',stressLabel:'private-label'};
 r.research.secret='private-secret';const out=R.exportRecord(r),json=JSON.stringify(out);
 for(const forbidden of ['private-owner','private@example.test','private-label','private-secret','rawPoints'])assert.equal(json.includes(forbidden),false,forbidden);
 assert.equal(out.strokes,undefined);
 assert.deepEqual(Object.keys(out).sort(),['schema','sessionId','build','research','task','input','condition','featureSchema','features','radar','note'].sort());
 assert.deepEqual(out.radar,{schema:'cw-radar-heuristic/1.0',scores:[1,2,3,4,5]});assert.equal(out.features.values.pressure,null);
 assert.throws(()=>R.exportRecord({...r,research:null}));assert.throws(()=>R.exportRecord({...r,research:{...r.research,sessionId:'other'}}));
});
test('exports do not share mutable feature objects or invent unavailable data',()=>{
 const r=record(),out=R.exportRecord(r);out.features.values.speed=999;assert.notEqual(r.features.values.speed,999);
 assert.equal(out.radar,null);assert.equal(out.features.values.pressure,null);
});
