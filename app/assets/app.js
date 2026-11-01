/* Presentation and pointer capture only. Features and persistence live in separate testable modules. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id),C=window.CW,S=window.CWStore;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,d=1)=>C.finite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:d}):'—';
  const uuid=()=>globalThis.crypto?.randomUUID?.()||('cw-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  let mode='real',view='home',capture=null,current=null,realCurrent=null,realCapture=null,resultRaw=null,historyReview=false,toastTimer,breathTimer,breathReturn=null,breathState='not-started',lastFocus=null;
  let storage;
  try{storage=window.localStorage;}catch{storage={getItem(){throw Error('此瀏覽器不允許本機儲存');},setItem(){throw Error('此瀏覽器不允許本機儲存');}};}
  const realStore=new S.Store(storage),demoStore=new S.Store(null,'demo');
  let person='temporary-'+uuid(),profilePersistent=false;
  try{person=storage.getItem(S.PROFILE)||person;storage.setItem(S.PROFILE,person);profilePersistent=true;}catch{}
  const browserEnvironment=[navigator.userAgent,navigator.language].join('|');
  const store=()=>mode==='demo'?demoStore:realStore;
  let historyReadError=null;
  function rows(){try{historyReadError=null;return store().list();}catch(e){historyReadError=e.message;notify(e.message);return [];}}
  function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,7000);}
  function task(){return CW_CORPUS.find(t=>t.id===$('task').value)||CW_CORPUS[0];}
  function setTasks(){const items=CW_CORPUS.filter(t=>t.cat===$('category').value);$('task').innerHTML=items.map(t=>`<option value="${esc(t.id)}">${esc(t.text)}</option>`).join('');taskChanged();}
  function taskChanged(){const t=task();$('task-poem').textContent=t.text;$('canvas-guide').textContent=t.text;if(capture&&capture.strokes.length){capture.flag('任務變更');$('write-notice').hidden=false;$('write-notice').textContent='這次已更換任務，不會加入個人基準。重新開始一段練習可建立新任務摘要。';}}
  function needsDiscard(){return view==='write'&&!!capture?.strokes.length;}
  function focusAvailable(target){if(!target||target.isConnected===false||target.closest?.('[hidden]'))return false;target.focus();return document.activeElement===target;}
  function restoreFocus(target){if(!focusAvailable(target))focusAvailable(document.querySelector('#view-'+view+' h1'));}
  // Native modal semantics plus explicit entry and boundary handling: Tab never exits to BODY.
  document.addEventListener('keydown',e=>{
    if(e.key!=='Tab')return;const dialog=['confirmation','breathing','tour'].map($).find(d=>d.open);if(!dialog)return;
    const controls=[...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
    const index=controls.indexOf(document.activeElement);if(!controls.length){e.preventDefault();dialog.focus();return;}
    if(e.shiftKey&&index<=0){e.preventDefault();controls.at(-1).focus();}else if(!e.shiftKey&&(index<0||index===controls.length-1)){e.preventDefault();controls[0].focus();}
  });
  let confirmResolve=null,confirmFocus=null;
  function askConfirm(message){updateMode();confirmFocus=document.activeElement;$('confirm-message').textContent=message;$('confirmation').showModal();focusAvailable($('confirm-no'));return new Promise(resolve=>{confirmResolve=resolve;});}
  function answerConfirm(answer){const resolve=confirmResolve;confirmResolve=null;$('confirmation').close();restoreFocus(confirmFocus);resolve?.(answer);}
  $('confirm-no').addEventListener('click',()=>answerConfirm(false));$('confirm-yes').addEventListener('click',()=>answerConfirm(true));$('confirmation').addEventListener('cancel',e=>{e.preventDefault();answerConfirm(false);});
  function guardLeave(action){askConfirm('離開會捨棄尚未完成的畫布與暫存軌跡。要離開嗎？').then(ok=>{if(ok){capture=null;paint();action();}});}
  function route(next){
    if(next!==view&&needsDiscard()){guardLeave(()=>route(next));return false;}
    if(view==='result'&&next!=='result')releaseRaw();
    if(view==='write'&&next!=='write'){capture=null;ctx.clearRect(0,0,canvasSize.w,canvasSize.h);}
    view=next;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+next);
    if(next==='history')renderHistory();if(next==='home')updateHome();
    window.scrollTo({top:0,behavior:'instant'});document.querySelector('#view-'+next+' h1')?.focus({preventScroll:true});return true;
  }
  function updateHome(){let count=0;try{count=realStore.list().length;}catch{count='—';}$('home-count').textContent=count;}
  function updateMode(){
    $('demo-banner').hidden=mode!=='demo';$('mode-label').textContent=mode==='demo'?'示範資料／非研究成果 · 記憶體隔離':'本機隔離候選 · 雲端未啟用';
    document.querySelectorAll('.dialog-mode').forEach(el=>el.textContent=mode==='demo'?'示範資料／非研究成果 · 不連雲端':'本機隔離候選 · 不連雲端');
  }
  function enterDemo(kind='normal'){
    if(needsDiscard()){guardLeave(()=>enterDemo(kind));return;}
    releaseRaw();
    if(mode!=='demo'){realCurrent=current;realCapture=view==='write'?null:capture;capture=null;mode='demo';}
    const data=C.demo(kind);demoStore.memory=data.history.map(r=>({...S.clean(r),local:'demo-memory',cloud:'demo-memory',cloudMessage:'示範資料僅在記憶體'}));
    current=data.current;historyReview=false;resultRaw={session:data.session,width:300,height:170};capture=null;updateMode();$('demo-kind').value=kind;view='home';route('result');renderResult();
  }
  function exitDemo(){releaseRaw();mode='real';demoStore.memory=[];current=realCurrent;capture=realCapture;realCurrent=null;realCapture=null;updateMode();view='home';route('home');notify('已退出示範。真實本機歷程未被示範寫入。');}
  function newWriting(){
    if(needsDiscard()){guardLeave(newWriting);return;}if(mode==='demo')exitDemo();
    releaseRaw();capture=new C.Capture();current=null;historyReview=false;$('write-notice').hidden=true;view='home';route('write');resizeCanvas(true);paint();updateCapture();
  }
  const canvas=$('canvas'),ctx=canvas.getContext('2d');let canvasSize={w:0,h:0,dpr:0};
  function resizeCanvas(initial=false){
    if(view!=='write')return;
    const rect=canvas.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height),dpr=window.devicePixelRatio||1;
    if(!w||!h||w===canvasSize.w&&h===canvasSize.h&&dpr===canvasSize.dpr)return;
    if(!initial&&capture&&(capture.strokes.length||capture.active)){capture.interrupt();capture.flag('尺寸改變');$('write-notice').hidden=false;$('write-notice').textContent='畫布尺寸已改變。保留可見筆跡供回看，這次不納入個人基準。';}
    canvasSize={w,h,dpr};canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint();
  }
  new ResizeObserver(()=>resizeCanvas()).observe($('paper'));
  window.addEventListener('resize',()=>resizeCanvas());
  function point(e,phase,pointerType=e.pointerType){
    const r=canvas.getBoundingClientRect(),pen=pointerType==='pen';
    return {x:e.clientX-r.left,y:e.clientY-r.top,t:e.timeStamp,phase,pointerType,pressure:pen&&Number.isFinite(e.pressure)?e.pressure:null,pressureEvidence:'unknown',tiltX:pen&&Number.isFinite(e.tiltX)?e.tiltX:null,tiltY:pen&&Number.isFinite(e.tiltY)?e.tiltY:null,width:Math.max(1.5,Number($('brush').value))};
  }
  function outside(p){return p.x<0||p.y<0||p.x>canvasSize.w||p.y>canvasSize.h;}
  function drawStroke(s){const a=s.points;if(!a.length)return;ctx.strokeStyle='#2a1f14';ctx.fillStyle='#2a1f14';ctx.lineCap='round';ctx.lineJoin='round';if(a.length===1){ctx.beginPath();ctx.arc(a[0].x,a[0].y,a[0].width/2,0,Math.PI*2);ctx.fill();}for(let i=1;i<a.length;i++){ctx.lineWidth=(a[i-1].width+a[i].width)/2;ctx.beginPath();ctx.moveTo(a[i-1].x,a[i-1].y);ctx.lineTo(a[i].x,a[i].y);ctx.stroke();}}
  function paint(){ctx.clearRect(0,0,canvasSize.w,canvasSize.h);capture?.strokes.forEach(drawStroke);if(capture?.active)drawStroke(capture.active);}
  const pressureLabel=f=>({'verified':'經實機確認','observed-variation':'觀察到接觸值變化','unknown':'未確認'})[f?.support?.pressureEvidence]||'未確認';
  function updateCapture(){const f=capture?C.extract(capture):null;$('stroke-count').textContent=`${capture?.strokes.length||0} 筆畫`;$('input-label').textContent=capture?.input?({mouse:'滑鼠',pen:'觸控筆',touch:'觸控'}[capture.input]||capture.input)+'書寫':'尚未落筆';$('device-support').textContent=`筆壓：${pressureLabel(f)} · 傾斜：${f?.support.tilt?'原始角度可用':'未確認'}`;}
  canvas.addEventListener('pointerdown',e=>{const policy=$('input-policy').value;if(view!=='write'||!capture||e.button!==0||e.isPrimary===false||policy!=='auto'&&policy!==e.pointerType)return;const p=point(e,'down');if(outside(p))return;if(capture.begin(e.pointerId,e.pointerType,p)){canvas.setPointerCapture(e.pointerId);e.preventDefault();paint();updateCapture();}});
  canvas.addEventListener('pointermove',e=>{if(capture?.pointer!==e.pointerId)return;const events=e.getCoalescedEvents?.()||[];for(const sample of events.length?events:[e]){const p=point(sample,'move',e.pointerType);if(outside(p)){capture.interrupt();break;}capture.move(e.pointerId,p);}e.preventDefault();paint();updateCapture();});
  canvas.addEventListener('pointerup',e=>{if(capture?.pointer!==e.pointerId)return;const p=point(e,'up');if(outside(p))capture.interrupt();else capture.end(e.pointerId,p);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);paint();updateCapture();});
  function interrupt(e){if(e?.pointerId!==undefined&&capture?.pointer!==e.pointerId)return;if(capture?.pointer!==null&&capture?.pointer!==undefined){capture.interrupt();paint();updateCapture();notify('輸入中斷已標記；這次不會加入個人基準。');}}
  function loseFocus(){if(view==='write'&&capture&&(capture.active||capture.strokes.length)){capture.flag('輸入中斷');interrupt();$('write-notice').hidden=false;$('write-notice').textContent='書寫過程曾失焦／切換頁面，這次保留回顧但不進個人基準。';}}
  canvas.addEventListener('pointercancel',interrupt);canvas.addEventListener('lostpointercapture',interrupt);window.addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});
  $('undo').addEventListener('click',()=>{capture?.undo();paint();updateCapture();});
  $('clear').addEventListener('click',async()=>{if(!capture)return;if(!capture.strokes.length||await askConfirm('清除這次畫布與所有暫存筆畫量測？')){capture.clear();paint();updateCapture();notify('畫面與筆畫量測已一起清除。');}});
  $('brush').addEventListener('input',()=>$('brush-value').textContent=$('brush').value);
  $('input-policy').addEventListener('change',()=>{if(capture?.active)capture.interrupt();if(capture?.strokes.length)capture.flag('輸入方式改變');paint();updateCapture();});
  $('grid').addEventListener('change',()=>$('paper').classList.toggle('grid',$('grid').checked));$('guide').addEventListener('change',()=>$('canvas-guide').hidden=!$('guide').checked);
  $('category').addEventListener('change',setTasks);$('task').addEventListener('change',taskChanged);
  $('finish').addEventListener('click',()=>{
    if(!capture)return;capture.interrupt();const meta={person,environment:browserEnvironment+'|canvas:'+canvasSize.w+'x'+canvasSize.h+'@'+canvasSize.dpr,input:capture.input||'none',task:task().id,schema:C.FEATURE_SCHEMA};
    if(!profilePersistent)capture.flag('個人識別未保存');
    current=C.summary(capture,meta,uuid(),Date.now());historyReview=false;resultRaw={session:{strokes:capture.strokes},width:canvasSize.w,height:canvasSize.h};view='result';route('result');renderResult();
    // Raw points remain only in memory for this result and are released on navigation.
    capture=null;ctx.clearRect(0,0,canvasSize.w,canvasSize.h);
  });
  let replayModel=null,replayFrame=0,replayPlaying=false,replayAt=0,replayClock=0;
  const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  function stopReplay(){replayPlaying=false;if(replayFrame&&window.cancelAnimationFrame)window.cancelAnimationFrame(replayFrame);replayFrame=0;}
  function releaseRaw(){stopReplay();resultRaw=null;replayModel=null;replayAt=0;const c=$('replay-canvas');c.width=1;c.height=1;$('timeline-content').innerHTML='';}
  function drawReplay(){
    const c=$('replay-canvas'),context=c.getContext('2d');if(!replayModel||!resultRaw)return;
    const dpr=window.devicePixelRatio||1,w=Math.max(1,resultRaw.width),h=Math.max(1,resultRaw.height);
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,w,h);
    const origin=replayModel.strokes[0]?.points[0]?.t??0;context.lineCap='round';context.lineJoin='round';context.strokeStyle='#2a1f14';context.fillStyle='#2a1f14';
    for(const stroke of replayModel.strokes){const pts=stroke.points.filter(p=>p.t-origin<=replayAt);if(!pts.length)continue;if(pts.length===1){context.beginPath();context.arc(pts[0].x,pts[0].y,(pts[0].width||3)/2,0,Math.PI*2);context.fill();}for(let i=1;i<pts.length;i++){context.lineWidth=((pts[i-1].width||3)+(pts[i].width||3))/2;context.beginPath();context.moveTo(pts[i-1].x,pts[i-1].y);context.lineTo(pts[i].x,pts[i].y);context.stroke();}}
  }
  function setReplay(at){
    replayAt=Math.max(0,Math.min(replayModel?.duration||0,Number(at)||0));$('replay-position').value=String(Math.round(replayAt));$('replay-time').textContent=`${fmt(replayAt/1000,2)} 秒`;
    document.querySelectorAll('.playhead').forEach(line=>{const x=replayModel?.duration?replayAt/replayModel.duration*1000:0;line.setAttribute('x1',x);line.setAttribute('x2',x);});drawReplay();
  }
  function sampleMarks(rows,max=120){if(rows.length<=max)return rows;const step=Math.ceil(rows.length/max),selected=rows.filter((_,i)=>i%step===0);if(selected.at(-1)!==rows.at(-1))selected.push(rows.at(-1));return selected;}
  function barsSvg(rows,duration,maxValue,label){const shown=sampleMarks(rows),height=78,marks=shown.map(p=>{const x=duration?p.at/duration*1000:0,h=Math.max(1,Math.min(51,p.value/maxValue*51));return `<rect x="${x.toFixed(2)}" y="${(61-h).toFixed(2)}" width="2.5" height="${h.toFixed(2)}" fill="#3e5136"/>`;}).join('');return `<svg viewBox="0 0 1000 ${height}" role="img" aria-label="${label}，實際時間位置；缺值不補線"><line x1="0" y1="62" x2="1000" y2="62" stroke="#766144"/>${marks}<line class="playhead" x1="0" y1="0" x2="0" y2="65" stroke="#8b3e32" stroke-width="3"/></svg>`;}
  function renderReplay(){
    stopReplay();replayAt=0;replayModel=resultRaw?C.timeline(resultRaw.session):null;
    const available=!!replayModel?.strokes.length;$('replay-canvas').hidden=!available;
    for(const id of ['replay-play','replay-pause','replay-restart','replay-position'])$(id).disabled=!available;
    if(!available){$('replay-note').textContent='此摘要沒有本次可用的原始筆跡；歷史只保存摘要，不能回放。';$('replay-position').value='0';$('replay-time').textContent='—';$('replay-status').textContent='無可回放筆跡';$('timeline-content').innerHTML='<p>沒有本次可用的時間軸。歷史摘要不含原始軌跡。</p>';return;}
    $('replay-position').max=String(Math.max(1,Math.ceil(replayModel.duration)));
    $('replay-note').textContent=`僅本次記憶體筆跡 · ${replayModel.strokes.length} 筆畫 · ${fmt(replayModel.duration/1000,2)} 秒。離開結果即釋放。${reducedMotion()?'已依減少動態效果停用自動播放，可手動移動進度。':''}`;
    $('replay-play').disabled=reducedMotion();$('replay-restart').disabled=reducedMotion();$('replay-status').textContent='尚未播放；速度 1×（實際時間）';
    const d=Math.max(replayModel.duration,1),blocks=replayModel.strokes.map((s,i)=>`<rect x="${(s.start/d*1000).toFixed(2)}" y="17" width="${Math.max(2,(s.end-s.start)/d*1000).toFixed(2)}" height="24" fill="#3e5136"><title>第 ${i+1} 筆：${fmt(s.start/1000,2)} 至 ${fmt(s.end/1000,2)} 秒</title></rect>`).join('');
    const speedMax=Math.max(1,...replayModel.speed.map(s=>s.value));
    const speedVisible=replayModel.speed.length>=3,pressureVisible=replayModel.pressure.length>=5;
    const speedChart=speedVisible?barsSvg(replayModel.speed,d,speedMax,'落筆移動速度 CSS px/s'):'<p>有效移動樣本不足，不顯示速度變化。</p>';
    const pressureChart=pressureVisible?barsSvg(replayModel.pressure,d,1,'筆壓 0 至 1 裝置相對值'):'<p>筆壓未確認或接觸樣本不足，不補假曲線。</p>';
    $('timeline-content').innerHTML=`<svg viewBox="0 0 1000 70" role="img" aria-label="落筆與筆畫間抬筆，橫軸 0 至 ${fmt(d/1000,2)} 秒"><line x1="0" y1="47" x2="1000" y2="47" stroke="#766144"/>${blocks}<line class="playhead" x1="0" y1="5" x2="0" y2="55" stroke="#8b3e32" stroke-width="3"/><text x="4" y="65">0 秒</text><text x="996" y="65" text-anchor="end">${fmt(d/1000,1)} 秒</text></svg><div class="timeline-legend"><span><i class="timeline-swatch"></i>落筆</span><span><i class="timeline-swatch gap"></i>抬筆／無採樣</span><span>紅線：播放位置</span></div><div class="timeline-detail"><p>${replayModel.strokes.length} 個落筆區段；${replayModel.pauses.length} 個筆畫間抬筆間隔。這些間隔不代表筆畫內停住或全部思考時間。</p><p>速度：由 ${replayModel.sampleCounts.computedSpeed} 個有移動的相鄰點間隔計算，單位 CSS px/s；圖上顯示 ${speedVisible?sampleMarks(replayModel.speed).length:0} 個，不改動原指標。</p>${speedChart}<p>筆壓：${replayModel.sampleCounts.computedPressure} 個接觸樣本（${pressureLabel(current.features)}），0–1 裝置相對值；圖上顯示 ${pressureVisible?sampleMarks(replayModel.pressure).length:0} 個。固定 0.5 fallback 保持未知。</p>${pressureChart}</div>`;
    setReplay(0);
  }
  function tick(now){if(!replayPlaying)return;setReplay(now-replayClock);if(replayAt>=replayModel.duration){stopReplay();$('replay-status').textContent='播放完成';return;}replayFrame=window.requestAnimationFrame(tick);}
  $('replay-play').addEventListener('click',()=>{if(!replayModel||reducedMotion())return;stopReplay();replayPlaying=true;replayClock=performance.now()-replayAt;$('replay-status').textContent='播放中 · 1× 實際時間';replayFrame=window.requestAnimationFrame(tick);});
  $('replay-pause').addEventListener('click',()=>{stopReplay();$('replay-status').textContent='已暫停';});
  $('replay-restart').addEventListener('click',()=>{if(!replayModel)return;stopReplay();setReplay(0);if(!reducedMotion())$('replay-play').click();});
  $('replay-position').addEventListener('input',()=>{stopReplay();setReplay($('replay-position').value);$('replay-status').textContent='已手動移動播放位置';});
  const formula={speed:'有效筆畫路徑總長 ÷ 落筆總秒數，為落筆期間平均速度。單位 CSS px/s，不是實際公分。',pause:'相鄰有效筆畫的「下一筆起點時間 − 上一筆終點時間」取中位數；只指筆畫間抬筆，不代表筆畫內停住。',active:'有效筆畫時間總和 ÷ 第一筆開始至最後一筆結束的時間 × 100，稱落筆時間占比；不是情緒機率。',pressure:'至少 5 個觀察到變化或經實機確認的接觸筆壓樣本，取中位數；未確認為 null。合法 0.5 保留；固定 fallback 不作實測。'};
  const sourceCount=(f,k)=>k==='pause'?`${f.counts.pauses} 個間隔`:k==='pressure'?`${f.counts.pressure} 個可用接觸樣本`:`${f.counts.points} 個點 · ${f.counts.strokes} 筆畫`;
  function card(k){
    const f=current.features,c=C.compare(current,rows(),k),m=C.METRICS[k],available=f.values[k]!==null;
    if(historyReadError)c.status='unavailable';
    const status=c.status==='ready'||c.status==='zero-mad'?`近期中位數 ${fmt(c.base)} ${m.unit} · 差值 ${fmt(c.delta,2)} · 有效 ${c.n} 筆`:c.status==='building'?`個人基準建立中 · ${c.n}/${C.MIN_HISTORY} 筆`:'本次不進行比較';
    let bars='';if(['ready','zero-mad'].includes(c.status)&&available){const max=Math.max(c.value,c.base,1);bars=`<div class="compare-bars" aria-label="本次與近期中位數對照"><div class="compare-line"><span>本次</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,c.value/max*100)}%"></div></div><span>${fmt(c.value)}</span></div><div class="compare-line baseline"><span>近期</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,c.base/max*100)}%"></div></div><span>${fmt(c.base)}</span></div></div>`;}
    return `<article class="metric-card ${k==='pressure'?'pressure':''}"><div><h3>${m.label}</h3><span class="metric-value">${fmt(f.values[k],k==='pressure'?2:1)}</span><span class="metric-unit">${m.unit}</span><p class="metric-source">${esc(sourceCount(f,k))} · ${mode==='demo'?'合成示範':'本次量測'}${!available?' · 缺值':''}</p></div><div class="comparison"><strong>${esc(status)}</strong>${bars}<p>${esc(C.observation(k,c))}</p></div><details><summary>查看計算與比較依據</summary><p>${formula[k]}</p><p>本次之前，取相同個人／瀏覽器環境、輸入方式、固定任務及 schema 最近最多 30 筆合格摘要；本次不算入基準。初始比較門檻 10 筆，可調工程設定，非臨床充分性聲明。</p><p>有效歷史 ${c.n} 筆；中位數 ${fmt(c.base)}；MAD ${fmt(c.mad,2)}${c.delta!==undefined?`；原始差值 ${fmt(c.delta,2)}`:''}。${esc(current.schema)}</p><p>可能干擾：畫布尺寸、取樣頻率、手部姿勢、裝置延遲、任務熟悉度。不同環境不混用，不解讀為診斷。</p></details></article>`;
  }
  function renderResult(){
    if(!current)return;const f=current.features,t=CW_CORPUS.find(t=>t.id===current.task);
    $('result-title').textContent=mode==='demo'?'同一套規則，看見不同節奏。':'謝謝你，完成這次練習。';
    $('result-subtitle').textContent=`${mode==='demo'?'示範資料／非研究成果 · ':''}${t?.text||current.task} · ${f.counts.strokes} 筆畫 · ${fmt(f.durationMs/1000)} 秒`;
    $('demo-controls').hidden=mode!=='demo';$('quality').textContent=f.schema!==C.FEATURE_SCHEMA?'此歷史摘要使用舊版特徵規則，僅供回顧；不與新版個人基準混用，原紀錄未改寫。':f.eligible?'量測符合本候選的基本品質門檻。缺少筆壓不影響其他有效特徵；每項仍須通過各自的樣本檢查。':`這次先留作回顧，不納入個人基準：${f.flags.join('、')||'資料不完整'}。可用值僅供本次參考。`;
    $('metric-cards').innerHTML=['speed','pause','active','pressure'].map(card).join('');
    renderReplay();
    if(historyReadError)$('quality').textContent+=' 本機歷史無法讀取，暫不比較；未覆寫原內容。';
    const bins=f.pauseBins||[],max=Math.max(...bins,1);$('pause-chart').innerHTML=bins.some(n=>n>0)?bins.map((n,i)=>`<div class="pause-bin"><span>${n} 次</span><div class="pause-bar" style="height:${n?Math.max(4,n/max*85):0}px"></div><span>${['少於 1 秒','1–3 秒','3–5 秒','5 秒以上'][i]}</span></div>`).join(''):'<p>目前沒有可用的筆畫間停頓資料。</p>';
    $('guidance-reason').textContent=f.values.pause>3?'本次筆畫間停頓中位數超過 3 秒。若你想休息，可選擇呼吸；這只是可略過的操作提示，不代表心理狀態。':'若想停下來，可以試著放慢呼吸。你也可以略過，繼續一天的步調。';
    $('guidance-state').textContent=guidanceLabel(current.guidance);
    $('technical-body').innerHTML=`<p>來源：${mode==='demo'?'固定合成治具／非研究成果':'本次畫布指標事件摘要'}；摘要 schema：<code>${esc(current.schema)}</code>；特徵 schema：<code>${esc(f.schema)}</code>；輸入：${esc(current.input)}。</p><p>品質標記：${esc(f.flags.join('、')||'無阻擋標記')}。筆壓：${pressureLabel(f)}；傾斜：${f.support.tilt?'保留原始 tiltX/tiltY，未換算實體傾角':'未確認'}。</p><p>以此瀏覽器匿名識別作個人範圍；共用瀏覽器無法辨認不同人，請使用獨立瀏覽器設定檔。不承諾跨裝置恢復。舊版特徵 schema 不混入本次基準，原紀錄不改寫。</p><p>候選未載入雲端 SDK，網路連線受 CSP connect-src none 限制；研究 Sheets 不啟用。真服務權限及 Apple Pencil：尚未驗證。程式版本 CW-COMP-001；門檻 3 筆畫、12 點、跨度 3 秒，僅工程品質設定。</p>`;
    updateSaveStatus();
  }
  function guidanceLabel(state){return ({'not-started':'尚未啟動引導',started:'引導已啟動（非已完成）',completed:'引導已完成；這筆不進自然書寫基準',cancelled:'引導已取消（非已完成）；這筆不進自然書寫基準',skipped:'已略過建議'})[state]||'尚未啟動引導';}
  function updateSaveStatus(message){
    if(historyReview){$('save').disabled=true;$('save').textContent='歷史摘要唯讀';$('retry-cloud').disabled=true;$('save-status').textContent='歷史摘要唯讀回看；原紀錄不重新保存或同步。';return;}
    $('save').disabled=false;
    if(mode==='demo'){$('save-status').textContent=message||'示範資料只留在記憶體，不保存到真實本機歷程或雲端。';$('save').textContent='示範保存（僅記憶體）';$('retry-cloud').disabled=true;return;}
    $('save').textContent='保存在此瀏覽器';$('retry-cloud').disabled=false;
    let saved;try{saved=realStore.list().find(x=>x.id===current?.id);}catch(e){$('save-status').textContent=e.message;return;}
    $('save-status').textContent=message||(saved?`本機已保存 · ${saved.cloudMessage}`:'尚未保存。本機保存與雲端確認分開顯示。');
  }
  $('save').addEventListener('click',()=>{if(historyReview)return;try{store().save(current);updateSaveStatus(mode==='demo'?'示範摘要僅存記憶體，真實歷程與雲端均未變更。':undefined);notify(mode==='demo'?'示範僅在記憶體。':'本機摘要已保存；雲端尚未確認。');updateHome();}catch(e){updateSaveStatus('本機保存失敗：'+e.message+'。畫面結果仍可使用。');}});
  $('retry-cloud').addEventListener('click',async()=>{if(mode==='demo'||historyReview)return;$('retry-cloud').disabled=true;try{realStore.save(current);updateSaveStatus('本機已保存；正在檢查雲端確認能力，尚未雲端成功。');await realStore.sync(current.id);updateSaveStatus();}catch(e){updateSaveStatus('保存／雲端失敗：'+e.message);}finally{$('retry-cloud').disabled=false;}});
  function renderHistory(){
    $('history-intro').textContent=mode==='demo'?'這裡都是合成示範摘要，僅存在記憶體，不是個人歷程或研究成果。':'只顯示這個瀏覽器真正保存的摘要。示範不計入真實次數。';
    const data=rows().sort((a,b)=>b.endedAt-a.endedAt),duration=data.reduce((n,r)=>n+(r.features?.durationMs||0),0),eligible=data.filter(r=>r.features?.eligible).length;
    if(historyReadError){$('history-stats').textContent='本機歷史目前無法讀取，筆數未知。';$('history-list').innerHTML='<p class="notice">'+esc(historyReadError)+'。原內容未覆寫，可稍後再試。</p>';return;}
    $('history-stats').innerHTML=`<div class="history-stat"><strong>${data.length}</strong>${mode==='demo'?'示範摘要':'真實本機摘要'}（筆）</div><div class="history-stat"><strong>${fmt(duration/60000,1)}</strong>書寫跨度合計（分鐘）</div><div class="history-stat"><strong>${eligible}</strong>符合基本品質（筆）</div>`;
    $('history-list').innerHTML=data.length?data.map(r=>`<article class="history-row"><div><h2>${esc(CW_CORPUS.find(t=>t.id===r.task)?.text||r.task)}</h2><p>${mode==='demo'?'示範資料／非研究成果 · ':''}${new Date(r.endedAt).toLocaleString('zh-TW')} · ${fmt(r.features.durationMs/1000)} 秒 · ${r.features.counts.strokes} 筆畫</p><p>${r.features.eligible?'品質合格，依各特徵與相同 key 篩選':'僅供回顧，不進基準'} · ${esc(r.cloudMessage||'僅在本機')}</p></div><div class="actions"><button class="secondary" data-review="${esc(r.id)}">回看摘要</button><button class="delete-btn" data-delete="${esc(r.id)}">刪除</button></div></article>`).join(''):'<div class="empty"><h2>這裡，等著你的第一筆。</h2><p>完成書寫並選擇本機保存後，摘要才會出現在這裡。沒有歷史時，不產生假趨勢。</p></div>';
    $('read-legacy').disabled=mode==='demo';$('legacy-list').innerHTML='';
  }
  $('history-list').addEventListener('click',async e=>{const review=e.target.closest('[data-review]'),del=e.target.closest('[data-delete]');if(review){current=rows().find(r=>r.id===review.dataset.review);historyReview=true;route('result');renderResult();}if(!del)return;
    const ordered=rows().sort((a,b)=>b.endedAt-a.endedAt),index=ordered.findIndex(r=>r.id===del.dataset.delete);
    if(await askConfirm(mode==='demo'?'刪除此記憶體示範摘要？真實資料不受影響。':'刪除此筆本機候選摘要？無法復原；其他摘要與舊版資料不受影響。')){try{await store().remove(del.dataset.delete);renderHistory();updateHome();const remaining=$('history-list').querySelectorAll?.('[data-review]')||[];restoreFocus(remaining[Math.min(Math.max(index,0),remaining.length-1)]);notify('此筆摘要已刪除。');}catch(err){restoreFocus(del);notify('刪除未完成：'+err.message);}}
  });
  $('read-legacy').addEventListener('click',()=>{if(mode==='demo')return;try{const data=JSON.parse(storage.getItem('writing-mindfulness-sessions')||'[]');if(!Array.isArray(data))throw Error('舊版格式不符');$('legacy-list').innerHTML=data.length?'<p>唯讀顯示最近最多 100 筆舊版摘要；不讀取原始軌跡、圖片或自由文字。</p>'+data.slice(-100).reverse().map((entry,i)=>{const r=entry&&typeof entry==='object'?entry:{};return `<article class="history-row"><div><h3>舊版摘要 ${i+1} · 版本不相容</h3><p>${esc(r.date||r.timestamp||'時間未提供')} · 原保存跨度 ${fmt(r.totalTime)} 秒 · 筆畫 ${fmt(r.strokeCount,0)} · 點數 ${fmt(r.pointCount,0)}</p><p>當時保存的平均停頓 ${fmt(r.avgPause)} 秒，未重新量測或驗證，不與新 schema 比較。未顯示舊心理分類，不改寫或補齊舊欄位。</p></div></article>`;}).join(''):'<p>此瀏覽器沒有舊版摘要。未讀取其他網站、帳號或雲端資料。</p>';}catch(e){$('legacy-list').textContent='舊版摘要未能讀取：'+e.message;}});
  function markGuidance(state){
    breathState=state;if(capture)capture.markGuidance(state);
    if(current&&['started','completed','cancelled'].includes(state)){current={...current,guidance:state,features:{...current.features,eligible:false,metricEligible:{speed:false,pause:false,active:false,pressure:false},flags:[...new Set([...current.features.flags,'介入引導'])]}};}
  }
  function openBreathing(){
    lastFocus=document.activeElement;breathReturn=view;markGuidance('started');paint();updateMode();const d=$('breathing');$('breath-complete').disabled=true;$('breath-phase').textContent='慢慢吸氣';$('breath-progress').textContent='3 輪，每輪 8 秒';d.showModal();focusAvailable($('breath-close'));let seconds=0;
    clearInterval(breathTimer);breathTimer=setInterval(()=>{seconds++;$('breath-phase').textContent=seconds%8<4?'慢慢吸氣':'慢慢吐氣';$('breath-progress').textContent=`第 ${Math.min(3,Math.floor(seconds/8)+1)} / 3 輪 · ${seconds} 秒`;
      if(seconds>=24){clearInterval(breathTimer);$('breath-phase').textContent='回到自然呼吸';$('breath-complete').disabled=false;}},1000);
  }
  function closeBreathing(completed=false){clearInterval(breathTimer);markGuidance(completed?'completed':'cancelled');$('breathing').close();if(breathReturn==='result')renderResult();if(breathReturn==='write'){updateCapture();$('write-notice').hidden=false;$('write-notice').textContent=guidanceLabel(breathState)+'。可繼續練習，這次僅作回顧。';}restoreFocus(lastFocus);}
  $('manual-breathe').addEventListener('click',openBreathing);$('result-breathe').addEventListener('click',openBreathing);
  $('breath-close').addEventListener('click',()=>closeBreathing());$('breath-cancel').addEventListener('click',()=>closeBreathing());$('breath-complete').addEventListener('click',()=>closeBreathing(true));$('breathing').addEventListener('cancel',e=>{e.preventDefault();closeBreathing();});
  $('skip-guidance').addEventListener('click',()=>{if(current.guidance==='not-started')current.guidance='skipped';$('guidance-state').textContent=guidanceLabel(current.guidance);notify('可以略過，依自己的步調就好。');});
  let tourFocus=null;function closeTour(){ $('tour').close();restoreFocus(tourFocus); }
  $('open-tour').addEventListener('click',()=>{tourFocus=document.activeElement;updateMode();$('tour').showModal();focusAvailable($('tour-close'));});$('tour-close').addEventListener('click',closeTour);$('tour').addEventListener('cancel',e=>{e.preventDefault();closeTour();});$('tour-demo').addEventListener('click',()=>{closeTour();enterDemo();});
  $('start-demo').addEventListener('click',()=>enterDemo());$('demo-kind').addEventListener('change',()=>enterDemo($('demo-kind').value));$('exit-demo').addEventListener('click',exitDemo);
  ['start-real','history-start','write-again'].forEach(id=>$(id).addEventListener('click',newWriting));
  document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>route(el.dataset.nav)));
  setTasks();updateMode();updateHome();
})();
