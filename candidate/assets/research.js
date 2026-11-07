/* Optional research B: explicit per-session consent and pre-writing VAS, local only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CWResearch=api;})(globalThis,function(){
  'use strict';
  const VERSION='cw-research-b/1',CONSENT='cw-local-research-consent/1',BUILD='CW-B-20261107';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function preflight({consent=false,confirmed=false,value,at}={}){
    if(consent!==true||confirmed!==true||!Number.isInteger(value)||value<0||value>100||!finite(at)||at<=0)return null;
    return {schema:VERSION,consentVersion:CONSENT,consentedAt:at,vasPre:value,answeredAt:at};
  }
  function pair(pre,{sessionId,startedAt,endedAt}={}){
    if(!pre||!finite(pre.consentedAt)||pre.consentedAt<=0||pre.consentedAt!==pre.answeredAt||pre.schema!==VERSION||pre.consentVersion!==CONSENT||typeof sessionId!=='string'||!sessionId||!finite(startedAt)||!finite(endedAt)||startedAt<pre.answeredAt||endedAt<startedAt)return null;
    const valid=preflight({consent:true,confirmed:true,value:pre.vasPre,at:pre.answeredAt});
    return valid?{...valid,consentedAt:pre.consentedAt,sessionId,startedAt,endedAt,build:BUILD,storage:'local-only'}:null;
  }
  function clean(value,record){
    const result=pair(value,{sessionId:record?.id,startedAt:value?.startedAt,endedAt:record?.endedAt});
    if(!result||value.sessionId!==record.id||value.endedAt!==record.endedAt||value.consentedAt!==value.answeredAt||value.storage!=='local-only')return null;
    return result;
  }
  function exportFeatures(f){
    if(!f||f.schema!=='cw-features/2.0')throw Error('無有效版本的特徵摘要');
    const number=v=>finite(v)?v:null;
    const numeric=(obj,keys)=>Object.fromEntries(keys.map(k=>[k,number(obj?.[k])]));
    const boolean=(obj,keys)=>Object.fromEntries(keys.map(k=>[k,typeof obj?.[k]==='boolean'?obj[k]:null]));
    const flags=['資料太少','短筆畫','無效時間或座標','無有效路徑','異常取樣','輸入中斷','尺寸改變','輸入方式改變','超出採樣上限','介入引導','任務變更','本機儲存不可用'];
    return {schema:f.schema,values:numeric(f.values,['speed','pause','active','pressure']),
      counts:numeric(f.counts,['strokes','points','pauses','pressure','tilt']),
      ...numeric(f,['durationMs','activeMs','distance']),
      flags:Array.isArray(f.flags)?f.flags.filter(v=>flags.includes(v)):[],
      eligible:typeof f.eligible==='boolean'?f.eligible:null,
      metricEligible:boolean(f.metricEligible,['speed','pause','active','pressure']),
      support:{...boolean(f.support,['pressure','tilt']),
        pressureEvidence:['verified','observed-variation','unknown'].includes(f.support?.pressureEvidence)?f.support.pressureEvidence:null,
        tiltEvidence:['raw-present','unknown'].includes(f.support?.tiltEvidence)?f.support.tiltEvidence:null},
      pauseBins:Array.isArray(f.pauseBins)&&f.pauseBins.length===4?f.pauseBins.map(number):null};
  }
  function exportRadar(r){
    return r?.schema==='cw-radar-heuristic/1.0'&&Array.isArray(r.scores)&&r.scores.length===5&&r.scores.every(v=>finite(v)&&v>=0&&v<=100)?{schema:r.schema,scores:r.scores.slice()}:null;
  }
  function exportRecord(record){
    const research=clean(record?.research,record);if(!research)throw Error('這筆沒有有效同意配對，無法匯出研究資料');
    // Explicit whitelist. No strokes, browser owner token, key, or inferred emotion labels.
    return {schema:VERSION,sessionId:record.id,build:BUILD,research,
      task:record.task,input:record.input,condition:record.environment,
      featureSchema:record.features.schema,features:exportFeatures(record.features),radar:exportRadar(record.radar),
      note:'VAS 是書寫前主觀自評；五軸為未驗證啟發式，不是壓力或情緒標記。未上傳。'};
  }
  return {VERSION,CONSENT,BUILD,preflight,pair,clean,exportRecord};
});
