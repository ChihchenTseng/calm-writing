/* CW-COMP-001: pure, deterministic feature extraction. No I/O or psychological inference. */
(function(root,factory){ const api=factory(); if(typeof module==='object'&&module.exports)module.exports=api; else root.CW=api; })(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SCHEMA='cw-writing/1.0', FEATURE_SCHEMA='cw-features/2.0', MIN_HISTORY=10, MAX_HISTORY=30;
  const BLOCKING_FLAGS=['資料太少','短筆畫','無效時間或座標','無有效路徑','異常取樣','輸入中斷','尺寸改變','輸入方式改變','超出採樣上限','介入引導','任務變更','個人識別未保存'];
  const METRICS={speed:{label:'落筆期間平均速度',unit:'CSS px/s'},pause:{label:'筆畫間抬筆間隔',unit:'秒'},active:{label:'落筆時間占比',unit:'%'},pressure:{label:'已觀察筆壓',unit:'0–1 裝置相對值'}};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const median=values=>{const a=values.filter(finite).slice().sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
  const unique=a=>[...new Set(a)];
  function extract(session){
    let flags=[...(session.flags||[])],distance=0,activeMs=0,pointCount=0,pressures=[],pressureCandidates=[],tilts=[],times=[],pauses=[],lastEnd=null,usable=0;
    const strokes=Array.isArray(session.strokes)?session.strokes:[];
    for(const stroke of strokes){
      const pts=stroke.points||[];
      if(pts.length<2){flags.push('短筆畫');lastEnd=null;continue;}
      let good=pts.every(p=>finite(p.x)&&finite(p.y)&&finite(p.t)&&p.t>=0);
      for(let i=1;i<pts.length;i++)if(!(pts[i].t>pts[i-1].t))good=false;
      if(lastEnd!==null&&pts[0].t<lastEnd)good=false;
      if(!good){flags.push('無效時間或座標');lastEnd=null;continue;}
      const start=pts[0].t,end=pts[pts.length-1].t;
      if(lastEnd!==null){const gap=start-lastEnd;pauses.push(gap/1000);if(gap>300000)flags.push('異常取樣');}
      lastEnd=end;times.push(start,end);usable++;pointCount+=pts.length;activeMs+=end-start;
      for(let i=1;i<pts.length;i++)distance+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
      const pen=pts.filter(p=>p.pointerType==='pen'||p.pressureSupported===true);
      const contact=pen.filter(p=>p.phase!=='up'&&finite(p.pressure)&&p.pressure>=0&&p.pressure<=1);
      pressureCandidates.push(...contact);
      for(const p of pts){if(p.pointerType==='pen'&&finite(p.tiltX)&&finite(p.tiltY))tilts.push([p.tiltX,p.tiltY]);else if(p.tiltSupported&&finite(p.tilt))tilts.push([p.tilt,0]);}
    }
    const verified=pressureCandidates.some(p=>p.pressureSupported===true||p.pressureEvidence==='verified');
    const varied=pressureCandidates.some(p=>p.pressure!==pressureCandidates[0]?.pressure);
    const pressureEvidence=verified?'verified':varied?'observed-variation':'unknown';
    if(pressureEvidence!=='unknown')pressures=pressureCandidates.map(p=>p.pressure);
    const span=times.length?Math.max(...times)-Math.min(...times):0;
    if(usable<3||pointCount<12||span<3000)flags.push('資料太少');
    if(!activeMs||!finite(distance)||!finite(span))flags.push('無效時間或座標');
    if(distance===0)flags.push('無有效路徑');
    if(activeMs>0&&(activeMs<300||distance/(activeMs/1000)>5000))flags.push('異常取樣');
    flags=unique(flags);
    const blocked=flags.some(f=>BLOCKING_FLAGS.includes(f));
    const values={speed:activeMs>0&&finite(distance)?distance/(activeMs/1000):null,pause:median(pauses),active:span>0?activeMs/span*100:null,pressure:pressures.length>=5?median(pressures):null};
    for(const k of Object.keys(values))if(!finite(values[k]))values[k]=null;
    return {schema:FEATURE_SCHEMA,values,counts:{strokes:usable,points:pointCount,pauses:pauses.length,pressure:pressures.length,tilt:tilts.length},durationMs:span,activeMs,distance,pauses,flags,eligible:!blocked,metricEligible:{speed:!blocked&&values.speed!==null,pause:!blocked&&values.pause!==null,active:!blocked&&values.active!==null,pressure:!blocked&&values.pressure!==null},support:{pressure:pressures.length>0,pressureEvidence,tilt:tilts.length>0,tiltEvidence:tilts.length?'raw-present':'unknown'}};
  }
  function key(meta){return JSON.stringify([meta.person,meta.environment,meta.input,meta.task,meta.schema||FEATURE_SCHEMA]);}
  function qualified(r,metric){const f=r?.features,v=f?.values?.[metric];return r?.schema===SCHEMA&&f?.schema===FEATURE_SCHEMA&&f.eligible&&f.metricEligible?.[metric]&&finite(v)&&Array.isArray(f.flags)&&!f.flags.some(x=>BLOCKING_FLAGS.includes(x))&&f.counts?.strokes>=3&&f.counts?.points>=12&&finite(f.durationMs)&&f.durationMs>=3000&&finite(f.activeMs)&&f.activeMs>=300&&f.activeMs<=f.durationMs+1e-6&&finite(f.distance)&&f.distance>0&&(metric==='speed'?v>=0&&v<=5000:metric==='active'?v>=0&&v<=100:metric==='pressure'?v>=0&&v<=1&&f.counts.pressure>=5:v>=0&&f.counts.pauses>=1);}
  function compare(current,history,metric){
    const value=current.features.values[metric];
    const seen=new Set();
    const records=history.filter(r=>r.id!==current.id&&r.key===current.key&&r.input===current.input&&r.environment===current.environment&&r.task===current.task&&finite(r.endedAt)&&r.endedAt>0&&r.endedAt<current.endedAt&&qualified(r,metric)).sort((a,b)=>b.endedAt-a.endedAt||a.id.localeCompare(b.id)).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,MAX_HISTORY);
    const values=records.map(r=>r.features.values[metric]),base=median(values),mad=base===null?null:median(values.map(v=>Math.abs(v-base)));
    if(!finite(current.endedAt)||!qualified(current,metric))return {status:'unavailable',n:records.length,value,base,mad,ids:records.map(r=>r.id)};
    if(records.length<MIN_HISTORY)return {status:'building',n:records.length,value,base,mad,ids:records.map(r=>r.id)};
    const delta=value-base;
    return {status:mad===0?'zero-mad':'ready',n:records.length,value,base,mad,delta,robustDistance:mad>0?Math.abs(delta)/mad:null,ids:records.map(r=>r.id)};
  }
  function observation(metric,c){
    if(c.status==='unavailable')return '本次資料不適合比較；仍可查看可用的量測摘要。';
    if(c.status==='building')return `個人基準建立中（${c.n}/${MIN_HISTORY} 筆）。不做長期趨勢或狀態判定。`;
    if(c.status==='zero-mad')return '近期基準沒有離散（MAD = 0）；只顯示原始差值，不計算標準化距離。';
    if(c.delta===0)return '本次與近期中位數相同。這是書寫行為觀察，不代表心理狀態。';
    return `本次${METRICS[metric].label}較近期中位數${c.delta>0?'高':'低'}；可能受輸入裝置、姿勢或書寫節奏影響，不代表好壞或心理狀態。`;
  }
  function summary(session,meta,id,endedAt){
    const f=extract(session);
    // Pauses are used transiently for a histogram, never persisted point-by-point.
    const {pauses,...features}=f;
    const bins=[0,0,0,0];for(const p of pauses)bins[p<1?0:p<3?1:p<5?2:3]++;
    return {id,schema:SCHEMA,key:key({...meta,schema:FEATURE_SCHEMA}),task:meta.task,input:meta.input,environment:meta.environment,endedAt,features:{...features,pauseBins:bins},guidance:session.guidance||'not-started'};
  }
  function timeline(session){
    const strokes=[],speed=[],pressure=[],pressureCandidates=[];let previousEnd=null,origin=null;
    for(const stroke of session?.strokes||[]){
      const points=stroke.points||[];
      if(!points.length||!points.every(p=>finite(p.x)&&finite(p.y)&&finite(p.t)&&p.t>=0))continue;
      if(points.some((p,i)=>i&&p.t<=points[i-1].t)||previousEnd!==null&&points[0].t<previousEnd)continue;
      origin??=points[0].t;
      const start=points[0].t-origin,end=points.at(-1).t-origin;
      strokes.push({start,end,points});
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],distance=Math.hypot(b.x-a.x,b.y-a.y),dt=b.t-a.t;
        const value=distance/dt*1000;if(distance>0&&finite(value))speed.push({at:b.t-origin,value,stroke:strokes.length-1});
      }
      const pen=points.filter(p=>p.pointerType==='pen'||p.pressureSupported===true).filter(p=>p.phase!=='up'&&finite(p.pressure)&&p.pressure>=0&&p.pressure<=1);
      for(const p of pen)pressureCandidates.push({point:p,stroke:strokes.length-1});
      previousEnd=points.at(-1).t;
    }
    if(pressureCandidates.some(x=>x.point.pressure!==pressureCandidates[0]?.point.pressure)||pressureCandidates.some(x=>x.point.pressureSupported===true||x.point.pressureEvidence==='verified'))for(const {point,stroke} of pressureCandidates)pressure.push({at:point.t-origin,value:point.pressure,stroke});
    const duration=strokes.length?strokes.at(-1).end:0;
    return {strokes,speed,pressure,duration,pauses:strokes.slice(1).map((s,i)=>({start:strokes[i].end,end:s.start})),sampleCounts:{computedSpeed:speed.length,computedPressure:pressure.length}};
  }
  class Capture{
    constructor(){this.strokes=[];this.active=null;this.pointer=null;this.flags=[];this.input=null;this.guidance='not-started';this.points=0;}
    flag(v){if(!this.flags.includes(v))this.flags.push(v);}
    begin(id,input,point){if(this.pointer!==null)return false;if(this.points>=50000){this.flag('超出採樣上限');return false;}if(![point?.x,point?.y,point?.t].every(finite)||point.t<0){this.flag('無效時間或座標');return false;}if(this.input&&this.input!==input)this.flag('輸入方式改變');this.input=this.input||input;this.pointer=id;this.active={points:[point]};return true;}
    move(id,point){if(id!==this.pointer||!this.active)return false;if(this.points+this.active.points.length>=50000){this.flag('超出採樣上限');return false;}if(![point?.x,point?.y,point?.t].every(finite)||point.t<=this.active.points.at(-1).t){this.flag('無效時間或座標');return false;}this.active.points.push(point);return true;}
    end(id,point){if(id!==this.pointer||!this.active)return false;if(point){if(![point.x,point.y,point.t].every(finite)||point.t<this.active.points.at(-1).t)this.flag('無效時間或座標');else if(point.t>this.active.points.at(-1).t)this.move(id,point);}this.strokes.push(this.active);this.points+=this.active.points.length;this.active=null;this.pointer=null;return true;}
    interrupt(reason='輸入中斷'){if(this.pointer!==null){this.active=null;this.pointer=null;this.flag(reason);}}
    undo(){this.interrupt();this.strokes.pop();this.points=this.strokes.reduce((n,s)=>n+s.points.length,0);}
    clear(){this.interrupt();this.strokes=[];this.points=0;/* session-level interruption/resize/intervention flags deliberately remain */}
    markGuidance(state){this.guidance=state;this.flag('介入引導');this.interrupt();}
  }
  function demo(kind='normal'){
    const gap=kind==='pause'?4400:500,session={strokes:[],flags:[],guidance:'not-started'};
    for(let s=0;s<6;s++){const start=s*(1000+gap);session.strokes.push({points:Array.from({length:8},(_,i)=>({x:30+i*12,y:30+s*20,t:start+i*1000/7,pressure:null,pressureSupported:false,tilt:null,tiltSupported:false}))});}
    if(kind==='short')session.strokes=session.strokes.slice(0,1);
    if(kind==='invalid')session.strokes[1].points[3].t=-1;
    const meta={person:'DEMO-NOT-RESEARCH',environment:'demo-canvas',input:'mouse',task:'h01',schema:SCHEMA};
    const now=1800000000000,current=summary(session,meta,'demo-current-'+kind,now);
    const history=Array.from({length:12},(_,i)=>{const r=summary(demoSession(400+i*30),meta,'demo-history-'+i,now-100000-i*100000);return r;});
    return {session,current,history};
  }
  function demoSession(gap){return {strokes:Array.from({length:6},(_,s)=>({points:Array.from({length:8},(_,i)=>({x:30+i*12,y:30+s*20,t:s*(1000+gap)+i*1000/7,pressure:null,pressureSupported:false,tilt:null,tiltSupported:false}))})),flags:[]};}
  return {SCHEMA,FEATURE_SCHEMA,MIN_HISTORY,MAX_HISTORY,METRICS,finite,median,extract,key,qualified,compare,observation,summary,timeline,Capture,demo};
});
