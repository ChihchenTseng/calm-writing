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
  // Same five-axis weighting and CSS px / 100 ms velocity as the root observation.
  // This reads the current raw session only; the scores never enter a saved summary.
  function emotionFeatures(session){
    const reasons=[],contacts=[],speeds=[];
    if(!session||!Array.isArray(session.strokes))return {scores:null,reasons:['本次原始筆跡不可用']};
    if((session.flags||[]).some(flag=>['輸入中斷','尺寸改變','無效時間或座標','超出採樣上限','輸入方式改變'].includes(flag)))reasons.push('本次書寫條件曾變更或中斷，暫不推測情緒');
    for(const stroke of session.strokes){
      if(stroke?.fragmentInvalid)continue;
      // The root records down/move only. App up points close the replay stroke.
      const points=Array.isArray(stroke?.points)?stroke.points.filter(p=>p?.phase!=='up'):[];
      if(points.length<2)continue;
      if(!points.every(p=>finite(p?.x)&&finite(p?.y)&&finite(p?.t)&&p.t>=0)||points.some((p,i)=>i>0&&p.t<=points[i-1].t))continue;
      for(const p of points)if(p.pointerType==='pen'&&finite(p.pressure)&&p.pressure>=0&&p.pressure<=1)contacts.push(p);
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],speed=Math.hypot(b.x-a.x,b.y-a.y)/(b.t-a.t)*100;
        if(finite(speed))speeds.push(speed);
      }
    }
    const verified=contacts.some(p=>p.pressureSupported===true||p.pressureEvidence==='verified');
    const varied=contacts.some(p=>p.pressure!==contacts[0]?.pressure);
    const pressures=verified||varied?contacts.map(p=>p.pressure):[];
    if(pressures.length<3)reasons.push('有效筆壓樣本不足（需要至少 3 筆實測接觸值）');
    if(speeds.length<2)reasons.push('有效同筆速度區間不足（需要至少 2 段）');
    if(reasons.length)return {scores:null,reasons};
    const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
    const deviation=(values,average)=>Math.sqrt(mean(values.map(value=>(value-average)**2)));
    const clamp=value=>Math.max(0,Math.min(1,value));
    const avgP=mean(pressures),maxP=pressures.reduce((highest,value)=>Math.max(highest,value),0),stdP=deviation(pressures,avgP);
    const avgSpeed=mean(speeds),stdSpeed=deviation(speeds,avgSpeed),slowRatio=speeds.filter(speed=>speed<2).length/speeds.length;
    return {scores:[
      {name:'緊張／專注',color:'#a36a39',value:clamp(avgP*0.45+stdP*1.1+(avgSpeed/300)*0.35+(stdSpeed/300)*0.2)},
      {name:'平靜／穩定',color:'#6b7c5e',value:clamp((1-stdP*1.8)*0.4+(1-stdSpeed/200)*0.35+slowRatio*0.25)},
      {name:'激動／急迫',color:'#a6574b',value:clamp(maxP*0.4+(avgSpeed/300)*0.3+(stdSpeed/200)*0.3)},
      {name:'疲倦／低落',color:'#767397',value:clamp((1-avgSpeed/300)*0.4+slowRatio*0.35+(1-avgP)*0.25)},
      {name:'輕鬆／愉快',color:'#ad8c43',value:clamp((1-Math.abs(avgP-0.45)*2)*0.35+(1-stdSpeed/200)*0.35+(1-slowRatio)*0.3)}
    ].map(item=>({...item,score:Math.round(item.value*100)})),reasons:[]};
  }
  function key(meta){return JSON.stringify([meta.person,meta.environment,meta.input,meta.task,meta.schema||FEATURE_SCHEMA]);}
  function ownerOf(r){
    if(r?.schema!==SCHEMA||r.features?.schema!==FEATURE_SCHEMA||typeof r.key!=='string')return null;
    let parts;try{parts=JSON.parse(r.key);}catch{return null;}
    if(!Array.isArray(parts)||parts.length!==5||parts.some(v=>typeof v!=='string'||!v)||parts[1]!==r.environment||parts[2]!==r.input||parts[3]!==r.task||parts[4]!==FEATURE_SCHEMA)return null;
    return parts[0];
  }
  function basicQualified(r){const f=r?.features;return !!ownerOf(r)&&f.eligible===true&&Array.isArray(f.flags)&&!f.flags.some(x=>BLOCKING_FLAGS.includes(x))&&f.counts?.strokes>=3&&f.counts?.points>=12&&finite(f.durationMs)&&f.durationMs>=3000&&finite(f.activeMs)&&f.activeMs>=300&&f.activeMs<=f.durationMs+1e-6&&finite(f.distance)&&f.distance>0;}
  function metricQualified(r,metric){const f=r?.features,v=f?.values?.[metric];return basicQualified(r)&&f.metricEligible?.[metric]===true&&finite(v)&&(metric==='speed'?v>=0&&v<=5000:metric==='active'?v>=0&&v<=100:metric==='pressure'?v>=0&&v<=1&&f.counts.pressure>=5:metric==='pause'?v>=0&&f.counts.pauses>=1:false);}
  const qualified=metricQualified;
  function eligibleHistory(current,history){
    const owner=ownerOf(current),seen=new Set();if(!owner||!finite(current.endedAt)||current.endedAt<=0)return [];
    const local=owner==='DEMO-NOT-RESEARCH'?'demo-memory':'saved';
    return (Array.isArray(history)?history:[]).filter(r=>typeof r?.id==='string'&&r.id&&r.id!==current.id&&ownerOf(r)===owner&&r.local===local&&finite(r.endedAt)&&r.endedAt>0&&r.endedAt<current.endedAt&&basicQualified(r)).sort((a,b)=>b.endedAt-a.endedAt||a.id.localeCompare(b.id)).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,MAX_HISTORY);
  }
  function historyCount(history,person,now){const seen=new Set();return (Array.isArray(history)?history:[]).filter(r=>r?.local==='saved'&&ownerOf(r)===person&&finite(r.endedAt)&&r.endedAt>0&&r.endedAt<=now&&basicQualified(r)).sort((a,b)=>b.endedAt-a.endedAt||a.id.localeCompare(b.id)).filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,MAX_HISTORY).length;}
  function compare(current,history,metric){
    const value=current.features.values[metric];
    const pool=eligibleHistory(current,history),records=pool.filter(r=>metricQualified(r,metric));
    const values=records.map(r=>r.features.values[metric]),base=median(values),mad=base===null?null:median(values.map(v=>Math.abs(v-base)));
    const result={n:records.length,eligibleN:pool.length,value,base,mad,ids:records.map(r=>r.id)};
    if(!metricQualified(current,metric))return {status:'unavailable',...result};
    if(pool.length<MIN_HISTORY)return {status:'building',...result};
    if(!records.length)return {status:'no-data',...result};
    const delta=value-base;
    return {status:mad===0?'zero-mad':'ready',...result,delta,robustDistance:mad>0?Math.abs(delta)/mad:null};
  }
  function observation(metric,c){
    if(c.status==='unavailable')return '本次資料不適合比較；仍可查看可用的量測摘要。';
    if(c.status==='building')return `個人基準建立中（${c.eligibleN}/${MIN_HISTORY} 筆合格摘要）；本項可用歷程 ${c.n} 筆。`;
    if(c.status==='no-data')return '整體比較已開啟；本項沒有可用歷程數值。';
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
    for(const [sourceIndex,stroke] of (session?.strokes||[]).entries()){
      const points=stroke.points||[];
      if(!points.length||!points.every(p=>finite(p.x)&&finite(p.y)&&finite(p.t)&&p.t>=0))continue;
      if(points.some((p,i)=>i&&p.t<=points[i-1].t)||previousEnd!==null&&points[0].t<previousEnd)continue;
      origin??=points[0].t;
      const start=points[0].t-origin,end=points.at(-1).t-origin;
      strokes.push({start,end,points,sourceIndex});
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
  function fragmentPairs(session,model){
    const raw=session?.strokes;
    if(!Array.isArray(raw)||!model?.strokes?.length)return [];
    const valid=stroke=>{
      const points=stroke?.points;
      return Array.isArray(points)&&points.length>=2&&!stroke.fragmentInvalid&&
        points.every((p,i)=>finite(p?.x)&&finite(p?.y)&&finite(p?.t)&&p.t>=0&&(!i||p.t>points[i-1].t));
    };
    const pairs=[];
    for(let i=0;i<model.strokes.length-1;i++){
      const before=model.strokes[i],after=model.strokes[i+1];
      if(after.sourceIndex!==before.sourceIndex+1)continue;
      const first=raw[before.sourceIndex],second=raw[after.sourceIndex];
      if(!valid(first)||!valid(second)||before.points!==first.points||after.points!==second.points)continue;
      if((first.fragmentSegment??0)!==(second.fragmentSegment??0))continue;
      const gap=after.start-before.end;
      if(!finite(gap)||gap<=0||gap>300000||before.start<0||before.start>before.end||
         before.end>=after.start||after.start>after.end||after.end>model.duration)continue;
      pairs.push({index:i,start:before.start,end:after.end,gapStart:before.end,gapEnd:after.start,gap});
    }
    return pairs;
  }
  class Capture{
    constructor(){this.strokes=[];this.active=null;this.pointer=null;this.flags=[];this.input=null;this.lastInput=null;this.guidance='not-started';this.points=0;this.fragmentSegment=0;}
    flag(v){if(!this.flags.includes(v))this.flags.push(v);}
    begin(id,input,point){if(this.pointer!==null)return false;if(this.points>=50000){this.flag('超出採樣上限');this.fragmentSegment++;return false;}if(![point?.x,point?.y,point?.t].every(finite)||point.t<0){this.flag('無效時間或座標');this.fragmentSegment++;return false;}if(this.lastInput&&this.lastInput!==input){this.flag('輸入方式改變');this.fragmentSegment++;}this.lastInput=input;this.input=this.input||input;this.pointer=id;this.active={points:[point],fragmentSegment:this.fragmentSegment};return true;}
    move(id,point){if(id!==this.pointer||!this.active)return false;if(this.points+this.active.points.length>=50000){this.flag('超出採樣上限');this.active.fragmentInvalid=true;return false;}if(![point?.x,point?.y,point?.t].every(finite)||point.t<=this.active.points.at(-1).t){this.flag('無效時間或座標');this.active.fragmentInvalid=true;return false;}this.active.points.push(point);return true;}
    end(id,point){if(id!==this.pointer||!this.active)return false;if(point){if(![point.x,point.y,point.t].every(finite)||point.t<this.active.points.at(-1).t){this.flag('無效時間或座標');this.active.fragmentInvalid=true;}else if(point.t>this.active.points.at(-1).t)this.move(id,point);}this.strokes.push(this.active);this.points+=this.active.points.length;this.active=null;this.pointer=null;return true;}
    interrupt(reason='輸入中斷'){if(this.pointer!==null){this.active=null;this.pointer=null;this.flag(reason);}this.fragmentSegment++;}
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
  return {SCHEMA,FEATURE_SCHEMA,MIN_HISTORY,MAX_HISTORY,METRICS,finite,median,extract,emotionFeatures,key,ownerOf,basicQualified,qualified,eligibleHistory,historyCount,compare,observation,summary,timeline,fragmentPairs,Capture,demo};
});
