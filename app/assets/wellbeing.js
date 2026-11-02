/* Optional, local-only wellbeing controls. No audio files, network, recording or persistence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CWWellbeing=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const labels={white:'白噪音',pink:'粉紅噪音',brown:'棕噪音',ambient:'柔和合成環境音'};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function noise(kind,count,seed=0x5f3759df){
    if(!['white','pink','brown'].includes(kind))throw Error('未知音源');
    const n=Math.max(32,Math.floor(count)),out=new Float32Array(n),rows=new Float32Array(12);let state=0,s=seed>>>0||1;
    const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2147483648-1;};
    for(let i=0;i<n;i++){
      if(kind==='white')out[i]=random();
      else if(kind==='pink'){let sum=0;for(let k=0;k<12;k++){if(i%(1<<k)===0)rows[k]=random();sum+=rows[k];}out[i]=sum/12;}
      else{state=state*.996+random()*.045;out[i]=state;}
    }
    let mean=0,peak=0;for(const x of out)mean+=x;mean/=n;for(const x of out)peak=Math.max(peak,Math.abs(x-mean));
    const scale=peak>0?.78/peak:0,edge=Math.min(256,Math.floor(n/20));
    for(let i=0;i<n;i++){const fade=edge?Math.min(1,i/edge,(n-1-i)/edge):1;out[i]=(out[i]-mean)*scale*fade;}
    return out;
  }
  function createAudio(options={}){
    const AC=options.AudioContextClass||((typeof window!=='undefined')&&(window.AudioContext||window.webkitAudioContext));
    const now=options.now||(()=>performance.now()),setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||clearTimeout;
    const hidden=options.hidden||(()=>typeof document!=='undefined'&&document.hidden),emit=options.onState||(()=>{}),onStarted=options.onStarted||(()=>{});
    let ctx=null,master=null,graph=null,fadePromise=null,tickId=0,sequence=0,disposed=false;
    const retired=new Map();
    let status='stopped',source='white',volume=.2,durationMs=600000,elapsedMs=0,startedAt=0,expired=false,reason='聲音已關閉。';
    const elapsed=()=>elapsedMs+(status==='playing'?Math.max(0,now()-startedAt):0);
    const snapshot=()=>({status,source,volume,durationMs,elapsedMs:elapsed(),remainingMs:durationMs?Math.max(0,durationMs-elapsed()):null,expired,reason,contextState:ctx?.state||'none'});
    const report=()=>emit(snapshot());
    const clearTick=()=>{if(tickId){clearTimer(tickId);tickId=0;}};
    const ramp=(param,value,seconds)=>{const at=ctx.currentTime;param.cancelScheduledValues(at);param.setValueAtTime(param.value,at);param.linearRampToValueAtTime(value,at+seconds);};
    function disposeGraph(g){if(!g||g.closed)return;g.closed=true;for(const x of g.sources){try{x.stop();}catch{}try{x.disconnect();}catch{}}for(const x of g.nodes){try{x.disconnect();}catch{}}}
    function fadeGraph(){const old=graph;graph=null;if(!old)return Promise.resolve();try{ramp(old.gain.gain,0,.12);}catch{disposeGraph(old);return Promise.resolve();}
      const task=new Promise(resolve=>{const record={timer:0,resolve};record.timer=setTimer(()=>{retired.delete(old);disposeGraph(old);resolve();},140);retired.set(old,record);});
      fadePromise=task;task.finally(()=>{if(fadePromise===task)fadePromise=null;});return task;}
    function clearRetired(){for(const [old,record] of retired){clearTimer(record.timer);disposeGraph(old);record.resolve();}retired.clear();fadePromise=null;}
    function closeContext(){const old=ctx;ctx=null;if(master){try{master.disconnect();}catch{}master=null;}if(old){old.onstatechange=null;old.close().catch(()=>{});}}
    function ensureContext(){if(ctx)return ctx;if(!AC)throw Error('此瀏覽器不支援本機合成聲音');ctx=new AC();master=ctx.createGain();master.gain.value=volume*.45;master.connect(ctx.destination);const owned=ctx;ctx.onstatechange=()=>{if(ctx===owned&&status==='playing'&&owned.state!=='running')pause('音訊中斷，已暫停；請手動繼續。');};return ctx;}
    function makeGraph(kind){const g={sources:[],nodes:[],gain:ctx.createGain(),closed:false};g.gain.gain.value=0;g.gain.connect(master);g.nodes.push(g.gain);
      try{
        const rate=ctx.sampleRate,count=Math.max(4096,Math.round(rate*4)),data=noise(kind==='ambient'?'pink':kind,count),buffer=ctx.createBuffer(1,count,rate);
        buffer.copyToChannel(data,0);const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;g.sources.push(src);
        if(kind==='ambient'){
          const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=440;src.connect(filter);filter.connect(g.gain);g.nodes.push(filter);
          for(const freq of [110,164.8]){const osc=ctx.createOscillator(),level=ctx.createGain();osc.type='sine';osc.frequency.value=freq;level.gain.value=.07;osc.connect(level);level.connect(g.gain);g.sources.push(osc);g.nodes.push(level);}
        }else src.connect(g.gain);
        for(const x of g.sources)x.start();return g;
      }catch(error){disposeGraph(g);throw error;}
    }
    const isDue=()=>durationMs>0&&elapsed()>=durationMs;
    function expire(){if(expired)return; if(status==='playing')elapsedMs=elapsed();
      const ticket=++sequence;expired=true;status='stopped';reason='設定的有效播放時間已用完。按「重新開始新一輪」才會重置時間。';clearTick();report();
      fadeGraph().then(()=>{if(ticket===sequence&&ctx)closeContext();});
    }
    function scheduleTick(){clearTick();if(status!=='playing')return;if(isDue()){expire();return;}const delay=durationMs?Math.max(1,Math.min(500,durationMs-elapsed())):500;
      tickId=setTimer(()=>{tickId=0;if(status!=='playing')return;if(isDue()){expire();return;}report();scheduleTick();},delay);}
    function setSource(next){if(!Object.hasOwn(labels,next)||expired)return false;if(isDue()){expire();return false;}source=next;if(status==='playing'){void switchSource();}else report();return true;}
    async function switchSource(){if(status==='switching'||expired)return;if(isDue()){expire();return;}const ticket=++sequence;elapsedMs=elapsed();status='switching';reason='正在切換聲音。';clearTick();report();await fadeGraph();if(ticket!==sequence||disposed||hidden())return;if(isDue()){expire();return;}
      try{if(ctx?.state!=='running')throw Error('音訊已中斷');graph=makeGraph(source);ramp(graph.gain.gain,1,.18);startedAt=now();status='playing';reason=`${labels[source]}播放中。`;scheduleTick();report();}
      catch(error){status='paused';reason='切換未完成，聲音已暫停。';report();}
    }
    function setVolume(next){const n=Number(next);if(!finite(n))return;volume=clamp(n,0,.4);if(master&&ctx){try{ramp(master.gain,volume*.45,.08);}catch{master.gain.value=volume*.45;}}report();}
    function setDuration(minutes){const n=Number(minutes);if(![0,5,10,20].includes(n))return;durationMs=n*60000;if(isDue()){expire();report();return;}if(expired){expired=false;status='paused';reason='期限已延長，可手動繼續聲音。';}if(status==='playing')scheduleTick();report();}
    async function play(){if(disposed||hidden()||expired)return false;if(isDue()){expire();return false;}if(status==='playing')return true;if(status==='starting'||status==='switching')return false;
      const fresh=status==='stopped';if(fresh)elapsedMs=0;const ticket=++sequence;status='starting';reason='正在啟動聲音。';report();
      try{const active=ensureContext();const resumed=active.resume();await resumed;if(fadePromise)await fadePromise;
        if(ticket!==sequence||disposed||hidden()){if(ctx===active&&active.state==='running'&&(hidden()||['paused','stopped'].includes(status)))await active.suspend().catch(()=>{});return false;}if(isDue()){expire();return false;}if(active.state!=='running')throw Error('瀏覽器未啟用音訊');
        graph=makeGraph(source);ramp(graph.gain.gain,1,.18);startedAt=now();status='playing';reason=`${labels[source]}播放中。`;scheduleTick();report();onStarted();return true;
      }catch(error){if(ticket!==sequence)return false;status='error';reason=`無法播放：${error?.message||'音訊不可用'}。仍可正常書寫。`;clearTick();disposeGraph(graph);graph=null;report();return false;}
    }
    function pause(message='聲音已暫停；請手動繼續。',immediate=false){
      if(isDue()){expire();return;}if(status==='playing')elapsedMs=elapsed();else if(status!=='starting'&&status!=='switching')return;
      const ticket=++sequence;status=graph||elapsedMs?'paused':'stopped';reason=message;clearTick();report();
      if(immediate){disposeGraph(graph);graph=null;if(ctx?.state==='running')ctx.suspend().catch(()=>{});return;}
      fadeGraph().then(()=>{if(ticket===sequence&&status==='paused'&&ctx?.state==='running')ctx.suspend().catch(()=>{});});
    }
    function stop(message='聲音已停止。'){
      const ticket=++sequence;status='stopped';expired=false;reason=message;elapsedMs=0;clearTick();report();
      fadeGraph().then(()=>{if(ticket===sequence&&ctx)closeContext();});
    }
    function restart(){stop('準備開始新一輪。');return play();}
    function dispose(){disposed=true;sequence++;clearTick();disposeGraph(graph);graph=null;clearRetired();closeContext();status='stopped';expired=false;elapsedMs=0;reason='聲音已關閉。';report();disposed=false;}
    report();return {play,restart,pause,stop,dispose,setSource,setVolume,setDuration,snapshot};
  }
  function createMindfulness(options={}){
    const now=options.now||(()=>performance.now()),setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||clearTimeout;
    const emit=options.onState||(()=>{}),onStarted=options.onStarted||(()=>{});let status='idle',durationMs=60000,elapsedMs=0,startedAt=0,tickId=0;
    const elapsed=()=>elapsedMs+(status==='running'?Math.max(0,now()-startedAt):0);
    const stage=()=>{const part=clamp(elapsed()/durationMs,0,1);return part<1/3?'留意自然呼吸，照自己舒服的速度即可。':part<2/3?'覺察筆觸與身體接觸的感覺，不必改變它。':'慢慢回到當下，準備好時再繼續書寫。';};
    const snapshot=()=>({status,durationMs,elapsedMs:Math.min(durationMs,elapsed()),stage:stage()});
    const report=()=>emit(snapshot());const clearTick=()=>{if(tickId){clearTimer(tickId);tickId=0;}};
    function tick(){clearTick();if(status!=='running')return;tickId=setTimer(()=>{tickId=0;if(status!=='running')return;if(elapsed()>=durationMs){elapsedMs=durationMs;status='completed';report();return;}report();tick();},250);}
    function start(seconds=60){if(![60,180].includes(Number(seconds)))return false;clearTick();durationMs=Number(seconds)*1000;elapsedMs=0;startedAt=now();status='running';report();onStarted();tick();return true;}
    function pause(){if(status!=='running')return;elapsedMs=elapsed();status='paused';clearTick();report();}
    function resume(){if(status!=='paused')return;startedAt=now();status='running';report();onStarted();tick();}
    function cancel(){if(!['running','paused'].includes(status))return;elapsedMs=elapsed();status='cancelled';clearTick();report();}
    function dispose(){clearTick();status='idle';elapsedMs=0;report();}
    report();return {start,pause,resume,cancel,dispose,snapshot,isActive:()=>status==='running'||status==='paused'};
  }
  function mount(options={}){
    const $=id=>document.getElementById(id),dialog=$('wellbeing-dialog');if(!dialog||!$('wellbeing-open')||typeof options.onIntervention!=='function')return null;let returnFocus=null;
    const intervention=()=>options.onIntervention?.();
    const audio=createAudio({onStarted:intervention,onState:renderAudio});
    const mindful=createMindfulness({onStarted:intervention,onState:renderMindful});
    function renderAudio(s){if($('audio-status').textContent!==s.reason)$('audio-status').textContent=s.reason;$('audio-play').disabled=['playing','starting','switching'].includes(s.status);$('audio-play').textContent=s.expired?'重新開始新一輪':s.status==='paused'?'繼續播放':'播放聲音';$('audio-pause').disabled=s.status!=='playing';$('audio-stop').disabled=['stopped','error'].includes(s.status);$('audio-source').disabled=s.expired;
      $('audio-volume-value').textContent=Math.round(s.volume*100)+'%';$('audio-remaining').textContent=s.expired?`有效播放 ${Math.floor(s.elapsedMs/1000)} 秒；本輪期限已用完。`:s.durationMs?`有效播放 ${Math.floor(s.elapsedMs/1000)} 秒；剩餘約 ${Math.ceil(s.remainingMs/60000)} 分鐘。`:`有效播放 ${Math.floor(s.elapsedMs/1000)} 秒；未設定停止時間。`;
      const live=['playing','paused','starting','switching'].includes(s.status);$('wellbeing-live').hidden=!live;const liveText=s.status==='playing'?`${labels[s.source]}播放中。`:s.status==='paused'?'聲音已暫停。':'聲音準備中。';if($('wellbeing-live-text').textContent!==liveText)$('wellbeing-live-text').textContent=liveText;$('wellbeing-quick-pause').disabled=!['playing','paused'].includes(s.status);$('wellbeing-quick-pause').textContent=s.status==='paused'?'繼續聲音':'暫停聲音';$('wellbeing-quick-stop').disabled=false;
    }
    function renderMindful(s){$('mindful-progress').value=Math.round(s.elapsedMs/s.durationMs*100);$('mindful-time').textContent=`${Math.floor(s.elapsedMs/1000)} / ${s.durationMs/1000} 秒`;if($('mindful-stage').textContent!==s.stage)$('mindful-stage').textContent=s.stage;
      const statusText=({idle:'尚未開始。',running:'引導進行中。',paused:'引導已暫停。',cancelled:'引導已取消。',completed:'引導自然完成。'})[s.status];if($('mindful-status').textContent!==statusText)$('mindful-status').textContent=statusText;$('mindful-start').disabled=['running','paused'].includes(s.status);$('mindful-pause').disabled=s.status!=='running';$('mindful-resume').disabled=s.status!=='paused';$('mindful-cancel').disabled=!['running','paused'].includes(s.status);$('mindful-duration').disabled=['running','paused'].includes(s.status);
    }
    function open(){returnFocus=document.activeElement;dialog.showModal();$('wellbeing-close').focus();}
    function close(){dialog.close();returnFocus?.focus();}
    $('wellbeing-open').addEventListener('click',open);$('wellbeing-close').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    $('mindful-start').addEventListener('click',()=>mindful.start($('mindful-duration').value));$('mindful-pause').addEventListener('click',mindful.pause);$('mindful-resume').addEventListener('click',mindful.resume);$('mindful-cancel').addEventListener('click',mindful.cancel);
    $('audio-source').addEventListener('change',()=>audio.setSource($('audio-source').value));$('audio-duration').addEventListener('change',()=>audio.setDuration($('audio-duration').value));$('audio-volume').addEventListener('input',()=>audio.setVolume(Number($('audio-volume').value)/100));
    $('audio-play').addEventListener('click',()=>{void (audio.snapshot().expired?audio.restart():audio.play());});$('audio-pause').addEventListener('click',()=>audio.pause());$('audio-stop').addEventListener('click',()=>audio.stop());
    $('wellbeing-quick-pause').addEventListener('click',()=>{if(audio.snapshot().status==='paused')void audio.play();else audio.pause();});$('wellbeing-quick-stop').addEventListener('click',()=>audio.stop());
    document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.pause('分頁已隱藏，聲音暫停；返回後請手動繼續。',true);mindful.pause();}});
    window.addEventListener('pagehide',()=>{audio.dispose();mindful.dispose();});
    return {audio,mindful,isInterventionActive:()=>audio.snapshot().status==='playing'||mindful.isActive(),stopAll:()=>{audio.stop();mindful.cancel();}};
  }
  return {noise,createAudio,createMindfulness,mount};
});
