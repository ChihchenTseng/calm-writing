/* Device-local, condition-matched descriptive baselines. No fitted psychological model. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports={create:factory};
  else root.CWPersonalization=factory(root.CW);
})(typeof globalThis==='object'?globalThis:this,function(CW){
  'use strict';
  const MIN_HISTORY=10,MAX_HISTORY=30,RADAR_SCHEMA='cw-radar-heuristic/1.0';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const median=a=>{const b=a.slice().sort((x,y)=>x-y),n=b.length;return n?(b[(n-1)>>1]+b[n>>1])/2:null;};
  function basic(r){
    if(!r||!CW.basicQualified(r))return false;
    const c=r.features.counts;
    return ['strokes','points'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0);
  }
  function metric(r,name){
    if(!basic(r)||!CW.qualified(r,name))return false;
    const count=name==='pressure'?'pressure':name==='pause'?'pauses':null;
    return !count||Number.isSafeInteger(r.features.counts[count])&&r.features.counts[count]>=0;
  }
  function eligibleHistory(current,history){
    const owner=CW.ownerOf(current);
    if(!owner||typeof current.id!=='string'||!current.id||!finite(current.endedAt)||current.endedAt<=0)return [];
    const local=owner==='DEMO-NOT-RESEARCH'?'demo-memory':'saved';
    const pool=(Array.isArray(history)?history:[]).filter(r=>
      typeof r?.id==='string'&&r.id&&r.id!==current.id&&r.key===current.key&&
      CW.ownerOf(r)===owner&&r.local===local&&finite(r.endedAt)&&r.endedAt>0&&r.endedAt<current.endedAt&&basic(r));
    // Repeated persisted copies cannot increase sample size. Newest qualified copy wins.
    const seen=new Set();
    return pool.slice().sort((a,b)=>b.endedAt-a.endedAt||a.id.localeCompare(b.id))
      .filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;}).slice(0,MAX_HISTORY);
  }
  function stats(values){const base=median(values);return {base,mad:base===null?null:median(values.map(v=>Math.abs(v-base)))};}
  function compare(current,history,name){
    const pool=eligibleHistory(current,history),records=pool.filter(r=>metric(r,name));
    const value=current?.features?.values?.[name]??null;
    const result={n:records.length,eligibleN:pool.length,requiredN:MIN_HISTORY,value,...stats(records.map(r=>r.features.values[name])),ids:records.map(r=>r.id)};
    if(!metric(current,name))return {...result,status:'unavailable',reason:'current-unqualified'};
    if(records.length<MIN_HISTORY)return {...result,status:'building',reason:'insufficient-metric-history'};
    const delta=value-result.base;
    return {...result,status:result.mad>0?'ready':'zero-mad',reason:result.mad>0?null:'zero-mad',delta,robustDistance:result.mad>0?Math.abs(delta)/result.mad:null};
  }
  function observation(name,c){
    if(c.status==='building')return `相同題目、輸入與環境的本項基準建立中（${c.n}/${MIN_HISTORY} 筆有效資料）；不混用其他題目的歷程。`;
    return CW.observation(name,c);
  }
  function historyCount(current,history){return eligibleHistory(current,history).length;}
  function radarSummary(emotion){
    const scores=emotion?.scores;
    if(!Array.isArray(scores)||scores.length!==5||!scores.every(x=>finite(x?.score)&&x.score>=0&&x.score<=100))return null;
    return {schema:RADAR_SCHEMA,scores:scores.map(x=>x.score)};
  }
  function rawAxis(r,i){const radar=r?.radar;return radar?.schema===RADAR_SCHEMA&&Array.isArray(radar.scores)&&radar.scores.length===5&&finite(radar.scores[i])&&radar.scores[i]>=0&&radar.scores[i]<=100?radar.scores[i]:null;}
  function personalizeRadar(current,history){
    const pool=eligibleHistory(current,history);
    const axes=Array.from({length:5},(_,i)=>{
      const raw=rawAxis(current,i);
      const records=pool.filter(r=>metric(r,'pressure')&&rawAxis(r,i)!==null);
      const values=records.map(r=>rawAxis(r,i)),s=stats(values);
      let reason=null;
      if(raw===null)reason='raw-unavailable';
      else if(!metric(current,'pressure'))reason='current-unqualified';
      else if(records.length<MIN_HISTORY)reason='insufficient-axis-history';
      else if(!(s.mad>0))reason='zero-mad';
      const personalized=reason===null;
      return {index:i,raw,value:personalized?Math.max(0,Math.min(100,50+15*(raw-s.base)/(1.4826*s.mad))):raw,
        status:personalized?'personalized':raw===null?'unavailable':'raw-fallback',reason,n:records.length,requiredN:MIN_HISTORY,...s,ids:records.map(r=>r.id)};
    });
    const personalizedN=axes.filter(a=>a.status==='personalized').length;
    return {schema:RADAR_SCHEMA,kind:'heuristic-relative-display',status:personalizedN===5?'personalized':personalizedN?'mixed':axes.every(a=>a.raw===null)?'unavailable':'raw-fallback',
      eligibleN:pool.length,requiredN:MIN_HISTORY,personalizedN,axes,
      explanation:'這是啟發式書寫圖形的相對顯示，不是經校準的情緒或壓力預測。只參考同題目、同輸入與同環境的先前資料；不足 10 筆或 MAD 為零時保留原公式。'};
  }
  return {MIN_HISTORY,MAX_HISTORY,RADAR_SCHEMA,eligibleHistory,compare,observation,historyCount,radarSummary,personalizeRadar};
});
