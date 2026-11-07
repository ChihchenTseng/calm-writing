/* Separate real summary storage and in-memory demo. No network implementation in candidate. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./research.js'):root.CWResearch);if(typeof module==='object'&&module.exports)module.exports=api;else root.CWStore=api;})(globalThis,function(R){
  'use strict';
  const KEY='cw-research-b-local-summaries-v1',PROFILE='cw-research-b-local-profile-v1',REVOKED='cw-research-b-withdrawn-v1';
  // Local revision identifies a particular saved snapshot, not merely its stable session ID.
  // It is deliberately NOT sent through the existing adapter interface.
  const revision=()=>globalThis.crypto?.randomUUID?.()||('rev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const content=r=>JSON.stringify(clean(r));
  async function deadline(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('雲端逾時')),ms);})]);}finally{clearTimeout(timer);}}
  function clean(r){
    if(!r||typeof r.id!=='string'||!r.features||typeof r.key!=='string')throw Error('摘要格式不符');
    const f=r.features;
    const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
    return {id:r.id,schema:r.schema,key:r.key,task:r.task,input:r.input,environment:r.environment,endedAt:r.endedAt,guidance:r.guidance,
      radar:r.radar?.schema==='cw-radar-heuristic/1.0'&&Array.isArray(r.radar.scores)&&r.radar.scores.length===5&&r.radar.scores.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100)?{schema:r.radar.schema,scores:r.radar.scores.slice()}:null,research:R.clean(r.research,r),
      features:{schema:f.schema,values:Object.fromEntries(['speed','pause','active','pressure'].map(k=>[k,numeric(f.values?.[k])])),counts:Object.fromEntries(['strokes','points','pauses','pressure','tilt'].map(k=>[k,numeric(f.counts?.[k])])),durationMs:numeric(f.durationMs),activeMs:numeric(f.activeMs),distance:numeric(f.distance),flags:(f.flags||[]).filter(x=>typeof x==='string'),eligible:!!f.eligible,metricEligible:Object.fromEntries(['speed','pause','active','pressure'].map(k=>[k,!!f.metricEligible?.[k]])),support:{pressure:!!f.support?.pressure,pressureEvidence:['unknown','observed-variation','verified'].includes(f.support?.pressureEvidence)?f.support.pressureEvidence:'unknown',tilt:!!f.support?.tilt,tiltEvidence:f.support?.tiltEvidence==='raw-present'?'raw-present':'unknown'},pauseBins:(f.pauseBins||[]).slice(0,4).map(numeric)}};
  }
  class Store{
    constructor(storage,mode='real',adapter=null,options={}){this.storage=storage;this.mode=mode;this.adapter=adapter;this.timeoutMs=options.timeoutMs??8000;this.memory=[];this.inflight=new Map();this.epochs=new Map();}
    revoked(){if(this.mode==='demo')return [];const raw=this.storage.getItem(REVOKED);if(!raw)return [];let ids;try{ids=JSON.parse(raw);}catch{throw Error('撤回紀錄無法讀取，研究資料暫不提供');}if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('撤回紀錄格式異常，研究資料暫不提供');return ids;}
    isResearchWithdrawn(id){return this.revoked().includes(id);}
    withdrawResearch(id){if(this.mode==='demo')throw Error('示範沒有研究配對');const revoked=this.revoked();if(!revoked.includes(id))this.storage.setItem(REVOKED,JSON.stringify([...revoked,id]));const rows=this.list();this.write(rows.map(r=>r.id===id?{...r,research:null,revision:revision()}:r));}
    list(){if(this.mode==='demo')return this.memory.slice();const raw=this.storage.getItem(KEY);if(!raw)return [];let parsed;try{parsed=JSON.parse(raw);}catch{throw Error('本機摘要格式無法讀取，未覆寫原內容');}if(!Array.isArray(parsed)||!parsed.every(r=>r&&typeof r.id==='string'&&typeof r.key==='string'&&r.features?.counts&&r.features?.values&&Array.isArray(r.features?.flags)&&r.features?.metricEligible))throw Error('本機摘要格式無法讀取，未覆寫原內容');const revoked=this.revoked();return parsed.map(r=>revoked.includes(r.id)?{...r,research:null}:r);}
    write(rows){if(this.mode==='demo'){this.memory=rows;return;}this.storage.setItem(KEY,JSON.stringify(rows));}
    save(record){const safe=clean(record);if(this.isResearchWithdrawn(safe.id))safe.research=null;const rows=this.list(),old=rows.find(x=>x.id===safe.id);const same=old&&content(old)===JSON.stringify(safe);const item={...safe,revision:same?old.revision:revision(),savedAt:old?.savedAt||Date.now(),local:this.mode==='demo'?'demo-memory':'saved',cloud:this.mode==='demo'?'demo-memory':same?old.cloud:'not-configured',cloudAttempted:!!old?.cloudAttempted,cloudMessage:this.mode==='demo'?'示範資料僅在記憶體':same?old.cloudMessage:'候選未啟用正式雲端；尚未驗證權限'};this.write([...rows.filter(x=>x.id!==item.id),item]);return item;}
    async sync(id){
      if(this.mode==='demo')return {cloud:'demo-memory',cloudMessage:'示範僅在記憶體，不會連線'};
      const item=this.list().find(x=>x.id===id);if(!item)throw Error('找不到此筆摘要');
      const snapshot=content(item),savedRevision=item.revision;
      const attemptKey=JSON.stringify([id,savedRevision??null,snapshot]);
      if(this.inflight.has(attemptKey))return this.inflight.get(attemptKey).work;
      const epoch=this.epochs.get(id)||0;
      const work=(async()=>{
        // Every status belongs to this exact revision AND whitelisted content.
        // Success, rejection, deadline and late responses cannot acknowledge a newer save.
        const update=(cloud,message)=>{if((this.epochs.get(id)||0)!==epoch)return null;const latest=this.list(),current=latest.find(x=>x.id===id);if(!current||current.revision!==savedRevision||content(current)!==snapshot)return null;const next={...current,cloud,cloudAttempted:!!this.adapter,cloudMessage:message};this.write(latest.map(x=>x.id===id?next:x));return next;};
        if(!this.adapter)return update('failed','雲端未啟用／權限未驗證；本機摘要仍保留');
        update('pending','等待雲端明確確認；尚未完成');
        try{const ack=await deadline(this.adapter.put(id,JSON.parse(snapshot)),this.timeoutMs);if(!ack||ack.confirmed!==true||ack.id!==id)throw Error('未收到同一筆摘要的明確確認');return update('confirmed','雲端已明確確認此摘要修訂');}catch(e){return update('failed',e.message||'雲端失敗');}
      })();this.inflight.set(attemptKey,{id,work});try{return await work;}finally{if(this.inflight.get(attemptKey)?.work===work)this.inflight.delete(attemptKey);}
    }
    async remove(id){
      if(this.mode==='demo'){this.memory=this.memory.filter(r=>r.id!==id);return;}
      if([...this.inflight.values()].some(attempt=>attempt.id===id))throw Error('此筆仍在等待同步結果，請稍後再刪除');
      const item=this.list().find(r=>r.id===id);if(!item)return;
      if(item.cloudAttempted||item.cloud==='confirmed'||item.cloud==='pending'){
        if(!this.adapter)throw Error('無法確認雲端刪除，保留本機摘要');
        const ack=await deadline(this.adapter.remove(id),this.timeoutMs);if(ack?.confirmed!==true||ack.id!==id)throw Error('雲端刪除未確認，保留本機摘要');
      }
      this.epochs.set(id,(this.epochs.get(id)||0)+1);this.write(this.list().filter(r=>r.id!==id));
    }
  }
  return {Store,clean,KEY,PROFILE,REVOKED};
});
