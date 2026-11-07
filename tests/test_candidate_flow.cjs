/* DOM integration with simulated PointerEvents, not a real-browser/device test. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../candidate');
function setup(seed={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://candidate.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,errors=[];w.addEventListener('error',e=>errors.push(e.error));
 for(const [k,v]of Object.entries(seed))w.localStorage.setItem(k,v);
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});w.ResizeObserver=class{observe(){}};
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:0,y:0,left:0,top:0,width:720,height:480,right:720,bottom:480};};
 w.HTMLElement.prototype.getClientRects=()=>[{}];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};w.HTMLCanvasElement.prototype.releasePointerCapture=()=>{};w.HTMLCanvasElement.prototype.hasPointerCapture=()=>false;
 for(const tag of w.document.querySelectorAll('script[src]')){const name=tag.getAttribute('src').split('?')[0];w.eval(fs.readFileSync(path.join(root,name),'utf8'));}
 const $=id=>w.document.getElementById(id),event=(id,type)=>$(id).dispatchEvent(new w.Event(type,{bubbles:true}));
 const check=(id,value=true)=>{$(id).checked=value;event(id,'change')};
 const pointer=(type,t,x=30,y=30,pressure=.2,pointerType='pen')=>{const e=new w.Event(type,{bubbles:true,cancelable:true});for(const[k,v]of Object.entries({timeStamp:t,pointerId:1,pointerType,button:0,isPrimary:true,clientX:x,clientY:y,pressure,tiltX:0,tiltY:0}))Object.defineProperty(e,k,{value:v});$('canvas').dispatchEvent(e)};
 const write=(pointerType='pen',fixedPressure=null)=>{if($('view-task')&&!$('view-task').hidden)$('product-begin').click();for(let s=0;s<4;s++){const t=100+s*1500;pointer('pointerdown',t,20,30+s*20,fixedPressure??.2,pointerType);for(let i=1;i<=4;i++)pointer('pointermove',t+i*200,20+i*30,30+s*20,fixedPressure??(.2+i*.07),pointerType);pointer('pointerup',t+1000,150,30+s*20,0,pointerType)}};
 const rows=()=>JSON.parse(w.localStorage.getItem(w.CWStore.KEY)||'[]');
 return {dom,w,$,event,check,pointer,write,rows,errors};
}
async function settled(){await new Promise(r=>setImmediate(r));}
test('startup: concise interface, isolated storage and local-only CSP',()=>{
 const a=setup({'cw-comp001-real-summaries-v1':'legacy-untouched'});try{
 assert.equal(a.errors.length,0);assert.equal(a.$('revision-faq'),null);assert.equal(a.$('personalize-radar'),null);assert.equal(a.$('result-measurements').open,false);
 assert.doesNotMatch(a.w.document.body.textContent,/識別碼|共用裝置|同一人|匿名識別/);
 assert.equal(a.w.localStorage.getItem('cw-comp001-real-summaries-v1'),'legacy-untouched');
 assert.match(a.w.document.querySelector('meta[http-equiv]').content,/connect-src 'none'/);
 const ids=[...a.w.document.querySelectorAll('[id]')].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
 }finally{a.dom.window.close()}
});
test('ordinary use has same result access, no VAS, repeated save is idempotent',()=>{
 const a=setup();try{a.$('start-real').click();assert.equal(a.$('research-opt-in').checked,false);a.write();a.$('finish').click();
 assert.equal(a.$('view-result').hidden,false);assert.equal(a.$('research-result').hidden,true);assert.equal(a.$('emotion-radar').querySelectorAll('svg').length,1);assert.match(a.$('radar-baseline-status').textContent,/原公式.*資料不足/);
 a.$('save').click();a.$('save').click();assert.equal(a.rows().length,1);const r=a.rows()[0];assert.equal(r.research,null);assert.equal(r.radar.scores.length,5);assert.equal(r.features.eligible,true);assert.equal(r.strokes,undefined);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('research requires explicit preflight, locks before drawing, exact pairing, resets next attempt',()=>{
 const a=setup();try{a.$('start-real').click();a.check('research-opt-in');a.$('product-begin').click();a.pointer('pointerdown',100);assert.match(a.$('stroke-count').textContent,/0/);assert.match(a.$('toast').textContent,/先確認/);
 a.check('research-confirm');a.write();assert.equal(a.$('research-opt-in').disabled,true);a.$('finish').click();a.$('save').click();const r=a.rows()[0];assert.equal(r.research.vasPre,50);assert.equal(r.research.sessionId,r.id);assert.equal(r.research.endedAt,r.endedAt);assert.ok(r.research.answeredAt<=r.research.startedAt);assert.equal(a.$('research-result').hidden,false);
 a.$('write-again').click();assert.equal(a.$('research-opt-in').checked,false);assert.equal(a.$('research-confirm').checked,false);a.write();a.$('finish').click();a.$('save').click();assert.equal(a.rows().length,2);assert.equal(a.rows()[1].research,null);assert.notEqual(a.rows()[0].id,a.rows()[1].id);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('slider change invalidates prior confirmation; blank completion never pairs research',()=>{
 const a=setup();try{a.$('start-real').click();a.check('research-opt-in');a.check('research-confirm');a.$('research-vas').value='70';a.event('research-vas','input');assert.equal(a.$('research-confirm').checked,false);a.$('product-begin').click();assert.equal(a.$('view-task').hidden,false);a.check('research-opt-in',false);a.$('product-begin').click();a.$('finish').click();a.$('save').click();assert.equal(a.rows()[0].research,null);assert.equal(a.rows()[0].features.eligible,false);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
test('topic changes stay enabled; cancel preserves, confirm clears VAS and starts new task',async()=>{
 const a=setup();try{a.$('start-real').click();a.check('research-opt-in');a.check('research-confirm');a.write();const old=a.$('task').value,next=a.$('task').options[1].value;assert.equal(a.$('task').disabled,false);
 a.$('task').value=next;a.event('task','change');assert.equal(a.$('confirmation').open,true);a.$('confirm-no').click();await settled();assert.equal(a.$('task').value,old);assert.match(a.$('stroke-count').textContent,/4/);
 a.$('task').value=next;a.event('task','change');a.$('confirm-yes').click();await settled();assert.equal(a.$('task').value,next);assert.match(a.$('stroke-count').textContent,/0/);assert.equal(a.$('research-opt-in').checked,false);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('withdraw consent persists removal while preserving ordinary summary and history review',async()=>{
 const a=setup();try{a.$('start-real').click();a.check('research-opt-in');a.check('research-confirm');a.write();a.$('finish').click();a.$('save').click();const id=a.rows()[0].id;
 a.$('research-withdraw').click();a.$('confirm-yes').click();await settled();assert.equal(a.rows()[0].id,id);assert.equal(a.rows()[0].research,null);assert.equal(a.$('research-result').hidden,true);assert.equal(a.rows()[0].features.eligible,true);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('history summary supports radar without raw replay or research enrollment',()=>{
 const a=setup();try{a.$('start-real').click();a.write();a.$('finish').click();a.$('save').click();a.w.document.querySelector('[data-nav="history"]').click();a.w.document.querySelector('[data-review]').click();assert.equal(a.$('replay-canvas').hidden,true);assert.equal(a.$('emotion-radar').querySelectorAll('svg').length,1);assert.equal(a.$('save').disabled,true);assert.equal(a.$('research-result').hidden,true);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
const legendScores=a=>[...a.$('emotion-legend').querySelectorAll('strong')].map(node=>Number(node.textContent.split(' / ')[0]));
function baselineHistory(a,count=12){
 a.$('start-real').click();a.write();a.$('finish').click();a.$('save').click();const base=a.rows()[0];
 return Array.from({length:count},(_,i)=>({...base,id:'prior-'+i,endedAt:base.endedAt-1000*(i+1),radar:{schema:base.radar.schema,scores:[20+i,45+i,70+i,25+i,50+i]}}));
}
function nextResult(a,history){a.w.localStorage.setItem(a.w.CWStore.KEY,JSON.stringify(history));a.$('write-again').click();a.write();a.$('finish').click();}
test('radar automatically uses the unchanged original formula with zero or nine prior records',()=>{
 for(const count of [0,9]){const a=setup();try{
 const history=baselineHistory(a,count),raw=a.rows()[0].radar.scores;nextResult(a,history);
 assert.equal(a.$('emotion-observation').dataset.radarMode,'raw-fallback');assert.match(a.$('radar-baseline-status').textContent,/原公式.*資料不足/);assert.deepEqual(legendScores(a),raw);
 assert.equal(a.$('emotion-legend').querySelectorAll('small').length,0);assert.match(a.$('emotion-note').textContent,/未驗證.*非情緒機率或心理診斷/);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}}
});
test('ten matching records enable personalization automatically; zero MAD falls back for the whole chart',()=>{
 const a=setup();try{
 const history=baselineHistory(a,10),raw=a.rows()[0].radar.scores;nextResult(a,history);a.$('save').click();const current=a.rows().find(r=>!r.id.startsWith('prior-'));
 const expected=a.w.CWPersonalization.personalizeRadar(current,history).axes.map(axis=>Math.round(axis.value));
 assert.equal(a.$('emotion-observation').dataset.radarMode,'personalized');assert.match(a.$('radar-baseline-status').textContent,/個人相對圖/);assert.deepEqual(legendScores(a),Array.from(expected));
 history.forEach(r=>r.radar.scores[0]=20);nextResult(a,history);assert.match(a.$('radar-baseline-status').textContent,/原公式.*變化不足/);assert.deepEqual(legendScores(a),raw);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('one insufficient axis or a different topic never borrows a partial personalized scale',()=>{
 for(const differentTopic of [false,true]){const a=setup();try{
 const history=baselineHistory(a,10),raw=a.rows()[0].radar.scores;
 if(differentTopic)history.forEach(r=>{r.task='other';const key=JSON.parse(r.key);key[3]='other';r.key=JSON.stringify(key)});else history[0].radar.scores[1]=null;
 nextResult(a,history);assert.equal(a.$('emotion-observation').dataset.radarMode,'raw-fallback');assert.deepEqual(legendScores(a),raw);assert.match(a.$('radar-baseline-status').textContent,/資料不足/);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}}
});
test('unavailable pen pressure, mouse and touch never fabricate radar values',()=>{
 for(const pointerType of ['pen','mouse','touch']){const a=setup();try{
 a.$('start-real').click();a.write(pointerType,.5);a.$('finish').click();a.$('save').click();
 assert.equal(a.$('emotion-observation').dataset.radarMode,'unavailable');assert.equal(a.$('emotion-radar').querySelector('svg'),null);assert.equal(a.rows()[0].radar,null);assert.equal(a.rows()[0].features.values.pressure,null);
 assert.match(a.$('radar-baseline-status').textContent,/筆壓資料不足/);assert.equal(a.$('metric-cards').querySelectorAll('.metric-card').length,4);assert.ok(Number.isFinite(a.rows()[0].features.values.speed));assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}}
});
test('a short but measurable session uses the original formula without claiming a personal comparison',()=>{
 const a=setup();try{a.$('start-real').click();a.$('product-begin').click();a.pointer('pointerdown',100,20,30,.2);for(let i=1;i<=4;i++)a.pointer('pointermove',100+i*200,20+i*30,30,.2+i*.07);a.pointer('pointerup',1100,150,30,0);a.$('finish').click();
 assert.equal(a.$('emotion-radar').querySelectorAll('svg').length,1);assert.equal(a.$('emotion-observation').dataset.radarMode,'raw-fallback');assert.match(a.$('radar-baseline-status').textContent,/原公式.*本次不符合/);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('blank or interrupted writing never leaves stale radar points',()=>{
 for(const interrupt of [false,true]){const a=setup();try{a.$('start-real').click();a.$('product-begin').click();if(interrupt){a.write();a.w.dispatchEvent(new a.w.Event('blur'));}a.$('finish').click();
 assert.equal(a.$('emotion-observation').dataset.radarMode,'unavailable');assert.equal(a.$('emotion-radar').querySelector('svg'),null);assert.equal(a.$('emotion-legend').children.length,0);assert.match(a.$('radar-baseline-status').textContent,interrupt?/中斷或條件改變/:/資料不足/);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}}
});
test('measurement details reset for the next result, remain operable and retain a concise limitation',()=>{
 const a=setup();try{a.$('start-real').click();a.write();a.$('finish').click();
 assert.equal(a.$('result-measurements').open,false);assert.equal(a.$('metric-cards').closest('details').id,'result-measurements');
 a.$('result-measurements').open=true;a.$('result-breathe').click();a.$('breath-cancel').click();assert.equal(a.$('result-measurements').open,true);
 a.$('write-again').click();a.write();a.$('finish').click();assert.equal(a.$('result-measurements').open,false);assert.equal(a.errors.length,0);
 }finally{a.dom.window.close()}
});
test('corrupt local history remains untouched and does not prevent current results',()=>{
 const a=setup({'cw-research-b-local-summaries-v1':'broken'});try{a.$('start-real').click();a.write();a.$('finish').click();assert.equal(a.$('view-result').hidden,false);assert.match(a.$('radar-baseline-status').textContent,/原公式.*無法讀取/);a.$('save').click();assert.equal(a.w.localStorage.getItem(a.w.CWStore.KEY),'broken');assert.match(a.$('save-status').textContent,/保存失敗/);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
test('changing categories after writing supports cancellation and an independent fresh round',async()=>{
 const a=setup();try{a.$('start-real').click();a.write();const old=a.$('category').value;a.$('category').value='single';a.event('category','change');a.$('confirm-no').click();await settled();assert.equal(a.$('category').value,old);a.$('category').value='single';a.event('category','change');a.$('confirm-yes').click();await settled();assert.equal(a.$('category').value,'single');assert.equal(a.$('task').options.length>0,true);assert.match(a.$('stroke-count').textContent,/0/);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
test('post-writing breathing never invalidates completed measurement',()=>{
 const a=setup();try{a.$('start-real').click();a.write();a.$('finish').click();a.$('save').click();assert.equal(a.rows()[0].features.eligible,true);a.$('result-breathe').click();a.$('breath-cancel').click();a.$('save').click();assert.equal(a.rows()[0].features.eligible,true);assert.doesNotMatch(a.rows()[0].features.flags.join(','),/介入引導/);assert.match(a.$('guidance-state').textContent,/不改動/);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
test('legacy App and early summaries are readable without migration or raw display',()=>{
 const seed={'cw-comp001-real-summaries-v1':JSON.stringify([{features:{durationMs:8000,counts:{strokes:3,points:20},values:{pause:.5}},strokes:'PRIVATE_RAW'}]),'writing-mindfulness-sessions':JSON.stringify([{totalTime:7,strokeCount:4,pointCount:25,rawPoints:'PRIVATE_RAW'}])};const a=setup(seed);try{a.w.document.querySelector('[data-nav="history"]').click();a.$('read-legacy').click();assert.match(a.$('legacy-list').textContent,/上一版 App/);assert.match(a.$('legacy-list').textContent,/早期書寫版/);assert.doesNotMatch(a.$('legacy-list').textContent,/PRIVATE_RAW/);assert.equal(a.rows().length,0);for(const[k,v]of Object.entries(seed))assert.equal(a.w.localStorage.getItem(k),v);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});

test('product shell keeps welcome, card selection and writing as separate steps',()=>{
 const a=setup();try{assert.equal(a.$('view-home').hidden,false);assert.match(a.$('home-title').textContent,/寫字靜心/);a.$('start-real').click();assert.equal(a.$('view-task').hidden,false);assert.equal(a.$('view-write').hidden,true);assert.ok(a.$('product-task-cards').querySelectorAll('button').length>1);a.w.document.querySelector('[data-product-category="single"]').click();a.w.document.querySelector('[data-product-task="s02"]').click();assert.equal(a.$('task').value,'s02');assert.equal(a.$('product-selected-text').textContent,'心');a.$('product-begin').click();assert.equal(a.$('view-write').hidden,false);assert.equal(a.w.document.body.dataset.productView,'write');assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
test('product return-to-picker cancellation preserves strokes and confirmation resets consent',async()=>{
 const a=setup();try{a.$('start-real').click();a.check('research-opt-in');a.check('research-confirm');a.write();const back=a.w.document.querySelector('#view-write [data-nav="task"]');back.click();a.$('confirm-no').click();await settled();assert.equal(a.$('view-write').hidden,false);assert.match(a.$('stroke-count').textContent,/4/);back.click();a.$('confirm-yes').click();await settled();assert.equal(a.$('view-task').hidden,false);assert.equal(a.$('research-opt-in').checked,false);assert.equal(a.$('research-confirm').checked,false);assert.match(a.$('stroke-count').textContent,/0/);assert.equal(a.errors.length,0);}finally{a.dom.window.close()}
});
test('product skin preserves existing candidate history and withdrawal state without migration',()=>{
 const a=setup();try{a.$('start-real').click();a.write();a.$('finish').click();a.$('save').click();const seed=Object.fromEntries(Object.keys(a.w.localStorage).map(k=>[k,a.w.localStorage.getItem(k)]));const b=setup(seed);try{assert.equal(b.rows().length,1);for(const[k,v]of Object.entries(seed))assert.equal(b.w.localStorage.getItem(k),v);b.w.document.querySelector('[data-nav="history"]').click();b.w.document.querySelector('[data-review]').click();assert.equal(b.$('view-result').hidden,false);assert.equal(b.$('save').disabled,true);assert.equal(b.errors.length,0);}finally{b.dom.window.close()}}finally{a.dom.window.close()}
});
