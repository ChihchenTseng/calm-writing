/* Pure CSS-pixel writing-space planning. No persistence or feature extraction. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CWLayout=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const VERSION='cw-layout/1',SUGGESTED_BRUSH=6,PAD=20,MIN_CELL=96,MAX_HEIGHT=960,MAX_PIXELS=12000000;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function characters(text){return [...String(text||'')].filter(ch=>!/[\s\p{P}]/u.test(ch)).length;}
  function plan({text,width,brush=SUGGESTED_BRUSH,dpr=1}={}){
    const count=characters(text),w=Number(width),b=Number(brush),scale=Number(dpr);
    if(!finite(w)||w<=0||!finite(b)||b<2||b>40||!finite(scale)||scale<=0||scale>4)return {valid:false,reason:'尺寸或筆寬無法量測，請重新開始。'};
    const cell=Math.max(MIN_CELL,Math.ceil(b*12)),cols=Math.floor((w-PAD*2)/cell),rows=cols>0?Math.max(1,Math.ceil(count/cols)):0;
    const needed=rows*cell+PAD*2,height=Math.max(380,needed),pixels=Math.ceil(w*scale)*Math.ceil(height*scale);
    const valid=count>0&&cols>0&&height<=MAX_HEIGHT&&pixels<=MAX_PIXELS;
    const reason=!count?'固定語料沒有可寫字元。':cols<1?'紙面寬度不足一個字格。':height>MAX_HEIGHT?`需要約 ${Math.ceil(height)} px 高，超過 ${MAX_HEIGHT} px 紙面上限。`:pixels>MAX_PIXELS?'畫布像素量超過裝置預算。':'';
    return {valid,reason,count,cols,rows,cell,pad:PAD,width:w,height:Math.min(height,MAX_HEIGHT),neededHeight:height,pixels,brush:b,dpr:scale,version:VERSION};
  }
  function condition(p,{grid=false,guide=false}={}){return `${VERSION}|${p.width}x${p.height}@${p.dpr}|cell:${p.cell}|brush:${p.brush}|grid:${+!!grid}|guide:${+!!guide}`;}
  return {VERSION,SUGGESTED_BRUSH,PAD,MAX_HEIGHT,MAX_PIXELS,characters,plan,condition};
});
